// Figuren: Profi-Modelle (Quaternius, CC0) + eigene Animationsschicht.
// Fertige Animationen (Stehen, Gehen, Jubeln, Umfallen) werden abgespielt; Zielen, Nachladen, Spritze, Ducken,
// Rutschen und Springen werden am Skelett berechnet (Hände/Füße greifen per "IK" genau an die richtige Stelle).
import * as THREE from 'three';
import { toon, box, sphere, cyl, cone, LAYER_FX } from './toon.js';
import { charGltf, cloneSkinned, prop } from './assets.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _q1 = Q(), _q2 = Q(), _q3 = Q();
const smooth = t => t * t * (3 - 2 * t);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

// ---------- IK-Helfer ----------
function aimBone(bone, childWorld, targetWorld) {
  bone.getWorldPosition(_a);
  _b.copy(childWorld).sub(_a);
  _c.copy(targetWorld).sub(_a);
  if (_b.lengthSq() < 1e-10 || _c.lengthSq() < 1e-10) return;
  _b.normalize(); _c.normalize();
  _q1.setFromUnitVectors(_b, _c);
  bone.getWorldQuaternion(_q2);
  _q1.multiply(_q2);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q1));
  bone.updateMatrixWorld(true);
}
const _A = V(), _B = V(), _C = V(), _T = V(), _P = V(), _E = V(), _dir = V();
function twoBoneIK(upper, lower, end, target, pole) {
  upper.getWorldPosition(_A); lower.getWorldPosition(_B); end.getWorldPosition(_C);
  const la = _A.distanceTo(_B), lb = _B.distanceTo(_C);
  _dir.copy(target).sub(_A);
  const d = Math.min(Math.max(_dir.length(), 0.01), (la + lb) * 0.999);
  _dir.normalize();
  _P.copy(pole).sub(_A); _P.addScaledVector(_dir, -_P.dot(_dir));
  if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0);
  _P.normalize();
  const cosA = Math.min(1, Math.max(-1, (la * la + d * d - lb * lb) / (2 * la * d)));
  _E.copy(_A).addScaledVector(_dir, la * cosA).addScaledVector(_P, la * Math.sqrt(1 - cosA * cosA));
  aimBone(upper, _B, _E);
  lower.getWorldPosition(_B); end.getWorldPosition(_C);
  _T.copy(_A).addScaledVector(_dir, d);
  aimBone(lower, _C, _T);
}

// ---------- Streifen-Shirt (Copycat) ----------
function stripeMaterial(h) {
  const m = toon('#ffffff', { unique: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.stripeF = { value: 24 / h };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vStripe;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvStripe = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vStripe; uniform float stripeF;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * mix(vec3(0.11,0.1,0.14), vec3(1.0), step(0.5, fract(vStripe * stripeF))), opacity );');
  };
  m.customProgramCacheKey = () => 'stripes';
  return m;
}

// Kimme & Korn für die Ich-Ansicht (Kamera schaut entlang -Z; Korn-Spitze liegt genau in der Bildmitte)
export function buildViewmodel() {
  const g = new THREE.Group();
  const gun = prop('blaster/blaster-d', { length: 0.6 });
  gun.position.set(0.0, -0.3, -0.7); // Modell-Unterkante liegt bei 0 -> Oberkante knapp unter der Sichtlinie
  g.add(gun);
  const black = toon('#1d1b24'), purple = toon('#6a4fb0');
  g.add(box(0.005, 0.014, 0.01, black, -0.0058, -0.012, -0.34));
  g.add(box(0.005, 0.014, 0.01, black, 0.0058, -0.012, -0.34));
  g.add(box(0.022, 0.006, 0.012, black, 0, -0.021, -0.34));
  g.add(box(0.012, 0.05, 0.03, purple, 0, -0.045, -0.35));
  g.add(box(0.0035, 0.032, 0.006, black, 0, -0.017, -0.92));
  g.add(box(0.004, 0.005, 0.007, toon('#ffd83a'), 0, -0.0025, -0.92));
  g.add(box(0.012, 0.05, 0.012, purple, 0, -0.056, -0.92));
  g.add(box(0.01, 0.1, 0.01, purple, 0, -0.1, -0.92));
  g.add(sphere(0.034, '#ffffff', 0.03, -0.2, -0.5, 12));
  g.add(sphere(0.032, '#ffffff', -0.025, -0.18, -0.85, 12));
  g.traverse(o => { if (o.isMesh) o.renderOrder = 10; });
  return g;
}

