// All sounds are synthesized with the Web Audio API — no audio files needed.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// I - V - vi - IV, 8 eighth-notes per bar
const CHORDS = [
  { bass: 48, arp: [60, 64, 67, 72] }, // C
  { bass: 43, arp: [59, 62, 67, 71] }, // G
  { bass: 45, arp: [57, 60, 64, 69] }, // Am
  { bass: 41, arp: [57, 60, 65, 69] }, // F
];
const MELODY = [
  72, null, 76, null, 79, 76, 74, null,
  74, null, 71, null, 67, null, 71, 74,
  72, null, 69, null, 76, null, 72, null,
  69, 72, 77, null, 76, 74, 72, null,
  79, null, 77, 76, 74, null, 76, null,
  74, null, 71, 74, 79, null, 74, null,
  72, 74, 76, null, 72, null, 69, 72,
  77, null, 76, null, 74, null, 72, null,
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicVolume = 0.5;
    this.sfxVolume = 0.7;
    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.setVolumes(this.musicVolume, this.sfxVolume);

    // Soft lowpass on the music so it sits behind the sound effects
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2600;
    this.musicFilter.connect(this.musicGain);

    // Shared noise buffer
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    setInterval(() => this._schedule(), 40);
  }

  setVolumes(music, sfx) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.musicGain.gain.value = music * 0.35;
    this.sfxGain.gain.value = sfx * 0.6;
  }

  startMusic() {
    if (!this.ctx) return;
    if (!this.musicOn) {
      this.musicOn = true;
      this.nextTime = this.ctx.currentTime + 0.1;
    }
  }

  // ---------- Music sequencer ----------
  _schedule() {
    if (!this.musicOn || !this.ctx) return;
    const stepLen = 60 / 132 / 2; // eighth notes at 132 BPM
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this._playStep(this.step, this.nextTime, stepLen);
      this.nextTime += stepLen;
      this.step = (this.step + 1) % MELODY.length;
    }
  }

  _playStep(step, t, len) {
    const chord = CHORDS[Math.floor(step / 8) % 4];
    const beat = step % 8;
    const out = this.musicFilter;
    // bass
    if (beat % 2 === 0) this._note(out, 'triangle', midi(chord.bass), t, len * 1.8, 0.5);
    // arpeggio
    this._note(out, 'square', midi(chord.arp[beat % 4] + 12), t, len * 0.5, 0.05);
    // melody
    const m = MELODY[step];
    if (m) this._note(out, 'square', midi(m), t, len * 0.9, 0.12);
    // drums
    if (beat === 0 || beat === 4) this._kick(t);
    if (beat % 2 === 1) this._hat(t, 0.06);
    if (beat === 2 || beat === 6) this._hat(t, 0.12, 0.12);
  }

  _note(dest, type, freq, t, dur, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  _hat(t, vol, dur = 0.04) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.musicGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  // ---------- Sound effects ----------
  _sweep(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(dur, vol, freq = 1200, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(100, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxGain);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  jump() { this._sweep('square', 300, 620, 0.12, 0.18); }
  land() { this._noise(0.08, 0.15, 600); }
  bounce() { this._sweep('sine', 200, 900, 0.35, 0.4); this._sweep('triangle', 400, 1400, 0.25, 0.15); }
  die() {
    this._noise(0.5, 0.5, 3000);
    this._sweep('sawtooth', 500, 60, 0.5, 0.25);
  }
  respawn() { this._sweep('sine', 400, 800, 0.15, 0.2); }
  crumble() { this._noise(0.3, 0.25, 900); }
  click() { this._sweep('square', 700, 900, 0.05, 0.12); }
  checkpoint() {
    [72, 76, 79, 84].forEach((n, i) => this._sweep('triangle', midi(n), midi(n) * 1.01, 0.25, 0.3, i * 0.08));
  }
  win() {
    const notes = [72, 76, 79, 84, 79, 84, 88];
    notes.forEach((n, i) => {
      this._sweep('square', midi(n), midi(n) * 1.005, i === notes.length - 1 ? 0.8 : 0.2, 0.2, i * 0.12);
      this._sweep('triangle', midi(n - 12), midi(n - 12), 0.25, 0.25, i * 0.12);
    });
  }
}
