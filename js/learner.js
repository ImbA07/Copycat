// Copycats Gedächtnis: beobachtet Mangos Verhalten und sagt es voraus.
// Startet in jedem Durchgang bei null und lernt Runde für Runde dazu.

const BIN = 0.1, BINS = 25; // Laufzeit-Histogramm für Seitwärts-Bewegung (0 … 2.5 s)

export class PlayerModel {
  constructor() {
    this.lat = { L: new Float32Array(BINS), R: new Float32Array(BINS), S: new Float32Array(BINS) };
    this.latSpeed = { L: 4, R: 4, S: 0 }; this.latSpeedN = { L: 0, R: 0, S: 0 };
    this.trans = { L: { L: 0, R: 1, S: 1 }, R: { L: 1, R: 0, S: 1 }, S: { L: 1, R: 1, S: 0 } };
    this.runs = 0;
    this.curLat = 'S'; this.curLatT = 0; this.latSample = 0;
    this.dodge = { L: 0, R: 0, jump: 0, slide: 0, crouch: 0, none: 0, n: 0 };
    this.pendingDodge = null;
    this.range = { close: [0, 0], mid: [0, 0], far: [0, 0] }; // [Schüsse, Treffer]
    this.approach = 0; this.approachN = 0; this.still = 0; this.stillN = 0;
    this.peek = { L: 0, R: 0 };
    this.heals = []; this.reloadAmmo = [];
    this.tricks = { jump: 0, slide: 0, dash: 0, crouch: 0 };
    this.playTime = 0; this.highTime = 0;
    this.flagRounds = 0; this.flagRush = 0;
    this.lostDisp = { f: 0, r: 0, n: 0 }; this.pendingLost = null;
    this.hidden = false; this.hiddenSince = 0; this.lastSeenPos = null;
    this.shotsFired = 0; this.shotsHit = 0; this.headshots = 0;
    this.roundsObserved = 0;
    this.barrelTrick = 0; // wie oft Mango ein Fass gegen Copycat benutzt hat
  }

  // Blickrichtung von Mango zu Copycat -> Mangos rechts/links
  static frame(p, b) {
    let fx = b.x - p.x, fz = b.z - p.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    return { fx, fz, rx: -fz, rz: fx, dist: l };
  }

  observe(dt, s) {
    // s: {t, p:{pos,vel,onGround,crouch,sliding}, b:{pos}, seen, flagActive, flagDist, flagTime}
    this.playTime += dt;
    const F = PlayerModel.frame(s.p.pos, s.b.pos);
    const vl = s.p.vel.x * F.rx + s.p.vel.z * F.rz; // + = Mangos rechts
    const vf = s.p.vel.x * F.fx + s.p.vel.z * F.fz; // + = auf Copycat zu
    if (s.p.pos.y > 0.9) this.highTime += dt;
    // Seitwärts-Zustand mit 10 Hz
    this.latSample += dt; this.curLatT += dt;
    if (this.latSample >= 0.1) {
      this.latSample = 0;
      const st = vl < -1.4 ? 'L' : vl > 1.4 ? 'R' : 'S';
      if (st !== 'S') { const n = ++this.latSpeedN[st]; this.latSpeed[st] += (Math.abs(vl) - this.latSpeed[st]) / Math.min(n, 60); }
      if (st !== this.curLat) {
        if (s.fight) {
          const bin = Math.min(BINS - 1, Math.floor(this.curLatT / BIN));
          this.lat[this.curLat][bin]++; this.trans[this.curLat][st]++;
          this.runs++;
        }
        this.curLat = st; this.curLatT = 0;
      }
      // Aggressivität / Campen
      if (s.fight || F.dist < 25) { this.approach += vf > 1 ? 1 : vf < -1 ? -1 : 0; this.approachN++; }
      if (!s.fight) { this.still += Math.hypot(s.p.vel.x, s.p.vel.z) < 0.6 ? 1 : 0; this.stillN++; }
    }
    // Ausweich-Reaktion nach Copycats Feuerstoß
    if (this.pendingDodge) {
      const pd = this.pendingDodge; pd.t += dt;
      if (s.p.sliding) pd.slide = true;
      if (!s.p.onGround && s.p.vel.y > 2) pd.jump = true;
      if (s.p.crouch > 0.6) pd.crouch = true;
      pd.lat += vl * dt;
      if (pd.t > 0.45) {
        const k = pd.jump ? 'jump' : pd.slide ? 'slide' : pd.lat < -0.35 ? 'L' : pd.lat > 0.35 ? 'R' : pd.crouch ? 'crouch' : 'none';
        this.dodge[k]++; this.dodge.n++; this.pendingDodge = null;
      }
    }
    // Sichtkontakt verloren / wieder da
    if (!s.seen && !this.hidden) { this.hidden = true; this.hiddenSince = s.t; this.lastSeenPos = { ...s.p.pos }; this.pendingLost = { t: 0, from: { ...s.p.pos }, F }; }
    if (this.pendingLost) {
      this.pendingLost.t += dt;
      if (this.pendingLost.t > 2.5) {
        const L = this.pendingLost, dx = s.p.pos.x - L.from.x, dz = s.p.pos.z - L.from.z;
        const n = ++this.lostDisp.n, f = dx * L.F.fx + dz * L.F.fz, r = dx * L.F.rx + dz * L.F.rz;
        this.lostDisp.f += (f - this.lostDisp.f) / Math.min(n, 12); this.lostDisp.r += (r - this.lostDisp.r) / Math.min(n, 12);
        this.pendingLost = null;
      }
    }
    if (s.seen && this.hidden) {
      this.hidden = false;
      if (s.t - this.hiddenSince > 0.8 && this.lastSeenPos) {
        const Fb = PlayerModel.frame(s.b.pos, this.lastSeenPos); // aus Copycats Sicht
        const off = (s.p.pos.x - this.lastSeenPos.x) * Fb.rx + (s.p.pos.z - this.lastSeenPos.z) * Fb.rz;
        // Copycats rechts = Mangos links
        if (Math.abs(off) > 0.5) this.peek[off > 0 ? 'L' : 'R']++;
      }
      this.pendingLost = null;
    }
    // Flagge
    if (s.flagActive && !this.flagCounted && s.flagDist < 3.2) { this.flagCounted = true; if (s.flagTime < 12) this.flagRush++; }
  }

