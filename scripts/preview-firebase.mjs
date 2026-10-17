import http from 'node:http';
import { realpath, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { firebaseHeaders } from '../firebase/hosting-policy.mjs';
const root = await realpath(fileURLToPath(new URL('../build/firebase/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT || 4187);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const server = http.createServer(async (req, res) => {
  for (const [key, value] of Object.entries(firebaseHeaders({ ocr: req.url === '/ocr-worker.js' }))) res.setHeader(key, value);
  if (req.headers.host !== `127.0.0.1:${port}` || !['GET','HEAD'].includes(req.method)) { res.writeHead(403); res.end(); return; }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`), pathname = decodeURIComponent(url.pathname);
    const target = await realpath(path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`));
    const relative = path.relative(root, target), type = types[path.extname(target)];
    if (relative.startsWith('..') || path.isAbsolute(relative) || !type) throw new Error('Not allowed');
    const bytes = await readFile(target); res.writeHead(200, { 'Content-Type': type }); res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local Firebase preview: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
