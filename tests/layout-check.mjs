import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();
let count = 0;
try {
  for (const width of [320, 683, 768, 1366]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:4173/#/timer');
    await page.waitForSelector('#start');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    count++;
    assert.ok(await page.locator('#start, #reset').evaluateAll(nodes => nodes.every(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().height >= 44)));
    count++;
    if (width === 320 || width === 1366) await page.screenshot({ path: fileURLToPath(new URL(`../qa/timer-${width === 320 ? 'mobile' : 'desktop'}.png`, import.meta.url)), fullPage: true });
  }
  console.log(`Final layout checks passed: ${count}`);
} finally { await browser.close(); }
