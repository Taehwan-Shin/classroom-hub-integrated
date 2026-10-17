export const PART_SIZE = 700000, MAX_CIPHERTEXT = 8 * 1024 * 1024, MAX_PARTS = 12;
export function splitVault(vault, revision) {
  if (!vault || Object.keys(vault).sort().join(',') !== 'ciphertext,iterations,iv,salt,version' || vault.version !== 1 || vault.iterations !== 600000 ||
      typeof vault.salt !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(vault.salt) || typeof vault.iv !== 'string' || !/^[A-Za-z0-9+/]{16}$/.test(vault.iv) ||
      typeof vault.ciphertext !== 'string' || vault.ciphertext.length < 24 || vault.ciphertext.length > MAX_CIPHERTEXT || !/^[A-Za-z0-9+/]+={0,2}$/.test(vault.ciphertext) ||
      typeof revision !== 'string' || !/^[a-f0-9-]{36}$/.test(revision)) throw new Error('저장 데이터의 형식 또는 8MiB 용량 제한을 확인해주세요.');
  const parts = [];
  for (let offset = 0; offset < vault.ciphertext.length; offset += PART_SIZE) parts.push({ revision, index: parts.length, ciphertext: vault.ciphertext.slice(offset, offset + PART_SIZE) });
  return { header: { version: vault.version, iterations: vault.iterations, salt: vault.salt, iv: vault.iv, revision, count: parts.length }, parts };
}
export function joinVault(header, parts) {
  if (!header || !Number.isInteger(header.count) || header.count < 1 || header.count > MAX_PARTS || parts.length !== header.count ||
      parts.some((p, i) => !p || p.index !== i || p.revision !== header.revision || typeof p.ciphertext !== 'string' || !p.ciphertext.length || p.ciphertext.length > PART_SIZE)) throw new Error('기록이 변경되었거나 저장 데이터가 손상되었습니다. 다시 열어주세요.');
  const vault = { version: header.version, iterations: header.iterations, salt: header.salt, iv: header.iv, ciphertext: parts.map(p => p.ciphertext).join('') };
  splitVault(vault, header.revision);
  return { revision: header.revision, vault };
}
