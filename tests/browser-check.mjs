// Uses an existing Playwright installation; it is not an application dependency.
// node tests/browser-check.mjs <absolute path to playwright/index.mjs>
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { tools } from '../dist/tools.mjs';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid test port');
const base = `http://127.0.0.1:${port}`;
await mkdir(new URL('../qa/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
const page = await context.newPage();
const errors = [], external = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('request', request => { if (!request.url().startsWith(base)) external.push(request.url()); });
const check = (name, condition) => { assert.ok(condition, name); results.push(name); };
const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(`../qa/${name}.png`, import.meta.url)), fullPage: true });
try {
  const response = await page.goto(base);
  check('HTTP readiness', response.status() === 200);
  await page.waitForSelector('.tool-card');
  const expected = tools.filter(tool => process.env.PREVIEW_STATIC !== '1' || tool.id !== 'personal-diary').map(tool => tool.route).sort();
  check('hub exposes the expected tool routes', JSON.stringify(await page.locator('.tool-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')).sort())) === JSON.stringify(expected));
  await screenshot('hub-desktop');
  await page.locator('.tool-card[href="#/timer"]').click();
  check('timer defaults to five minutes', await page.locator('.countdown').innerText() === '05:00');
  await screenshot('timer-desktop');
  await page.getByRole('button', { name: '3분', exact: true }).click();
  check('quick choice', await page.locator('.countdown').innerText() === '03:00');
  await page.locator('#seconds').fill('60');
  check('invalid seconds rejected and error linked', await page.locator('#start').isDisabled() && await page.locator('#seconds').getAttribute('aria-invalid') === 'true');
  await page.locator('#seconds').fill('0'); await page.locator('#minutes').fill('0');
  check('zero total rejected', await page.locator('#start').isDisabled());
  await page.locator('#seconds').fill('10');
  await page.locator('#sound').click();
  check('sound off toggle', await page.locator('#sound').getAttribute('aria-pressed') === 'false');
  await page.locator('#start').click();
  check('input locks during run', await page.locator('#minutes').isDisabled());
  await page.waitForTimeout(1100); await page.locator('#pause').click();
  const paused = await page.locator('.countdown').innerText();
  await page.waitForTimeout(300);
  check('pause preserves display', await page.locator('.countdown').innerText() === paused);
  await page.locator('#resume').click();
  check('resume starts running', await page.locator('.timer-stage').getAttribute('data-state') === 'running');
  await page.locator('.back-link').click(); await page.locator('.tool-card[href="#/timer"]').click();
  check('home navigation pauses timer and reentry preserves it', await page.locator('.timer-stage').getAttribute('data-state') === 'paused');
  await page.locator('#reset').click();
  check('reset restores configured duration', await page.locator('.countdown').innerText() === '00:10');
  await page.locator('#seconds').fill('1'); await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('.timer-stage').dataset.state === 'finished');
  check('finish displays zero and completion text', await page.locator('.countdown').innerText() === '00:00' && await page.locator('.timer-message').innerText() === '시간이 끝났어요');
  await page.waitForTimeout(200);
  check('finish is stable', await page.locator('.countdown').innerText() === '00:00');
  await page.locator('#reset').click();
  await page.evaluate(() => { Element.prototype.requestFullscreen = async () => { throw new Error('simulated denial'); }; });
  await page.locator('#fullscreen').click();
  check('fullscreen denial falls back to expanded view', await page.locator('.timer-stage').evaluate(el => el.classList.contains('expanded')));
  check('fullscreen error has visible explanation', (await page.locator('.feature-notice').innerText()).includes('확대'));
  await page.locator('#fullscreen').click();
  check('expanded view can be exited', !await page.locator('.timer-stage').evaluate(el => el.classList.contains('expanded')));
  await page.reload(); await page.waitForSelector('#sound');
  check('refresh resets time and sound preference', await page.locator('.countdown').innerText() === '05:00' && await page.locator('#sound').getAttribute('aria-pressed') === 'true');
  await page.evaluate(() => { window.AudioContext = class { constructor() { throw new Error('simulated audio denial'); } }; window.webkitAudioContext = undefined; });
  await page.locator('#minutes').fill('0'); await page.locator('#seconds').fill('1'); await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('.timer-stage').dataset.state === 'finished');
  check('audio denial still completes visibly', (await page.locator('.feature-notice').innerText()).includes('재생'));
  await page.goto(`${base}/#/not-registered`);
  check('unknown route handled safely', (await page.locator('h1').innerText()).includes('등록되지'));
  for (const width of [320, 768, 1366]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['#/', '#/timer']) {
      await page.goto(`${base}/${route}`); await page.waitForSelector('h1');
      check(`${route} no overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      check(`${route} main controls fit at ${width}`, await page.locator('main button, .tool-card').evaluateAll(nodes => nodes.filter(el => !el.hidden && el.getClientRects().length).every(el => { const rect = el.getBoundingClientRect(); return rect.x >= 0 && rect.right <= window.innerWidth && rect.height >= 44; })));
      if (width === 320) await screenshot(route === '#/' ? 'hub-mobile' : 'timer-mobile');
    }
  }
  await page.setViewportSize({ width: 683, height: 500 });
  await page.goto(`${base}/#/timer`);
  check('200 percent equivalent layout has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.locator('#minutes').focus(); await page.keyboard.press('Tab');
  check('keyboard traversal reaches seconds', await page.locator('#seconds').evaluate(el => el === document.activeElement));
  check('countdown does not announce each second', await page.locator('.countdown').getAttribute('aria-live') === 'off');
  await page.reload(); await page.waitForSelector('#fullscreen');
  await page.locator('#fullscreen').click();
  check('native fullscreen enters successfully', await page.evaluate(() => document.fullscreenElement?.id === 'timer-stage'));
  await page.locator('#fullscreen').click();
  check('native fullscreen exits preserving timer', await page.evaluate(() => !document.fullscreenElement) && await page.locator('.countdown').innerText() === '05:00');
  await page.locator('#minutes').fill('0'); await page.locator('#seconds').fill('1');
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('.timer-stage').dataset.state === 'finished');
  check('native WebAudio completes without fallback error', await page.locator('.feature-notice').innerText() === '');
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.reload(); await page.waitForSelector('.countdown'); await screenshot('timer-mobile');
  for (const [route, status] of [['/', 200], ['/timer-engine.mjs', 200], ['/SPEC.md', 404], ['/../SPEC.md', 404], ['/%2e%2e%5cSPEC.md', 404], ['/not-a-file', 404]]) {
    const result = await context.request.get(`${base}${route}`);
    check(`static server ${route} returns ${status}`, result.status() === status);
  }
  check('server blocks writes', (await context.request.post(base)).status() === 405);
  check('server HEAD supported', (await context.request.head(base)).status() === 200);
  check('no external network requests', external.length === 0);
  check('no uncaught browser or CSP errors', errors.length === 0);
  console.log(JSON.stringify({ passed: results.length, checks: results, errors }, null, 2));
} finally { await browser.close(); }
