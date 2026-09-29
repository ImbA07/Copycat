// Sound: alle Effekte werden live erzeugt (kein Download nötig), dazu dynamische Musik und die Sprachaufnahmen.
import { settings } from './config.js';

class AudioSys {
  constructor() { this.ctx = null; this.buffers = new Map(); this.tension = 0; this.musicOn = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.voiceBus = ctx.createGain(); this.voiceBus.connect(this.master);
    this.duck = ctx.createGain(); this.duck.connect(this.musicBus);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startMusic();
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.master;
    this.sfxBus.gain.value = settings.sfx;
    this.musicBus.gain.value = settings.music * 0.55;
    this.voiceBus.gain.value = settings.voice * 1.2;
  }
  get now() { return this.ctx.currentTime; }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.now;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }
  // Ausgang: normal oder räumlich (Position in der Welt)
  out(pos, gain = 1) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 1.1; p.maxDistance = 80;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p).connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return g;
  }
  noiseSrc(dur) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(this.now, Math.random()); s.stop(this.now + dur); return s; }
  env(g, a, peak, dec, t0 = this.now) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); }
  osc(type, f0, f1, dur, dest, peak = 0.5, a = 0.002) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, this.now); if (f1) o.frequency.exponentialRampToValueAtTime(f1, this.now + dur);
    this.env(g, a, peak, dur); o.connect(g).connect(dest); o.start(); o.stop(this.now + a + dur + 0.05);
  }
  noiseBurst(dest, dur, filterType, f0, f1, peak = 0.6, q = 1, a = 0.002) {
    const s = this.noiseSrc(dur + a + 0.05), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = filterType; f.Q.value = q; f.frequency.setValueAtTime(f0, this.now); if (f1) f.frequency.exponentialRampToValueAtTime(f1, this.now + dur);
    this.env(g, a, peak, dur); s.connect(f).connect(g).connect(dest);
  }

  play(name, pos = null, vol = 1) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    switch (name) {
      case 'shot':
        this.noiseBurst(o, 0.12, 'lowpass', 6000, 800, 0.9);
        this.osc('square', 160, 50, 0.1, o, 0.5);
        this.noiseBurst(o, 0.35, 'bandpass', 1400, 300, 0.12, 0.7, 0.01);
        break;
      case 'hit': this.osc('square', 1800, 1500, 0.05, o, 0.25); this.osc('sine', 900, 700, 0.06, o, 0.2); break;
      case 'headshot': this.osc('sine', 2400, 2300, 0.35, o, 0.35); this.osc('triangle', 3600, 3500, 0.25, o, 0.15); this.osc('square', 1800, 1500, 0.05, o, 0.2); break;
      case 'kill': [880, 1320, 1760].forEach((f, i) => setTimeout(() => this.osc('triangle', f, f, 0.18, this.out(null, vol), 0.3), i * 70)); break;
      case 'hurt': this.osc('sawtooth', 220, 90, 0.18, o, 0.25); this.noiseBurst(o, 0.12, 'lowpass', 1200, 300, 0.4); break;
      case 'reload':
        this.noiseBurst(o, 0.04, 'highpass', 3000, 3000, 0.4);
        setTimeout(() => this.ctx && this.noiseBurst(this.out(pos, vol), 0.05, 'bandpass', 1800, 900, 0.6, 3), 650);
        setTimeout(() => this.ctx && (this.noiseBurst(this.out(pos, vol), 0.06, 'highpass', 2500, 2500, 0.6), this.osc('square', 400, 300, 0.04, this.out(pos, vol), 0.2)), 1500);
        break;
      case 'empty': this.osc('square', 1200, 1100, 0.02, o, 0.2); break;
      case 'dash': this.noiseBurst(o, 0.25, 'bandpass', 600, 3000, 0.5, 2, 0.02); break;
      case 'slide': this.noiseBurst(o, 0.5, 'lowpass', 2000, 400, 0.35, 1, 0.03); break;
      case 'jump': this.osc('sine', 300, 600, 0.12, o, 0.12); break;
      case 'land': this.noiseBurst(o, 0.08, 'lowpass', 500, 100, 0.4); break;
      case 'step': this.noiseBurst(o, 0.05, 'bandpass', 700 + Math.random() * 400, 300, 0.35, 2); break;
      case 'explosion':
        this.noiseBurst(o, 1.2, 'lowpass', 3000, 60, 1.2, 0.8, 0.005);
        this.osc('sine', 90, 30, 0.8, o, 0.9);
        break;
      case 'crack': this.noiseBurst(o, 0.25, 'bandpass', 900, 200, 0.8, 1.5); this.osc('square', 180, 60, 0.12, o, 0.3); break;
      case 'impact': this.noiseBurst(o, 0.05, 'bandpass', 2500, 1200, 0.25, 2); break;
      case 'siren': {
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain(); osc.type = 'sawtooth';
        const t = this.now; for (let i = 0; i < 4; i++) { osc.frequency.setValueAtTime(500, t + i * 0.6); osc.frequency.linearRampToValueAtTime(900, t + i * 0.6 + 0.3); osc.frequency.linearRampToValueAtTime(500, t + i * 0.6 + 0.6); }
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.05); g.gain.setValueAtTime(0.18, t + 2.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2000;
        osc.connect(f).connect(g).connect(o); osc.start(); osc.stop(t + 2.5); break;
      }
      case 'tick': this.osc('square', 1000, 1000, 0.03, o, 0.12); break;
      case 'capture': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.osc('square', f, f, 0.2, this.out(null, vol), 0.15), i * 90)); break;
      case 'syringe': this.noiseBurst(o, 0.3, 'highpass', 4000, 1500, 0.3, 1, 0.05); this.osc('sine', 200, 120, 0.08, o, 0.4); break;
      case 'heal': this.osc('sine', 700, 1100, 0.12, o, 0.15); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => setTimeout(() => this.osc('square', f, f, 0.16, this.out(null, vol), 0.15), i * 110)); break;
      case 'lose': [392, 370, 349, 262].forEach((f, i) => setTimeout(() => this.osc('sawtooth', f, f * 0.98, 0.35, this.out(null, vol), 0.15), i * 260)); break;
      case 'beep': this.osc('square', 660, 660, 0.12, o, 0.15); break;
      case 'go': this.osc('square', 1320, 1320, 0.3, o, 0.18); break;
      case 'click': this.osc('triangle', 900, 700, 0.04, o, 0.2); break;
      case 'honk': this.osc('sawtooth', 330, 320, 0.25, o, 0.2); this.osc('sawtooth', 415, 410, 0.25, o, 0.15); break;
      case 'kazoo': {
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        osc.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3;
        const t = this.now, notes = [392, 440, 392, 330, 392, 523];
        notes.forEach((n, i) => osc.frequency.setValueAtTime(n, t + i * 0.16));
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.03); g.gain.setValueAtTime(0.3, t + notes.length * 0.16 - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + notes.length * 0.16);
        osc.connect(f).connect(g).connect(o); osc.start(); osc.stop(t + notes.length * 0.16 + 0.05); break;
      }
    }
  }

  // ---------------- Sprache ----------------
  async load(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    const p = fetch(url).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).catch(() => null);
    this.buffers.set(url, p); return p;
  }
  preload(urls) { if (this.ctx) urls.forEach(u => this.load(u)); }
  async voice(url, { rate = 1, whisper = false } = {}) {
    if (!this.ctx) return 0;
    const buf = await this.load(url);
    if (!buf) return 0;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = whisper ? 1.5 : 1;
    s.connect(g).connect(this.voiceBus); s.start();
    // Musik kurz leiser
    const t = this.now, dur = buf.duration / rate;
    this.duck.gain.cancelScheduledValues(t); this.duck.gain.setTargetAtTime(0.45, t, 0.05); this.duck.gain.setTargetAtTime(1, t + dur, 0.3);
    return dur;
  }

  // ---------------- Musik ----------------
  startMusic() {
    if (this.musicOn) return;
    this.musicOn = true;
    this.bpm = 126; this.step = 0; this.nextTime = this.now + 0.1;
    this.mode = 'menu';
    this.timer = setInterval(() => this.schedule(), 25);
  }
  setMode(m) { this.mode = m; }
  schedule() {
    const ctx = this.ctx; if (!ctx) return;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }
  note(type, freq, t, dur, peak, cutoff = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f).connect(g); } else o.connect(g);
    g.connect(this.duck); o.start(t); o.stop(t + dur + 0.02);
  }
  drum(kind, t, peak) {
    if (kind === 'kick') {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g).connect(this.duck); o.start(t); o.stop(t + 0.2);
    } else {
      const s = this.ctx.createBufferSource(); s.buffer = this.noise; const f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const dur = kind === 'hat' ? 0.03 : 0.12;
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.duck); s.start(t, Math.random()); s.stop(t + dur + 0.01);
    }
  }
  playStep(step, t) {
    const T = this.mode === 'menu' ? 0.12 : this.mode === 'calm' ? 0.2 : this.tension;
    const bar = (step / 16) | 0, s = step % 16;
    // Agenten-Surf-Akkorde: Am F G E
    const roots = [110, 87.31, 98, 82.41][bar];
    const minor = bar === 3 ? [0, 4, 7] : bar === 0 ? [0, 3, 7] : [0, 4, 7];
    const semi = n => Math.pow(2, n / 12);
    // Bass (immer)
    const bassPat = [0, null, 12, null, 7, null, 12, 10, 0, null, 12, null, 7, 12, 10, 7];
    if (bassPat[s] !== null) this.note('triangle', roots * semi(bassPat[s]), t, 0.18, 0.32);
    // Schlagzeug
    if (s % 8 === 0) this.drum('kick', t, 0.5);
    if (T > 0.2 && s % 8 === 4) this.drum('snare', t, 0.22);
    if (T > 0.2 && s % 2 === 0) this.drum('hat', t, 0.07);
    if (T > 0.7 && s % 2 === 1) this.drum('hat', t, 0.05);
    if (T > 0.55 && (s === 14 || s === 15) && bar === 3) this.drum('snare', t, 0.2);
    // Surf-Gitarre (Tremolo)
    if (T > 0.4) {
      const mel = [0, 3, 7, 12, 10, 7, 3, 7, 0, 3, 7, 12, 15, 12, 10, 7];
      if (s % 2 === 0 || T > 0.8) this.note('sawtooth', roots * 4 * semi(minor[(s >> 2) % 3] + (mel[s] > 7 ? 12 : 0)), t, 0.09, 0.05, 2200);
    }
    // Orgel-Akkordflächen (ruhig) bzw. Stabs (hektisch)
    if (s === 0 || (T > 0.6 && (s === 6 || s === 10))) for (const n of minor) this.note('square', roots * 2 * semi(n), t, T > 0.6 ? 0.12 : 0.9, T > 0.6 ? 0.04 : 0.03, 1400);
    // Menü: Zirkus-Melodie
    if (this.mode === 'menu' && s % 4 === 0) {
      const circ = [12, 15, 19, 15, 12, 10, 7, 10, 12, 15, 19, 22, 19, 15, 12, 7];
      this.note('square', roots * 4 * semi(circ[(bar * 4 + s / 4) % 16] - 12), t, 0.14, 0.035, 1800);
    }
  }
}

export const audio = new AudioSys();
