// Copycats Sprüche. Mango ist stumm. Es spricht immer nur ein Spruch gleichzeitig.
import { VOICE } from './voiceManifest.js';
import { audio } from './audio.js';

const pick = a => a[(Math.random() * a.length) | 0];

export class Dialog {
  constructor(subtitleEl, floatLayer) {
    this.subs = subtitleEl; this.layer = floatLayer;
    this.busyUntil = 0; this.lastTrig = {}; this.lastLine = {};
    this.bubble = null; this.bubbleUntil = 0; this.current = null; this.token = 0;
  }
  preload() {
    const urls = [];
    for (const lines of Object.values(VOICE.copycat)) for (const l of lines) urls.push(l.file);
    audio.preload(urls);
  }
  now() { return performance.now() / 1000; }
  stop() { try { this.current?.stop(); } catch { /* schon vorbei */ } this.current = null; }

  // force: unterbricht einen laufenden Spruch
  say(trig, { cooldown = 8, force = false, chance = 1 } = {}) {
    const t = this.now();
    const lines = VOICE.copycat[trig]; if (!lines) return 0;
    if (!force) {
      if (Math.random() > chance) return 0;
      if (t < this.busyUntil) return 0;
      if (t - (this.lastTrig[trig] || -99) < cooldown) return 0;
    } else this.stop();
    let line = pick(lines);
    if (lines.length > 1 && line === this.lastLine[trig]) line = lines[(lines.indexOf(line) + 1) % lines.length];
    this.lastLine[trig] = line; this.lastTrig[trig] = t;
    const est = Math.max(1.2, line.text.length * 0.07);
    this.busyUntil = t + est + 0.6;
    const my = ++this.token;
    audio.voice(line.file).then(res => {
      if (!res) return;
      if (my !== this.token) { try { res.src.stop(); } catch { /* egal */ } return; }
      this.current = res.src; this.busyUntil = this.now() + res.dur + 0.6;
    });
    this.subtitle(line.text, est + 1.2);
    this.showBubble(line.text, est + 0.8);
    return est;
  }
  subtitle(text, dur) {
    const el = document.createElement('div');
    el.className = 'sub cc';
    el.innerHTML = '<b>Copycat:</b> '; el.append(text);
    this.subs.innerHTML = ''; this.subs.appendChild(el);
    setTimeout(() => el.remove(), dur * 1000);
  }
  showBubble(text, dur) {
    if (!this.bubble || !this.bubble.isConnected) { this.bubble = document.createElement('div'); this.layer.appendChild(this.bubble); }
    this.bubble.className = 'speech';
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
