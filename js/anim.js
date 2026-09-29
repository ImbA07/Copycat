// Profi-Bewegungen ("Universal Animation Library" von Quaternius, CC0) auf die Figuren übertragen.
// Die Daten (assets/anims.json) enthalten pro Bild die Knochen-Positionen/-Drehungen des Quaternius-Skeletts.
// Beim Laden werden sie einmal pro Figur auf deren Skelett umgerechnet ("Retargeting"):
//  - Becken, Wirbelsäule, Kopf, Füße: Drehung relativ zur Grundhaltung
//  - Arme: Richtung der Knochen
//  - Füße/Knie: Positionen (für die Bein-IK), passend zur Beinlänge skaliert
import * as THREE from 'three';

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _q1 = Q(), _q2 = Q(), _q3 = Q();

// Knochen so drehen, dass die Richtung zum Kind-Punkt auf targetWorld zeigt
export function aimBone(bone, childWorld, targetWorld) {
  bone.getWorldPosition(_a);
  _b.copy(childWorld).sub(_a);
  _c.copy(targetWorld).sub(_a);
  if (_b.lengthSq() < 1e-12 || _c.lengthSq() < 1e-12) return;
  _b.normalize(); _c.normalize();
  _q1.setFromUnitVectors(_b, _c);
  bone.getWorldQuaternion(_q2);
  _q1.multiply(_q2);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q1));
  bone.updateMatrixWorld(true);
}

