import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiaryStore, MAX_BYTES } from './diary-store.mjs';
import { acquireDiaryLock } from './diary-lock.mjs';
import { securityHeaders } from './security-policy.mjs';

if (process.env.PREVIEW_STATIC && process.env.PREVIEW_STATIC !== '1') throw new Error('Invalid preview mode');
const staticPreview = process.env.PREVIEW_STATIC === '1';
const root = await realpath(fileURLToPath(new URL(staticPreview ? '../build/static/' : '../dist/', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const diaryDirectory = fileURLToPath(new URL('../data/diary/', import.meta.url));
const diary = staticPreview ? null : createDiaryStore(diaryDirectory);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
let releaseDiaryLock = async () => {};
if (!staticPreview) {
  try { releaseDiaryLock = await acquireDiaryLock(diaryDirectory); }
  catch (error) {
    process.stderr.write(error.message === 'LOCKED'
      ? 'Diary server is already running or a lock remains after an interrupted shutdown. See README for recovery.\n'
      : 'Diary storage could not be opened. Existing data was not changed.\n');
    process.exit(1);
  }
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  const ocrWorker = request.url?.split('?')[0] === '/ocr-worker.js';
  for (const [name, value] of Object.entries(securityHeaders({ diary: !staticPreview, ocr: ocrWorker }))) response.setHeader(name, value);
  const origin = `http://127.0.0.1:${port}`;
  if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403); response.end('Forbidden'); return; }
  if (request.url === '/api/diary') {
    if (staticPreview) { response.writeHead(404); response.end('Not found'); return; }
    const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data)); };
    if (request.headers['x-diary-request'] !== '1' || (request.headers.origin && request.headers.origin !== origin) ||
        (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) { send(403, { error: '요청 출처를 확인할 수 없습니다.' }); return; }
    try {
      if (request.method === 'GET') { send(200, await diary.read()); return; }
      if (request.method !== 'PUT') { send(405, { error: '허용되지 않은 요청입니다.' }); return; }
      if (request.headers['content-type'] !== 'application/json') { send(415, { error: '잘못된 데이터 형식입니다.' }); return; }
      let size = 0; const chunks = [];
      for await (const chunk of request) { size += chunk.length; if (size > MAX_BYTES) { send(413, { error: '저장 용량 제한을 초과했습니다.' }); return; } chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || Object.keys(body).sort().join(',') !== 'revision,vault' || (body.revision !== null && (typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision)))) throw new Error('INVALID');
      send(200, await diary.write(body.revision, body.vault));
    } catch (error) { send(['CONFLICT', 'LOCKED'].includes(error.message) ? 409 : 400, { error: error.message === 'CONFLICT' ? '다른 창에서 기록이 변경되었습니다. 입력 내용을 보관한 뒤 잠금 후 다시 여세요.' : error.message === 'LOCKED' ? '다른 저장 작업이 진행 중이거나 잠금 파일이 남아 있습니다. 입력 내용을 유지하고 README의 복구 절차를 확인해주세요.' : '데이터를 읽거나 저장 상태를 확인할 수 없습니다. 입력 내용을 보관하고 기록 파일 상태를 확인해주세요.' }); }
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end('Method not allowed'); return; }
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const target = await realpath(path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`));
    const relative = path.relative(root, target);
    const type = types[path.extname(target)];
    if (relative.startsWith('..') || path.isAbsolute(relative) || !type) throw new Error('Not allowed');
    const data = await readFile(target);
    response.writeHead(200, { 'Content-Type': type });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); }
});
const releaseLock = async () => {
  try { await releaseDiaryLock(); }
  catch { process.stderr.write('Diary lock cleanup failed. See README before restarting.\n'); process.exitCode = 1; }
};
server.on('error', () => { process.stderr.write('Local preview could not start. Choose another PORT if it is in use.\n'); process.exitCode = 1; void releaseLock(); });
server.once('close', () => { void releaseLock(); });
server.listen(port, '127.0.0.1', () => process.stdout.write(`Local: http://127.0.0.1:${port}\n`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
