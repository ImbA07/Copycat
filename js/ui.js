// Menüs, Einstellungen, Tastenbelegung und HUD.
import { settings, saveSettings, resetKeys, ACTIONS, keyLabel, T } from './config.js';
import { audio } from './audio.js';

const $ = id => document.getElementById(id);
const SCREENS = ['screen-start', 'screen-pause', 'screen-settings', 'screen-leaderboard', 'screen-intermission', 'screen-over', 'click-to-play', 'loading'];

export class UI {
  constructor(input) {
    this.input = input;
    this.el = {
      hud: $('hud'), cross: $('crosshair'), hit: $('hitmarker'), vig: $('vignette'),
      round: $('hud-round'), timer: $('hud-timer'), score: $('hud-score'),
      hpFill: $('hp-fill'), hpHeal: $('hp-heal'), hpNum: $('hp-num'), syr: $('syringes'), dashes: $('dashes'),
      ammo: $('ammo-cur'), reloadHint: $('reload-hint'), botHp: $('bot-hp-fill'),
      flagBar: $('flag-bar'), flagP: $('flag-p'), flagB: $('flag-b'), center: $('center-msg'),
      killcam: $('killcam-tag'), tut: $('tutorial-box'), subs: $('subtitles'), float: $('float-layer'),
    };
    this.settingsReturn = 'screen-start';
    this.hitT = 0; this.vigT = 0; this.centerT = 0;
    this.buildSettings();
    this.renderCrosshair();
  }
  show(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }
  hideScreens() { for (const s of SCREENS) $(s).classList.add('hidden'); }
  hud(on) { this.el.hud.classList.toggle('hidden', !on); }
  onAction(fn) {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-action]'); if (!b) return;
      audio.init(); audio.play('click'); fn(b.dataset.action, b);
    });
  }

  // ---------- Einstellungen ----------
  buildSettings() {
    for (const k of ['sens', 'adsSens', 'master', 'music', 'sfx', 'voice']) {
      const inp = $('s-' + k), out = $('o-' + k);
      const fmt = v => (k === 'sens' || k === 'adsSens') ? (+v).toFixed(2) : Math.round(v * 100) + ' %';
      inp.value = settings[k]; out.textContent = fmt(settings[k]);
      inp.addEventListener('input', () => { settings[k] = +inp.value; out.textContent = fmt(inp.value); saveSettings(); audio.applyVolumes(); });
    }
    for (const [id, key] of [['s-chStyle', 'chStyle'], ['s-chColor', 'chColor']]) {
      const seg = $(id);
      const sync = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === settings[key]));
      seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings[key] = b.dataset.v; saveSettings(); sync(); this.renderCrosshair(); });
      sync();
    }
    this.renderKeybinds();
  }
  renderKeybinds() {
    const box = $('keybinds'); box.innerHTML = '';
    for (const [action, label] of ACTIONS) {
      const row = document.createElement('div'); row.className = 'kb';
      const span = document.createElement('span'); span.textContent = label;
      const btn = document.createElement('button'); btn.textContent = keyLabel(settings.keys[action]);
      btn.addEventListener('click', () => {
        btn.classList.add('listening'); btn.textContent = 'Taste drücken …';
        this.input.listenCb = code => {
          if (code !== 'Escape') {
            for (const [a] of ACTIONS) if (a !== action && settings.keys[a] === code) settings.keys[a] = settings.keys[action];
            settings.keys[action] = code; saveSettings();
          }
          this.renderKeybinds();
        };
      });
      row.append(span, btn); box.appendChild(row);
    }
    const fixed = document.createElement('div'); fixed.className = 'kb muted';
    fixed.innerHTML = '<span>Schießen / Zielen / Pause</span><span>Linksklick / Rechtsklick / Esc</span>';
    box.appendChild(fixed);
  }
  resetKeys() { resetKeys(); this.renderKeybinds(); }

  renderCrosshair() {
    const c = this.el.cross; c.innerHTML = '';
    document.documentElement.style.setProperty('--ch', settings.chColor);
    const bar = (x, y, w, h) => { const i = document.createElement('i'); Object.assign(i.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); c.appendChild(i); };
    const st = settings.chStyle;
    if (st === 'cross' || st === 'crossdot') { const g = 5, l = 8, w = 2; bar(-w / 2, -g - l, w, l); bar(-w / 2, g, w, l); bar(-g - l, -w / 2, l, w); bar(g, -w / 2, l, w); }
    if (st === 'dot' || st === 'crossdot') bar(-2, -2, 4, 4);
    if (st === 'circle') { const i = document.createElement('i'); i.className = 'ring'; Object.assign(i.style, { left: '-11px', top: '-11px', width: '22px', height: '22px' }); c.appendChild(i); bar(-1.5, -1.5, 3, 3); }
    this.crossBars = [...c.children];
  }
  setSpread(px, ads) {
    this.el.cross.style.display = ads ? 'none' : 'block';
    if (settings.chStyle === 'cross' || settings.chStyle === 'crossdot') {
      const g = 5 + px, l = 8, w = 2, b = this.crossBars;
      if (b.length >= 4) {
        b[0].style.top = (-g - l) + 'px'; b[1].style.top = g + 'px'; b[2].style.left = (-g - l) + 'px'; b[3].style.left = g + 'px';
      }
    }
  }

  // ---------- HUD ----------
  hitmarker(kind) {
    const h = this.el.hit; h.className = kind === 'head' ? 'head' : kind === 'kill' ? 'kill' : '';
    h.innerHTML = '';
    const d = kind === 'kill' ? 13 : kind === 'head' ? 11 : 9;
    for (const [x, y, r] of [[-1, -1, -45], [1, -1, 45], [-1, 1, 45], [1, 1, -45]]) {
      const i = document.createElement('i'); i.style.transform = `translate(${x * d}px, ${y * d}px) rotate(${r}deg)`; h.appendChild(i);
    }
    h.style.opacity = 1; this.hitT = kind === 'kill' ? 0.4 : 0.18;
  }
  hurt(amount) { this.vigT = Math.min(0.9, this.vigT + amount / 40); }
  center(text, sub = '', dur = 1.5) {
    const c = this.el.center; c.innerHTML = ''; c.textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; c.appendChild(s); }
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    this.centerT = dur;
  }
  update(dt, g) {
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.el.hit.style.opacity = 0; }
    this.vigT = Math.max(0, this.vigT - dt * 0.8);
    const p = g.player;
    const lowHp = p.hp < 30;
    this.el.vig.style.opacity = Math.min(1, this.vigT + (lowHp && p.alive ? 0.35 + Math.sin(performance.now() / 200) * 0.1 : 0));
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) this.el.center.textContent = ''; }
    this.el.hpFill.style.width = p.hp + '%'; this.el.hpFill.classList.toggle('low', lowHp);
    this.el.hpHeal.style.width = Math.min(100, p.hp + Math.max(0, p.healLeft)) + '%';
    this.el.hpNum.textContent = Math.ceil(p.hp);
    this.el.ammo.textContent = p.reloading ? '…' : p.ammo; this.el.ammo.classList.toggle('low', p.ammo <= 5);
    this.el.reloadHint.classList.toggle('hidden', !(p.ammo <= 5 && !p.reloading));
    this.el.botHp.style.width = g.bot.hp + '%';
    this.el.round.textContent = g.mode === 'tutorial' ? 'TUTORIAL' : 'RUNDE ' + g.round;
    this.el.score.textContent = g.score.toLocaleString('de-DE');
    const tLeft = g.flag.active ? 0 : Math.max(0, T.flagTime - g.roundTime);
    if (g.mode === 'tutorial') this.el.timer.textContent = '∞';
    else if (g.flag.active) this.el.timer.textContent = '🚩 FLAGGE';
    else this.el.timer.textContent = `${Math.floor(tLeft / 60)}:${String(Math.floor(tLeft % 60)).padStart(2, '0')}`;
    this.el.timer.classList.toggle('warn', !g.flag.active && tLeft <= T.flagTime - T.flagWarn && g.mode !== 'tutorial');
    // Spritzen & Dash
    const syr = p.syringes;
    if (this._syr !== syr) { this._syr = syr; this.el.syr.innerHTML = ''; for (let i = 0; i < Math.max(T.syringeStart, Math.min(T.syringeMax, syr)); i++) { const s = document.createElement('span'); s.className = 'syr' + (i < syr ? '' : ' used'); s.textContent = '💉'; this.el.syr.appendChild(s); } const k = document.createElement('span'); k.className = 'key'; k.textContent = keyLabel(settings.keys.heal); this.el.syr.appendChild(k); }
    if (!this.dashEls) {
      this.el.dashes.innerHTML = ''; this.dashEls = [];
      for (let i = 0; i < T.dashCharges; i++) { const d = document.createElement('div'); d.className = 'dash'; d.innerHTML = '<i></i>'; this.el.dashes.appendChild(d); this.dashEls.push(d); }
      const k = document.createElement('span'); k.className = 'key'; k.textContent = keyLabel(settings.keys.dash); this.el.dashes.appendChild(k); this.dashKey = k;
    }
    this.dashKey.textContent = keyLabel(settings.keys.dash);
    this.dashEls.forEach((d, i) => {
      const full = i < p.dashCharges, charging = i === p.dashCharges;
      d.classList.toggle('full', full);
      d.firstChild.style.width = full ? '100%' : charging ? (p.dashRecharge / T.dashRecharge * 100) + '%' : '0%';
    });
    // Flagge
    this.el.flagBar.classList.toggle('hidden', !g.flag.active);
    if (g.flag.active) {
      this.el.flagP.style.width = (g.flag.progress.player / T.flagCapture * 100) + '%';
      this.el.flagB.style.width = (g.flag.progress.bot / T.flagCapture * 100) + '%';
      this.el.flagBar.classList.toggle('contested', g.flag.owner === 'both');
    }
  }

  // ---------- Zwischen den Runden ----------
  intermission(d) {
    $('im-title').textContent = d.title;
    const pts = $('im-points'); pts.innerHTML = '';
    d.points.forEach(([label, v], i) => { const el = document.createElement('div'); el.className = 'pt'; el.style.animationDelay = (i * 0.12) + 's'; el.innerHTML = v !== '' ? `${label} <b>+${v}</b>` : label; pts.appendChild(el); });
    const tot = document.createElement('div'); tot.className = 'pt'; tot.style.animationDelay = (d.points.length * 0.12) + 's'; tot.innerHTML = `GESAMT <b>${d.total.toLocaleString('de-DE')}</b>`; pts.appendChild(tot);
    const bub = $('im-bubbles'); bub.innerHTML = '';
    d.lines.forEach((t, i) => { const el = document.createElement('div'); el.className = 'bubble'; el.style.animationDelay = (0.4 + i * 0.5) + 's'; el.textContent = t; bub.appendChild(el); });
    this.renderDossier($('im-dossier'), d.dossier);
    $('im-file').open = false;
    this.show('screen-intermission');
  }
  renderDossier(el, rows) {
    el.innerHTML = '';
    for (const r of rows) {
      const row = document.createElement('div'); row.className = 'dz';
      const l = document.createElement('div'); l.className = 'lbl'; l.textContent = r.label;
      const v = document.createElement('div'); v.className = 'val';
      if (r.bars) {
        const bar = document.createElement('div'); bar.className = 'dbar';
        for (const [name, frac, col] of r.bars) {
          if (frac <= 0.001) continue;
          const i = document.createElement('i'); i.style.width = (frac * 100) + '%'; i.style.background = col;
          i.textContent = name && frac > 0.12 ? `${name} ${Math.round(frac * 100)}%` : ''; i.title = `${name} ${Math.round(frac * 100)} %`;
          bar.appendChild(i);
        }
        v.appendChild(bar);
      } else v.textContent = r.text;
      row.append(l, v); el.appendChild(row);
    }
  }
  gameOver(d) {
    $('go-score').textContent = d.score.toLocaleString('de-DE');
    const st = $('go-stats'); st.innerHTML = '';
    for (const [k, v] of d.stats) { const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v; st.append(a, b); }
    this.renderDossier($('go-dossier'), d.dossier);
    $('go-msg').textContent = ''; $('go-pin-row').classList.add('hidden'); $('go-setpin').classList.add('hidden');
    $('go-submit').classList.toggle('hidden', d.score <= 0);
    $('go-name').value = d.name || '';
    this.show('screen-over');
  }
  msg(text) { $('go-msg').textContent = text; }
  renderLeaderboard(rows, me, target = $('lb-list')) {
    target.innerHTML = '';
    if (!rows) { target.innerHTML = '<li class="muted">Bestenliste gerade nicht erreichbar.</li>'; return; }
    if (!rows.length) { target.innerHTML = '<li class="muted">Noch leer – sei der Erste!</li>'; return; }
    for (const r of rows) {
      const li = document.createElement('li'); if (me && r.display_name.toLowerCase() === me.toLowerCase()) li.className = 'me';
      const n = document.createElement('span'); n.className = 'n'; n.textContent = r.display_name;
      const rr = document.createElement('span'); rr.className = 'r'; rr.textContent = `${r.rounds} Runden`;
      const s = document.createElement('span'); s.className = 's'; s.textContent = r.score.toLocaleString('de-DE');
      li.append(n, rr, s); target.appendChild(li);
    }
  }
  startBest(rows) {
    const el = $('start-best'); el.innerHTML = '';
    if (!rows || !rows.length) return;
    const h = document.createElement('h4'); h.textContent = '🏆 TOP 3'; el.appendChild(h);
    const ol = document.createElement('ol');
    for (const r of rows.slice(0, 3)) { const li = document.createElement('li'); li.textContent = `${r.display_name} – ${r.score.toLocaleString('de-DE')}`; ol.appendChild(li); }
    el.appendChild(ol);
  }
  tutorial(steps, cur) {
    const b = this.el.tut; b.classList.remove('hidden');
    b.innerHTML = '<h4>MINI-TUTORIAL</h4>';
    const ul = document.createElement('ul');
    steps.forEach((s, i) => { const li = document.createElement('li'); li.className = i < cur ? 'done' : i === cur ? 'cur' : ''; li.textContent = (i < cur ? '✔ ' : i === cur ? '▶ ' : '• ') + s.text(); ul.appendChild(li); });
    b.appendChild(ul);
    const sk = document.createElement('div'); sk.className = 'skip'; sk.textContent = 'Überspringen: Esc → Aufgeben'; b.appendChild(sk);
  }
  hideTutorial() { this.el.tut.classList.add('hidden'); }
}
