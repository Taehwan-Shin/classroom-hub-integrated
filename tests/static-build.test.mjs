import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fileHashes } from '../scripts/verify-vendor.mjs';

test('public build excludes diary, preserves releases, and refuses altered inputs/outputs', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'static-build-test-'));
  const project = fileURLToPath(new URL('../', import.meta.url));
  try {
    for (const name of ['scripts', 'dist']) await cp(path.join(project, name), path.join(dir, name), { recursive: true });
    const run = () => spawnSync(process.execPath, [path.join(dir, 'scripts/build-static.mjs')], { encoding: 'utf8', windowsHide: true });
    assert.equal(run().status, 0);
    const output = path.join(dir, 'build/static'), files = await fileHashes(output);
    assert.ok(Object.keys(files).every(name => !name.includes('diary') && !name.startsWith('data/')));
    const app = await readFile(path.join(output, 'app.mjs'), 'utf8');
    assert.ok(!app.includes('renderDiary') && !app.includes('#/diary'));
    assert.ok(!(await readFile(path.join(output, 'tools.mjs'), 'utf8')).includes('personal-diary'));
    assert.ok((await readFile(path.join(output, 'index.html'), 'utf8')).includes("connect-src 'none'"));
    const manifest = JSON.parse(await readFile(path.join(output, 'BUILD-MANIFEST.json'), 'utf8'));
    assert.deepEqual(await fileHashes(path.join(dir, 'build/releases', manifest.release)), files);
    const headers = JSON.parse(await readFile(path.join(dir, 'build/security-headers.json'), 'utf8'));
    assert.ok(!headers.default['Content-Security-Policy'].includes('wasm-unsafe-eval'));
    assert.ok(headers.overrides['/ocr-worker.js']['Content-Security-Policy'].includes('wasm-unsafe-eval'));
    assert.equal(run().status, 0);
    assert.deepEqual(await fileHashes(output), files);
    await writeFile(path.join(dir, 'build/.build.lock'), 'SYNTHETIC_LOCK');
    assert.notEqual(run().status, 0);
    assert.deepEqual(await fileHashes(output), files);
    await rm(path.join(dir, 'build/.build.lock'));
    await writeFile(path.join(output, 'unexpected.txt'), 'SYNTHETIC_PRESERVE');
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(path.join(output, 'unexpected.txt'), 'utf8'), 'SYNTHETIC_PRESERVE');
    await rm(path.join(output, 'unexpected.txt'));
    await writeFile(path.join(dir, 'dist/.env'), 'SYNTHETIC_PRIVATE_DATA');
    assert.notEqual(run().status, 0);
    assert.deepEqual(await fileHashes(output), files);
    await rm(path.join(dir, 'dist/.env'));
    await writeFile(path.join(dir, 'dist/vendor/pdfjs/pdf.mjs'), 'SYNTHETIC_TAMPERING');
    assert.notEqual(run().status, 0);
    assert.deepEqual(await fileHashes(output), files);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(dir).startsWith('static-build-test-'));
    await rm(dir, { recursive: true, force: true });
  }
});
