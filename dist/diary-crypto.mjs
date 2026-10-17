const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const encode = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: decode(salt), iterations: 600000 }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export function newSalt() { return encode(crypto.getRandomValues(new Uint8Array(16))); }
export function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 10000) throw new Error('기록 형식이 올바르지 않습니다.');
  const dates = new Set();
  for (const e of entries) {
    if (!e || Object.keys(e).sort().join(',') !== 'body,date,mood,title' || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isFinite(Date.parse(e.date)) || new Date(e.date).toISOString().slice(0, 10) !== e.date || dates.has(e.date) ||
        typeof e.title !== 'string' || e.title.length > 120 || typeof e.body !== 'string' || !e.body.trim() || e.body.length > 20000 || !['평온', '기쁨', '보통', '피곤', '속상'].includes(e.mood)) throw new Error('기록 형식이나 길이를 확인해주세요.');
    dates.add(e.date);
  }
  return entries;
}
export async function seal(entries, key, salt) {
  validateEntries(entries);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('classroom-diary-v1') }, key, encoder.encode(JSON.stringify(entries)));
  return { version: 1, iterations: 600000, salt, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}
export async function unseal(vault, key) {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(vault.iv), additionalData: encoder.encode('classroom-diary-v1') }, key, decode(vault.ciphertext));
  return validateEntries(JSON.parse(decoder.decode(bytes)));
}
