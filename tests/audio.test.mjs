import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerAudio } from '../dist/audio.mjs';

test('unsupported or denied audio produces a safe false result', async () => {
  globalThis.window = {};
  assert.equal(await new TimerAudio().play(), false);
  window.AudioContext = class { constructor() { throw new Error('denied'); } };
  assert.equal(await new TimerAudio().play(), false);
  delete globalThis.window;
});
test('a reset while audio preparation is pending cancels the old alarm', async () => {
  let release, oscillators = 0;
  const ready = new Promise(resolve => { release = resolve; });
  globalThis.window = { AudioContext: class {
    state = 'suspended';
    async resume() { await ready; this.state = 'running'; }
    createOscillator() { oscillators++; throw new Error('should never be called'); }
  } };
  const audio = new TimerAudio(); const result = audio.play();
  audio.stop(); release();
  assert.equal(await result, true); assert.equal(oscillators, 0);
  delete globalThis.window;
});
test('failure during alarm construction cleans nodes without hiding failure notification', async () => {
  globalThis.window = { AudioContext: class {
    state = 'running'; currentTime = 0;
    createOscillator() { throw new Error('unavailable'); }
  } };
  const audio = new TimerAudio(); const generation = audio.generation;
  assert.equal(await audio.play(), false);
  assert.equal(audio.generation, generation); assert.equal(audio.nodes.length, 0);
  delete globalThis.window;
});
