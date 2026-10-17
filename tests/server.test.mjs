import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function unusedPort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1');
  await once(server, 'listening'); const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
function launch(directory, port, staticPreview = false) {
  const source = `await import(${JSON.stringify(pathToFileURL(path.join(directory, 'scripts/serve.mjs')).href)}); process.on('message', () => { process.emit('SIGTERM'); process.disconnect(); });`;
  return spawn(process.execPath, ['--input-type=module', '-e', source], { windowsHide: true,
    env: { ...process.env, PORT: String(port), PREVIEW_STATIC: staticPreview ? '1' : '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
}
async function ready(child) {
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server did not start'); })]);
}
async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  if (child.connected) child.send('shutdown'); else child.kill();
  await exited;
}
test('different ports cannot open the same diary folder; graceful shutdown releases its lock', { timeout: 15000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diary-server-test-'));
  const children = [];
  try {
    await cp(fileURLToPath(new URL('../scripts/', import.meta.url)), path.join(dir, 'scripts'), { recursive: true });
    await mkdir(path.join(dir, 'dist')); await writeFile(path.join(dir, 'dist/index.html'), 'SYNTHETIC');
    const port = await unusedPort(), secondPort = await unusedPort();
    const first = launch(dir, port); children.push(first); await ready(first);
    const second = launch(dir, secondPort); children.push(second);
    assert.equal((await once(second, 'exit'))[0], 1);
    await readFile(path.join(dir, 'data/diary/.server.lock'));
    assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200);
    await stop(first);
    await assert.rejects(readFile(path.join(dir, 'data/diary/.server.lock')), { code: 'ENOENT' });
    const third = launch(dir, secondPort); children.push(third); await ready(third); await stop(third);
    // Public preview must not initialize private storage or expose its API.
    assert.ok(path.resolve(path.join(dir, 'data')).startsWith(path.resolve(dir) + path.sep));
    await rm(path.join(dir, 'data'), { recursive: true });
    await mkdir(path.join(dir, 'build/static'), { recursive: true });
    await writeFile(path.join(dir, 'build/static/index.html'), 'SYNTHETIC_PUBLIC');
    const preview = launch(dir, port, true); children.push(preview); await ready(preview);
    const response = await fetch(`http://127.0.0.1:${port}`);
    assert.ok(response.headers.get('content-security-policy').includes("connect-src 'none'"));
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/diary`, { method: 'PUT' })).status, 404);
    await assert.rejects(readFile(path.join(dir, 'data/diary/.server.lock')), { code: 'ENOENT' });
    await stop(preview);
  } finally {
    for (const child of children) await stop(child);
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(dir).startsWith('diary-server-test-'));
    await rm(dir, { recursive: true, force: true });
  }
});
