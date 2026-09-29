// Gemeinsame Logik für Mango und Copycat: Bewegung, Gewehr, Spritzen.
import { T } from './config.js';

// Rückstoßmuster (Grad pro Schuss: [hoch, rechts]) – immer gleich, damit man es lernen kann
export const RECOIL = [
  [0.9, 0], [1.0, 0.05], [1.1, -0.05], [1.1, 0.1], [1.0, 0.15], [0.9, 0.1], [0.8, 0.05], [0.7, 0],
  [0.3, -0.6], [0.3, -0.7], [0.3, -0.6], [0.25, -0.5], [0.25, -0.3], [0.2, -0.1],
  [0.25, 0.5], [0.25, 0.6], [0.25, 0.7], [0.2, 0.6], [0.2, 0.4], [0.2, 0.2],
];

export class Actor {
  constructor(rig, name) {
    this.rig = rig; this.name = name;
    this.pos = { x: 0, y: 0, z: 0 }; this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.syringes = T.syringeStart;
    this.reset();
  }
  reset() {
    this.hp = T.hp; this.alive = true; this.deadT = 0;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.onGround = true; this.crouch = 0; this.crouching = false;
    this.slideT = 0; this.slideCd = 0; this.slideDir = { x: 0, z: 0 };
    this.dashT = 0; this.dashCharges = T.dashCharges; this.dashRecharge = 0; this.dashDir = { x: 0, z: 0 };
    this.ammo = T.magSize; this.reloadT = -1; this.fireCd = 0; this.shotIndex = 0; this.sinceShot = 9;
    this.syringeT = -1; this.healLeft = 0; this.healTick = 0;
    this.taunt = null; this.ads = false; this.sprinting = false;
    this.speed = 0; this.localMove = { fwd: 0, side: 0 };
    this.stepAcc = 0; this.airTime = 0;
    this.damageTaken = 0; this.damageDealt = 0;
  }
  get height() { return this.rig.standEye + 0.25 - this.crouch * 0.7; }
  get eyeY() { return this.pos.y + this.rig.eyeHeight(this.crouch) + (this.slideT > 0 ? -0.35 : 0); }
  eye() { return { x: this.pos.x, y: this.eyeY, z: this.pos.z }; }
  forward() { return { x: Math.sin(this.yaw) * Math.cos(this.pitch), y: Math.sin(this.pitch), z: Math.cos(this.yaw) * Math.cos(this.pitch) }; }
  get reloading() { return this.reloadT >= 0; }
  get healing() { return this.syringeT >= 0; }

