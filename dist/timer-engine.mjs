export const MAX_SECONDS = 5999;

export function parseDuration(minutes, seconds) {
  const valid = value => typeof value === 'string' && /^\d{1,2}$/.test(value);
  if (!valid(minutes) || !valid(seconds)) {
    return { ok: false, message: '분과 초에 정수를 입력해주세요. 분은 0~99, 초는 0~59입니다.' };
  }
  const m = Number(minutes), s = Number(seconds);
  if (m > 99 || s > 59) return { ok: false, message: '분은 0~99, 초는 0~59 사이로 입력해주세요.' };
  if (m * 60 + s === 0) return { ok: false, message: '시간을 1초 이상 설정해주세요.' };
  return { ok: true, durationMs: (m * 60 + s) * 1000 };
}

export function formatDuration(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export class TimerEngine {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.configuredMs = 300000;
    this.remainingMs = this.configuredMs;
    this.status = 'idle';
    this.deadlineMs = null;
    this.notified = false;
  }
  snapshot() {
    return { configuredMs: this.configuredMs, remainingMs: this.remainingMs,
      status: this.status, deadlineMs: this.deadlineMs, notified: this.notified };
  }
  configure(ms) {
    if (!['idle', 'finished'].includes(this.status)) return false;
    if (!Number.isInteger(ms) || ms < 1000 || ms > MAX_SECONDS * 1000 || ms % 1000) return false;
    this.configuredMs = ms;
    this.reset();
    return true;
  }
  start() {
    if (!['idle', 'finished'].includes(this.status)) return false;
    this.remainingMs = this.configuredMs;
    this.notified = false;
    this.deadlineMs = this.now() + this.remainingMs;
    this.status = 'running';
    return true;
  }
  tick() {
    if (this.status !== 'running') return this.snapshot();
    // Late callbacks use elapsed wall time. A backwards clock change must not add time.
    this.remainingMs = Math.max(0, Math.min(this.remainingMs, this.deadlineMs - this.now()));
    if (this.remainingMs === 0) {
      this.status = 'finished';
      this.deadlineMs = null;
    }
    return this.snapshot();
  }
  pause() {
    if (this.status !== 'running') return false;
    this.tick();
    if (this.status === 'finished') return false;
    this.status = 'paused';
    this.deadlineMs = null;
    return true;
  }
  resume() {
    if (this.status !== 'paused') return false;
    this.deadlineMs = this.now() + this.remainingMs;
    this.status = 'running';
    return true;
  }
  reset() {
    this.remainingMs = this.configuredMs;
    this.status = 'idle';
    this.deadlineMs = null;
    this.notified = false;
  }
  consumeFinish() {
    if (this.status !== 'finished' || this.notified) return false;
    this.notified = true;
    return true;
  }
}
