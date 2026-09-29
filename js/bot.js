// Copycat: KI-Gegner. Grundkönnen ist "ok" und bleibt gleich – besser wird er NUR durch das, was er über dich lernt.
import { PlayerModel } from './learner.js';

const REACTION = 0.34;      // s bis er nach dem Entdecken schießt
const PERCEPTION = 0.2;     // wahrgenommene Verzögerung
const AIM_ERR = 1.9;        // Grad Grundstreuung beim Zielen
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
    this.model.onRoundStart();
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
      this.aimErr = { x: rnd(-1, 1) * AIM_ERR * settle, y: rnd(-1, 1) * AIM_ERR * settle * 0.7 };
    }
    if (this.lookAround > 0 && !seen) { this.lookAround -= dt; me.yaw += dt * 2.2; }
    else if (aimPoint) {
      const dx = aimPoint.x - eye.x, dy = aimPoint.y - eye.y, dz = aimPoint.z - eye.z;
      const ty = Math.atan2(dx, dz) + this.aimErr.x * Math.PI / 180;
      const tp = Math.atan2(dy, Math.hypot(dx, dz)) + this.aimErr.y * Math.PI / 180;
      const dyaw = angDiff(ty, me.yaw), maxT = TURN * dt;
      me.yaw += Math.max(-maxT, Math.min(maxT, dyaw));
      me.pitch += Math.max(-maxT, Math.min(maxT, tp - me.pitch));
      if (seen && this.seenT > REACTION && Math.abs(dyaw) < (this.barrelAim ? 0.05 : 0.12) && p.alive) wantFire = true;
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
    if (me.ammo === 0 || (me.ammo < 6 && !seen && t - this.lastSeenTime > 1.5)) cmd.reload = true;

    // ---------- Bewegung ----------
    let target = null, strafe = false;
    switch (this.state) {
      case 'fight': {
        strafe = true;
        const want = this.model.preferredRange();
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
      const bold = this.model.cap > 0.5 || t < 5;
      cmd.sprint = !seen && this.state !== 'ambush' && this.state !== 'hold' && cmd.fwd > 0.5 && (!nearKnown || bold);
    }
    if (this.state === 'hunt' && !seen && l > 0.01) { // beim Suchen in Laufrichtung schauen
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
    const g = this.game, me = g.bot, p = g.player, t = g.roundTime;
    const prev = this.state;
    const hpLow = me.hp < 40, canHeal = me.syringes > 0 && me.hp < 55;
    // Mango heilt / lädt nach -> drücken! (lernt, wann du heilst)
    const ht = this.model.healThreshold;
    const pushNow = ((p.healing || p.reloading) && dist < 25 && this.model.cap > 0.2) || (this.model.cap > 0.35 && ht !== null && p.hp <= ht + 8 && p.syringes > 0);
    if (this.state === 'cover') {
      const done = this.stateT > 5 || (!me.reloading && !me.healing && (!this.wantHeal || me.hp > 70) && this.stateT > 1.2);
      if (!done) return;
      this.wantHeal = false;
    }
    if (seen && !pushNow && ((hpLow && canHeal) || (me.reloading && dist < 20))) {
      const cp = this.findCover();
      if (cp) { this.coverPoint = cp; this.wantHeal = hpLow && canHeal; this.setState('cover'); return; }
    }
    if (!seen && canHeal && hpLow) this.wantHeal = true;
    if (g.flag.active) {
      const pIn = Math.hypot(p.pos.x, p.pos.z) < 3.2, meIn = Math.hypot(me.pos.x, me.pos.z) < 3.2;
      const flagEager = me.hp >= p.hp - 10 || this.model.flagRushRate > 0.5 || g.flag.progress.player > 2.5;
      if (!seen || meIn || flagEager) { if (!(seen && pIn && !meIn && dist < 6)) { this.setState('flag'); return; } }
    } else if (t > 84 && this.model.flagRushRate > 0.5 && !seen) { this.setState('flag'); return; }
    if (this.state === 'hold') {
      const lost = !seen && t - this.lastSeenTime > 3;
      if (dist < 7 || lost || this.stateT > 9 || pushNow) { this.setState(dist < 7 || pushNow ? 'fight' : 'hunt'); }
      return;
    }
    if (seen) {
      // Vorsicht: anfangs fast immer Deckung + rauslehnen; später seltener (oder gegen Stürmer bewusst)
      const caution = 1 - this.model.cap * 0.75 + (this.model.aggression > 0.35 && this.model.cap > 0.3 ? 0.25 : 0);
      if (prev !== 'fight' && dist > 8 && !pushNow && !(p.hp < 30 && me.hp > 60) && Math.random() < caution) {
        const cp = this.findCover(6);
        if (cp) { this.coverPoint = cp; this.coverLow = cp.low; this.holdPhase = 'hide'; this.holdT = rnd(0.4, 0.9); this.setState('hold'); return; }
      }
      this.setState('fight'); return;
    }
    // Hinterhalt gegen Stürmer
    if (prev === 'fight' && this.model.aggression > 0.3 && Math.random() < 0.5 && t - this.lastSeenTime < 1) { this.setState('ambush'); return; }
    if (this.state === 'ambush' && this.stateT < 3.5) return;
    this.setState('hunt');
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
