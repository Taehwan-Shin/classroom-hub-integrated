// Minimal RPC client for the pinned Tesseract.js 6.0.1 worker protocol.
// Own the native Worker from creation so cancellation also stops initialization.
export function createLocalOcr(onProgress = () => {}) {
  const worker = new Worker(new URL('./ocr-worker.js', import.meta.url));
  const pending = new Map(); let sequence = 0, stopped = false;
  function terminate() {
    if (stopped) return;
    stopped = true; worker.terminate();
    for (const request of pending.values()) request.reject(new Error('CANCELED'));
    pending.clear();
  }
  function send(action, payload) {
    if (stopped) return Promise.reject(new Error('CANCELED'));
    const jobId = `local-${++sequence}`;
    return new Promise((resolve, reject) => {
      pending.set(jobId, { resolve, reject });
      worker.postMessage({ workerId: 'local-document', jobId, action, payload });
    });
  }
  worker.onmessage = ({ data }) => {
    if (stopped) return;
    const request = pending.get(data.jobId);
    if (!request) return;
    if (data.status === 'progress') {
      if (data.data?.status === 'recognizing text') onProgress(Math.round(data.data.progress * 100));
    } else {
      pending.delete(data.jobId);
      if (data.status === 'resolve') request.resolve(data.data);
      else request.reject(new Error('OCR_UNAVAILABLE'));
    }
  };
  worker.onerror = event => {
    event.preventDefault();
    for (const request of pending.values()) request.reject(new Error('OCR_UNAVAILABLE'));
    pending.clear(); worker.terminate(); stopped = true;
  };
  const ready = (async () => {
    await send('load', { options: { lstmOnly: true, corePath: new URL('./vendor/tesseract/core', import.meta.url).href, logging: false } });
    await send('loadLanguage', { langs: 'kor+eng', options: { langPath: new URL('./local-models', import.meta.url).href, cacheMethod: 'none', gzip: true, lstmOnly: true } });
    await send('initialize', { langs: 'kor+eng', oem: 1, config: {} });
    await send('setParameters', { params: { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' } });
  })();
  return { ready, terminate,
    async recognize(canvas) {
      await ready;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('OCR_UNAVAILABLE');
      const image = new Uint8Array(await blob.arrayBuffer());
      const data = await send('recognize', { image, options: {}, output: { text: true } });
      return { data };
    }
  };
}