  botBurstStart() { if (!this.pendingDodge) this.pendingDodge = { t: 0, lat: 0, jump: false, slide: false, crouch: false }; }
  onTrick(k) { if (k in this.tricks) this.tricks[k]++; }
  onHeal(hp) { this.heals.push(hp); }
  onReload(ammoLeft) { this.reloadAmmo.push(ammoLeft); }
  onShot(dist, hit, head) {
    const b = dist < 9 ? 'close' : dist < 18 ? 'mid' : 'far';
    this.range[b][0]++; if (hit) this.range[b][1]++;
    this.shotsFired++; if (hit) this.shotsHit++; if (head) this.headshots++;
  }
  onRoundStart() { this.flagCounted = false; this.hidden = false; this.pendingLost = null; this.pendingDodge = null; }
  onRoundEnd(flagWasActive) { this.roundsObserved++; if (flagWasActive) this.flagRounds++; }

  // ------------- Vorhersagen -------------
  get confidence() { return Math.min(1, this.runs / 60); }
  survival(st, t) {
    const h = this.lat[st]; let tot = 0, after = 0;
    for (let i = 0; i < BINS; i++) { tot += h[i]; if ((i + 1) * BIN > t) after += h[i]; }
    if (tot < 3) return Math.exp(-t / 0.8); // Vorwissen: ~0,8 s
    return (after + 0.5) / (tot + 1);
  }
  // Erwartete Seitwärts-Verschiebung in den nächsten H Sekunden (m, + = Mangos rechts)
  lateralDrift(st, elapsed, H, curVel) {
    const S0 = this.survival(st, elapsed);
    const tr = this.trans[st], tot = tr.L + tr.R + tr.S;
    const vNext = (tr.R * this.latSpeed.R - tr.L * this.latSpeed.L) / (tot || 1);
    let disp = 0; const step = 0.03;
    for (let tau = 0; tau < H; tau += step) {
      const stay = Math.min(1, this.survival(st, elapsed + tau) / Math.max(S0, 1e-3));
      disp += (stay * curVel + (1 - stay) * vNext) * step;
    }
    return disp;
  }
  // Wo wird Mango in H Sekunden sein? (perc = wahrgenommener, leicht verzögerter Zustand)
  predict(perc, botPos, H) {
    const F = PlayerModel.frame(perc.pos, botPos);
    const vl = perc.vel.x * F.rx + perc.vel.z * F.rz, vf = perc.vel.x * F.fx + perc.vel.z * F.fz;
    const naiveLat = vl * H * 0.25; // "ok" von Anfang an: grobe Vorhaltung
    const learned = this.lateralDrift(perc.latState, perc.latT, H, vl);
    const c = this.confidence * 0.95;
    let lat = naiveLat * (1 - c) + learned * c;
    // Ausweichen, wenn Copycat gerade anfängt zu schießen
    if (perc.burstStart && this.dodge.n >= 4) {
      const pL = this.dodge.L / this.dodge.n, pR = this.dodge.R / this.dodge.n;
      lat += (pR - pL) * 0.9 * Math.min(1, this.dodge.n / 10);
    }
    const fwd = vf * H * 0.6;
    let y = perc.pos.y + (perc.onGround ? 0 : perc.vel.y * H - 10 * H * H);
    if (perc.onGround && this.dodge.n >= 5 && perc.burstStart) y += 0.35 * (this.dodge.jump / this.dodge.n);
    return { x: perc.pos.x + F.rx * lat + F.fx * fwd, y, z: perc.pos.z + F.rz * lat + F.fz * fwd };
  }
  // Wo sucht Copycat, wenn Mango verschwunden ist?
  searchPoint(lastSeen, botPos) {
    const F = PlayerModel.frame(lastSeen, botPos);
    const w = Math.min(1, this.lostDisp.n / 3);
    return { x: lastSeen.x + (F.fx * this.lostDisp.f + F.rx * this.lostDisp.r) * w, z: lastSeen.z + (F.fz * this.lostDisp.f + F.rz * this.lostDisp.r) * w };
  }
  // Von welcher Seite (aus Copycats Sicht) kommt Mango aus der Deckung? + = Copycats rechts
  peekBias() { const n = this.peek.L + this.peek.R; if (n < 3) return 0; return (this.peek.L - this.peek.R) / n; }
  preferredRange() {
    const acc = k => { const [s, h] = this.range[k]; return s >= 12 ? h / s : null; };
    const opts = [['close', 7], ['mid', 13], ['far', 21]].map(([k, d]) => [acc(k), d]).filter(a => a[0] !== null);
    if (opts.length < 2) return 13;
    opts.sort((a, b) => a[0] - b[0]);
    return opts[0][1];
  }
  get aggression() { return this.approachN > 20 ? this.approach / this.approachN : 0; }
  get camping() { return this.stillN > 30 ? this.still / this.stillN : 0; }
  get healThreshold() { if (!this.heals.length) return null; return this.heals.reduce((a, b) => a + b, 0) / this.heals.length; }
  perMin(k) { return this.tricks[k] / Math.max(1, this.playTime / 60); }
  get flagRushRate() { return this.flagRounds ? this.flagRush / this.flagRounds : 0; }
  meanRun() {
    let tot = 0, sum = 0;
    for (const st of ['L', 'R']) for (let i = 0; i < BINS; i++) { tot += this.lat[st][i]; sum += this.lat[st][i] * (i + 0.5) * BIN; }
    return tot ? sum / tot : null;
  }

