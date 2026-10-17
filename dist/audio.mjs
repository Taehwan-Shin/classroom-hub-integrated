export class TimerAudio {
  constructor() { this.context = null; this.nodes = []; this.generation = 0; }
  async prepare() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch { return false; }
  }
  stop() {
    this.generation++;
    this.stopNodes();
  }
  stopNodes() {
    for (const node of this.nodes) { try { node.stop(); } catch {} }
    this.nodes = [];
  }
  async play() {
    const generation = this.generation;
    if (!await this.prepare()) return false;
    if (generation !== this.generation) return true;
    try {
      const ctx = this.context;
      for (let index = 0; index < 3; index++) {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        const at = ctx.currentTime + index * .28;
        oscillator.type = 'sine';
        oscillator.frequency.value = index === 1 ? 880 : 660;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.15, at + .02);
        gain.gain.exponentialRampToValueAtTime(.001, at + .22);
        oscillator.connect(gain); gain.connect(ctx.destination);
        this.nodes.push(oscillator);
        oscillator.onended = () => {
          oscillator.disconnect(); gain.disconnect();
          this.nodes = this.nodes.filter(node => node !== oscillator);
        };
        oscillator.start(at); oscillator.stop(at + .24);
      }
      return true;
    } catch { this.stopNodes(); return false; }
  }
}
