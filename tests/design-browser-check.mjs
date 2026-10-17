// Visual regression against an isolated copy. Never opens the real diary store.
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(path.join(tmpdir(), 'hub-design-'));
let child, browser;
try {
  await cp(path.join(root, 'dist'), path.join(fixture, 'dist'), { recursive: true });
  await mkdir(path.join(fixture, 'scripts'));
  for (const name of ['serve.mjs', 'diary-store.mjs', 'diary-lock.mjs', 'security-policy.mjs']) await copyFile(path.join(root, 'scripts', name), path.join(fixture, 'scripts', name));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const boot = `await import(${JSON.stringify(pathToFileURL(path.join(fixture, 'scripts/serve.mjs')).href)}); process.on('message', () => { process.emit('SIGTERM'); process.disconnect(); });`;
  child = spawn(process.execPath, ['--input-type=module', '-e', boot], { windowsHide: true, env: { ...process.env, PORT: String(port), PREVIEW_STATIC: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Fixture server failed'); })]);
  const { chromium } = await import(pathToFileURL(process.argv[2]).href);
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage(); const errors = [], external = []; let checks = 0;
  const base = `http://127.0.0.1:${port}`;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (new URL(request.url()).origin !== base && !request.url().startsWith('data:')) external.push('external'); });
  const check = (value, label) => { assert.ok(value, label); checks++; };
  await mkdir(path.join(root, 'qa'), { recursive: true });
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(base);
    await page.waitForSelector('.tool-card');
    for (const image of await page.locator('.card-art img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(node => node.decode()); }
    await page.evaluate(() => scrollTo(0, 0));
    check(await page.locator('.card-art img').count() === 4, 'all four local illustrations loaded');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}`);
    const cards = await page.locator('.tool-card').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    check(width > 760 ? cards[0].y === cards[1].y && cards[0].x !== cards[1].x : cards[0].y < cards[1].y, 'responsive card columns');
    check(await page.locator('.card-action').evaluateAll(nodes => nodes.every(n => n.getBoundingClientRect().height >= 44)), 'touch targets');
    if ([320, 1366].includes(width)) await page.screenshot({ path: path.join(root, 'qa', `design-hub-${width}.png`), fullPage: true });
    await page.locator('[href="#/timer"].tool-card').click();
    check(await page.locator('.countdown').innerText() === '05:00', 'timer route works');
    check(await page.locator('#start').evaluate(n => n.scrollWidth <= n.clientWidth && getComputedStyle(n, '::before').content !== 'none'), 'timer icon and text fit');
    await page.locator('#start').click(); await page.locator('#pause').click();
    check(await page.locator('.timer-stage').getAttribute('data-state') === 'paused', 'timer controls work');
    await page.locator('#reset').click();
  }
  for (const [width, height] of [[1024, 768], [1280, 720], [1366, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height }); await page.goto(base);
    await page.waitForSelector('.tool-card');
    const layout = await page.evaluate(() => ({ total: document.documentElement.scrollHeight, viewport: innerHeight, header: document.querySelector('.site-header').offsetHeight, intro: document.querySelector('.hub-intro').offsetHeight, tools: document.querySelector('.tools-section').offsetHeight, footer: document.querySelector('.site-footer').offsetHeight }));
    check(layout.total <= layout.viewport, `entire hub fits ${width}x${height} without scrolling: ${JSON.stringify(layout)}`);
    check(await page.locator('.tool-card').evaluateAll(nodes => nodes.every(n => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })), 'all four tools visible');
    if (width === 1366) await page.screenshot({ path: path.join(root, 'qa/design-hub-compact.png'), fullPage: true });
  }
  await page.goto(`${base}/#/polynomial`); await page.locator('.forest-cover-art').evaluate(n => n.decode());
  check(await page.locator('.forest-cover-art').getAttribute('src') === './assets/illustrations/forest-v1.webp', 'forest artwork reused');
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.screenshot({ path: path.join(root, 'qa/design-forest.png'), fullPage: true });
  await page.locator('.forest-start').click(); await page.locator('.forest-pause').click();
  check(await page.locator('.forest-play').isVisible(), 'game opens and pauses');
  await page.goto(`${base}/#/pdf`); check(await page.locator('#pdf-file').isVisible(), 'PDF input available');
  await page.goto(`${base}/#/diary`); await page.waitForSelector('#diary-gate:not([hidden])');
  check(await page.locator('#unlock-button').isVisible(), 'isolated empty diary gate available');
  check(external.length === 0 && errors.length === 0, 'no external requests or browser errors');
  await page.goto(base); await page.emulateMedia({ reducedMotion: 'reduce' });
  check(await page.locator('.tool-card').first().evaluate(n => getComputedStyle(n).transitionDuration === '0s'), 'reduced motion respected');
  await page.locator('.tool-card').first().focus();
  check(await page.locator('.tool-card').first().evaluate(n => getComputedStyle(n).outlineStyle !== 'none'), 'keyboard focus visible');
  // Image failure must not remove the linked tool or its name.
  await page.route('**/timer-v1.webp', route => route.fulfill({ status: 404, body: '' }));
  await page.reload(); await page.waitForSelector('.art-unavailable');
  check(await page.locator('[href="#/timer"].tool-card h3').innerText() === '교실 타이머', 'image failure preserves tool');
  if (process.env.RUN_REGRESSION === '1') {
    const regression = spawn(process.execPath, [path.join(root, 'tests/browser-check.mjs'), process.argv[2]], { windowsHide: true, env: { ...process.env, PORT: String(port), PREVIEW_STATIC: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; regression.stdout.on('data', data => { output += data; }); regression.stderr.on('data', data => { output += data; });
    const [exitCode] = await once(regression, 'exit'); assert.equal(exitCode, 0, output); console.log(output);
  }
  console.log(`Design browser checks passed: ${checks} (${process.env.BROWSER_CHANNEL || 'chrome'}). Real user data untouched.`);
} finally {
  await browser?.close();
  if (child && child.exitCode === null) { child.send('stop'); await once(child, 'exit'); }
  assert.ok(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(fixture).startsWith('hub-design-'));
  await rm(fixture, { recursive: true, force: true });
}