  // ------------- Erkenntnisse (für Sprüche + Akte) -------------
  insights() {
    const out = [];
    const d = this.dodge;
    if (d.n >= 5) {
      const pL = d.L / d.n, pR = d.R / d.n, pJ = d.jump / d.n;
      if (pL > 0.5) out.push({ key: 'learn_dodge_left', w: pL });
      if (pR > 0.5) out.push({ key: 'learn_dodge_right', w: pR });
      if (pJ > 0.3 || this.perMin('jump') > 10) out.push({ key: 'learn_jump', w: Math.max(pJ, this.perMin('jump') / 20) });
    }
    const mr = this.meanRun();
    if (mr !== null && this.runs > 25 && mr < 0.55) out.push({ key: 'learn_adad', w: 0.9 - mr });
    const ht = this.healThreshold;
    if (ht !== null && this.heals.length >= 1) { if (ht > 55) out.push({ key: 'learn_heal_early', w: 0.6 }); else if (ht < 30) out.push({ key: 'learn_heal_late', w: 0.5 }); }
    if (this.camping > 0.45) out.push({ key: 'learn_camper', w: this.camping });
    if (this.aggression > 0.35) out.push({ key: 'learn_rusher', w: this.aggression + 0.2 });
    const acc = k => { const [s, h] = this.range[k]; return s >= 12 ? h / s : null; };
    const ac = acc('close'), af = acc('far'), am = acc('mid');
    if (ac !== null && (am ?? af) !== null && ac < (am ?? af) - 0.12) out.push({ key: 'learn_close_weak', w: 0.7 });
    if (af !== null && (am ?? ac) !== null && af < (am ?? ac) - 0.12) out.push({ key: 'learn_far_weak', w: 0.7 });
    const pn = this.peek.L + this.peek.R;
    if (pn >= 3) { const pl = this.peek.L / pn; if (pl > 0.65) out.push({ key: 'learn_peek_left', w: pl }); if (pl < 0.35) out.push({ key: 'learn_peek_right', w: 1 - pl }); }
    if (this.flagRounds >= 1 && this.flagRushRate > 0.6) out.push({ key: 'learn_flag', w: 0.65 });
    if (this.perMin('slide') > 3) out.push({ key: 'learn_slide', w: 0.55 + this.perMin('slide') / 30 });
    if (this.perMin('dash') > 4) out.push({ key: 'learn_dash', w: 0.55 + this.perMin('dash') / 30 });
    if (this.playTime > 30 && this.highTime / this.playTime > 0.25) out.push({ key: 'learn_high', w: 0.5 + this.highTime / this.playTime });
    out.sort((a, b) => b.w - a.w);
    return out;
  }

