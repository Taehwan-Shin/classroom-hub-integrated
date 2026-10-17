import { readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
let count=0;
for(const name of await readdir(root)) {
  if(!/^(firebase|firestore)-debug.*\.log$/.test(name))continue;
  const filename=path.join(root,name),stat=await lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Unexpected log file');
  const content=await readFile(filename,'utf8');
  const sanitized=content
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[account]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g,'[redacted access token]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted JWT]')
    .replace(/(["'](?:access_token|refresh_token|id_token|sub|at_hash)["']\s*:\s*)["'][^"']*["']/g,'$1"[redacted]"');
  if(sanitized!==content){await writeFile(filename,sanitized);count++;}
}
console.log(`Local CLI logs checked; ${count} files sanitized. No log contents printed.`);
