import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine, parseDuration, formatDuration } from '../dist/timer-engine.mjs';
import { tools, validateTools } from '../dist/tools.mjs';

function clock() {
  let time = 100000;
  return { engine: new TimerEngine(() => time), advance: ms => { time += ms; } };
}
test('duration accepts boundaries and leading zeroes', () => {
  assert.equal(parseDuration('00', '01').durationMs, 1000);
  assert.equal(parseDuration('99', '59').durationMs, 5999000);
  assert.equal(parseDuration('03', '00').durationMs, 180000);
});
test('duration rejects empty, zero, fractional, negative, overflow, notation and injected strings', () => {
  for (const values of [['', '0'], ['0', ''], ['0', '0'], ['-1', '1'], ['1.2', '0'], ['1', '60'],
    ['100', '0'], ['NaN', '0'], ['Infinity', '0'], [' 1', '0'], ['1e1', '0'], ['0x1', '0'], ['<b>', '0']]) {
    assert.equal(parseDuration(...values).ok, false, String(values));
  }
  assert.equal(parseDuration(1, '0').ok, false);
});
test('format rounds up remaining partial seconds and never displays negatives', () => {
  assert.equal(formatDuration(1), '00:01'); assert.equal(formatDuration(60001), '01:01');
  assert.equal(formatDuration(-1), '00:00'); assert.equal(formatDuration(5999000), '99:59');
});
test('delayed callback reaches finish using elapsed time instead of tick count', () => {
  const { engine, advance } = clock(); engine.configure(5000); engine.start();
  advance(6000); assert.equal(engine.tick().status, 'finished'); assert.equal(engine.remainingMs, 0);
});
test('duplicate start cannot move the deadline', () => {
  const { engine, advance } = clock(); engine.configure(10000); engine.start();
  const deadline = engine.deadlineMs; advance(3000);
  assert.equal(engine.start(), false); assert.equal(engine.deadlineMs, deadline);
  assert.equal(engine.tick().remainingMs, 7000);
});
test('pause preserves exact remainder and resume excludes paused duration', () => {
  const { engine, advance } = clock(); engine.configure(10000); engine.start(); advance(3250);
  engine.pause(); advance(5000); assert.equal(engine.tick().remainingMs, 6750);
  engine.resume(); advance(6750); assert.equal(engine.tick().status, 'finished');
});
test('locked configuration and invalid state actions are rejected', () => {
  const { engine } = clock(); assert.equal(engine.resume(), false); assert.equal(engine.pause(), false);
  engine.start(); assert.equal(engine.configure(5000), false); engine.pause();
  assert.equal(engine.configure(5000), false); assert.equal(engine.start(), false);
});
test('reset prevents a stale deadline from triggering finish', () => {
  const { engine, advance } = clock(); engine.configure(5000); engine.start(); advance(4999);
  engine.reset(); advance(10000); assert.equal(engine.tick().status, 'idle');
  assert.equal(engine.remainingMs, 5000); assert.equal(engine.consumeFinish(), false);
});
test('finished notification consumed only once and reset for a new run', () => {
  const { engine, advance } = clock(); engine.configure(1000); engine.start(); advance(1000); engine.tick();
  assert.equal(engine.consumeFinish(), true); assert.equal(engine.consumeFinish(), false);
  engine.tick(); assert.equal(engine.consumeFinish(), false);
  engine.start(); advance(1000); engine.tick(); assert.equal(engine.consumeFinish(), true);
});
test('pausing after expiry keeps finished state instead of reviving it', () => {
  const { engine, advance } = clock(); engine.configure(1000); engine.start(); advance(1001);
  assert.equal(engine.pause(), false); assert.equal(engine.status, 'finished'); assert.equal(engine.resume(), false);
});
test('invalid engine durations never mutate the previous setting', () => {
  const { engine } = clock();
  for (const value of [NaN, Infinity, 0, -1000, 999, 1001, 6000000, '5000']) {
    assert.equal(engine.configure(value), false); assert.equal(engine.configuredMs, 300000);
  }
});
test('backwards wall clock does not increase the remainder', () => {
  const { engine, advance } = clock(); engine.configure(10000); engine.start(); advance(3000); engine.tick();
  advance(-2000); assert.equal(engine.tick().remainingMs, 7000);
});
test('snapshots cannot mutate internal state', () => {
  const { engine } = clock(); const state = engine.snapshot(); state.remainingMs = 0;
  assert.equal(engine.remainingMs, 300000);
});
test('registered tool filtering rejects external paths, missing handlers and duplicates', () => {
  const routes = new Set(['#/', '#/timer', '#/pdf', '#/example']);
  const extra = { id: 'example', title: '예시 도구', description: '합성 예시', route: '#/example' };
  const list = [...tools, extra, extra, { ...extra, id: 'bad', route: 'javascript:alert(1)' },
    { ...extra, id: 'unknown', route: '#/unknown' }, { ...extra, id: 'space id' }, { ...extra, title: '' }];
  assert.deepEqual(validateTools(list, routes).map(tool => tool.id), ['classroom-timer', 'pdf-inspector', 'example']);
});