  // Detaillierte Akte
  dossier() {
    const pct = x => Math.round(x * 100);
    const d = this.dodge, rows = [];
    if (d.n) rows.push({ label: 'Ausweichen bei Beschuss', bars: [['links', d.L / d.n, '#7ec8ff'], ['rechts', d.R / d.n, '#ff8a1f'], ['Sprung', d.jump / d.n, '#ffd83a'], ['Rutschen', d.slide / d.n, '#ff4fa3'], ['gar nicht', (d.none + d.crouch) / d.n, '#cccccc']] });
    else rows.push({ label: 'Ausweichen bei Beschuss', text: 'noch keine Daten' });
    const mr = this.meanRun();
    rows.push({ label: 'Hin-und-her-Rhythmus', text: mr ? `wechselt alle ~${mr.toFixed(2).replace('.', ',')} s die Richtung` : 'noch keine Daten' });
    rows.push({ label: 'Vorhersage-Sicherheit', bars: [['sicher', this.confidence, '#ff4fa3'], ['', 1 - this.confidence, '#eeeeee']] });
    const acc = k => { const [s, h] = this.range[k]; return s ? `${pct(h / s)} %` : '–'; };
    rows.push({ label: 'Deine Trefferquote', text: `nah ${acc('close')} · mittel ${acc('mid')} · weit ${acc('far')}` });
    const pr = this.preferredRange();
    rows.push({ label: 'Copycats Lieblingsabstand', text: pr === 7 ? 'nah dran (da bist du schwach)' : pr === 21 ? 'weit weg (da bist du schwach)' : 'mittlere Distanz' });
    const ag = this.aggression;
    rows.push({ label: 'Spielstil', bars: [['stürmt', Math.max(0, ag), '#ff3b3b'], ['vorsichtig', 1 - Math.abs(ag), '#ffd83a'], ['zieht zurück', Math.max(0, -ag), '#7ec8ff']] });
    rows.push({ label: 'Stillstehen (ohne Kampf)', bars: [['campt', this.camping, '#9aa3b5'], ['', 1 - this.camping, '#eeeeee']] });
    const pn = this.peek.L + this.peek.R;
    rows.push({ label: 'Kommt aus der Deckung', text: pn ? `links ${pct(this.peek.L / pn)} % · rechts ${pct(this.peek.R / pn)} %` : 'noch keine Daten' });
    const ht = this.healThreshold;
    rows.push({ label: 'Spritze bei', text: ht !== null ? `~${Math.round(ht)} Leben` : 'noch nie benutzt' });
    const ra = this.reloadAmmo.length ? this.reloadAmmo.reduce((a, b) => a + b, 0) / this.reloadAmmo.length : null;
    rows.push({ label: 'Lädt nach bei', text: ra !== null ? `~${Math.round(ra)} Schuss im Magazin` : 'noch keine Daten' });
    rows.push({ label: 'Tricks pro Minute', text: `Sprünge ${this.perMin('jump').toFixed(1).replace('.', ',')} · Rutschen ${this.perMin('slide').toFixed(1).replace('.', ',')} · Dash ${this.perMin('dash').toFixed(1).replace('.', ',')}` });
    rows.push({ label: 'Hohe Positionen', text: this.playTime > 5 ? `${pct(this.highTime / this.playTime)} % der Zeit oben` : '–' });
    rows.push({ label: 'Fass-Trick', text: this.barrelTrick ? `abgeschaut! (${this.barrelTrick}× von dir gesehen)` : 'noch nicht gesehen' });
    rows.push({ label: 'Flagge', text: this.flagRounds ? `stürmt hin in ${pct(this.flagRushRate)} % der Fälle` : 'noch nie gesehen' });
    return rows;
  }
}
