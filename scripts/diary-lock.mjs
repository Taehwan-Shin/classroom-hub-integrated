import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';

// Exclusive file creation works across processes. Never remove an existing lock:
// a crashed process requires an operator to confirm it has stopped first.
export async function acquireDiaryLock(directory, name = '.server.lock') {
  if (!['.server.lock', '.write.lock'].includes(name)) throw new Error('INVALID_LOCK');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, name);
  let handle;
  try { handle = await open(filename, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('LOCKED'); throw error; }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try { await handle.close(); } finally { await unlink(filename); }
  };
}
