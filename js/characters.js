// Figuren: Profi-Modelle (Quaternius, CC0) + Profi-Bewegungen (Universal Animation Library, CC0) + eigene Schicht.
// Laufen/Joggen/Sprinten/Ducken/Springen/Rutschen/Umfallen/Tanzen kommen aus echten Animationen (auf das Skelett
// umgerechnet, Füße bleiben beim Laufen am Boden). Seitwärts/rückwärts: Schrittrichtung wird gedreht, Oberkörper
// bleibt zum Ziel. Zielen, Nachladen und Spritze werden am Skelett berechnet (Hände greifen per "IK" an die Waffe).
import * as THREE from 'three';
import { toon, glow, box, rbox, sphere, cyl, cone, LAYER_FX } from './toon.js';
import { charGltf, cloneSkinned, prop } from './assets.js';
import { aimBone, retarget, Blend, sample, QB, LAYOUT, STRIDE } from './anim.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const smooth = t => t * t * (3 - 2 * t);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
// Weiche Bahn durch Schlüsselpunkte [[zeit, punkt], ...] (Catmull-Rom) – die Hand fließt ohne Stopps durch alle Punkte
function pathAt(keys, t) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, p1] = keys[i], [t1, p2] = keys[i + 1];
  const p0 = keys[Math.max(0, i - 1)][1], p3 = keys[Math.min(keys.length - 1, i + 2)][1];
  const u = Math.min(1, Math.max(0, (t - t0) / Math.max(1e-4, t1 - t0))), u2 = u * u, u3 = u2 * u;
  return new THREE.Vector3(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3));
}
const bump = (t, a, b) => { const x = seg(t, a, b); return Math.sin(x * Math.PI); };

// ---------- IK-Helfer ----------
const _A = V(), _B = V(), _C = V(), _T = V(), _P = V(), _E = V(), _dir = V();
const _q1 = Q(), _q2 = Q(), _q3 = Q(), _qI = Q(), _yAxis = V(0, 1, 0);
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

function starMesh(r) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * 0.45 : r; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: r * 0.4, bevelEnabled: false }); g.center();
  return new THREE.Mesh(g, glow('#ffe14a', 1.6));
}

