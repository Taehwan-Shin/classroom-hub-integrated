export function contentSecurityPolicy({ diary = false, ocr = false } = {}) {
  return `default-src 'self'; script-src 'self'${ocr ? " 'wasm-unsafe-eval'" : ''}; worker-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src '${diary ? 'self' : 'none'}'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}
export function securityHeaders(options) {
  return {
    'Content-Security-Policy': contentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}
