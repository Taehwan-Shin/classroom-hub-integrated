import { readFile, writeFile, mkdir, cp, lstat, rename, rm, open, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tools } from '../dist/tools.mjs';
import { fileHashes, verifyVendor } from './verify-vendor.mjs';
import { securityHeaders } from './security-policy.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const parent = path.join(project, 'build'), target = path.join(parent, 'static');
const stage = path.join(parent, `.stage-${randomUUID()}`);
const backup = path.join(parent, `.previous-${randomUUID()}`);
const excluded = new Set(['diary-view.mjs', 'diary-crypto.mjs', 'diary.css']);
const publicFiles = new Set(['app.mjs', 'audio.mjs', 'excel-export.mjs', 'hub-view.mjs', 'index.html', 'local-ocr.mjs', 'ocr-worker.js',
  'pdf-analysis.mjs', 'pdf-reader.mjs', 'pdf-view.mjs', 'polynomial-data.mjs', 'polynomial-engine.mjs', 'polynomial-view.mjs',
  'polynomial.css', 'styles.css', 'timer-engine.mjs', 'timer-view.mjs', 'tools.mjs', 'assets/mark.svg',
  'assets/illustrations/timer-v1.webp', 'assets/illustrations/pdf-v1.webp',
  'assets/illustrations/forest-v1.webp', 'assets/illustrations/journal-v1.webp']);
const kind = 'classroom-hub-static-v1';
function replaceOnce(source, before, after = '') {
  if (source.split(before).length !== 2) throw new Error('Static build source changed: review diary exclusion rules');
  return source.replace(before, after);
}
async function exists(filename) { try { return await lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function assertBuildPath(filename) {
  if (!path.resolve(filename).startsWith(path.resolve(parent) + path.sep)) throw new Error('Unsafe build path');
}
await verifyVendor(project);
const existingParent = await exists(parent);
if (existingParent && (!existingParent.isDirectory() || existingParent.isSymbolicLink())) throw new Error('Unsafe build directory');
await mkdir(parent, { recursive: true });
const lockFilename = path.join(parent, '.build.lock');
let buildLock;
try { buildLock = await open(lockFilename, 'wx'); }
catch (error) { if (error.code === 'EEXIST') throw new Error('Another build is running or a build lock remains; preserve existing outputs and confirm all builds have stopped before removing .build.lock'); throw error; }
try {
  if (await exists(target)) {
    const stat = await lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe build output');
    const previous = JSON.parse(await readFile(path.join(target, 'BUILD-MANIFEST.json'), 'utf8'));
    const current = await fileHashes(target);
    delete current['BUILD-MANIFEST.json'];
    if (previous.kind !== kind || JSON.stringify(previous.files) !== JSON.stringify(current)) throw new Error('Existing build was edited or contains unknown files; preserve it before rebuilding');
  }
  await mkdir(stage, { recursive: true });
  try {
    // Validate the whole input tree before copying; no symlinks, private folders or
    // user data are included. Only dist's static assets are copied.
    const inputs = await fileHashes(path.join(project, 'dist'));
    if (Object.keys(inputs).some(name => !excluded.has(name) && !publicFiles.has(name) && !name.startsWith('vendor/'))) throw new Error('Unexpected static input: review the public asset allowlist');
    await cp(path.join(project, 'dist'), stage, { recursive: true, filter: source => !excluded.has(path.basename(source)) });
    let app = (await readFile(path.join(stage, 'app.mjs'), 'utf8')).replace(/\r\n/g, '\n');
    app = replaceOnce(app, "import { renderDiary } from './diary-view.mjs';");
    app = replaceOnce(app, ",\n  ['#/diary', () => renderDiary(main)]");
    app = replaceOnce(app, "  if (path === '#/diary') document.title = '오늘의 일기 · 교실 도구 허브';");
    await writeFile(path.join(stage, 'app.mjs'), app);
    const toolSource = await readFile(path.join(stage, 'tools.mjs'), 'utf8');
    const validator = toolSource.slice(toolSource.indexOf('export function validateTools'));
    if (!validator.startsWith('export function validateTools')) throw new Error('Tool validator missing');
    await writeFile(path.join(stage, 'tools.mjs'), `export const tools = Object.freeze(${JSON.stringify(tools.filter(tool => tool.id !== 'personal-diary'), null, 2)}.map(Object.freeze));\n\n${validator}`);
    let html = await readFile(path.join(stage, 'index.html'), 'utf8');
    html = replaceOnce(html, '  <link rel="stylesheet" href="./diary.css">');
    html = replaceOnce(html, "connect-src 'self'", "connect-src 'none'");
    await writeFile(path.join(stage, 'index.html'), html);
    const files = await fileHashes(stage);
    const release = createHash('sha256').update(JSON.stringify(files)).digest('hex');
    await writeFile(path.join(stage, 'BUILD-MANIFEST.json'), JSON.stringify({ kind, release, files }, null, 2) + '\n');
    const headers = { default: securityHeaders(), overrides: { '/ocr-worker.js': securityHeaders({ ocr: true }) }, mime: { '.mjs': 'text/javascript', '.js': 'text/javascript', '.webp': 'image/webp' } };
    await writeFile(path.join(parent, 'security-headers.json'), JSON.stringify(headers, null, 2) + '\n');
    // Preserve every content-addressed release for rollback; never overwrite one.
    const releaseDirectory = path.join(parent, 'releases', release);
    for (const directory of [path.dirname(releaseDirectory), releaseDirectory]) {
      const stat = await exists(directory);
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Unsafe release archive');
    }
    await mkdir(path.dirname(releaseDirectory), { recursive: true });
    if (!(await exists(releaseDirectory))) await cp(stage, releaseDirectory, { recursive: true });
    else if (JSON.stringify(await fileHashes(releaseDirectory)) !== JSON.stringify(await fileHashes(stage))) throw new Error('Release archive integrity mismatch');
    assertBuildPath(stage); assertBuildPath(target); assertBuildPath(backup);
    if (await exists(target)) await rename(target, backup);
    try { await rename(stage, target); }
    catch (error) { if (await exists(backup)) await rename(backup, target); throw error; }
    if (await exists(backup)) await rm(backup, { recursive: true });
    console.log(`Public static build ready: build/static (${release.slice(0, 12)}). Diary excluded. Apply build/security-headers.json to the host before publishing.`);
  } finally {
    if (await exists(stage)) { assertBuildPath(stage); await rm(stage, { recursive: true }); }
  }
} finally {
  try { await buildLock.close(); } finally { await unlink(lockFilename); }
}
