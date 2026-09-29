// Sprüche: Mango (stimmungsabhängig) und Copycat (flüstert – und bricht manchmal sein Schweigen).
import { VOICE } from './voiceManifest.js';
import { audio } from './audio.js';

const pick = a => a[(Math.random() * a.length) | 0];

export class Dialog {
  constructor(subtitleEl, floatLayer) {
    this.subs = subtitleEl; this.layer = floatLayer;
    this.busyUntil = { mango: 0, copycat: 0 };
    this.lastTrig = {}; this.lastLine = {};
    this.bubble = null; this.bubbleUntil = 0;
  }
  preload() {
    const urls = [];
    for (const ch of Object.values(VOICE)) for (const tr of Object.values(ch)) for (const lines of Object.values(tr)) for (const l of lines) urls.push(l.file);
    audio.preload(urls);
  }
  now() { return performance.now() / 1000; }

  // mood: 'conf' | 'neutral' | 'desp' (nur Mango)
  say(char, trig, { mood = 'neutral', cooldown = 6, force = false, chance = 1 } = {}) {
    const t = this.now();
    const bank = VOICE[char]?.[trig]; if (!bank) return 0;
    if (!force) {
      if (Math.random() > chance) return 0;
      if (t < this.busyUntil[char]) return 0;
      if (t - (this.lastTrig[char + trig] || -99) < cooldown) return 0;
    }
    let m = mood;
    if (char === 'copycat') m = Object.keys(bank)[0];
    const lines = bank[m] || bank.neutral || Object.values(bank)[0];
    let line = pick(lines);
    if (lines.length > 1 && line === this.lastLine[char + trig]) line = lines[(lines.indexOf(line) + 1) % lines.length];
    this.lastLine[char + trig] = line; this.lastTrig[char + trig] = t;
    const rate = char === 'mango' ? (m === 'desp' ? 1.07 : m === 'conf' ? 0.97 : 1) : 1;
    const est = Math.max(1.2, line.text.length * 0.065) / rate;
    this.busyUntil[char] = t + est + 0.3;
    audio.voice(line.file, { rate, whisper: m === 'whisper' }).then(d => { if (d) this.busyUntil[char] = this.now() + d + 0.3; });
    this.subtitle(char, line.text, est + 1.2, m);
    if (char === 'copycat') this.showBubble(line.text, est + 0.8, m !== 'whisper');
    return est;
  }
  // Copycat "vergisst" kurz, dass er Pantomime ist
  breakSilence() {
    const kind = Math.random() < 0.5 ? 'angry' : 'amused';
    const bank = VOICE.copycat.break[kind]; const line = pick(bank);
    this.busyUntil.copycat = this.now() + 3.5;
    audio.voice(line.file).then(d => {
      setTimeout(() => this.say('copycat', 'break_after', { force: true }), (d || 1.2) * 1000 + 450);
    });
    this.subtitle('copycat', line.text, 2.5, kind);
    this.showBubble(line.text, 2, true);
  }
  subtitle(char, text, dur, mood) {
    const el = document.createElement('div');
    el.className = 'sub' + (char === 'copycat' ? ' cc' : '');
    const who = char === 'copycat' ? (mood === 'whisper' ? 'Copycat (flüstert)' : 'COPYCAT') : 'Mango';
    el.innerHTML = `<b></b> `; el.firstChild.textContent = who + ':'; el.append(text);
    this.subs.appendChild(el);
    while (this.subs.children.length > 3) this.subs.firstChild.remove();
    setTimeout(() => el.remove(), dur * 1000);
  }
  showBubble(text, dur, loud) {
    if (!this.bubble) { this.bubble = document.createElement('div'); this.layer.appendChild(this.bubble); }
    this.bubble.className = 'speech' + (loud ? ' loud' : '');
    this.bubble.textContent = text; this.bubbleUntil = this.now() + dur;
  }
  // Blase über Copycats Kopf positionieren
  update(project, headPos, visible) {
    if (!this.bubble) return;
    if (this.now() > this.bubbleUntil || !visible) { this.bubble.style.display = 'none'; return; }
    const s = project(headPos);
    if (!s) { this.bubble.style.display = 'none'; return; }
    this.bubble.style.display = 'block';
    this.bubble.style.left = Math.max(140, Math.min(innerWidth - 140, s.x)) + 'px';
    this.bubble.style.top = Math.max(60, s.y) + 'px';
  }
  reset() { this.busyUntil = { mango: 0, copycat: 0 }; this.subs.innerHTML = ''; if (this.bubble) { this.bubble.remove(); this.bubble = null; } }
}
