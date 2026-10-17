import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.argv[2]).href);
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://classroom-diary-098bae6e.web.app/#/diary');
  await page.locator('#google-sign-in').waitFor();
  const popupPromise=page.waitForEvent('popup');
  await page.locator('#google-sign-in').click();
  const popup=await popupPromise;
  await popup.waitForURL(url=>url.hostname==='accounts.google.com',{timeout:30000});
  assert.equal(new URL(popup.url()).hostname,'accounts.google.com');
  await popup.close();
  await page.waitForFunction(()=>document.querySelector('#cloud-status')?.textContent.includes('취소'));
  assert.equal(await page.locator('#google-sign-in').isEnabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: live Firebase → Google OAuth popup → cancellation recovery (no actual user login)');
}finally{await browser.close();}