// Große Comic-Augen mit Pupillen, Lidern (Blinzeln) und Augenbrauen + Mund. Liegt am Kopf-Knochen.
function buildFace(rig, deco, cy, R, o) {
  const eyes = [], white = toon('#ffffff', { rough: 0.25, rim: 0.1 }), pupilM = toon('#16121f', { rough: 0.2 });
  const lidM = toon(o.lid, { unique: true });
  for (const side of [-1, 1]) {
    const big = o.odd && side < 0 ? 1.18 : 1;
    const g = new THREE.Group(); g.position.set(side * R * o.eyeX, cy + R * o.eyeY, R * 1.0); deco.add(g);
    const ball = sphere(R * o.eyeR * big, white, 0, 0, 0, 18); ball.scale.set(1, 1.15, 0.5); g.add(ball);
    const pupil = sphere(R * o.eyeR * 0.45 * big, pupilM, 0, 0, R * o.eyeR * 0.42, 12); pupil.scale.z = 0.4; g.add(pupil);
    const shine = sphere(R * o.eyeR * 0.12, glow('#ffffff', 1.2), R * o.eyeR * 0.15, R * o.eyeR * 0.2, R * o.eyeR * 0.78, 6); pupil.add(shine); shine.position.set(R * 0.03, R * 0.04, R * 0.02);
    const lid = sphere(R * o.eyeR * big * 1.07, lidM, 0, 0, 0, 16); lid.scale.set(1, 1.15, 0.56); g.add(lid);
    lid.geometry = lid.geometry.clone(); // obere Hälfte als Lid
    const lp = lid.geometry.attributes.position; for (let i = 0; i < lp.count; i++) if (lp.getY(i) < 0) lp.setY(i, 0); lp.needsUpdate = true; lid.geometry.computeVertexNormals();
    const brow = box(R * 0.42 * big, R * 0.09, R * 0.08, toon(o.brow), 0, R * o.eyeR * 1.35 * big, R * 0.05); g.add(brow);
    if (o.tear && side > 0) g.add(box(R * 0.04, R * 0.22, R * 0.03, toon('#16121f'), 0, -R * o.eyeR * 1.5, R * 0.05));
    eyes.push({ g, pupil, lid, brow, side, big });
  }
  const mouth = new THREE.Group(); mouth.position.set(0, cy - R * o.mouthY, R * 1.02); deco.add(mouth);
  const mouthIn = sphere(R * 0.2, toon('#5a1522'), 0, 0, 0, 14); mouthIn.scale.set(1.4, 0.5, 0.35); mouth.add(mouthIn);
  if (o.teeth) mouth.add(box(R * 0.36, R * 0.09, R * 0.05, '#ffffff', 0, R * 0.06, R * 0.06));
  if (o.lips) { const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.05, 6, 16), toon(o.lips)); lip.scale.set(1.35, 0.55, 1); mouth.add(lip); }
  rig.face = (st, dt, fl) => {
    // Blinzeln
    rig.blinkT -= dt;
    if (rig.blinkT < 0) { rig.blink = 1; rig.blinkT = 2 + Math.random() * 3.5; }
    rig.blink = Math.max(0, rig.blink - dt * 7);
    const dead = st.dead > 0;
    const closed = dead ? 0.85 : Math.sin(Math.min(1, rig.blink) * Math.PI);
    const angry = rig.recoil > 0.2 || st.reload >= 0 ? 1 : 0, hurt = rig.hitReact;
    for (const e of eyes) {
      e.lid.scale.y = 1.15 * (0.12 + closed * 1.0); e.lid.rotation.x = -0.9 + closed * 0.9;
      e.lid.visible = true;
      e.pupil.position.x = (st.side || 0) * -R * 0.03; e.pupil.position.y = Math.max(-1, Math.min(1, st.pitch || 0)) * R * 0.07;
      e.pupil.scale.setScalar(dead ? 0.6 : 1 + hurt * 0.25);
      const tilt = (angry * 0.35 - hurt * 0.45 + (o.odd && e.side < 0 ? -0.25 : 0)) * e.side;
      e.brow.rotation.z = tilt; e.brow.position.y = R * o.eyeR * 1.35 * e.big + hurt * R * 0.08 - angry * R * 0.03;
    }
    const open = Math.max(hurt, dead ? 0.6 : 0, taunting(st) ? 0.5 + Math.sin(rig.t * 12) * 0.3 : 0);
    mouthIn.scale.set(1.4 - open * 0.5, 0.5 + open * 1.1, 0.35);
  };
}
const taunting = st => !!st.taunt;

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
    this.flashMats = [];
    const conv = m => {
      const c = spec.colors[m.name];
      if (c === null) { const h = m.clone(); h.visible = false; return h; }
      const mm = c === 'stripes' ? stripeMaterial(geoH || 1) : toon(c || '#cccccc', { unique: true, rim: 0.32, rough: m.name === 'Skin' ? 0.5 : 0.7 });
      this.flashMats.push(mm);
      return mm;
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
    this.victory = this.mixer.clipAction(clip('Victory')); this.victory.play();
    this.mot = retarget(gltf, cloneSkinned); this.blend = new Blend();
    this.lw = { idle: 1 }; this.phase = 0; this.deadT = 0; this.landT = 9; this.landW = 0; this.hitT = 9; this.moveDir = 1;
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
    this.jiggle = []; this.squash = 0; this.blinkT = 2 + Math.random() * 3; this.blink = 0;
    this.prevHead = null; this.headVel = V();
    // K.-o.-Sterne über dem Kopf
    this.stars = new THREE.Group(); this.stars.visible = false; this.root.add(this.stars);
    for (let i = 0; i < 5; i++) { const st = starMesh(0.09); st.userData.a = i / 5 * Math.PI * 2; this.stars.add(st); }
    this.meshes = []; this.root.traverse(o => { if (o.isMesh) this.meshes.push(o); });
  }

  // Nach dem Landen kurz zusammenstauchen
  land(strength) { this.squash = Math.min(1, Math.max(this.squash, strength)); if (strength > 0.25) { this.landT = 0; this.landW = Math.min(1, strength * 1.2); } }

  hitboxes(pos) {
    this.root.updateMatrixWorld(true);
    const hp = this.head.getWorldPosition(V());
    return {
      head: { x: hp.x, y: hp.y, z: hp.z, r: this.headR },
      body: { x: pos.x, z: pos.z, r: this.spec.bodyR, y0: pos.y, y1: hp.y - this.headR * 0.85 },
    };
  }
  eyeHeight(crouchAmt) { return this.standEye * (1 - 0.34 * crouchAmt); }
  flash() { this.hitFlash = 0.12; this.hitReact = 1; this.hitT = 0; }
  local(x, y, z) { return V(x, y, z).applyMatrix4(this.root.matrixWorld); }

  // st: {speed, fwd, side, grounded, crouch, slide, pitch, reload, syringe, taunt, dead, sprint}
  animate(st, dt) {
    dt = Math.max(0, dt || 0);
    this.t += dt;
    const B = this.bones, s = this.s, K = this.k, H = this.spec.height;
    const dead = st.dead > 0, taunt = st.taunt;
    const fullBody = dead || (taunt && (taunt.type === 'dance' || taunt.type === 'flail'));
    // ----- 1) Grundbewegung aus den Profi-Animationen -----
    for (const [b, p, q] of this.rest) { b.position.copy(p); b.quaternion.copy(q); }
    const M = this.mot, sp = st.speed || 0;
    const moving = sp > 0.35 && st.grounded && !st.slide;
    // Laufrichtung relativ zum Blick: vorwärts / seitwärts / rückwärts
    let theta = 0, mdir = 1;
    if (moving) {
      const ang = Math.atan2(-st.side, st.fwd); // + = nach links
      if (Math.abs(ang) <= 1.75) theta = ang; else { mdir = -1; theta = ang - Math.sign(ang) * Math.PI; }
    }
    this.moveDir = mdir;
    let dy = theta - this.legYaw; if (Math.abs(dy) > 1.6) this.legYaw = theta; else this.legYaw += dy * Math.min(1, dt * 14);
    // Zielgewichte
    const c = Math.min(1, st.crouch || 0), air = !st.grounded && !st.slide && !dead;
    const tw = {};
    if (dead) tw.death = 1;
    else if (taunt?.type === 'dance') tw.dance = 1;
    else if (st.slide) tw.slide = 1;
    else if (air) tw.air = 1;
    else if (moving) {
      const sprintK = st.sprint ? Math.min(1, Math.max(0, (sp - 5.8) / 1.6)) : 0;
      const walkK = Math.min(1, Math.max(0, 1 - (sp - 1.6) / 2.2));
      tw.walk = walkK * (1 - c); tw.jog = (1 - walkK) * (1 - sprintK) * (1 - c); tw.sprint = (1 - walkK) * sprintK * (1 - c); tw.crouchWalk = c;
    } else { tw.idle = 1 - c; tw.crouchIdle = c; }
    const rate = dead ? 14 : air ? 9 : st.slide ? 16 : 11, kk = Math.min(1, dt * rate);
    for (const n of new Set([...Object.keys(this.lw), ...Object.keys(tw)])) { this.lw[n] = (this.lw[n] || 0) + ((tw[n] || 0) - (this.lw[n] || 0)) * kk; if (this.lw[n] < 1e-3 && !tw[n]) delete this.lw[n]; }
    // Schritt-Takt: Füße gleiten genau so schnell nach hinten, wie die Figur läuft (kein Rutschen)
    const GAIT = ['walk', 'jog', 'sprint', 'crouchWalk'];
    let gw = 0, dist = 0;
    for (const n of GAIT) if (this.lw[n]) { gw += this.lw[n]; dist += this.lw[n] * Math.max(0.3, M[n].speed * this.s) * M[n].dur; }
    if (gw > 0 && moving) this.phase = (this.phase + mdir * dt * sp / (dist / gw) + 10) % 1;
    this.deadT = dead ? this.deadT + dt : 0;
    this.landT += dt; this.hitT += dt;
    const Bl = this.blend; Bl.clear();
    for (const [n, w] of Object.entries(this.lw)) {
      const clip = M[n];
      let t;
      if (GAIT.includes(n)) t = ((this.phase + clip.phase0) % 1) * clip.dur;
      else if (n === 'death') t = this.deadT;
      else if (n === 'air') t = 0.25 + (this.t % 1.0) * 0.5;
      else t = this.t;
      Bl.add(clip, t, w);
    }
    // Landen: kurz in die Knie
    const lk = this.landT < 0.42 && !air && !dead ? this.landW * Math.sin(Math.PI * this.landT / 0.42) * (moving ? 0.45 : 0.9) : 0;
    if (lk > 0.01) Bl.add(M.land, 0.12 + this.landT * 0.6, lk * Bl.w / Math.max(0.05, 1 - lk));
    const R = Bl.result();
    // Anwenden
    QB.forEach((n, i) => B[n].quaternion.fromArray(R, i * 4));
    const rest = M._rest;
    const cs = Math.cos(this.legYaw), sn = Math.sin(this.legYaw);
    const rot = (x, z, rx, rz, k = 1) => { const dx = x - rx, dz = z - rz; return [rx + (dx * cs + dz * sn) * k, rz + (-dx * sn + dz * cs) * k]; };
    {
      const [bx, bz] = rot(R[LAYOUT.O_BODY], R[LAYOUT.O_BODY + 2], rest.body.x, rest.body.z);
      B.Body.position.set(bx, R[LAYOUT.O_BODY + 1], bz);
    }
    const yawQ = _q1.setFromAxisAngle(_yAxis, this.legYaw * 0.7);
    ['L', 'R'].forEach((side, i) => {
      const o = LAYOUT.O_FOOT + i * 7, rf = side === 'L' ? rest.footL : rest.footR;
      const lat = 1 - 0.25 * Math.abs(sn); // seitlich etwas kürzere Schritte
      let [fx, fz] = rot(R[o], R[o + 2], rf.x, rf.z, lat);
      // Beim Seitwärtslaufen nicht über Kreuz treten
      if (side === 'L') fx = Math.max(fx, rf.x * 0.45); else fx = Math.min(fx, rf.x * 0.45);
      B['Foot' + side].position.set(fx, R[o + 1], fz);
      B['Foot' + side].quaternion.fromArray(R, o + 3).premultiply(yawQ);
      const po = LAYOUT.O_POLE + i * 3;
      const [px, pz] = rot(R[po], R[po + 2], rf.x, rf.z);
      B['PoleTarget' + side].position.set(px * 0.5 + R[po] * 0.5, R[po + 1], pz * 0.5 + R[po + 2] * 0.5);
    });
    // Treffer: kurzer Ruck im Oberkörper (aus der Treffer-Animation, draufaddiert)
    if (this.hitT < M.hit.dur && !dead) {
      const hk = 1 - this.hitT / M.hit.dur;
      const h0 = this._h0 || (this._h0 = new Float32Array(M.hit.data.subarray(0, 20)));
      const cur = sample(M.hit, this.hitT, this._ht || (this._ht = new Float32Array(STRIDE)));
      for (let i = 0; i < 5; i++) {
        _q2.fromArray(h0, i * 4).invert().premultiply(_q3.fromArray(cur, i * 4)); // h_t * inv(h0) (lokal genug für den kleinen Ruck)
        _q2.slerp(_qI, 1 - hk * 1.4 > 0 ? 1 - hk * 1.4 : 0);
        B[QB[i]].quaternion.multiply(_q2);
      }
    }
    if (taunt?.type === 'flail') {
      // alte Jubel-Animation der Figur (Arme wedeln)
      for (const [b, p, q] of this.rest) { b.position.copy(p); b.quaternion.copy(q); }
      this.victory.timeScale = 1.8; this.mixer.update(dt);
    }

    // ----- 2) Körperhaltung (Blick, Lehnen, Hüfte dreht mit den Beinen) -----
    const crouch = st.slide ? 1 : c;
    if (taunt?.type === 'crouchspam') B.Body.position.y -= ((Math.sin(taunt.t * 14) + 1) / 2) * 0.33 * H * K;
    // Beschleunigung spüren: nach vorn/zur Seite lehnen
    const vf = (st.fwd || 0) * sp, vs = (st.side || 0) * sp;
    const af = this._pvf === undefined ? 0 : (vf - this._pvf) / Math.max(dt, 1e-3), as = this._pvs === undefined ? 0 : (vs - this._pvs) / Math.max(dt, 1e-3);
    this._pvf = vf; this._pvs = vs;
    this.accLean = this.accLean || { f: 0, s: 0 };
    this.accLean.f += (Math.max(-1, Math.min(1, af / 40)) - this.accLean.f) * Math.min(1, dt * 8);
    this.accLean.s += (Math.max(-1, Math.min(1, as / 40)) - this.accLean.s) * Math.min(1, dt * 8);
    if (!fullBody) {
      B.Body.rotateY(this.legYaw * 0.4);
      B.Abdomen.rotateY(-this.legYaw * 0.25);
      B.Torso.rotateY(-this.legYaw * 0.15);
      // Laufzyklen beugen den Oberkörper stark vor – im Kampf etwas aufrechter, rückwärts leicht zurück
      let gaitW = 0; for (const n of GAIT) gaitW += this.lw[n] || 0;
      const lean = st.slide ? -0.2 : (st.sprint ? 0.1 : -0.16) * Math.min(1, gaitW) - (mdir < 0 ? 0.12 : 0) * gaitW + this.accLean.f * 0.18;
      B.Abdomen.rotateX(lean - this.hitReact * 0.25);
      B.Abdomen.rotateZ(this.accLean.s * 0.14);
      B.Torso.rotateX(-st.pitch * 0.3);
      B.Neck.rotateX(-st.pitch * 0.4 + (st.slide ? 0.3 : 0));
    }
    this.hitReact = Math.min(1, Math.max(0, this.hitReact - dt * 6));
    this.model.updateMatrixWorld(true);
    // ----- 3) Beine (IK zu den Füßen) -----
    for (const side of ['L', 'R']) {
      const tgt = B['Foot' + side].getWorldPosition(V());
      const pole = B['PoleTarget' + side].getWorldPosition(V());
      twoBoneIK(B['UpperLeg' + side], B['LowerLeg' + side], B['LowerLeg' + side + '_end'] || B['LowerLeg' + side], tgt, pole);
    }

    // ----- 4) Waffe -----
    this.recoil = Math.max(0, this.recoil - dt * 10);
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const shoulder = B.UpperArmR.getWorldPosition(V()).applyMatrix4(inv);
    this.gunPivot.position.set(0, shoulder.y + 0.02, 0.02);
    this.gunPivot.rotation.set(fullBody ? 0 : -st.pitch, 0, 0);
    this.gun.position.set(-0.1, -0.1, 0.34 - this.recoil * 0.06); this.gun.rotation.y = 0;
    this.gun.rotation.set(-this.recoil * 0.08, 0, 0);
    const bob = st.speed > 0.4 && st.grounded ? Math.sin(this.t * (6 + st.speed)) * 0.012 * Math.min(1, st.speed / 5) : Math.sin(this.t * 1.8) * 0.004;
    this.gun.position.y += bob; this.gun.rotation.z = st.speed > 0.4 ? Math.sin(this.t * (3 + st.speed * 0.5)) * 0.04 : 0;
    if (st.sprint) { this.gun.rotation.x += 0.35; this.gun.rotation.y = 0.4; this.gun.position.y -= 0.08; }
    let leftTarget = null, rightTarget = null, gunVisible = !fullBody;
    this.spareMag.visible = false; this.syringe.visible = false;
    if (this.mag) this.mag.visible = true;
    this.gun.updateMatrixWorld(true);
    const inGun = p => p.clone().applyMatrix4(this.gun.matrixWorld);
    // Nachladen: Waffe kippen, Magazin raus (fällt), neues vom Gürtel, reinklatschen, Spannhebel ziehen – alles in einem Fluss
    if (st.reload >= 0 && !dead) {
      const t = st.reload;
      const tilt = smooth(seg(t, 0, 0.14)) * (1 - smooth(seg(t, 0.84, 1)));
      const slap = bump(t, 0.62, 0.7), pull = bump(t, 0.77, 0.86);
      this.gun.rotation.z = tilt * 0.7 - slap * 0.12; this.gun.rotation.x -= tilt * 0.32 - pull * 0.08;
      this.gun.position.y -= tilt * 0.06 - slap * 0.035; this.gun.position.x += tilt * 0.05; this.gun.position.z -= pull * 0.03;
      this.gun.updateMatrixWorld(true);
      const magOut = t > 0.2 && t < 0.63;
      if (this.mag) this.mag.visible = !magOut;
      if (t > 0.2 && !this._magDropped) { this._magDropped = true; this.onMagDrop?.(this.mag || this.gun); }
      const pMag = inGun(this.magPoint), pGrip = inGun(this.gripL), pCharge = inGun(this.chargePoint);
      const pBelt = this.local(0.26 * H / 2, 0.95 * s, 0.12);
      const below = pMag.clone().add(V(0, -0.16, 0.02)), up = pMag.clone().add(V(0, -0.06, 0));
      const back = pCharge.clone().add(V(0, 0, -0.12).applyQuaternion(this.gun.getWorldQuaternion(Q())));
      const p = pathAt([[0, pGrip], [0.13, pMag], [0.22, below], [0.4, pBelt], [0.52, below], [0.6, up], [0.66, pMag], [0.76, pCharge], [0.82, back], [0.88, pCharge], [1, pGrip]], t);
      leftTarget = p;
      if (t > 0.34 && t < 0.64) {
        this.spareMag.visible = true;
        this.spareMag.position.copy(p.clone().applyMatrix4(inv)).add(V(0, 0.02, 0));
        this.spareMag.rotation.set(0, 0, tilt * 0.65);
      }
      // Kopf schaut zur Waffe/zum Gürtel, Oberkörper dreht leicht mit
      const look = smooth(seg(t, 0.05, 0.2)) * (1 - smooth(seg(t, 0.85, 1)));
      const belt = bump(t, 0.28, 0.58);
      B.Neck.rotateX(look * 0.35 + belt * 0.25); B.Neck.rotateY(look * 0.18 + belt * 0.2);
      B.Torso.rotateY(belt * 0.18); B.Abdomen.rotateZ(-belt * 0.06);
    } else this._magDropped = false;
    // Spritze: Waffe nur noch rechts, links Spritze vom Gürtel, ausholen, ins Bein rammen
    if (st.syringe >= 0 && !dead) {
      const t = st.syringe;
      const away = smooth(seg(t, 0, 0.12)) * (1 - smooth(seg(t, 0.88, 1)));
      this.gun.rotation.z = -0.55 * away; this.gun.position.y -= 0.1 * away; this.gun.position.x -= 0.04 * away;
      this.gun.updateMatrixWorld(true);
      const pBelt = this.local(0.26 * H / 2, 0.92 * s, 0.12);
      const pUp = this.local(0.3 * H / 2, 2.05 * s, 0.4);
      const pThigh = this.local(0.2 * H / 2, 0.72 * s - (st.crouch ? 0.2 : 0), 0.24);
      const pGrip = inGun(this.gripL);
      let p;
      if (t < 0.45) p = pathAt([[0, pGrip], [0.2, pBelt], [0.45, pUp]], t);
      else if (t < 0.52) p = pUp.lerp(pThigh, seg(t, 0.45, 0.52) ** 2); // Zustechen: schnell
      else if (t < 0.78) p = pThigh.add(V(0, Math.sin(this.t * 55) * 0.012 * (1 - seg(t, 0.52, 0.78)), 0));
      else p = pathAt([[0.78, pThigh], [0.9, pBelt], [1, pGrip]], t);
      leftTarget = p;
      this.syringe.visible = t > 0.1 && t < 0.92;
      this.syringe.position.copy(p.clone().applyMatrix4(inv));
      this.syringe.rotation.set(t < 0.45 ? 0.4 : Math.PI - 0.35, 0, 0);
      this.juice.scale.y = t > 0.55 ? Math.max(0.05, 1 - seg(t, 0.55, 0.78)) : 1;
      // Ausholen: Oberkörper zieht mit, beim Stich nach vorn beugen und hinschauen
      const wind = bump(t, 0.25, 0.5), stab = smooth(seg(t, 0.46, 0.55)) * (1 - smooth(seg(t, 0.75, 0.95)));
      B.Abdomen.rotateX(stab * 0.28 - wind * 0.08); B.Torso.rotateY(wind * 0.25 - stab * 0.1); B.Neck.rotateX(stab * 0.45);
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
    // Treffer-Aufblitzen
    const fl = Math.max(0, this.hitFlash) / 0.12;
    for (const m of this.flashMats) { m.emissive?.setRGB(fl * 0.9, fl * 0.85, fl * 0.8); }
    // Stauchen (Landen / Treffer)
    this.squash = Math.max(0, this.squash - dt * 5);
    const sq = this.squash * 0.14 + fl * 0.06;
    this.body.scale.set(1 + sq, 1 - sq, 1 + sq);
    // Kopfbewegung messen -> Haare/Schal schwingen nach
    const hp = this.head.getWorldPosition(V());
    if (this.prevHead && dt > 0) { const v = hp.clone().sub(this.prevHead).divideScalar(dt); this.headVel.lerp(v, Math.min(1, dt * 8)); }
    this.prevHead = hp;
    const inv2 = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const lv = this.headVel.clone().transformDirection(inv2).multiplyScalar(this.headVel.length());
    for (const j of this.jiggle) {
      const tx = Math.max(-0.6, Math.min(0.6, lv.z * j.k + (j.base?.x || 0))), tz = Math.max(-0.6, Math.min(0.6, -lv.x * j.k + (j.base?.z || 0)));
      j.vx = (j.vx || 0) + ((tx - j.obj.rotation.x) * j.stiff - (j.vx || 0) * j.damp) * dt;
      j.vz = (j.vz || 0) + ((tz - j.obj.rotation.z) * j.stiff - (j.vz || 0) * j.damp) * dt;
      j.obj.rotation.x += j.vx * dt; j.obj.rotation.z += j.vz * dt;
    }
    // Gesicht
    this.face?.(st, dt, fl);
    // K.-o.-Sterne
    this.stars.visible = dead && st.dead > 0.6;
    if (this.stars.visible) {
      const h = this.head.getWorldPosition(V()).applyMatrix4(inv2);
      this.stars.position.set(h.x, h.y + this.headR * 1.1, h.z);
      for (const c of this.stars.children) { const a = c.userData.a + this.t * 3; c.position.set(Math.cos(a) * this.headR * 1.2, Math.sin(this.t * 6 + c.userData.a) * 0.05, Math.sin(a) * this.headR * 1.2); c.rotation.y = this.t * 4; }
    }
  }
}

