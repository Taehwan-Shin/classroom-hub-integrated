import { readFile, open, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { acquireDiaryLock } from './diary-lock.mjs';

export const MAX_BYTES = 8 * 1024 * 1024;
export function validateEnvelope(value) {
  const b64 = (v, size) => typeof v === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === size && Buffer.from(v, 'base64').toString('base64') === v;
  if (!value || Object.keys(value).sort().join(',') !== 'ciphertext,iterations,iv,salt,version' || value.version !== 1 || value.iterations !== 600000 ||
      !b64(value.salt, 16) || !b64(value.iv, 12) || typeof value.ciphertext !== 'string' || value.ciphertext.length > MAX_BYTES ||
      !b64(value.ciphertext, Buffer.from(value.ciphertext, 'base64').length) || Buffer.from(value.ciphertext, 'base64').length < 16) throw new Error('INVALID');
  return value;
}
export function createDiaryStore(directory) {
  const filename = path.join(directory, 'vault.json');
  let queue = Promise.resolve();
  async function read() {
    try {
      const bytes = await readFile(filename);
      if (bytes.length > MAX_BYTES) throw new Error('INVALID');
      return { revision: createHash('sha256').update(bytes).digest('hex'), vault: validateEnvelope(JSON.parse(bytes)) };
    } catch (error) { if (error.code === 'ENOENT') return { revision: null, vault: null }; throw error; }
  }
  function write(revision, vault) {
    const operation = queue.then(async () => {
      validateEnvelope(vault);
      const release = await acquireDiaryLock(directory, '.write.lock');
      try {
        const current = await read();
        if (current.revision !== revision) throw new Error('CONFLICT');
        const bytes = Buffer.from(JSON.stringify(vault));
        if (bytes.length > MAX_BYTES) throw new Error('INVALID');
        const temp = path.join(directory, `.${randomUUID()}.tmp`);
        try {
          const handle = await open(temp, 'wx', 0o600);
          try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
          await rename(temp, filename);
        } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
        return { revision: createHash('sha256').update(bytes).digest('hex') };
      } finally { await release(); }
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { read, write };
}
