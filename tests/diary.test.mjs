import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDiaryStore, validateEnvelope } from '../scripts/diary-store.mjs';
import { deriveKey, newSalt, seal, unseal, validateEntries } from '../dist/diary-crypto.mjs';
import { acquireDiaryLock } from '../scripts/diary-lock.mjs';

test('encrypted persistence, wrong password, tampering, conflicts, and corrupt file preservation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diary-test-'));
  try {
    const store = createDiaryStore(dir), salt = newSalt();
    const key = await deriveKey('synthetic-test-passphrase', salt);
    const entry = { date: '2026-10-11', title: '<script>synthetic</script>', body: 'SYNTHETIC_ONLY_MARKER', mood: '평온' };
    const vault = await seal([entry], key, salt);
    const first = await store.write(null, vault);
    const file = await readFile(path.join(dir, 'vault.json'), 'utf8');
    assert.ok(!file.includes(entry.body) && !file.includes(entry.title) && !file.includes(entry.date));
    assert.deepEqual(await unseal((await createDiaryStore(dir).read()).vault, key), [entry]);
    await assert.rejects(unseal(vault, await deriveKey('wrong-synthetic-password', salt)));
    const altered = { ...vault, ciphertext: (vault.ciphertext[0] === 'A' ? 'B' : 'A') + vault.ciphertext.slice(1) };
    await assert.rejects(unseal(altered, key));
    assert.throws(() => validateEnvelope({ ...vault, iterations: 1 }));
    assert.throws(() => validateEntries([{ ...entry, date: '2026-02-30' }]));
    assert.throws(() => validateEntries([entry, entry]));
    const updates = await Promise.allSettled([store.write(first.revision, await seal([], key, salt)), store.write(first.revision, vault)]);
    assert.equal(updates.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(updates.find(r => r.status === 'rejected').reason.message, 'CONFLICT');
    await writeFile(path.join(dir, 'vault.json'), '{corrupt');
    await assert.rejects(store.write(null, vault));
    assert.equal(await readFile(path.join(dir, 'vault.json'), 'utf8'), '{corrupt');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('independent stores cannot both accept the same revision and release write locks after failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diary-concurrency-'));
  try {
    const salt = newSalt(), key = await deriveKey('synthetic-lock-test-password', salt);
    const first = createDiaryStore(dir), second = createDiaryStore(dir);
    const initial = await first.write(null, await seal([], key, salt));
    const vaults = await Promise.all(['A', 'B'].map(body => seal([{ date: '2026-01-01', title: '', body, mood: '보통' }], key, salt)));
    const updates = await Promise.allSettled([first.write(initial.revision, vaults[0]), second.write(initial.revision, vaults[1])]);
    assert.equal(updates.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(['LOCKED', 'CONFLICT'].includes(updates.find(result => result.status === 'rejected').reason.message));
    await assert.rejects(readFile(path.join(dir, '.write.lock')), { code: 'ENOENT' });
    await assert.rejects(first.write(initial.revision, vaults[0]), /CONFLICT/);
    const current = await first.read();
    await second.write(current.revision, await seal([], key, salt));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('server locks reject a second owner and fail closed on a preexisting lock', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'diary-lock-'));
  try {
    const release = await acquireDiaryLock(dir);
    await assert.rejects(acquireDiaryLock(dir), /LOCKED/);
    await release(); await release();
    await writeFile(path.join(dir, '.server.lock'), 'synthetic-stale-lock');
    await assert.rejects(acquireDiaryLock(dir), /LOCKED/);
    assert.equal(await readFile(path.join(dir, '.server.lock'), 'utf8'), 'synthetic-stale-lock');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