// ---------- Rohdaten ----------
let LIB = null;
export async function loadMotions(url) {
  const j = await (await fetch(url)).json();
  const nP = j.pos.length, nR = j.rot.length, stride = nP * 3 + nR * 4;
  const clips = {};
  for (const [k, c] of Object.entries(j.clips)) {
    const bin = atob(c.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const raw = new Int16Array(bytes.buffer);
    const frames = [];
    for (let f = 0; f < c.frames; f++) {
      const o = f * stride, P = {}, R = {};
      j.pos.forEach((b, i) => { P[b] = new THREE.Vector3(raw[o + i * 3], raw[o + i * 3 + 1], raw[o + i * 3 + 2]).multiplyScalar(0.001); });
      j.rot.forEach((b, i) => { const p = o + nP * 3 + i * 4; R[b] = new THREE.Quaternion(raw[p], raw[p + 1], raw[p + 2], raw[p + 3]).normalize(); });
      frames.push({ P, R });
    }
    clips[k] = { frames, fps: j.fps, dur: c.dur, loop: c.loop };
  }
  LIB = clips;
}

// ---------- Umrechnung auf ein Figuren-Skelett ----------
// Ausgabe pro Bild (Float32Array): lokale Drehungen der Oberkörper-Knochen, Body-Position, Fuß-Positionen/-Drehungen, Knie-Zielpunkte
export const QB = ['Hips', 'Abdomen', 'Torso', 'Neck', 'Head', 'ShoulderL', 'UpperArmL', 'LowerArmL', 'FistL', 'ShoulderR', 'UpperArmR', 'LowerArmR', 'FistR'];
const O_BODY = QB.length * 4, O_FOOT = O_BODY + 3; // Fuß: je 3 Pos + 4 Drehung
const O_POLE = O_FOOT + 14; // Knie: je 3
export const STRIDE = O_POLE + 6;
export const LAYOUT = { O_BODY, O_FOOT, O_POLE };

const cache = new WeakMap();
export function retarget(gltf, cloneFn) {
  if (cache.has(gltf)) return cache.get(gltf);
  if (!LIB) throw new Error('Bewegungen nicht geladen');
  const sc = cloneFn(gltf.scene);
  sc.position.set(0, 0, 0); sc.quaternion.identity(); sc.scale.set(1, 1, 1);
  const B = {}; sc.traverse(o => { if (o.isBone || /_end$/.test(o.name)) B[o.name] = o; });
  const rest = []; sc.traverse(o => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone()]); });
  const reset = () => { for (const [b, p, q] of rest) { b.position.copy(p); b.quaternion.copy(q); } sc.updateMatrixWorld(true); };
  reset();
  const wp = o => o.getWorldPosition(V()), wq = o => o.getWorldQuaternion(Q());
  // Grundhaltungen
  const T = LIB.tpose.frames[0];
  const srcLeg = T.P.thigh_l.distanceTo(T.P.foot_l);
  const dstLeg = wp(B.UpperLegL).distanceTo(wp(B.LowerLegL_end || B.FootL));
  const S = dstLeg / srcLeg;
  const restW = {}; for (const n of [...QB, 'Body', 'FootL', 'FootR']) restW[n] = { p: wp(B[n]), q: wq(B[n]) };
  const DELTA = [['Hips', 'pelvis'], ['Abdomen', 'spine_01'], ['Torso', 'spine_03'], ['Neck', 'neck_01'], ['Head', 'Head']];
  const ARM = s => [[`Shoulder${s}`, `UpperArm${s}`, `clavicle_${s.toLowerCase()}`, `upperarm_${s.toLowerCase()}`],
    [`UpperArm${s}`, `LowerArm${s}`, `upperarm_${s.toLowerCase()}`, `lowerarm_${s.toLowerCase()}`],
    [`LowerArm${s}`, `Fist${s}`, `lowerarm_${s.toLowerCase()}`, `hand_${s.toLowerCase()}`],
    [`Fist${s}`, `Fist${s}_end`, `hand_${s.toLowerCase()}`, `middle_01_${s.toLowerCase()}`]];
  const setWorldQ = (bone, q) => { bone.parent.getWorldQuaternion(_q3).invert(); bone.quaternion.copy(_q3).multiply(q); bone.updateMatrixWorld(true); };
  const setWorldP = (bone, p) => { bone.parent.updateWorldMatrix(true, false); bone.position.copy(bone.parent.worldToLocal(p.clone())); bone.updateMatrixWorld(true); };
  const out = {};
  for (const [key, clip] of Object.entries(LIB)) {
    const data = new Float32Array(clip.frames.length * STRIDE);
    clip.frames.forEach((F, f) => {
      reset();
      const o = f * STRIDE;
      // Becken-Verschiebung
      setWorldP(B.Body, restW.Body.p.clone().add(F.P.pelvis.clone().sub(T.P.pelvis).multiplyScalar(S)));
      for (const [d, s] of DELTA) setWorldQ(B[d], F.R[s].clone().multiply(T.R[s].clone().invert()).multiply(restW[d].q));
      for (const side of ['L', 'R']) for (const [d, dc, s, sc2] of ARM(side)) {
        if (!B[dc]) continue;
        const dir = F.P[sc2].clone().sub(F.P[s]).normalize();
        aimBone(B[d], wp(B[dc]), wp(B[d]).add(dir));
      }
      QB.forEach((n, i) => B[n].quaternion.toArray(data, o + i * 4));
      B.Body.position.toArray(data, o + O_BODY);
      ['L', 'R'].forEach((side, i) => {
        const s = side.toLowerCase(), foot = B['Foot' + side];
        setWorldP(foot, restW['Foot' + side].p.clone().add(F.P['foot_' + s].clone().sub(T.P['foot_' + s]).multiplyScalar(S)));
        setWorldQ(foot, F.R['foot_' + s].clone().multiply(T.R['foot_' + s].clone().invert()).multiply(restW['Foot' + side].q));
        foot.position.toArray(data, o + O_FOOT + i * 7); foot.quaternion.toArray(data, o + O_FOOT + i * 7 + 3);
        // Knie-Richtung -> Zielpunkt weit vor dem Knie
        const hip = F.P['thigh_' + s], knee = F.P['calf_' + s], ank = F.P['foot_' + s];
        const mid = hip.clone().add(ank).multiplyScalar(0.5), kd = knee.clone().sub(mid);
        if (kd.lengthSq() < 1e-6) kd.set(0, 0, 1); kd.normalize();
        const dMid = wp(B['UpperLeg' + side]).add(wp(foot)).multiplyScalar(0.5);
        const pole = dMid.add(kd.multiplyScalar(dstLeg * 1.2));
        const loc = foot.parent.worldToLocal(pole);
        loc.toArray(data, o + O_POLE + i * 3);
      });
    });
    // Tempo der Laufzyklen: wie schnell gleitet der aufgesetzte Fuß nach hinten (Meter/s im Quelltempo)
    let v = 0, n = 0, zMaxF = 0, zMax = -Infinity;
    const fr = clip.frames;
    const yMin = Math.min(...fr.map(F => F.P.foot_l.y));
    for (let f = 1; f < fr.length; f++) {
      if (fr[f].P.foot_l.y < yMin + 0.03) { v += (fr[f - 1].P.foot_l.z - fr[f].P.foot_l.z) * clip.fps; n++; }
      if (fr[f].P.foot_l.z > zMax) { zMax = fr[f].P.foot_l.z; zMaxF = f; }
    }
    out[key] = { data, frames: fr.length, fps: clip.fps, dur: clip.dur, loop: clip.loop, speed: n ? Math.max(0, v / n) * S : 0, phase0: zMaxF / Math.max(1, fr.length - 1) };
  }
  // Ruhe-Werte (Füße/Body) für Richtungs-Umrechnung
  reset();
  out._rest = { footL: B.FootL.position.clone(), footR: B.FootR.position.clone(), body: B.Body.position.clone(), unit: dstLeg };
  cache.set(gltf, out);
  return out;
}

