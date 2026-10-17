export const PROJECT = 'classroom-diary-098bae6e';
export function firebaseHeaders({ ocr = false } = {}) {
  return {
    'Content-Security-Policy': `default-src 'self'; script-src 'self' https://apis.google.com${ocr ? " 'wasm-unsafe-eval'" : ''}; worker-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://apis.google.com https://${PROJECT}.firebaseapp.com; frame-src https://${PROJECT}.firebaseapp.com; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
  };
}