export class Rig {
  constructor(gltf, spec) {
    this.spec = spec;
    const s = spec.height / 3.08; this.s = s;
    this.k = 1 / (100 * s); // Meter -> Knochen-Einheiten
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.model = cloneSkinned(gltf.scene);
    this.model.scale.setScalar(s);
    this.body.add(this.model);
    // Farben
    let geoH = 0;
    this.model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.geometry.computeBoundingBox(); geoH = Math.max(geoH, o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y); } });
    const conv = m => {
      const c = spec.colors[m.name];
      if (c === null) { const h = m.clone(); h.visible = false; return h; }
      if (c === 'stripes') return stripeMaterial(geoH || 1);
      return toon(c || '#cccccc');
    };
    this.model.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); });
    // Knochen + Ruhelage
    this.bones = {}; this.rest = [];
    this.model.traverse(o => {
      if (o.isBone || /_end$/.test(o.name)) this.bones[o.name] = o;
      if (o.isBone) this.rest.push([o, o.position.clone(), o.quaternion.clone()]);
    });
    const B = this.bones;
    this.head = new THREE.Object3D(); this.head.position.set(0, 0.0048, 0.0004); B.Head.add(this.head);
    this.headR = 0.46 * s;
    // Animationen
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = n => gltf.animations.find(a => a.name.endsWith('|' + n));
    this.actions = {};
    for (const n of ['Idle', 'Walk', 'Victory', 'Defeat']) { const a = this.mixer.clipAction(clip(n)); a.play(); a.setEffectiveWeight(0); this.actions[n] = a; }
    this.actions.Defeat.setLoop(THREE.LoopOnce); this.actions.Defeat.clampWhenFinished = true;
    this.weights = { Idle: 1, Walk: 0, Victory: 0, Defeat: 0 };
    this.actions.Idle.setEffectiveWeight(1);
    // Waffe (Drehpunkt an der Schulter, neigt sich mit dem Blick)
    this.gunPivot = new THREE.Group(); this.root.add(this.gunPivot);
    this.gun = new THREE.Group(); this.gunPivot.add(this.gun);
    this.gunModel = prop('blaster/blaster-d', { length: 0.8 });
    this.gunModel.rotation.y = Math.PI; // Lauf zeigt nach +Z (Blickrichtung)
    this.gun.add(this.gunModel);
    if (spec.gunTint) this.gunModel.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(spec.gunTint); } });
    this.mag = null; this.gunModel.traverse(o => { if (o.name === 'magazine') this.mag = o; });
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.04, 0.42); this.gun.add(this.muzzle);
    this.rifle = { muzzle: this.muzzle };
    this.gripR = V(0, -0.09, -0.1); this.gripL = V(0, -0.04, 0.2);
    this.magPoint = V(0, -0.16, 0.03); this.chargePoint = V(0.06, 0.06, -0.08);
    this.spareMag = prop('blaster/clip-large', { height: 0.17 }); this.spareMag.visible = false; this.root.add(this.spareMag);
    this.syringe = new THREE.Group();
    this.syringe.add(cyl(0.03, 0.03, 0.2, toon('#bff5ff', { transparent: true, opacity: 0.85 }), 0, 0, 0, 10));
    const juice = cyl(0.026, 0.026, 0.14, toon('#6bff6b', { emissive: '#2a9a2a' }), 0, -0.02, 0, 10); this.syringe.add(juice); this.juice = juice;
    this.syringe.add(cyl(0.01, 0.01, 0.26, '#16121f', 0, 0.18, 0, 6));
    this.syringe.add(cyl(0.04, 0.04, 0.015, '#16121f', 0, 0.31, 0, 10));
    this.syringe.add(cyl(0.005, 0.001, 0.12, '#dddddd', 0, -0.16, 0, 6));
    this.syringe.visible = false; this.root.add(this.syringe);
    // Schatten
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.02; this.shadow.layers.set(LAYER_FX);
    this.root.add(this.shadow);
    // Maße (Meter)
    this.standEye = 2.62 * s;
    this.shoulderY = 1.85 * s;
    this.t = 0; this.recoil = 0; this.hitFlash = 0; this.hitReact = 0;
    this.legYaw = 0;
    this.onMagDrop = null; this._magDropped = false; this._deadStarted = false;
    this.meshes = []; this.root.traverse(o => { if (o.isMesh) this.meshes.push(o); });
  }

  hitboxes(pos) {
    this.root.updateMatrixWorld(true);
    const hp = this.head.getWorldPosition(V());
    return {
      head: { x: hp.x, y: hp.y, z: hp.z, r: this.headR },
      body: { x: pos.x, z: pos.z, r: this.spec.bodyR, y0: pos.y, y1: hp.y - this.headR * 0.85 },
    };
  }
  eyeHeight(crouchAmt) { return this.standEye * (1 - 0.34 * crouchAmt); }
  flash() { this.hitFlash = 0.12; this.hitReact = 1; }
  local(x, y, z) { return V(x, y, z).applyMatrix4(this.root.matrixWorld); }

  setWeights(target, dt, speed = 10) {
    const k = Math.min(1, dt * speed);
    for (const n in this.weights) { this.weights[n] += ((target[n] || 0) - this.weights[n]) * k; this.actions[n].setEffectiveWeight(this.weights[n]); }
  }

  // st: {speed, fwd, side, grounded, crouch, slide, pitch, reload, syringe, taunt, dead, sprint}
  animate(st, dt) {
    this.t += dt;
    const B = this.bones, s = this.s, K = this.k, H = this.spec.height;
    const dead = st.dead > 0, taunt = st.taunt;
    const fullBody = dead || (taunt && (taunt.type === 'dance' || taunt.type === 'flail'));
    // ----- 1) Grundanimation -----
    for (const [b, p, q] of this.rest) { b.position.copy(p); b.quaternion.copy(q); }
    const moving = st.speed > 0.4 && st.grounded && !st.slide;
    const w = { Idle: 1 };
    if (dead) { w.Idle = 0; w.Defeat = 1; }
    else if (fullBody) { w.Idle = 0; w.Victory = 1; }
    else if (moving) { w.Idle = 0; w.Walk = 1; }
    if (dead && !this._deadStarted) { this.actions.Defeat.reset().play(); this._deadStarted = true; }
    if (!dead) this._deadStarted = false;
    this.setWeights(w, dt, dead ? 20 : 10);
    let targetLegYaw = 0, dir = 1;
    if (moving) {
      const ang = Math.atan2(-st.side, st.fwd); // + = nach links
      if (Math.abs(ang) <= 1.95) targetLegYaw = Math.max(-1.15, Math.min(1.15, ang));
      else { dir = -1; targetLegYaw = Math.max(-1.15, Math.min(1.15, ang - Math.sign(ang) * Math.PI)); }
    }
    this.legYaw += (targetLegYaw - this.legYaw) * Math.min(1, dt * 12);
    this.actions.Walk.timeScale = dir * Math.max(0.8, Math.min(2.8, st.speed / 2.3));
    this.actions.Victory.timeScale = taunt?.type === 'flail' ? 1.8 : 1.15;
    this.mixer.update(dt);

    // ----- 2) Körperhaltung -----
    const crouch = st.slide ? 1 : st.crouch;
    const drop = (st.slide ? 0.46 : 0.33) * crouch * H;
    B.Body.position.y -= drop * K;
    if (taunt?.type === 'crouchspam') B.Body.position.y -= ((Math.sin(taunt.t * 14) + 1) / 2) * 0.33 * H * K;
    if (!fullBody) {
      B.Body.rotateY(this.legYaw);
      const lean = st.slide ? -0.5 : (st.sprint ? 0.22 : 0.05) * Math.min(1, st.speed / 6);
      B.Abdomen.rotateY(-this.legYaw * 0.55);
      B.Torso.rotateY(-this.legYaw * 0.45);
      B.Abdomen.rotateX(lean + crouch * 0.28 - this.hitReact * 0.3);
      B.Torso.rotateX(-st.pitch * 0.3);
      B.Neck.rotateX(-st.pitch * 0.4 + (st.slide ? 0.3 : 0));
    }
    this.hitReact = Math.max(0, this.hitReact - dt * 6);
    // Füße: in der Luft anziehen, beim Rutschen ein Bein nach vorn
    if (!fullBody) {
      if (!st.grounded && !st.slide) { for (const f of [B.FootL, B.FootR]) { f.position.y += 0.3 * H * K * 0.5; f.position.z += 0.08 * K; } B.FootL.position.z += 0.12 * K; }
      if (st.slide) { B.FootL.position.z += 0.5 * K; B.FootR.position.z -= 0.1 * K; B.FootR.position.y += 0.05 * K; }
    }
    this.model.updateMatrixWorld(true);
    // ----- 3) Beine (IK zu den Füßen) -----
    if (!dead) for (const side of ['L', 'R']) {
      const tgt = B['Foot' + side].getWorldPosition(V());
      const pole = B['PoleTarget' + side].getWorldPosition(V());
      if (st.slide) pole.y += 0.4;
      twoBoneIK(B['UpperLeg' + side], B['LowerLeg' + side], B['LowerLeg' + side + '_end'] || B['LowerLeg' + side], tgt, pole);
    }

    // ----- 4) Waffe -----
    this.recoil = Math.max(0, this.recoil - dt * 10);
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const shoulder = B.UpperArmR.getWorldPosition(V()).applyMatrix4(inv);
    this.gunPivot.position.set(0, shoulder.y + 0.02, 0.02);
    this.gunPivot.rotation.set(fullBody ? 0 : -st.pitch, 0, 0);
    this.gun.position.set(-0.1, -0.1, 0.34 - this.recoil * 0.06);
    this.gun.rotation.set(-this.recoil * 0.08, 0, 0);
    let leftTarget = null, rightTarget = null, gunVisible = !fullBody;
    this.spareMag.visible = false; this.syringe.visible = false;
    if (this.mag) this.mag.visible = true;
    this.gun.updateMatrixWorld(true);
    const inGun = p => p.clone().applyMatrix4(this.gun.matrixWorld);
    // Nachladen: Magazin raus (fällt), neues vom Gürtel, rein, Spannhebel ziehen
    if (st.reload >= 0 && !dead) {
      const t = st.reload;
      const tilt = smooth(seg(t, 0, 0.12)) * (1 - smooth(seg(t, 0.86, 1)));
      this.gun.rotation.z = tilt * 0.65; this.gun.rotation.x -= tilt * 0.3; this.gun.position.y -= tilt * 0.05; this.gun.position.x += tilt * 0.04;
      this.gun.updateMatrixWorld(true);
      const magOut = t > 0.22 && t < 0.64;
      if (this.mag) this.mag.visible = !magOut;
      if (t > 0.22 && !this._magDropped) { this._magDropped = true; this.onMagDrop?.(this.mag || this.gun); }
      const pMag = inGun(this.magPoint), pGrip = inGun(this.gripL), pCharge = inGun(this.chargePoint);
      const pBelt = this.local(0.26 * H / 2, 0.95 * s, 0.12);
      const below = pMag.clone().add(V(0, -0.14, 0));
      let p;
      if (t < 0.12) p = pGrip.lerp(pMag, smooth(seg(t, 0, 0.12)));
      else if (t < 0.24) p = pMag.lerp(below, smooth(seg(t, 0.12, 0.24)));
      else if (t < 0.42) p = below.lerp(pBelt, smooth(seg(t, 0.24, 0.42)));
      else if (t < 0.58) p = pBelt.lerp(below, smooth(seg(t, 0.42, 0.58)));
      else if (t < 0.66) p = below.lerp(pMag, smooth(seg(t, 0.58, 0.66)));
      else if (t < 0.78) p = pMag.lerp(pCharge, smooth(seg(t, 0.66, 0.78)));
      else if (t < 0.87) p = pCharge.add(V(0, 0, -0.1 * Math.sin(seg(t, 0.78, 0.87) * Math.PI)).applyQuaternion(this.gun.getWorldQuaternion(Q())));
      else p = pCharge.lerp(pGrip, smooth(seg(t, 0.87, 1)));
      leftTarget = p;
      if (t > 0.34 && t < 0.64) {
        this.spareMag.visible = true;
        this.spareMag.position.copy(p.clone().applyMatrix4(inv)).add(V(0, 0.02, 0));
        this.spareMag.rotation.set(0, 0, tilt * 0.65);
      }
    } else this._magDropped = false;
    // Spritze: Waffe nur noch rechts, links Spritze vom Gürtel, ausholen, ins Bein rammen
    if (st.syringe >= 0 && !dead) {
      const t = st.syringe;
      this.gun.rotation.z = -0.55; this.gun.position.y -= 0.1; this.gun.position.x -= 0.04;
      this.gun.updateMatrixWorld(true);
      const pBelt = this.local(0.26 * H / 2, 0.92 * s, 0.12);
      const pUp = this.local(0.3 * H / 2, 2.05 * s, 0.4);
      const pThigh = this.local(0.2 * H / 2, 0.72 * s - (st.crouch ? 0.2 : 0), 0.24);
      let p;
      if (t < 0.22) p = pBelt;
      else if (t < 0.45) p = pBelt.lerp(pUp, smooth(seg(t, 0.22, 0.45)));
      else if (t < 0.53) p = pUp.lerp(pThigh, seg(t, 0.45, 0.53) ** 2);
      else if (t < 0.78) p = pThigh.add(V(0, Math.sin(this.t * 55) * 0.012, 0));
      else p = pThigh.lerp(pBelt, smooth(seg(t, 0.78, 1)));
      leftTarget = p;
      this.syringe.visible = t > 0.08 && t < 0.94;
      this.syringe.position.copy(p.clone().applyMatrix4(inv));
      this.syringe.rotation.set(t < 0.45 ? 0.4 : Math.PI - 0.35, 0, 0);
      this.juice.scale.y = t > 0.55 ? Math.max(0.05, 1 - seg(t, 0.55, 0.78)) : 1;
    }
    // Pantomime: unsichtbare Wand abtasten
    if (taunt?.type === 'box' && !dead) {
      gunVisible = false;
      const tt = taunt.t, k = Math.sin(tt * 5) * 0.12, h = this.shoulderY + 0.05;
      leftTarget = this.local(0.26 + k, h + Math.cos(tt * 5) * 0.12, 0.5);
      rightTarget = this.local(-0.26 - k, h - Math.cos(tt * 5) * 0.12, 0.5);
    }
    this.body.position.y = taunt?.type === 'flail' ? Math.abs(Math.sin(taunt.t * 7)) * 0.45 : taunt?.type === 'dance' ? Math.abs(Math.sin(taunt.t * 4.5)) * 0.1 : 0;
    this.gun.visible = gunVisible && !dead;
    this.gunModel.visible = this.gun.visible;
    // ----- 5) Arme (IK an die Waffe) -----
    if (!fullBody) {
      const poleR = this.local(-0.7, this.shoulderY - 0.9, -0.3), poleL = this.local(0.7, this.shoulderY - 0.9, -0.1);
      twoBoneIK(B.UpperArmR, B.LowerArmR, B.FistR, rightTarget || inGun(this.gripR), poleR);
      twoBoneIK(B.UpperArmL, B.LowerArmL, B.FistL, leftTarget || inGun(this.gripL), poleL);
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.scarfTail && (this.scarfTail.rotation.z = 0.3 + Math.sin(this.t * 8) * 0.25 * Math.min(1, st.speed / 4));
  }
}

