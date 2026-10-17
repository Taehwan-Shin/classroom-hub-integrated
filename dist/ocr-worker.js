// Both program and models are static app assets. Never fetch a user's file or text.
importScripts('./vendor/tesseract/models.js');
self.fetch = async resource => {
  const url = new URL(typeof resource === 'string' ? resource : resource.url, self.location.href);
  const lang = /\/local-models\/(kor|eng)\.traineddata\.gz$/.exec(url.pathname)?.[1];
  if (url.origin !== self.location.origin || !lang || url.search || url.hash) throw new Error('External OCR resources disabled');
  const encoded = self.LOCAL_OCR_MODELS[lang];
  const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
  return new Response(bytes, { status: 200 });
};
importScripts('./vendor/tesseract/worker.min.js');
