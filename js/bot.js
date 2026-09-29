// Copycat: KI-Gegner. Grundkönnen ist "ok". Besser wird er durch das, was er über dich lernt (cap),
// und durch Taktik (tac, wächst bis Runde 50): Konter-Pläne gegen deinen Stil, Schwächen ausnutzen, kluges Heilen.
// Er bleibt immer besiegbar: Reaktionszeit und Zielstreuung haben feste Untergrenzen.
import { PlayerModel } from './learner.js';

const REACTION = 0.34;      // s bis er nach dem Entdecken schießt (ab Runde 15 langsam bis 0,27 s)
const PERCEPTION = 0.2;     // wahrgenommene Verzögerung
const AIM_ERR = 1.9;        // Grad Grundstreuung beim Zielen (ab Runde 15 langsam bis 1,55°)
const TURN = 7.5;           // rad/s maximale Drehgeschwindigkeit

const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class CopycatBrain {
  constructor(game) {
    this.game = game;
    this.model = new PlayerModel();
    this.history = [];
    this.resetRound();
  }
  resetRound() {
    this.state = 'hunt'; this.stateT = 0;
    this.seenT = 0; this.lastSeen = null; this.lastSeenTime = -99; this.heard = null;
    this.path = null; this.pathTarget = null; this.repathT = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.5;
    this.burstLeft = 0; this.burstPause = 0; this.burstStart = false;
    this.aimErr = { x: 0, y: 0 }; this.aimErrT = 0; this.trackT = 0;
    this.tauntCd = 8; this.decideT = 0; this.coverPoint = null; this.coverT = 0;
    this.trickT = 0; this.stuckT = 0; this.lastPos = null;
    this.history.length = 0;
    this.lookAround = 0; this.wantHeal = false;
    this.window = null; this.oppKey = null; this.oppTake = false; this.kite = false;
    this.flankPt = null; this.highPt = null; this.planT = 0; this.ambushLook = null; this.pendingSay = null;
    this.model.onRoundStart();
    this.choosePlan(true);
  }
  get reaction() { return REACTION - 0.07 * this.model.late; }
  get aimErrBase() { return AIM_ERR * (1 - 0.18 * this.model.late); }
  say(trig, opt = {}) { this.game.dialog?.say(trig, { cooldown: 25, chance: 0.5, ...opt }); }

  // Mango ist gerade verwundbar (heilt / lädt nach) – nur wenn Copycat es sieht oder hört
  noticeWindow(type, dur) { this.window = { type, until: this.game.roundTime + dur }; }

  // Konter-Plan gegen Mangos Spielstil (je höher das Taktik-Level, desto öfter)
  choosePlan(roundStart = false) {
    const m = this.model, tac = m.tac;
    const acc = k => { const [n, h] = m.range[k]; return n >= 12 ? h / n : null; };
    const ac = acc('close'), af = acc('far'), am = acc('mid');
    const opts = [['standard', 1.2]];
    if (m.aggression > 0.3) opts.push(['bait', 7 * m.aggression * tac]);
    if (m.camping > 0.35) opts.push(['flank', 7 * m.camping * tac]);
    if (ac !== null && (am ?? af) !== null && ac < (am ?? af) - 0.1) opts.push(['rushClose', 3 * tac]);
    if (af !== null && (am ?? ac) !== null && af < (am ?? ac) - 0.1) opts.push(['keepFar', 3 * tac]);
    if (m.playTime > 30 && m.highTime / m.playTime > 0.25) opts.push(['high', 3 * tac]);
    let sum = 0; for (const [, w] of opts) sum += w;
    let r = Math.random() * sum, plan = 'standard';
    for (const [k, w] of opts) { r -= w; if (r <= 0) { plan = k; break; } }
    // Ansage (wird gesprochen, sobald Copycat gerade nichts anderes sagt)
    if (plan !== 'standard' && (plan !== m.plan || Math.random() < 0.15)) this.pendingSay = { trig: 'counter_' + plan, from: roundStart ? 3.5 : this.game.roundTime, until: roundStart ? 14 : this.game.roundTime + 6 };
    m.plan = plan; this.planT = 0;
  }

  // Wahrnehmung: Mangos Zustand mit Verzögerung
  record(t, p) {
    this.history.push({ t, pos: { ...p.pos }, vel: { ...p.vel }, onGround: p.onGround, latState: this.model.curLat, latT: this.model.curLatT });
    while (this.history.length > 2 && this.history[1].t < t - 1) this.history.shift();
  }
  perceived(t) {
    const target = t - PERCEPTION;
    for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].t <= target) return this.history[i];
    return this.history[0];
  }

  hear(pos, loudness) {
    const b = this.game.bot.pos;
    if (Math.hypot(pos.x - b.x, pos.z - b.z) < loudness) this.heard = { pos: { ...pos }, t: this.game.roundTime };
  }

  update(dt) {
    const g = this.game, me = g.bot, p = g.player, world = g.arena.world, t = g.roundTime;
    const cmd = { fwd: 0, side: 0 };
    if (!me.alive) return cmd;
    this.record(t, p);
    const eye = me.eye();
    const pHead = { x: p.pos.x, y: p.eyeY, z: p.pos.z }, pChest = { x: p.pos.x, y: p.pos.y + p.height * 0.6, z: p.pos.z };
    const seeHead = p.alive && world.lineOfSight(eye, pHead), seeChest = p.alive && world.lineOfSight(eye, pChest);
    const seen = seeHead || seeChest;
    const dist = Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
    // Lernen
    this.model.observe(dt, {
      t, p: { pos: p.pos, vel: p.vel, onGround: p.onGround, crouch: p.crouch, sliding: p.slideT > 0 },
      b: { pos: me.pos }, seen, fight: seen && dist < 35,
      flagActive: g.flag.active, flagDist: Math.hypot(p.pos.x, p.pos.z), flagTime: g.flag.active ? t - g.flag.spawnT : 0,
    });
    if (seen) { this.seenT += dt; this.lastSeen = { ...p.pos }; this.lastSeenTime = t; }
    else this.seenT = 0;
    const ps = this.pendingSay;
    if (ps && t >= ps.from) { if (t > ps.until || g.dialog?.say(ps.trig, { cooldown: 0 })) this.pendingSay = null; }
    this.stateT += dt; this.decideT -= dt; this.tauntCd -= dt; this.trickT -= dt;

    // ---------- Entscheiden ----------
    if (this.decideT <= 0) { this.decideT = 0.2; this.decide(seen, dist); }

    // ---------- Zielen ----------
    let aimPoint = null, wantFire = false;
    const perc = this.perceived(t);
    if (seen && perc) {
      const H = PERCEPTION + 0.03;
      const pred = this.model.predict({ ...perc, burstStart: this.burstStart }, me.pos, H);
      // auf den sichtbaren Teil zielen (Brust, sonst Kopf)
      aimPoint = { x: pred.x, y: pred.y + (seeChest ? p.height * 0.62 : p.height - 0.2), z: pred.z };
      this.trackT += dt;
    } else {
      this.trackT = 0;
      const tgt = this.lastSeen && t - this.lastSeenTime < 4 ? this.lastSeen : this.heard ? this.heard.pos : null;
      if (tgt) {
        // Vorzielen: Seite, auf der Mango meist wieder auftaucht
        const bias = this.model.peekBias();
        const fx = tgt.x - me.pos.x, fz = tgt.z - me.pos.z, l = Math.hypot(fx, fz) || 1;
        const rx = -fz / l, rz = fx / l;
        aimPoint = { x: tgt.x - rx * bias * 1.2, y: (tgt.y || 0) + 1.3, z: tgt.z - rz * bias * 1.2 };
      } else if (this.state === 'ambush' && this.ambushLook) {
        aimPoint = { x: this.ambushLook.x, y: 1.4, z: this.ambushLook.z }; // Vorzielen: da kommt Mango gleich her
      } else if (this.path && this.path.length > 1) {
        const w = this.path[1]; aimPoint = { x: w.x, y: eye.y, z: w.z };
      }
    }
    // Fass-Trick: hat Mango es vorgemacht, jagt Copycat Fässer neben ihm hoch
    this.barrelAim = false;
    if (seen && this.model.barrelTrick > 0 && p.alive) {
      for (const c of world.colliders) {
        if (!c.alive || !c.explosive) continue;
        const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
        if (Math.hypot(cx - p.pos.x, cz - p.pos.z) > 3.2 || Math.hypot(cx - me.pos.x, cz - me.pos.z) < 6) continue;
        const bp = { x: cx, y: 0.6, z: cz };
        if (world.raycast(eye, (() => { const dx = bp.x - eye.x, dy = bp.y - eye.y, dz = bp.z - eye.z, l = Math.hypot(dx, dy, dz); return { x: dx / l, y: dy / l, z: dz / l }; })(), 200)?.collider === c) { aimPoint = bp; this.barrelAim = true; break; }
      }
    }
    // Zielfehler: zittert, wird beim Verfolgen ruhiger
    this.aimErrT -= dt;
    if (this.aimErrT <= 0) {
      this.aimErrT = 0.18;
      const settle = Math.max(0.45, 1.6 - this.trackT * 1.2);
      this.aimErr = { x: rnd(-1, 1) * this.aimErrBase * settle, y: rnd(-1, 1) * this.aimErrBase * settle * 0.7 };
    }
    if (this.lookAround > 0 && !seen) { this.lookAround -= dt; me.yaw += dt * 2.2; }
    else if (aimPoint) {
      const dx = aimPoint.x - eye.x, dy = aimPoint.y - eye.y, dz = aimPoint.z - eye.z;
      const ty = Math.atan2(dx, dz) + this.aimErr.x * Math.PI / 180;
      const tp = Math.atan2(dy, Math.hypot(dx, dz)) + this.aimErr.y * Math.PI / 180;
      const dyaw = angDiff(ty, me.yaw), maxT = TURN * dt;
      me.yaw += Math.max(-maxT, Math.min(maxT, dyaw));
      me.pitch += Math.max(-maxT, Math.min(maxT, tp - me.pitch));
      if (seen && this.seenT > this.reaction && Math.abs(dyaw) < (this.barrelAim ? 0.05 : 0.12) && p.alive) wantFire = true;
    }

    // ---------- Feuerstöße ----------
    this.burstStart = false;
    if (wantFire && !me.taunt) {
      if (this.burstPause > 0) { this.burstPause -= dt; wantFire = false; }
      else {
        if (this.burstLeft <= 0) {
          this.burstLeft = dist < 9 ? Math.round(rnd(6, 10)) : dist < 18 ? Math.round(rnd(3, 6)) : Math.round(rnd(2, 4));
          this.burstStart = true; this.model.botBurstStart();
        }
        if (me.fireCd <= 0 && me.ammo > 0) {
          this.burstLeft--;
          if (this.burstLeft <= 0) this.burstPause = dist < 9 ? rnd(0.2, 0.35) : rnd(0.35, 0.65);
        }
      }
    }
    cmd.fire = wantFire && !me.taunt;
    if (me.ammo === 0 || (me.ammo < 6 + Math.round(this.model.tac * 5) && !seen && t - this.lastSeenTime > 1.5 && this.state !== 'push')) cmd.reload = true;

    // ---------- Bewegung ----------
    let target = null, strafe = false;
    switch (this.state) {
      case 'push': {
        // Druck machen: direkt drauf, keine Deckung
        strafe = seen && dist < 9;
        const tgt = seen ? p.pos : (this.lastSeen && t - this.lastSeenTime < 5 ? this.lastSeen : this.heard?.pos);
        if (tgt && !(seen && dist < 4.5)) target = tgt;
        break;
      }
      case 'flank': target = this.flankPt; break;
      case 'high': target = this.highPt; break;
      case 'fight': {
        strafe = true;
        const plan = this.model.plan;
        let want = plan === 'rushClose' ? 7 : plan === 'keepFar' ? 21 : this.model.preferredRange();
        if (this.kite || plan === 'bait') want = Math.max(want, 14);
        if (dist > want + 3) target = p.pos; // näher ran
        else if (dist < want - 3) { // Abstand gewinnen
          const ax = me.pos.x - p.pos.x, az = me.pos.z - p.pos.z, l = Math.hypot(ax, az) || 1;
          target = { x: me.pos.x + ax / l * 4, z: me.pos.z + az / l * 4 };
        }
        break;
      }
      case 'hold': {
        // Deckung -> kurz rauslehnen und feuern -> zurück
        this.holdT -= dt;
        if (this.holdPhase === 'hide') {
          target = this.coverPoint;
          const there = target && Math.hypot(target.x - me.pos.x, target.z - me.pos.z) < 0.7;
          if (there) { cmd.crouch = !seen && this.coverLow; if (me.ammo < 12 && !me.reloading) cmd.reload = true; }
          else this.holdT = Math.max(this.holdT, 0.2);
          if (this.holdT <= 0 && !me.reloading) {
            this.peekPoint = this.findPeek(this.coverPoint);
            this.holdPhase = 'peek'; this.holdT = rnd(1.0, 1.9); this.peekHp = me.hp;
            if (!this.peekPoint) this.setState('fight');
          }
        } else {
          target = seen ? null : this.peekPoint;
          if (seen) strafe = Math.random() < 0.02 ? true : strafe;
          if (this.holdT <= 0 || me.hp < this.peekHp - 16 || me.ammo === 0) {
            this.holdPhase = 'hide'; this.holdT = rnd(0.6, 1.2) + (1 - this.model.cap) * 0.6;
          }
        }
        break;
      }
      case 'cover': target = this.coverPoint; if (target && Math.hypot(target.x - me.pos.x, target.z - me.pos.z) < 0.8) { cmd.crouch = !seen; if (this.wantHeal) cmd.heal = true; } break;
      case 'flag': target = { x: 0, z: 0 }; strafe = seen; break;
      case 'ambush': target = null; cmd.crouch = this.stateT > 0.5 && !seen; break;
      case 'hunt': default: {
        const tgt = this.huntTarget();
        target = tgt;
        if (tgt && Math.hypot(tgt.x - me.pos.x, tgt.z - me.pos.z) < 1.5 && this.lookAround <= 0) { this.lookAround = 1.2; this.heard = null; this.lastSeen = null; }
      }
    }
    let wx = 0, wz = 0;
    if (target) {
      const dir = this.followPath(target, dt);
      if (dir) { wx += dir.x; wz += dir.z; }
    }
    if (strafe && seen) {
      // Copycat übernimmt deinen Rhythmus beim Hin-und-her-Laufen
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        const mr = this.model.meanRun();
        const base = mr ? Math.max(0.25, Math.min(1.2, mr)) : 0.6;
        this.strafeT = base * rnd(0.6, 1.4);
        this.strafeDir = Math.random() < 0.8 ? -this.strafeDir : this.strafeDir;
        if (Math.random() < 0.15) this.strafeDir = 0;
      }
      const fx = p.pos.x - me.pos.x, fz = p.pos.z - me.pos.z, l = Math.hypot(fx, fz) || 1;
      wx += -fz / l * this.strafeDir; wz += fx / l * this.strafeDir;
    }
    // Hängt fest? Richtung wechseln / springen
    if (this.lastPos && (wx || wz)) {
      const moved = Math.hypot(me.pos.x - this.lastPos.x, me.pos.z - this.lastPos.z);
      this.stuckT = moved < 0.5 * dt ? this.stuckT + dt : 0;
      if (this.stuckT > 0.4) { this.strafeDir = -this.strafeDir; this.path = null; this.stuckT = 0; if (Math.random() < 0.5) cmd.jump = true; }
    }
    this.lastPos = { ...me.pos };
    // in lokale Steuerung umrechnen
    const l = Math.hypot(wx, wz);
    if (l > 0.01) {
      wx /= l; wz /= l;
      const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
      cmd.fwd = wx * sy + wz * cy; cmd.side = -wx * cy + wz * sy;
      const known = this.lastSeen && t - this.lastSeenTime < 8 ? this.lastSeen : this.heard?.pos;
      const nearKnown = known && Math.hypot(known.x - me.pos.x, known.z - me.pos.z) < 20;
      const bold = this.model.cap > 0.5 || t < 5 || this.model.tac > 0.4;
      cmd.sprint = !seen && this.state !== 'ambush' && this.state !== 'hold' && cmd.fwd > 0.5 && (!nearKnown || bold || this.state === 'push' || this.state === 'flank');
    }
    if ((this.state === 'hunt' || this.state === 'flank' || this.state === 'high' || this.state === 'push') && !seen && l > 0.01) { // beim Suchen in Laufrichtung schauen
      const ty = Math.atan2(wx, wz); if (!aimPoint || t - this.lastSeenTime > 4) me.yaw += Math.max(-TURN * dt * 0.6, Math.min(TURN * dt * 0.6, angDiff(ty, me.yaw)));
    }

    // ---------- Deine Tricks nachmachen ----------
    if (this.trickT <= 0) {
      this.trickT = 0.5;
      const m = this.model, perHalfSec = k => Math.min(0.5, m.perMin(k) / 120 * (seen ? 1.4 : 0.6));
      if (m.playTime > 15) {
        if (Math.random() < perHalfSec('jump')) cmd.jump = true;
        if (Math.random() < perHalfSec('dash') && (seen || l > 0)) cmd.dash = true;
        if (Math.random() < perHalfSec('slide') && cmd.sprint) cmd.crouchPressed = cmd.crouch = true;
      }
      if (seen && this.burstStart === false && Math.random() < 0.04) cmd.jump = true;
    }
    if (me.slideT > 0) cmd.crouch = true;
    if (this.wantHeal && !seen && me.syringes > 0 && me.hp < 60 && !me.healing) { cmd.heal = true; this.wantHeal = false; }

    // ---------- Verspotten (riskant!) ----------
    if (!me.taunt && this.tauntCd <= 0 && seen && dist > 7 && me.hp > 55 && p.hp < 55 && p.reloading && Math.random() < 0.5) this.startTaunt();
    else if (!me.taunt && this.tauntCd <= 0 && !seen && t - this.lastSeenTime < 3 && me.hp > 60 && Math.random() < 0.02) this.startTaunt();
    return cmd;
  }

  startTaunt(dur = 1.6) {
    const m = this.model, g = this.game;
    let type = ['box', 'dance'][(Math.random() * 2) | 0];
    if (m.perMin('crouch') > 8 || m.perMin('slide') > 4) type = 'crouchspam';
    else if (m.perMin('jump') > 8) type = 'flail';
    g.bot.taunt = { type, t: 0, dur };
    this.tauntCd = rnd(10, 16);
    g.onBotTaunt(type);
  }

  decide(seen, dist) {
    const g = this.game, me = g.bot, p = g.player, t = g.roundTime, m = this.model, tac = m.tac;
    const prev = this.state;
    const knownRecent = seen || t - this.lastSeenTime < 2.5;
    // ---------- Gelegenheiten: Mango heilt / lädt nach / hat kaum Leben / fast leeres Magazin ----------
    let win = this.window && t < this.window.until ? this.window.type : null;
    if (!win && seen && p.ammo <= 2 && !p.reloading) win = 'reload';
    const pWeak = knownRecent && p.hp <= 35;
    const iWeak = me.hp <= 40, canHeal = me.syringes > 0 && me.hp < 60;
    // Einmal pro Gelegenheit entscheiden, ob Copycat sie erkennt (steigt mit dem Taktik-Level; anfangs selten)
    const opp = win ? 'win:' + win : pWeak ? 'weak' : null;
    if (opp !== this.oppKey) { this.oppKey = opp; this.oppTake = !!opp && Math.random() < 0.15 + 0.85 * tac; }
    let pressure = false;
    if (opp && this.oppTake && dist < 30) pressure = !iWeak || !!win || p.hp <= me.hp + 10; // selbst angeschlagen: nur wenn Mango genauso schlecht dran ist
    // Vorahnung: heilt meist bei ~X Leben -> kurz davor schon Druck machen
    const ht = m.healThreshold;
    if (!pressure && !iWeak && tac > 0.3 && m.cap > 0.35 && ht !== null && knownRecent && p.hp <= ht + 8 && p.syringes > 0) pressure = true;
    if (pressure) {
      if (this.state !== 'push') this.say(win === 'heal' ? 'push_heal' : win === 'reload' ? 'push_reload' : 'push_low', { chance: 0.55, cooldown: 20 });
      this.setState('push'); return;
    }
    if (this.state === 'push' && this.stateT < 1.2 && (seen || t - this.lastSeenTime < 1.5)) return; // kurz dranbleiben
    if (this.state === 'cover') {
      const done = this.stateT > 5 || (!me.reloading && !me.healing && (!this.wantHeal || me.hp > 70) && this.stateT > 1.2);
      if (!done) return;
      this.wantHeal = false;
    }
    // ---------- Selbst angeschlagen: heilen oder alles auf eine Karte? ----------
    this.kite = false;
    if (iWeak && knownRecent) {
      if (canHeal) {
        // direkt vor Mango heilen wäre tödlich – mit Taktik lieber kämpfen, wenn Mango auch wackelt
        const tooClose = seen && dist < 7 && tac > 0.35 && p.hp <= me.hp + 25;
        if (tooClose) { if (prev !== 'fight') this.say('self_rush_low', { chance: 0.45 }); this.setState('fight'); return; }
        const cp = this.findCover();
        if (cp) { this.coverPoint = cp; this.wantHeal = true; this.say('self_heal', { chance: 0.45, cooldown: 30 }); this.setState('cover'); return; }
      } else if (tac > 0.25) { this.kite = true; if (prev !== 'fight') this.say('self_kite', { chance: 0.4, cooldown: 20 }); }
    }
    if (seen && me.reloading && dist < 20 && !pWeak) {
      const cp = this.findCover();
      if (cp) { this.coverPoint = cp; this.wantHeal = false; this.setState('cover'); return; }
    }
    if (!seen && canHeal && iWeak) this.wantHeal = true;
    // ---------- Flagge ----------
    if (g.flag.active) {
      const pIn = Math.hypot(p.pos.x, p.pos.z) < 3.2, meIn = Math.hypot(me.pos.x, me.pos.z) < 3.2;
      const flagEager = me.hp >= p.hp - 10 || m.flagRushRate > 0.5 || g.flag.progress.player > 2.5;
      if (!seen || meIn || flagEager) { if (!(seen && pIn && !meIn && dist < 6)) { this.setState('flag'); return; } }
    } else if (t > 84 && m.flagRushRate > 0.5 && !seen) { this.setState('flag'); return; }
    if (this.state === 'hold') {
      const lost = !seen && t - this.lastSeenTime > 3;
      if (dist < 7 || lost || this.stateT > 9) { this.setState(dist < 7 ? 'fight' : 'hunt'); }
      return;
    }
    // ---------- Konter-Plan ab und zu neu wählen (nicht mitten im Gefecht) ----------
    this.planT += 0.2;
    if (!seen && this.planT > 9) this.choosePlan();
    const plan = m.plan;
    if (seen) {
      // Vorsicht: anfangs fast immer Deckung + rauslehnen; später seltener. Gegen Stürmer bewusst aus der Deckung.
      let caution = 1 - m.cap * 0.75 + (m.aggression > 0.35 && m.cap > 0.3 ? 0.25 : 0);
      if (plan === 'bait') caution += 0.35;
      if (plan === 'rushClose') caution = 0.1;
      if (prev !== 'fight' && dist > 8 && !(p.hp < 30 && me.hp > 60) && Math.random() < caution) {
        const cp = this.findCover(6);
        if (cp) { this.coverPoint = cp; this.coverLow = cp.low; this.holdPhase = 'hide'; this.holdT = rnd(0.4, 0.9); this.setState('hold'); return; }
      }
      this.setState('fight'); return;
    }
    // ---------- Nicht in Sicht: Plan ausführen ----------
    if (this.state === 'flank') {
      const there = this.flankPt && Math.hypot(this.flankPt.x - me.pos.x, this.flankPt.z - me.pos.z) < 2;
      if (!there && this.stateT < 9 && this.flankPt) return;
      this.setState('hunt'); return;
    }
    if (this.state === 'high') {
      const there = this.highPt && Math.hypot(this.highPt.x - me.pos.x, this.highPt.z - me.pos.z) < 1.2;
      if (there) { this.ambushLook = this.huntTarget(); this.setState('ambush'); this.ambushMax = 6; return; }
      if (this.stateT < 10 && this.highPt) return;
    }
    if (plan === 'flank' && prev !== 'flank' && (this.lastSeen || this.heard)) {
      this.flankPt = this.findFlank(this.lastSeen || this.heard.pos);
      if (this.flankPt) { this.setState('flank'); return; }
    }
    if (plan === 'high' && prev !== 'high' && prev !== 'ambush' && !this.highPt) {
      this.highPt = this.findHigh();
      if (this.highPt) { this.setState('high'); return; }
    }
    // Hinterhalt: gegen Stürmer (Plan "bait") gezielt, sonst manchmal nach einem Gefecht
    if (prev === 'fight' && (plan === 'bait' || (m.aggression > 0.3 && Math.random() < 0.5)) && t - this.lastSeenTime < 1.2) {
      this.ambushLook = this.lastSeen; this.ambushMax = plan === 'bait' ? 5.5 : 3.5; this.setState('ambush'); return;
    }
    if (plan === 'bait' && prev === 'hunt' && this.stateT > 2 && Math.random() < 0.08 * (1 + tac)) {
      const cp = this.findCover(5);
      if (cp) { this.ambushLook = this.huntTarget(); this.ambushMax = 5; this.setState('ambush'); return; }
    }
    if (this.state === 'ambush' && this.stateT < (this.ambushMax || 3.5)) return;
    this.setState('hunt');
  }
  // Seitlicher Anmarschpunkt (neben Mangos Position, von dort aus nicht direkt sichtbar)
  findFlank(P) {
    const g = this.game, me = g.bot, nav = g.arena.nav, world = g.arena.world;
    const dx = me.pos.x - P.x, dz = me.pos.z - P.z, l = Math.hypot(dx, dz) || 1, fx = dx / l, fz = dz / l;
    let best = null;
    for (const s of [1, -1]) for (const [side, back] of [[8, 2], [7, -3], [10, 4], [6, -5]]) {
      const x = P.x - fz * s * side + fx * back, z = P.z + fx * s * side + fz * back;
      if (Math.abs(x) > 16 || Math.abs(z) > 27) continue;
      const [ci, cj] = nav.toCell(x, z), k = cj * nav.w + ci;
      if (nav.blocked[k] || nav.height[k] > 0.3) continue;
      if (world.lineOfSight({ x: P.x, y: 1.7, z: P.z }, { x, y: 1.6, z })) continue;
      const d = Math.hypot(x - me.pos.x, z - me.pos.z) + Math.random() * 3;
      if (!best || d < best.d) best = { x, z, d };
    }
    return best;
  }
  // Hoher Platz (Plattform, Dach) in Copycats Hälfte nahe der Mitte
  findHigh() {
    const nav = this.game.arena.nav, me = this.game.bot;
    let best = null;
    for (let i = 0; i < 400; i++) {
      const x = rnd(-15, 15), z = rnd(2, 22);
      const [ci, cj] = nav.toCell(x, z), k = cj * nav.w + ci;
      if (nav.blocked[k] || nav.height[k] < 1.2) continue;
      const sc = nav.height[k] - Math.abs(z - 8) * 0.08 - Math.hypot(x - me.pos.x, z - me.pos.z) * 0.03;
      if (!best || sc > best.s) best = { x, z, s: sc };
    }
    return best;
  }
  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; this.path = null; } }

  huntTarget() {
    const g = this.game, t = g.roundTime;
    if (this.lastSeen && t - this.lastSeenTime < 6) return this.model.searchPoint(this.lastSeen, g.bot.pos);
    if (this.heard && t - this.heard.t < 5) return this.heard.pos;
    // Ahnung: Mangos Hälfte, bevorzugt hohe Positionen falls er die mag
    if (!this.guess || Math.hypot(this.guess.x - g.bot.pos.x, this.guess.z - g.bot.pos.z) < 2) {
      const hi = this.model.playTime > 20 && this.model.highTime / this.model.playTime > 0.25;
      const nav = g.arena.nav;
      let best = null;
      for (let i = 0; i < 12; i++) {
        const x = rnd(-14, 14), z = rnd(-24, 4);
        const [ci, cj] = nav.toCell(x, z), k = cj * nav.w + ci;
        if (nav.blocked[k]) continue;
        const score = (hi ? nav.height[k] : 0) + Math.random();
        if (!best || score > best.s) best = { x, z, s: score };
      }
      this.guess = best || { x: 0, z: -10 };
    }
    return this.guess;
  }

  followPath(target, dt) {
    const g = this.game, me = g.bot, nav = g.arena.nav;
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || !this.pathTarget || Math.hypot(this.pathTarget.x - target.x, this.pathTarget.z - target.z) > 1.5) {
      this.path = nav.findPath(me.pos, target) || null; this.pathTarget = { x: target.x, z: target.z }; this.repathT = 0.8;
    }
    if (!this.path || this.path.length < 2) {
      const dx = target.x - me.pos.x, dz = target.z - me.pos.z, l = Math.hypot(dx, dz);
      return l > 0.4 ? { x: dx / l, z: dz / l } : null;
    }
    while (this.path.length > 1 && Math.hypot(this.path[1].x - me.pos.x, this.path[1].z - me.pos.z) < 0.6) this.path.shift();
    if (this.path.length < 2) return null;
    const w = this.path[1], dx = w.x - me.pos.x, dz = w.z - me.pos.z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  findCover(maxR = 10) {
    const g = this.game, me = g.bot, p = g.player, world = g.arena.world, nav = g.arena.nav;
    const from = { x: p.pos.x, y: p.eyeY, z: p.pos.z };
    let best = null;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(1.5, maxR);
      const x = me.pos.x + Math.cos(a) * r, z = me.pos.z + Math.sin(a) * r;
      const [ci, cj] = nav.toCell(x, z), k = cj * nav.w + ci;
      if (nav.blocked[k] || nav.height[k] > 0.3) continue;
      if (Math.hypot(x - p.pos.x, z - p.pos.z) < 6) continue;
      if (world.lineOfSight(from, { x, y: 1.0, z })) continue;
      const low = world.lineOfSight(from, { x, y: 2.0, z }); // nur hinter halbhoher Deckung -> ducken
      const s = r + Math.random() + (low ? 1.5 : 0);
      if (!best || s < best.s) best = { x, z, s, low };
    }
    return best;
  }

  // Punkt nahe der Deckung, von dem aus Copycat Mango sehen kann
  findPeek(cp) {
    const g = this.game, p = g.player, world = g.arena.world, nav = g.arena.nav;
    if (!cp) return null;
    const target = { x: p.pos.x, y: p.eyeY, z: p.pos.z };
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0.8, 2.8);
      const x = cp.x + Math.cos(a) * r, z = cp.z + Math.sin(a) * r;
      const [ci, cj] = nav.toCell(x, z), k = cj * nav.w + ci;
      if (nav.blocked[k] || nav.height[k] > 0.3) continue;
      if (!world.lineOfSight({ x, y: g.bot.rig.standEye, z }, target)) continue;
      if (!best || r < best.r) best = { x, z, r };
    }
    return best;
  }
}