// ---------------- Mango ----------------
export function buildMango() {
  const rig = new Rig(charGltf('Casual_Bald'), {
    height: 2.0, bodyR: 0.34,
    colors: { Shirt: '#22b8a7', Skin: '#ffd83a', Pants: '#6a3fb5', Belt: '#8a4a22', Face: '#16121f' },
  });
  const deco = new THREE.Group(); deco.scale.setScalar(rig.k); rig.bones.Head.add(deco);
  const cy = 0.48 * rig.s, R = rig.headR;
  // Riesige Mango-Mähne
  const hairMat = toon('#ff8a1f'), hair2 = toon('#ff6a00');
  const hair = new THREE.Group(); hair.position.set(0, cy + R * 0.5, -R * 0.12); deco.add(hair);
  let k = 0;
  for (let ring = 0; ring < 3; ring++) {
    const n = [7, 10, 13][ring];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3, tilt = [0.3, 0.9, 1.45][ring];
      const len = [0.6, 0.52, 0.4][ring] * (0.85 + (k++ % 3) * 0.12);
      const spike = cone(0.11, len, (i + ring) % 2 ? hairMat : hair2, 0, 0, 0, 7);
      spike.geometry = spike.geometry.clone(); spike.geometry.translate(0, len / 2, 0);
      const d = V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      spike.quaternion.setFromUnitVectors(V(0, 1, 0), d);
      spike.position.copy(d).multiplyScalar(R * 0.4);
      hair.add(spike);
    }
  }
  hair.add(sphere(R * 0.8, hairMat, 0, 0, 0, 14));
  const leaf = sphere(0.1, toon('#3fbf4a'), 0.05, 0.68, 0, 10); leaf.scale.set(0.45, 1.3, 0.2); leaf.rotation.z = -0.5; hair.add(leaf);
  // Clownsnase
  deco.add(sphere(R * 0.2, toon('#ff3b3b'), 0, cy - R * 0.08, R * 0.97, 14));
  // Fliege
  const bow = new THREE.Group(); bow.position.set(0, cy - R * 1.08, R * 0.5);
  bow.add(cone(0.06, 0.1, toon('#ff3b3b'), -0.05, 0, 0, 4).rotateZ(Math.PI / 2)); bow.add(cone(0.06, 0.1, toon('#ff3b3b'), 0.05, 0, 0, 4).rotateZ(-Math.PI / 2));
  deco.add(bow);
  rig.name = 'Mango';
  rig.meshes = []; rig.root.traverse(o => { if (o.isMesh) rig.meshes.push(o); });
  return rig;
}

