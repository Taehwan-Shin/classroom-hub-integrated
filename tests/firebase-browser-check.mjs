import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium }=await import(pathToFileURL(process.argv[2]).href);
const base=process.argv[3]||'http://127.0.0.1:4187';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1366,height:950}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(base);assert.equal(response.status(),200);
  assert.ok(response.headers()['content-security-policy'].includes('https://identitytoolkit.googleapis.com'));
  assert.equal(await page.locator('.tool-card').count(),4);
  assert.ok((await page.locator('.tool-card[href="#/diary"]').innerText()).includes('Google 계정'));
  await page.locator('.tool-card[href="#/diary"]').click();
  await page.locator('#google-sign-in').waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#diary-gate').count(),0);
  assert.equal(await page.locator('#google-sign-in').isEnabled(),true);
  await mkdir(new URL('../qa/',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../qa/firebase-login-desktop.png',import.meta.url)),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:fileURLToPath(new URL('../qa/firebase-login-mobile.png',import.meta.url)),fullPage:true});
  assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
  assert.deepEqual(errors,[]);
  const config=await fetch(`${base}/firebase-config.json`).then(r=>r.json());assert.equal(config.projectId,'classroom-diary-098bae6e');
  const worker=await fetch(`${base}/ocr-worker.js`);assert.ok(worker.headers.get('content-security-policy').includes('wasm-unsafe-eval'));
  console.log('PASS: Firebase hosting headers, 4 hub tools, login gate, mobile layout, public config, OCR policy, no app errors or persisted session');
}finally{await browser.close();}
