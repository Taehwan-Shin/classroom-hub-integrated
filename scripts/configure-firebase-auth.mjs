import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PROJECT } from '../firebase/hosting-policy.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
const cache = process.env.npm_config_cache;
if (!cache) throw new Error('Set npm_config_cache to the verified Firebase CLI cache');
const require = createRequire(import.meta.url);
let configstore;
for (const directory of await readdir(path.join(cache, '_npx'))) {
  try { configstore = require(path.join(cache, '_npx', directory, 'node_modules/firebase-tools/lib/configstore.js')).configstore; break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
const email = configstore?.get('user')?.email;
if (typeof email !== 'string' || !email.includes('@')) throw new Error('Firebase CLI authentication is required');
// Operational support contact is read from the authenticated account at runtime;
// it is never hardcoded in source, included in builds, or printed in output.
const config = { auth: { authorizedDomains: [`${PROJECT}.web.app`, `${PROJECT}.firebaseapp.com`], providers: { googleSignIn: { oAuthBrandDisplayName: 'Classroom Diary', supportEmail: email } } } };
const filename = path.join(tmpdir(), `diary-auth-${randomUUID()}.json`);
let stdout = '', stderr = '';
try {
  await writeFile(filename, JSON.stringify(config), { flag:'wx', mode:0o600 });
  const command = `npx -y firebase-tools@latest deploy --only auth --project ${PROJECT} --config "${filename}" --non-interactive`;
  const child = spawn(process.env.ComSpec, ['/d','/s','/c',command], { cwd:project, env:process.env, windowsHide:true, windowsVerbatimArguments:true, stdio:['ignore','pipe','pipe'] });
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',resolve); });
  const clean = text => text.replaceAll(email,'[account]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[account]').replace(/("(?:access_token|refresh_token|id_token|sub|at_hash)"\s*:\s*)"[^"]*"/g,'$1"[redacted]"');
  for (const name of await readdir(project)) if (/^(firebase|firestore)-debug.*\.log$/.test(name)) {
    const logPath = path.join(project,name); await writeFile(logPath,clean(await readFile(logPath,'utf8')));
  }
  console.log(clean(stdout));
  if (code !== 0) { console.error(clean(stderr)); process.exitCode = 1; }
} finally { await unlink(filename).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