// ---------- Abspielen & Mischen ----------
const tmpA = new Float32Array(STRIDE), tmpB = new Float32Array(STRIDE);
// Bild bei Zeit t (Sekunden) in out schreiben (zwischen zwei Bildern gemischt)
export function sample(clip, t, out) {
  const n = clip.frames;
  let x = t * clip.fps;
  if (clip.loop) { x %= (n - 1); if (x < 0) x += n - 1; } else x = Math.min(n - 1, Math.max(0, x));
  const i = Math.floor(x), j = Math.min(n - 1, i + 1), f = x - i, D = clip.data, oi = i * STRIDE, oj = j * STRIDE;
  for (let k = 0; k < STRIDE; k++) out[k] = D[oi + k] + (D[oj + k] - D[oi + k]) * f;
  return out;
}
// Mischpult: acc += w * pose (Drehungen mit Vorzeichen-Angleich)
export class Blend {
  constructor() { this.acc = new Float32Array(STRIDE); this.w = 0; }
  clear() { this.acc.fill(0); this.w = 0; }
  add(clip, t, w) {
    if (w <= 1e-4) return;
    const p = sample(clip, t, tmpA), A = this.acc;
    const quat = o => { const s = this.w > 0 && (A[o] * p[o] + A[o + 1] * p[o + 1] + A[o + 2] * p[o + 2] + A[o + 3] * p[o + 3]) < 0 ? -w : w; for (let k = 0; k < 4; k++) A[o + k] += p[o + k] * s; };
    for (let i = 0; i < QB.length; i++) quat(i * 4);
    for (let k = 0; k < 3; k++) A[O_BODY + k] += p[O_BODY + k] * w;
    for (let s = 0; s < 2; s++) { const o = O_FOOT + s * 7; for (let k = 0; k < 3; k++) A[o + k] += p[o + k] * w; quat(o + 3); }
    for (let k = 0; k < 6; k++) A[O_POLE + k] += p[O_POLE + k] * w;
    this.w += w;
  }
  // Ergebnis normieren
  result() {
    const A = this.acc, w = this.w || 1, R = tmpB;
    for (let k = 0; k < STRIDE; k++) R[k] = A[k] / w;
    const nq = o => { const l = Math.hypot(R[o], R[o + 1], R[o + 2], R[o + 3]) || 1; for (let k = 0; k < 4; k++) R[o + k] /= l; };
    for (let i = 0; i < QB.length; i++) nq(i * 4);
    nq(O_FOOT + 3); nq(O_FOOT + 10);
    return R;
  }
}