// Geschwungene, sich verjüngende Haarsträhne mit Farbverlauf (Ansatz -> Spitze)
function hairLock(points, r0, r1, colA, colB, flatten = 0.62, seg = 22, radial = 9) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], col = [], idx = [];
  const cA = new THREE.Color(colA), cB = new THREE.Color(colB), c = new THREE.Color();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, p = curve.getPointAt(t), r = (r0 + (r1 - r0) * Math.pow(t, 1.6)) * (i === seg ? 0.2 : 1) * (i === 0 ? 0.85 : 1);
    const N = frames.normals[i], Bn = frames.binormals[i];
    c.copy(cA).lerp(cB, Math.pow(t, 0.9));
    for (let j = 0; j < radial; j++) {
      const a = j / radial * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * flatten;
      pos.push(p.x + N.x * x + Bn.x * y, p.y + N.y * x + Bn.y * y, p.z + N.z * x + Bn.z * y);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, cc = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const hairMat = () => toon('#ffffff', { vertexColors: true, rough: 0.45, rim: 0.4 });

// ---------------- Mango ----------------
export function buildMango() {
  const rig = new Rig(charGltf('Casual_Bald'), {
    height: 2.0, bodyR: 0.34,
    colors: { Shirt: '#1fb5a3', Skin: '#ffd23a', Pants: '#6a3fb5', Belt: '#7a3f1a', Face: '#ffd23a' },
  });
  const deco = new THREE.Group(); deco.scale.setScalar(rig.k); rig.bones.Head.add(deco);
  const cy = 0.48 * rig.s, R = rig.headR;
  // --- Clowns-Frisur: große flauschige Büschel an den Seiten + hinten, Kringel-Locke oben ---
  const HW = 0.62 * rig.s, HH = 0.48 * rig.s, HD = 0.5 * rig.s; // halbe Kopfmaße (eckiger Kopf)
  const oranges = ['#ff7a18', '#ff8c26', '#ff6a12', '#ff9a34'].map(c => toon(c, { rough: 0.78, rim: 0.45 }));
  const puff = (cx, cyy, cz, rad, n, seed) => {
    const g = new THREE.Group(); g.position.set(cx, cyy, cz); deco.add(g);
    let r = seed;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * 1.2, d = rad * (0.35 + rnd() * 0.45);
      const sp = sphere(rad * (0.45 + rnd() * 0.3), oranges[i % 4], Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d, 16);
      g.add(sp);
    }
    rig.jiggle.push({ obj: g, k: 0.05, stiff: 85 + rnd() * 30, damp: 8 });
    return g;
  };
  for (const sx of [-1, 1]) {
    puff(sx * HW * 1.12, cy + HH * 0.25, -HD * 0.1, R * 0.62, 11, sx > 0 ? 7 : 13);
    puff(sx * HW * 0.95, cy - HH * 0.15, -HD * 0.35, R * 0.45, 7, sx > 0 ? 21 : 29);
  }
  puff(0, cy + HH * 0.35, -HD * 1.05, R * 0.66, 12, 41);
  // Kringel-Locke oben
  const curlG = new THREE.Group(); curlG.position.set(0, cy + HH * 0.95, HD * 0.1); deco.add(curlG);
  const curlPts = []; for (let i = 0; i <= 16; i++) { const t = i / 16, a = t * Math.PI * 3.2; curlPts.push(V(Math.sin(a) * R * 0.28 * (1 - t * 0.6), t * R * 0.9, Math.cos(a) * R * 0.28 * (1 - t * 0.6) - R * 0.1)); }
  curlG.add(new THREE.Mesh(hairLock(curlPts, R * 0.2, R * 0.08, '#ff6a12', '#ffa63a', 1), hairMat()));
  rig.jiggle.push({ obj: curlG, k: 0.09, stiff: 60, damp: 5 });
  // Mango-Blatt ganz oben
  const leafG = new THREE.Group(); leafG.position.set(0, R * 0.9, 0); curlG.add(leafG);
  const leaf = new THREE.Mesh(hairLock([V(0, 0, 0), V(R * 0.2, R * 0.25, 0), V(R * 0.55, R * 0.35, 0), V(R * 0.85, R * 0.2, 0)], R * 0.2, R * 0.01, '#2e9e3a', '#6ee06a', 0.25), hairMat());
  leafG.add(leaf); leafG.add(cyl(R * 0.03, R * 0.04, R * 0.25, '#6b4a2a', 0, -R * 0.1, 0, 6));
  rig.jiggle.push({ obj: leafG, k: 0.08, stiff: 70, damp: 6 });
  // Gesicht
  buildFace(rig, deco, cy, R, { eyeX: 0.36, eyeY: 0.14, eyeR: 0.27, lid: '#ffd23a', brow: '#a8420a', mouthY: 0.56, teeth: true });
  deco.add(sphere(R * 0.2, toon('#ff2d3b', { rough: 0.18, rim: 0.2 }), 0, cy - R * 0.14, HD * 1.05, 18)); // Clownsnase
  // Fliege
  const bow = new THREE.Group(); bow.position.set(0, cy - R * 1.1, R * 0.5);
  const bowM = toon('#ff2d3b', { rough: 0.35 });
  for (const sx of [-1, 1]) { const w = sphere(0.06, bowM, sx * 0.06, 0, 0, 10); w.scale.set(1.3, 0.8, 0.5); bow.add(w); }
  bow.add(sphere(0.028, bowM, 0, 0, 0.01, 8));
  deco.add(bow);
  rig.name = 'Mango';
  rig.meshes = []; rig.root.traverse(o => { if (o.isMesh) rig.meshes.push(o); });
  return rig;
}

