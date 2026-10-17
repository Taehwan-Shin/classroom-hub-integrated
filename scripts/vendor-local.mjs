// Run only against the already downloaded, SHA-512 verified packages in tmp/vendor.
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const base = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(base, 'tmp/vendor');
const target = path.join(base, 'dist/vendor');
await mkdir(path.join(target, 'pdfjs'), { recursive: true });
await mkdir(path.join(target, 'tesseract/core'), { recursive: true });
for (const name of ['pdf.mjs', 'pdf.worker.mjs']) await copyFile(path.join(source, 'package/build', name), path.join(target, 'pdfjs', name));
await copyFile(path.join(source, 'package/LICENSE'), path.join(target, 'pdfjs/LICENSE.txt'));
const binary = {};
for (const [folder, kind] of [['cmaps', 'cMapUrl'], ['standard_fonts', 'standardFontDataUrl']]) {
  binary[kind] = {};
  for (const name of await readdir(path.join(source, 'package', folder))) {
    if (name.startsWith('LICENSE')) await copyFile(path.join(source, 'package', folder, name), path.join(target, 'pdfjs', `${folder}-${name}.txt`));
    if (!/\.(bcmap|pfb|ttf)$/.test(name)) continue;
    binary[kind][name] = (await readFile(path.join(source, 'package', folder, name))).toString('base64');
  }
}
await writeFile(path.join(target, 'pdfjs/binary-data.mjs'), `// Mozilla PDF.js built-in CMaps and standard fonts. See LICENSE.txt.\nexport const binaryData = ${JSON.stringify(binary)};\n`);
for (const name of ['worker.min.js', 'worker.min.js.LICENSE.txt']) await copyFile(path.join(source, 'tesseract/package/dist', name), path.join(target, 'tesseract', name));
await copyFile(path.join(source, 'tesseract/package/LICENSE.md'), path.join(target, 'tesseract/LICENSE.txt'));
for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) await copyFile(path.join(source, 'ocr-core/package', name), path.join(target, 'tesseract/core', name));
await copyFile(path.join(source, 'ocr-core/package/LICENSE'), path.join(target, 'tesseract/core/LICENSE.txt'));
await copyFile(path.join(source, 'ocr-core/package/LICENSE'), path.join(target, 'tesseract/models-LICENSE.txt'));
const languages = {};
for (const lang of ['kor', 'eng']) {
  languages[lang] = (await readFile(path.join(source, lang, 'package/4.0.0_best_int', `${lang}.traineddata.gz`))).toString('base64');
}
await writeFile(path.join(target, 'tesseract/models.js'), `// Static OCR language data only; no user document. See THIRD_PARTY.md.\nself.LOCAL_OCR_MODELS = ${JSON.stringify(languages)};\n`);
for (const name of ['pdfjs-source.json', 'ocr-source.json']) await copyFile(path.join(source, name), path.join(target, name));
console.log('Static local PDF and OCR assets prepared.');