// ---------------- Copycat ----------------
export function buildCopycat() {
  const rig = new Rig(charGltf('OldClassy_Male'), {
    height: 2.25, bodyR: 0.34, gunTint: '#ffc0e0',
    colors: { Shirt: 'stripes', Skin: '#fbfbff', Pants: '#1d1b24', Belt: '#1d1b24', Detail: '#1d1b24', Face: '#16121f', Hair: '#16121f', Hat: null },
  });
  const deco = new THREE.Group(); deco.scale.setScalar(rig.k); rig.bones.Head.add(deco);
  const cy = 0.48 * rig.s, R = rig.headR;
  // Schiefe Baskenmütze
  const beret = new THREE.Group(); beret.position.set(0.08, cy + R * 1.02, -0.04); beret.rotation.z = 0.42;
  const b1 = sphere(R * 0.72, toon('#e8223a'), 0, 0, 0, 16); b1.scale.set(1, 0.3, 1); beret.add(b1);
  beret.add(cyl(0.012, 0.012, 0.07, '#e8223a', 0, R * 0.25, 0, 6));
  deco.add(beret);
  // Rote Lippen + Wangen
  deco.add(sphere(R * 0.11, toon('#e8223a'), 0, cy - R * 0.62, R * 0.9, 10));
  deco.add(sphere(R * 0.12, toon('#ff8fb0'), -R * 0.62, cy - R * 0.28, R * 0.72, 8));
  deco.add(sphere(R * 0.12, toon('#ff8fb0'), R * 0.62, cy - R * 0.28, R * 0.72, 8));
  // Roter Schal
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, R * 0.15, 8, 18), toon('#e8223a'));
  scarf.rotation.x = Math.PI / 2; scarf.position.set(0, cy - R * 1.12, 0.02); scarf.scale.set(1.25, 1.1, 1); deco.add(scarf);
  const tail = box(0.08, 0.26, 0.03, '#e8223a', 0.08, cy - R * 1.4, R * 0.5); deco.add(tail);
  rig.scarfTail = tail;
  rig.name = 'Copycat';
  rig.meshes = []; rig.root.traverse(o => { if (o.isMesh) rig.meshes.push(o); });
  return rig;
}
