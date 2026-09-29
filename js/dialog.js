// Copycats Sprüche: echte Sprachaufnahme + Sprechblase. Mango ist stumm. Immer nur ein Spruch gleichzeitig.
import { LINES } from './lines.js';
import { VOICE } from './voiceManifest.js';
import { audio } from './audio.js';

const pick = a => a[(Math.random() * a.length) | 0];

export class Dialog {
  constructor(subtitleEl, floatLayer) {
    this.subs = subtitleEl; this.layer = floatLayer;
    this.busyUntil = 0; this.lastTrig = {}; this.lastLine = {};
    this.bubble = null; this.bubbleUntil = 0; this.current = null; this.token = 0;
  }
  preload() { if (!this.loaded) { this.loaded = true; audio.preload(Object.values(VOICE)); } }
  now() { return performance.now() / 1000; }
  stop() { try { this.current?.stop(); } catch { /* schon vorbei */ } this.current = null; }
  text(trig) { return LINES[trig]?.lines[0]; }

  // force: unterbricht einen laufenden Spruch
  say(trig, { cooldown = 8, force = false, chance = 1 } = {}) {
    const t = this.now();
    const entry = LINES[trig]; if (!entry) return 0;
    if (!force) {
      if (Math.random() > chance) return 0;
      if (t < this.busyUntil) return 0;
      if (t - (this.lastTrig[trig] || -99) < cooldown) return 0;
    } else this.stop();
    const lines = entry.lines;
    let line = pick(lines);
    if (lines.length > 1 && line === this.lastLine[trig]) line = lines[(lines.indexOf(line) + 1) % lines.length];
    this.lastLine[trig] = line; this.lastTrig[trig] = t;
    const est = Math.max(1.0, line.length * 0.065);
    this.busyUntil = t + est + 0.5;
    const my = ++this.token;
    if (VOICE[line]) audio.voice(VOICE[line]).then(res => {
      if (!res) return;
      if (my !== this.token) { try { res.src.stop(); } catch { /* egal */ } return; }
      this.current = res.src; this.busyUntil = this.now() + res.dur + 0.5;
    });
    this.subtitle(line, est + 1.4);
    this.showBubble(line, est + 1.1, entry.mood);
    return est;
  }
  subtitle(text, dur) {
    const el = document.createElement('div');
    el.className = 'sub cc';
    el.innerHTML = '<b>Copycat:</b> '; el.append(text);
    this.subs.innerHTML = ''; this.subs.appendChild(el);
    setTimeout(() => el.remove(), dur * 1000);
  }
  showBubble(text, dur, mood) {
    if (!this.bubble || !this.bubble.isConnected) { this.bubble = document.createElement('div'); this.layer.appendChild(this.bubble); }
    this.bubble.className = 'speech' + (mood === 'wuetend' || mood === 'aufgeregt' ? ' loud' : '');
    this.bubble.textContent = text; this.bubbleUntil = this.now() + dur;
  }
  update(project, headPos, visible) {
    if (!this.bubble) return;
    if (this.now() > this.bubbleUntil || !visible) { this.bubble.style.display = 'none'; return; }
    const s = project(headPos);
    if (!s) { this.bubble.style.display = 'none'; return; }
    this.bubble.style.display = 'block';
    this.bubble.style.left = Math.max(140, Math.min(innerWidth - 140, s.x)) + 'px';
    this.bubble.style.top = Math.max(60, s.y) + 'px';
  }
  reset() { this.stop(); this.token++; this.busyUntil = 0; this.subs.innerHTML = ''; if (this.bubble) { this.bubble.remove(); this.bubble = null; } }
}
