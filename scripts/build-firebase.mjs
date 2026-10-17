import { readFile, writeFile, mkdir, cp, lstat, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';
import { fileHashes } from './verify-vendor.mjs';
import { firebaseHeaders } from '../firebase/hosting-policy.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
// Reuse the audited public build as the allowlisted starting point.
execFileSync(process.execPath, [path.join(project, 'scripts/build-static.mjs')], { cwd: project, stdio: 'inherit' });
const parent = path.join(project, 'build'), target = path.join(parent, 'firebase');
const stage = path.join(parent, `.firebase-stage-${randomUUID()}`), backup = path.join(parent, `.firebase-previous-${randomUUID()}`);
const kind = 'classroom-hub-firebase-v1';
async function exists(p) { try { return await lstat(p); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function safeOutput(p) { const stat = await exists(p); if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Unsafe Firebase output path'); return stat; }
function replaceOnce(s, a, b) { if (s.split(a).length !== 2) throw new Error('Firebase build source changed'); return s.replace(a, b); }
await safeOutput(target);
if (await exists(target)) {
  const manifest = JSON.parse(await readFile(path.join(target, 'BUILD-MANIFEST.json'), 'utf8'));
  const hashes = await fileHashes(target); delete hashes['BUILD-MANIFEST.json'];
  if (manifest.kind !== kind || JSON.stringify(manifest.files) !== JSON.stringify(hashes)) throw new Error('Firebase build changed; preserve it before rebuilding');
}
try {
  await cp(path.join(parent, 'static'), stage, { recursive: true });
  for (const name of ['diary-view.mjs', 'diary-crypto.mjs', 'diary.css']) await cp(path.join(project, 'dist', name), path.join(stage, name));
  await build({ entryPoints: [path.join(project, 'firebase/cloud-client.mjs')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof', outfile: path.join(stage, 'firebase-cloud.mjs'), metafile: true }).then(async result => {
    await writeFile(path.join(parent, 'firebase-bundle-meta.json'), JSON.stringify(result.metafile, null, 2));
  });
  await cp(path.join(project, 'firebase/public-config.json'), path.join(stage, 'firebase-config.json'));
  let app = await readFile(path.join(stage, 'app.mjs'), 'utf8');
  app = replaceOnce(app, "import { renderPolynomialGame } from './polynomial-view.mjs';", "import { renderPolynomialGame } from './polynomial-view.mjs';\nimport { renderCloudDiary as renderDiary } from './firebase-cloud.mjs';");
  app = replaceOnce(app, "['#/polynomial', () => renderPolynomialGame(main)]", "['#/polynomial', () => renderPolynomialGame(main)],\n  ['#/diary', () => renderDiary(main)]");
  app = replaceOnce(app, "  if (previous !== null)", "  if (path === '#/diary') document.title = '오늘의 일기 · 교실 도구 허브';\n  if (previous !== null)");
  await writeFile(path.join(stage, 'app.mjs'), app);
  const tools = await readFile(path.join(project, 'dist/tools.mjs'), 'utf8');
  await writeFile(path.join(stage, 'tools.mjs'), replaceOnce(tools, '이 PC에 암호화하여 보관하세요.', '내 Google 계정에 암호화하여 보관하세요.'));
  const hub = await readFile(path.join(stage, 'hub-view.mjs'), 'utf8');
  // Hub artwork captions describe the tool, independently of the diary backend.
  await writeFile(path.join(stage, 'hub-view.mjs'), hub);
  let html = await readFile(path.join(stage, 'index.html'), 'utf8');
  html = replaceOnce(html, '  <link rel="stylesheet" href="./polynomial.css">', '  <link rel="stylesheet" href="./polynomial.css">\n  <link rel="stylesheet" href="./diary.css">');
  html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/, `$1${firebaseHeaders()['Content-Security-Policy'].replace("; frame-ancestors 'none'", '')}$2`);
  await writeFile(path.join(stage, 'index.html'), html);
  await rm(path.join(stage, 'BUILD-MANIFEST.json'));
  const files = await fileHashes(stage), release = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  await writeFile(path.join(stage, 'BUILD-MANIFEST.json'), JSON.stringify({ kind, release, files }, null, 2) + '\n');
  const archive = path.join(parent, 'firebase-releases', release);
  await safeOutput(path.dirname(archive)); await safeOutput(archive); await mkdir(path.dirname(archive), { recursive: true });
  if (!(await exists(archive))) await cp(stage, archive, { recursive: true });
  if (await exists(target)) await rename(target, backup);
  try { await rename(stage, target); } catch (error) { if (await exists(backup)) await rename(backup, target); throw error; }
  if (await exists(backup)) await rm(backup, { recursive: true });
  const configPath = path.join(project, 'firebase.json'), config = JSON.parse(await readFile(configPath, 'utf8'));
  const asHeaders = value => Object.entries(value).map(([key, value]) => ({ key, value }));
  config.hosting.headers = [
    // Reserved Firebase authentication helpers keep their managed response policy.
    { source: '!/__/auth/**', headers: asHeaders(firebaseHeaders()) },
    { source: '/ocr-worker.js', headers: asHeaders(firebaseHeaders({ ocr: true })) },
    { source: '**/*.mjs', headers: [{ key: 'Content-Type', value: 'text/javascript; charset=utf-8' }] }
  ];
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Firebase build ready: build/firebase (${release.slice(0, 12)})`);
} finally { if (await exists(stage)) await rm(stage, { recursive: true }); }
