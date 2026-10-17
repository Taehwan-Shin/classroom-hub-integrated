import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function fileHashes(directory, prefix = '') {
  const result = {};
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const name = prefix + entry.name, target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in build inputs');
    if (entry.isDirectory()) Object.assign(result, await fileHashes(target, name + '/'));
    else if (entry.isFile()) result[name] = createHash('sha256').update(await readFile(target)).digest('hex');
    else throw new Error('Unsupported build input');
  }
  return result;
}
export async function verifyVendor(project) {
  const pinned = JSON.parse(await readFile(path.join(project, 'scripts/vendor-checksums.json'), 'utf8'));
  const current = await fileHashes(path.join(project, 'dist/vendor'));
  if (JSON.stringify(current) !== JSON.stringify(pinned)) throw new Error('Vendor integrity mismatch: review local assets before building');
  return current;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyVendor(fileURLToPath(new URL('../', import.meta.url)));
  console.log('Vendored files match the pinned local baseline. Current vulnerability status remains unverified.');
}
