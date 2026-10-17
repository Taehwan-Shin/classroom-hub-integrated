import * as pdfjs from './vendor/pdfjs/pdf.mjs';
import { binaryData } from './vendor/pdfjs/binary-data.mjs';
import { createLocalOcr } from './local-ocr.mjs';
import { MAX_PAGES, MAX_TEXT_LENGTH, textFromItems, analyzePage, summarizePages } from './pdf-analysis.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
class MemoryBinaryDataFactory {
  async fetch({ kind, filename }) {
    const collection = ['cMapUrl', 'standardFontDataUrl'].includes(kind) ? binaryData[kind] : null;
    const encoded = collection && Object.hasOwn(collection, filename) ? collection[filename] : null;
    if (!encoded) throw new Error('LOCAL_RESOURCE_UNAVAILABLE');
    return Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  }
}
export function createPdfInspector() {
  let task = null, ocr = null, canceled = false, renderTask = null, ocrProgress = () => {};
  const check = () => { if (canceled) throw new Error('CANCELED'); };
  async function cleanup() {
    canceled = true;
    renderTask?.cancel();
    if (ocr) { ocr.terminate(); ocr = null; }
    const currentTask = task; task = null;
    if (currentTask) await currentTask.destroy().catch(() => {});
  }
  async function recognize(page, progress) {
    check();
    if (!ocr) {
      progress('한국어 OCR 준비 중', null);
      ocr = createLocalOcr(percent => { if (!canceled) ocrProgress('글자 인식 중', percent); });
      await ocr.ready; check();
    }
    check();
    ocrProgress = progress;
    const initial = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 2600 / Math.max(initial.width, initial.height), Math.sqrt(6000000 / (initial.width * initial.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    try {
      renderTask = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, background: 'rgb(255,255,255)' });
      await renderTask.promise; renderTask = null; check();
      const { data } = await ocr.recognize(canvas);
      check(); return { text: data.text, confidence: Number.isFinite(data.confidence) ? data.confidence : null };
    } finally { canvas.width = 0; canvas.height = 0; }
  }
  return {
    cancel: cleanup,
    async inspect(buffer, { forceOcr = false, onProgress = () => {} } = {}) {
      let passwordProtected = false;
      try {
        check();
        task = pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0,
          isEvalSupported: false, enableXfa: false, disableFontFace: true, useSystemFonts: false,
          useWorkerFetch: false, BinaryDataFactory: MemoryBinaryDataFactory,
          useWasm: false, isImageDecoderSupported: false, stopAtErrors: true,
          cMapPacked: true, disableAutoFetch: true, maxImageSize: 25000000 });
        task.onPassword = () => { passwordProtected = true; void task.destroy(); };
        const document = await task.promise; check();
        if (document.numPages > MAX_PAGES) throw new Error('PAGE_LIMIT');
        const pages = []; let totalText = 0;
        for (let number = 1; number <= document.numPages; number++) {
          check(); onProgress(`${number} / ${document.numPages}쪽 읽는 중`, null);
          const page = await document.getPage(number);
          const content = await page.getTextContent(); check();
          let text = textFromItems(content.items), method = 'PDF 텍스트', confidence = null;
          if (forceOcr || !text.replace(/\s/g, '')) {
            const result = await recognize(page, (phase, percent) => onProgress(`${number} / ${document.numPages}쪽 · ${phase}`, percent));
            text = result.text; confidence = result.confidence; method = 'OCR';
          }
          totalText += text.length;
          if (totalText > MAX_TEXT_LENGTH) throw new Error('TEXT_LIMIT');
          pages.push(analyzePage(text, number, method, confidence));
          page.cleanup();
          if (pages.reduce((count, item) => count + item.issues.length, 0) > 10000) throw new Error('TOO_MANY_CANDIDATES');
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        check(); return { pages, summary: summarizePages(pages) };
      } catch (error) {
        if (passwordProtected) throw new Error('PASSWORD');
        if (canceled) throw new Error('CANCELED');
        const allowed = ['PAGE_LIMIT', 'TEXT_LIMIT', 'TOO_MANY_CANDIDATES', 'OCR_UNAVAILABLE'];
        throw new Error(allowed.includes(error.message) ? error.message : 'PDF_READ_FAILED');
      } finally { await cleanup(); }
    }
  };
}
