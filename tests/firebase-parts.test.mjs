import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitVault, joinVault, PART_SIZE } from '../firebase/vault-parts.mjs';
import { deriveKey, newSalt, seal, unseal } from '../dist/diary-crypto.mjs';
test('cloud chunks preserve encrypted records and reject mixed revisions, missing parts and oversized vaults', async () => {
  const salt = newSalt(), key = await deriveKey('synthetic-cloud-password', salt);
  const entries = Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2,'0')}`, title: 'Synthetic', body: '합성'.repeat(9500), mood: '평온' }));
  const vault = await seal(entries, key, salt), revision = crypto.randomUUID();
  const { header, parts } = splitVault(vault, revision);
  assert.ok(parts.length > 1 && parts.every(p => p.ciphertext.length <= PART_SIZE));
  assert.deepEqual(await unseal(joinVault(header, parts).vault, key), entries);
  assert.throws(() => joinVault(header, parts.slice(1)));
  assert.throws(() => joinVault(header, parts.map((p,i) => i ? p : { ...p, revision: crypto.randomUUID() })));
  assert.throws(() => splitVault({ ...vault, ciphertext: 'A'.repeat(8*1024*1024+1) }, revision));
});