  // cmd: {fwd, side, sprint, jump, crouch, dash, fire, reload, heal, ads}
  update(dt, cmd, world, ev) {
    if (!this.alive) { this.deadT += dt; this.vel.x *= 0.9; this.vel.z *= 0.9; this.physics(dt, world, 0, 0, ev); return; }
    if (this.taunt) { this.taunt.t += dt; if (this.taunt.t > this.taunt.dur) this.taunt = null; }
    // Dash-Ladungen
    if (this.dashCharges < T.dashCharges) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= T.dashRecharge) { this.dashCharges++; this.dashRecharge = 0; }
    }
    this.slideCd -= dt;
    this.sinceShot += dt;
    if (this.sinceShot > 0.32) this.shotIndex = 0;
    this.fireCd -= dt;

    // Bewegungswunsch
    let fwd = cmd.fwd || 0, side = cmd.side || 0;
    const len = Math.hypot(fwd, side); if (len > 1) { fwd /= len; side /= len; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // Welt-Richtung: vorwärts = (sin yaw, cos yaw), rechts = (-cos yaw, sin yaw)
    const wx = sy * fwd - cy * side, wz = cy * fwd + sy * side;
    this.ads = !!cmd.ads && !this.healing && this.reloadT < 0;
    this.sprinting = !!cmd.sprint && fwd > 0.3 && !this.ads && !cmd.fire && !this.healing && this.crouch < 0.5;
    this.crouching = !!cmd.crouch;

    // Rutschen: Ducken während Sprint
    if (cmd.crouchPressed && this.sprinting && this.onGround && this.slideCd <= 0 && this.slideT <= 0) {
      this.slideT = T.slideTime; this.slideCd = T.slideTime + T.slideCooldown;
      const l = Math.hypot(wx, wz) || 1; this.slideDir = { x: wx / l, z: wz / l };
      const cur = Math.hypot(this.vel.x, this.vel.z);
      const v = Math.max(T.slideV, cur + 2);
      this.vel.x = this.slideDir.x * v; this.vel.z = this.slideDir.z * v;
      ev.push({ type: 'slide', actor: this });
    }
    // Dash
    if (cmd.dash && this.dashCharges > 0 && this.dashT <= 0) {
      this.dashCharges--; if (this.dashCharges === T.dashCharges - 1) this.dashRecharge = 0;
      let dx = wx, dz = wz; const l = Math.hypot(dx, dz);
      if (l < 0.1) { dx = sy; dz = cy; } else { dx /= l; dz /= l; }
      this.dashDir = { x: dx, z: dz }; this.dashT = T.dashTime;
      this.vel.x = dx * T.dashV; this.vel.z = dz * T.dashV; if (!this.onGround) this.vel.y = Math.max(this.vel.y, 0.5);
      this.slideT = 0;
      ev.push({ type: 'dash', actor: this });
    }
    // Springen
    if (cmd.jump && this.onGround && this.crouch < 0.6) {
      this.vel.y = T.jumpV; this.onGround = false;
      if (this.slideT > 0) { this.slideT = 0; this.vel.y *= 0.9; } // Slide-Sprung behält Tempo
      ev.push({ type: 'jump', actor: this });
    }
    const crouchTarget = (this.crouching || this.slideT > 0) ? 1 : 0;
    this.crouch += (crouchTarget - this.crouch) * Math.min(1, dt * 12);

    let maxV = this.sprinting ? T.sprint : T.walk;
    if (this.crouch > 0.5) maxV = T.crouch;
    if (this.ads) maxV = Math.min(maxV, T.adsWalk);
    if (this.healing) maxV *= T.syringeMoveMul;
    if (this.taunt) maxV = 0;

    this.physics(dt, world, wx * maxV, wz * maxV, ev);

    // Lokale Bewegung für Animation
    this.localMove.fwd = (this.vel.x * sy + this.vel.z * cy);
    this.localMove.side = (-this.vel.x * cy + this.vel.z * sy);

    // Nachladen
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      if (this.reloadT >= T.reloadTime) { this.ammo = T.magSize; this.reloadT = -1; ev.push({ type: 'reloaded', actor: this }); }
    } else if ((cmd.reload && this.ammo < T.magSize) || (this.ammo === 0 && cmd.fire && this.fireCd <= 0)) {
      if (!this.healing) { this.reloadT = 0; ev.push({ type: 'reload', actor: this, ammoLeft: this.ammo }); }
    }
    // Spritze
    if (cmd.heal && !this.healing && this.syringes > 0 && this.hp < T.hp) {
      this.syringes--; this.syringeT = 0; this.healLeft = T.syringeHeal; this.healTick = 0;
      if (this.reloadT >= 0) this.reloadT = -1; // Nachladen abgebrochen
      ev.push({ type: 'heal', actor: this, hp: this.hp });
    }
    if (this.syringeT >= 0) {
      const prev = this.syringeT; this.syringeT += dt;
      if (prev < 0.52 * T.syringeAnim && this.syringeT >= 0.52 * T.syringeAnim) ev.push({ type: 'stab', actor: this });
      if (this.syringeT >= T.syringeAnim) this.syringeT = -1;
    }
    if (this.healLeft > 0 && (this.syringeT < 0 || this.syringeT > T.syringeAnim * 0.6)) {
      this.healTick += dt;
      const step = T.syringeHealTime / 10;
      while (this.healTick >= step && this.healLeft > 0) {
        this.healTick -= step;
        const amt = Math.min(5, this.healLeft, T.hp - this.hp);
        this.hp += amt; this.healLeft -= 5;
        if (this.hp >= T.hp) this.healLeft = 0;
        ev.push({ type: 'healtick', actor: this });
      }
    }
    // Schießen
    if (cmd.fire && this.fireCd <= 0 && this.ammo > 0 && this.reloadT < 0 && !this.healing && !this.taunt) {
      this.fireCd = T.fireInterval; this.ammo--;
      const idx = this.shotIndex; this.shotIndex = Math.min(this.shotIndex + 1, RECOIL.length - 1); this.sinceShot = 0;
      ev.push({ type: 'fire', actor: this, index: idx, spread: this.spread(idx) });
      this.rig.recoil = 1;
    } else if (cmd.firePressed && this.ammo === 0 && this.reloadT < 0) ev.push({ type: 'empty', actor: this });
  }

  spread(idx) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let s = this.ads ? 0.12 : 1.6;
    s += (this.ads ? 0.9 : 2.2) * Math.min(1, sp / 8);
    if (!this.onGround) s += 3.5;
    if (this.crouch > 0.5 && this.slideT <= 0) s *= 0.65;
    if (idx === 0 && this.ads && sp < 1) s = 0;
    return s; // Grad
  }

  physics(dt, world, tvx, tvz, ev) {
    // Horizontal
    if (this.slideT > 0) {
      this.slideT -= dt;
      const v = Math.hypot(this.vel.x, this.vel.z), nv = Math.max(T.crouch, v - dt * 9);
      if (v > 0.01) { this.vel.x *= nv / v; this.vel.z *= nv / v; }
      // leichtes Lenken
      this.vel.x += (tvx * 0.15) * dt; this.vel.z += (tvz * 0.15) * dt;
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.dashT <= 0) { // Ruck vorbei: sofort auf Lauftempo abbremsen
        const v = Math.hypot(this.vel.x, this.vel.z), cap = this.sprinting ? T.sprint : T.walk;
        if (v > cap) { this.vel.x *= cap / v; this.vel.z *= cap / v; }
      }
    } else {
      const accel = this.onGround ? T.accelGround : T.accelAir;
      let dx = tvx - this.vel.x, dz = tvz - this.vel.z;
      const dl = Math.hypot(dx, dz), maxStep = accel * dt;
      if (dl > maxStep) { dx *= maxStep / dl; dz *= maxStep / dl; }
      if (this.onGround || Math.hypot(tvx, tvz) > 0.1) { this.vel.x += dx; this.vel.z += dz; }
    }
    // Vertikal
    this.vel.y -= T.gravity * dt;
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const r = this.rig.spec.bodyR * 0.9;
    // Kanten-Hilfe: in der Luft zieht man sich an Kanten bis ~0,95 m über den Füßen hoch statt abzuprallen
    const assist = this.onGround ? T.stepHeight : (this.vel.y > 5 ? 0.45 : T.mantle);
    const bumped = world.pushOut(this.pos, r, this.pos.y, this.height, assist);
    if (bumped && this.dashT > 0) { this.dashT = 0; const v = Math.hypot(this.vel.x, this.vel.z); if (v > T.walk) { this.vel.x *= T.walk / v; this.vel.z *= T.walk / v; } }
    // tatsächliche Geschwindigkeit nach Kollision
    if (dt > 0) {
      const ax = (this.pos.x - prevX) / dt, az = (this.pos.z - prevZ) / dt;
      if (bumped) { this.vel.x = ax; this.vel.z = az; }
    }
    this.pos.y += this.vel.y * dt;
    const airMantle = !this.onGround && this.vel.y <= 1.5;
    const g = world.groundHeight(this.pos.x, this.pos.z, airMantle ? r * 1.2 : r * 0.8, this.pos.y + Math.max(0, -this.vel.y * dt), this.onGround ? T.stepHeight : (airMantle ? T.mantle : 0.12));
    if (airMantle && g > this.pos.y + 0.05) { this.pos.y = g; this.vel.y = 0; this.mantled = true; }
    const wasGround = this.onGround;
    if (this.pos.y <= g + 0.001 && this.vel.y <= 0) {
      if (!wasGround && this.airTime > 0.25) ev.push({ type: 'land', actor: this, fall: -this.vel.y });
      this.pos.y = g; this.vel.y = 0; this.onGround = true; this.airTime = 0;
    } else if (this.onGround && this.vel.y <= 0 && this.pos.y - g < T.stepHeight + 0.05) {
      this.pos.y = g; this.vel.y = 0; // Treppen/Rampen runter "kleben"
    } else { this.onGround = false; this.airTime += dt; }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // Schritte
    if (this.onGround && this.speed > 2.5 && this.slideT <= 0) {
      this.stepAcc += dt * this.speed;
      if (this.stepAcc > 2.2) { this.stepAcc = 0; ev.push({ type: 'step', actor: this, loud: this.sprinting }); }
    }
  }

  damage(amount, info, ev) {
    if (!this.alive) return 0;
    const d = Math.min(this.hp, amount);
    this.hp -= d; this.damageTaken += d;
    if (this.taunt) this.taunt = null;
    if (this.hp <= 0) { this.alive = false; this.hp = 0; this.reloadT = -1; this.syringeT = -1; ev.push({ type: 'death', actor: this, info }); }
    return d;
  }

  animState() {
    return {
      speed: this.speed, fwd: this.localMove.fwd, side: Math.sign(this.localMove.side),
      grounded: this.onGround, crouch: this.slideT > 0 ? 0 : this.crouch, slide: this.slideT > 0,
      pitch: this.pitch, reload: this.reloadT >= 0 ? this.reloadT / T.reloadTime : -1,
      syringe: this.syringeT >= 0 ? this.syringeT / T.syringeAnim : -1,
      taunt: this.taunt, dead: this.alive ? 0 : Math.min(1, this.deadT * 2.2), sprint: this.sprinting, dash: this.dashT > 0,
    };
  }
  syncRig(dt, st = this.animState()) {
    this.rig.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.rig.root.rotation.y = this.yaw;
    this.rig.animate(st, dt);
  }
}