// ---------------- Copycat ----------------
export function buildCopycat() {
  const rig = new Rig(charGltf('OldClassy_Male'), {
    height: 2.25, bodyR: 0.34, gunTint: '#ffc0e0',
    colors: { Shirt: 'stripes', Skin: '#fbfbff', Pants: '#1d1b24', Belt: '#1d1b24', Detail: '#1d1b24', Face: '#fbfbff', Hair: '#16121f', Hat: null },
  });
  const deco = new THREE.Group(); deco.scale.setScalar(rig.k); rig.bones.Head.add(deco);
  const cy = 0.48 * rig.s, R = rig.headR;
  // Schiefe Baskenmütze
  const beret = new THREE.Group(); beret.position.set(0.08, cy + R * 1.02, -0.04); beret.rotation.z = 0.42;
  const b1 = sphere(R * 0.72, toon('#e8223a'), 0, 0, 0, 16); b1.scale.set(1, 0.3, 1); beret.add(b1);
  beret.add(cyl(0.012, 0.012, 0.07, '#e8223a', 0, R * 0.25, 0, 6));
  deco.add(beret);
  rig.jiggle.push({ obj: beret, k: 0.04, stiff: 80, damp: 7, base: { z: 0.42 } });
  // Pantomimen-Gesicht: schiefe große Augen mit Träne, rote Lippen, Wangen
  buildFace(rig, deco, cy, R, { eyeX: 0.36, eyeY: 0.16, eyeR: 0.25, odd: true, lid: '#fbfbff', brow: '#16121f', tear: true, mouthY: 0.66, lips: '#e8223a' });
  for (const sx of [-1, 1]) { const ch = sphere(R * 0.13, toon('#ff8fb0'), sx * R * 0.62, cy - R * 0.3, R * 0.72, 10); ch.scale.z = 0.4; deco.add(ch); }
  // Roter Schal
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, R * 0.15, 8, 18), toon('#e8223a'));
  scarf.rotation.x = Math.PI / 2; scarf.position.set(0, cy - R * 1.12, 0.02); scarf.scale.set(1.25, 1.1, 1); deco.add(scarf);
  const tailG = new THREE.Group(); tailG.position.set(0.08, cy - R * 1.15, R * 0.5); deco.add(tailG);
  const tail = box(0.08, 0.28, 0.03, '#e8223a', 0, -0.14, 0); tailG.add(tail);
  rig.jiggle.push({ obj: tailG, k: 0.12, stiff: 40, damp: 4, base: { z: 0.25 } });
  rig.name = 'Copycat';
  rig.meshes = []; rig.root.traverse(o => { if (o.isMesh) rig.meshes.push(o); });
  return rig;
}
