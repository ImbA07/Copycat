// Figuren: Mango (Spieler) und Copycat (Pantomime). Aus einfachen Formen gebaut, prozedural animiert.
import * as THREE from 'three';
import { toon, flat, box, sphere, cyl, cone, capsule, LAYER_FX } from './toon.js';

const stripes = (() => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1c1a24' : '#ffffff'; g.fillRect(0, i * 8, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
})();

export function buildRifle(accent = '#ff8a1f') {
  const g = new THREE.Group();
  const dark = '#34313d';
  g.add(box(0.1, 0.14, 0.55, dark, 0, 0, 0));            // Gehäuse
  g.add(box(0.08, 0.08, 0.3, accent, 0, -0.01, 0.38));  // Handschutz
  const barrel = cyl(0.025, 0.025, 0.35, '#222', 0, 0.01, 0.65, 8); barrel.rotation.x = Math.PI / 2; g.add(barrel);
  g.add(box(0.07, 0.22, 0.1, '#222', 0, -0.16, 0.12));   // Magazin
  g.add(box(0.07, 0.14, 0.08, dark, 0, -0.12, -0.12));   // Griff
  g.add(box(0.08, 0.12, 0.3, accent, 0, -0.03, -0.4));   // Schaft
  g.add(box(0.02, 0.06, 0.03, '#222', 0, 0.1, 0.62));    // Korn
  g.add(box(0.07, 0.05, 0.03, '#222', 0, 0.09, -0.2));   // Kimme
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, 0.84); g.add(muzzle);
  const mag = g.children[3];
  return { group: g, muzzle, mag };
}

// Kimme & Korn für die Ich-Ansicht (am Kamera-Objekt befestigt)
export function buildViewmodel() {
  // Kamera schaut entlang -Z; die Korn-Spitze liegt exakt in der Bildmitte (0, 0)
  const g = new THREE.Group();
  const dark = toon('#34313d'), black = toon('#1d1b24');
  g.add(box(0.034, 0.03, 0.28, dark, 0, -0.07, -0.47));             // Gehäuse
  g.add(box(0.03, 0.026, 0.22, toon('#ff8a1f'), 0, -0.064, -0.72)); // Handschutz
  const barrel = cyl(0.006, 0.006, 0.18, '#1d1b24', 0, -0.05, -0.95, 8); barrel.rotation.x = Math.PI / 2; g.add(barrel);
  // Kimme: zwei Pfosten mit Lücke
  g.add(box(0.005, 0.012, 0.01, black, -0.0058, -0.011, -0.32));
  g.add(box(0.005, 0.012, 0.01, black, 0.0058, -0.011, -0.32));
  g.add(box(0.022, 0.005, 0.012, black, 0, -0.019, -0.32));
  g.add(box(0.01, 0.034, 0.04, dark, 0, -0.038, -0.34));
  // Korn mit gelber Spitze
  g.add(box(0.0035, 0.03, 0.006, black, 0, -0.016, -0.9));
  g.add(box(0.004, 0.005, 0.007, toon('#ffd83a'), 0, -0.0025, -0.9));
  g.add(box(0.016, 0.012, 0.012, black, 0, -0.036, -0.9));
  // Handschuhe
  g.add(sphere(0.024, '#ffffff', 0.02, -0.095, -0.42, 10));
  g.add(sphere(0.024, '#ffffff', -0.014, -0.088, -0.7, 10));
  g.traverse(o => { if (o.isMesh) o.renderOrder = 10; });
  return g;
}

function limb(len, r, color) {
  // Gelenk-Gruppe; Mesh hängt nach unten
  const pivot = new THREE.Group();
  const m = capsule(r, Math.max(0.01, len - 2 * r), color, 0, -len / 2, 0);
  pivot.add(m);
  return pivot;
}

class Rig {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const s = spec;
    // Beine
    this.hips = new THREE.Group(); this.hips.position.y = s.legLen; this.body.add(this.hips);
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = limb(s.legLen * 0.52, s.legR, s.pants);
      thigh.position.x = side * s.hipW;
      const knee = limb(s.legLen * 0.5, s.legR * 0.9, s.pants2 || s.pants); knee.position.y = -s.legLen * 0.5;
      thigh.add(knee);
      const foot = box(s.footW, 0.16, s.footL, s.shoe, 0, -s.legLen * 0.5 + 0.02, s.footL * 0.3);
      knee.add(foot);
      this.hips.add(thigh);
      this.legs.push({ thigh, knee, foot, side });
    }
    this.hips.add(box(s.hipW * 2 + s.legR * 2, 0.22, s.legR * 2.4, s.pants, 0, 0.02, 0));
    // Oberkörper
    this.torso = new THREE.Group(); this.torso.position.y = 0.08; this.hips.add(this.torso);
    this.chest = capsule(s.chestR, s.torsoLen - s.chestR * 2 + 0.1, s.shirt, 0, s.torsoLen / 2, 0);
    this.chest.scale.set(1, 1, 0.75);
    this.torso.add(this.chest);
    // Kopf
    this.neck = new THREE.Group(); this.neck.position.y = s.torsoLen + 0.05; this.torso.add(this.neck);
    this.neck.add(cyl(0.07, 0.08, 0.16, s.skin, 0, 0.06, 0, 8));
    this.head = new THREE.Group(); this.head.position.y = 0.12 + s.headR; this.neck.add(this.head);
    // Zielgruppe: Arme + Waffe drehen sich mit der Blickneigung
    this.aim = new THREE.Group(); this.aim.position.set(0, s.torsoLen - 0.12, 0.02); this.torso.add(this.aim);
    this.rifle = buildRifle(s.gunAccent);
    this.rifle.group.position.set(0.1, -0.08, 0.35);
    this.aim.add(this.rifle.group);
    this.arms = [];
    for (const side of [-1, 1]) {
      const up = limb(s.armLen * 0.5, s.armR, s.sleeve);
      up.position.set(side * (s.chestR + 0.02), 0, 0);
      const low = limb(s.armLen * 0.5, s.armR * 0.9, s.forearm || s.skin); low.position.y = -s.armLen * 0.5;
      up.add(low);
      const hand = sphere(s.armR * 1.35, s.glove, 0, -s.armLen * 0.5, 0, 10); low.add(hand);
      this.aim.add(up);
      this.arms.push({ up, low, hand, side });
    }
    // Spritze (für Heil-Animation)
    this.syringe = new THREE.Group();
    this.syringe.add(cyl(0.035, 0.035, 0.22, toon('#bff5ff', { transparent: true, opacity: 0.9 }), 0, 0, 0, 8));
    this.syringe.add(cyl(0.012, 0.012, 0.3, '#16121f', 0, 0.2, 0, 6));
    this.syringe.add(cyl(0.006, 0.001, 0.12, '#dddddd', 0, -0.17, 0, 6));
    this.syringe.add(cyl(0.032, 0.032, 0.14, flat('#6bff6b'), 0, -0.02, 0, 8));
    this.syringe.visible = false;
    this.arms[0].hand.add(this.syringe);
    // Schatten
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.layers.set(LAYER_FX);
    this.root.add(this.shadow);

    this.phase = 0; this.t = 0; this.recoil = 0; this.hitFlash = 0;
    this.meshes = []; this.root.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    this.standEye = s.legLen + 0.08 + s.torsoLen + 0.17 + s.headR;
  }

  // Treffer-Zonen in Weltkoordinaten
  hitboxes(pos, crouchAmt) {
    this.root.updateMatrixWorld(true);
    const hp = new THREE.Vector3(); this.head.getWorldPosition(hp);
    return {
      head: { x: hp.x, y: hp.y, z: hp.z, r: this.spec.headR * 1.05 },
      body: { x: pos.x, z: pos.z, r: this.spec.bodyR, y0: pos.y, y1: hp.y - this.spec.headR * 0.8 },
    };
  }
  eyeHeight(crouchAmt) { return this.standEye * (1 - 0.38 * crouchAmt); }

  flash() { this.hitFlash = 0.12; }

  // st: {speed, fwd, side, grounded, crouch(0..1), slide, pitch, reload(0..1|-1), syringe(0..1|-1), taunt(null|{type,t}), dead(0..1), vy}
  animate(st, dt) {
    this.t += dt;
    const s = this.spec;
    const sp = Math.min(1.4, st.speed / 5.2);
    this.phase += dt * (3.2 + st.speed * 1.35) * (st.speed > 0.3 ? 1 : 0);
    const ph = this.phase;
    let legSwing = Math.sin(ph) * 0.75 * sp;
    const bob = Math.abs(Math.sin(ph)) * 0.06 * sp;
    const c = st.crouch;
    // Grundhaltung
    this.body.position.y = -c * s.legLen * 0.36 + (st.grounded ? bob : 0);
    this.body.rotation.set(0, 0, 0);
    this.torso.rotation.set(0.05 + c * 0.25 + sp * 0.06, 0, 0);
    for (const L of this.legs) {
      const sw = legSwing * (L.side > 0 ? 1 : -1) * (1 - c * 0.5);
      L.thigh.rotation.set(-sw - c * 1.1, 0, 0);
      L.knee.rotation.set(Math.max(0, Math.sin(ph + (L.side > 0 ? 0 : Math.PI) + 1.2)) * 1.1 * sp + c * 2.0, 0, 0);
      // Seitwärts: Beine leicht spreizen
      L.thigh.rotation.z = st.side * 0.12 * L.side * sp;
    }
    if (!st.grounded && !st.slide) {
      for (const L of this.legs) { L.thigh.rotation.x = -0.7 + L.side * 0.25; L.knee.rotation.x = 1.3; }
    }
    if (st.slide) {
      this.body.position.y = -s.legLen * 0.55;
      this.torso.rotation.x = -0.55;
      for (const L of this.legs) { L.thigh.rotation.x = -1.35 + (L.side > 0 ? 0.25 : 0); L.knee.rotation.x = L.side > 0 ? 0.2 : 0.9; }
    }
    // Arme halten das Gewehr
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.aim.rotation.set(-st.pitch - this.torso.rotation.x - this.recoil * 0.08, 0, 0);
    this.aim.position.z = 0.02 - this.recoil * 0.05;
    const [la, ra] = this.arms;
    ra.up.rotation.set(-1.25, 0, -0.2); ra.low.rotation.set(-0.5, 0, 0);
    la.up.rotation.set(-1.35, 0, 0.55); la.low.rotation.set(-0.35, 0, 0.3);
    this.rifle.group.rotation.set(0, 0, 0);
    this.rifle.group.position.set(0.1, -0.08, 0.35);
    this.rifle.mag.visible = true;
    this.syringe.visible = false;
    if (st.reload >= 0) {
      const k = Math.sin(Math.min(1, st.reload) * Math.PI);
      this.rifle.group.rotation.z = k * 0.6; this.rifle.group.rotation.x = k * 0.3;
      la.up.rotation.set(-0.9 + k * 0.5, 0, 0.3 + k * 0.2); la.low.rotation.set(-1.2 * k, 0, 0);
      this.rifle.mag.visible = st.reload < 0.35 || st.reload > 0.6;
    }
    if (st.syringe >= 0) {
      // Linker Arm lässt Waffe los, holt aus und rammt die Spritze ins Bein
      const p = st.syringe;
      this.syringe.visible = true;
      const raise = p < 0.45 ? p / 0.45 : 1, stab = p < 0.45 ? 0 : Math.min(1, (p - 0.45) / 0.12);
      la.up.rotation.set(-2.6 * raise * (1 - stab) + 0.3 * stab, 0, 0.35 - 0.2 * stab);
      la.low.rotation.set(-0.6 * (1 - stab), 0, 0);
      this.syringe.rotation.set(Math.PI, 0, 0);
      this.rifle.group.rotation.z = -0.4;
      if (stab > 0 && p < 0.75) this.body.position.y -= 0.04 * Math.sin(this.t * 60);
    }
    // Kopf leicht mitnicken
    this.head.rotation.set(-st.pitch * 0.35 + Math.sin(ph * 2) * 0.03 * sp, 0, 0);
    if (st.taunt) this.animateTaunt(st.taunt, dt);
    if (st.dead > 0) {
      const d = Math.min(1, st.dead);
      this.body.rotation.x = -d * 1.45;
      this.body.position.y = -d * 0.3;
      for (const A of this.arms) A.up.rotation.set(-2.8 * d, 0, A.side * 0.6 * d);
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.headExtra?.(st, dt);
  }

  animateTaunt(tn, dt) {
    const t = tn.t, [la, ra] = this.arms;
    this.aim.rotation.x = 0;
    if (tn.type === 'box') { // Pantomime: unsichtbare Wand
      const k = Math.sin(t * 5);
      la.up.rotation.set(-1.4, 0, 0.7 + k * 0.15); la.low.rotation.set(-1.4, 0, 0);
      ra.up.rotation.set(-1.4, 0, -0.7 - k * 0.15); ra.low.rotation.set(-1.4, 0, 0);
      this.rifle.group.position.set(0.25, -0.5, 0); this.rifle.group.rotation.set(1.4, 0, 0);
      this.body.rotation.y = Math.sin(t * 2.5) * 0.4;
    } else if (tn.type === 'dance') { // alberner Tanz
      this.body.position.y += Math.abs(Math.sin(t * 9)) * 0.25;
      this.body.rotation.z = Math.sin(t * 9) * 0.2;
      la.up.rotation.set(-2.9, 0, 0.4 + Math.sin(t * 9) * 0.5);
      ra.up.rotation.set(-0.4 + Math.sin(t * 9) * 0.6, 0, -0.9);
      for (const L of this.legs) L.thigh.rotation.x = Math.sin(t * 9 + L.side) * 0.9;
    } else if (tn.type === 'crouchspam') { // äfft dein Ducken nach
      const k = (Math.sin(t * 14) + 1) / 2;
      this.body.position.y = -k * this.spec.legLen * 0.4;
      for (const L of this.legs) { L.thigh.rotation.x = -k * 1.2; L.knee.rotation.x = k * 2.1; }
      this.head.rotation.z = Math.sin(t * 7) * 0.4;
    } else { // flail / Sprung-Nachäffen
      this.body.position.y += Math.abs(Math.sin(t * 6)) * 0.7;
      la.up.rotation.set(-3 + Math.sin(t * 12) * 0.6, 0, 0.8);
      ra.up.rotation.set(-3 + Math.cos(t * 12) * 0.6, 0, -0.8);
      for (const L of this.legs) L.thigh.rotation.z = L.side * (0.3 + Math.sin(t * 6) * 0.3);
    }
  }
}

// ---------------- Mango ----------------
export function buildMango() {
  const rig = new Rig({
    legLen: 1.0, legR: 0.075, hipW: 0.13, footW: 0.16, footL: 0.42,
    torsoLen: 0.6, chestR: 0.24, headR: 0.24, armLen: 0.72, armR: 0.065, bodyR: 0.36,
    skin: '#ffd83a', pants: '#6a3fb5', shoe: '#8a4a22', shirt: '#22b8a7', sleeve: '#22b8a7', glove: '#ffffff', forearm: '#ffd83a',
    gunAccent: '#ff8a1f',
  });
  const h = rig.head, R = 0.24;
  const skin = toon('#ffd83a');
  const headMesh = sphere(R, skin, 0, 0, 0, 20); headMesh.scale.set(0.92, 1.12, 0.95); h.add(headMesh);
  // Schnauze mit Überbiss
  const muzzle = sphere(R * 0.62, skin, 0, -R * 0.45, R * 0.55, 14); muzzle.scale.set(1.1, 0.75, 0.9); h.add(muzzle);
  h.add(box(R * 0.9, 0.05, 0.05, '#ffffff', 0, -R * 0.52, R * 1.02));
  // Clown-Nase
  h.add(sphere(0.07, toon('#ff3b3b'), 0, -R * 0.05, R * 1.05, 12));
  // Augen
  for (const sx of [-1, 1]) {
    const e = sphere(0.085, flat('#ffffff'), sx * 0.085, R * 0.25, R * 0.82, 14); e.scale.set(1, 1.15, 0.7); h.add(e);
    h.add(sphere(0.022, flat('#16121f'), sx * 0.08, R * 0.25, R * 0.82 + 0.058, 8));
    const brow = box(0.12, 0.025, 0.03, '#b34a00', sx * 0.09, R * 0.62, R * 0.8); brow.rotation.z = sx * 0.25; h.add(brow);
  }
  // Riesige Mango-Mähne: Zacken in alle Richtungen
  const hair = new THREE.Group(); hair.position.y = R * 0.55; h.add(hair);
  const hairMat = toon('#ff8a1f'), hair2 = toon('#ff6a00');
  let k = 0;
  for (let ring = 0; ring < 3; ring++) {
    const n = [7, 9, 11][ring];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      const tilt = [0.35, 0.95, 1.5][ring];
      const len = [0.7, 0.62, 0.45][ring] * (0.85 + (k++ % 3) * 0.12);
      const spike = cone(0.13, len, (i + ring) % 2 ? hairMat : hair2, 0, 0, 0, 7);
      spike.geometry = spike.geometry.clone(); spike.geometry.translate(0, len / 2, 0);
      spike.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
      spike.rotation.order = 'YXZ'; spike.rotation.y = 0;
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      spike.position.copy(dir).multiplyScalar(0.1);
      hair.add(spike);
    }
  }
  hair.add(sphere(0.2, hairMat, 0, 0.02, -0.02, 12));
  // Mango-Blatt obendrauf
  const leaf = sphere(0.12, toon('#3fbf4a'), 0.05, 0.78, 0, 10); leaf.scale.set(0.45, 1.3, 0.2); leaf.rotation.z = -0.5; hair.add(leaf);
  // Fliege
  rig.neck.add(cone(0.07, 0.12, toon('#ff3b3b'), -0.06, 0.02, 0.1, 4).rotateZ(Math.PI / 2));
  rig.neck.add(cone(0.07, 0.12, toon('#ff3b3b'), 0.06, 0.02, 0.1, 4).rotateZ(-Math.PI / 2));
  rig.hairGroup = hair;
  rig.headMeshes = [];
  h.traverse(o => { if (o.isMesh) rig.headMeshes.push(o); });
  rig.name = 'Mango';
  rig.meshes = []; rig.root.traverse(o => { if (o.isMesh) rig.meshes.push(o); });
  return rig;
}

// ---------------- Copycat ----------------
export function buildCopycat() {
  const rig = new Rig({
    legLen: 1.3, legR: 0.055, hipW: 0.1, footW: 0.14, footL: 0.5,
    torsoLen: 0.55, chestR: 0.2, headR: 0.23, armLen: 0.95, armR: 0.05, bodyR: 0.33,
    skin: '#ffffff', pants: '#1d1b24', pants2: '#1d1b24', shoe: '#16121f', shirt: toon('#ffffff', { map: stripes }), sleeve: toon('#ffffff', { map: stripes }), glove: '#ffffff', forearm: toon('#ffffff', { map: stripes }),
    gunAccent: '#ff4fa3',
  });
  // Hosenträger
  for (const sx of [-1, 1]) { const b = box(0.04, 0.55, 0.02, '#16121f', sx * 0.11, 0.3, 0.15); rig.torso.add(b); }
  const h = rig.head, R = 0.23;
  const face = sphere(R, flat('#fbfbff'), 0, 0, 0, 20); face.material = toon('#ffffff'); face.scale.set(0.85, 1.25, 0.9); h.add(face);
  // Schiefe Augen (eins groß, eins klein) + Lidstrich
  const eyes = [[-0.085, 0.07, 0.1], [0.08, 0.04, 0.065]];
  rig.pupils = [];
  for (const [x, y, r] of eyes) {
    const e = sphere(r, flat('#ffffff'), x, y, R * 0.78, 14); e.scale.z = 0.6; h.add(e);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 18), toon('#16121f')); ring.position.set(x, y, R * 0.78 + 0.02); h.add(ring);
    const p = sphere(r * 0.35, flat('#16121f'), x + 0.01, y - 0.01, R * 0.78 + r * 0.55, 8); h.add(p); rig.pupils.push(p);
    const tear = box(0.012, 0.08, 0.01, '#16121f', x, y - r - 0.05, R * 0.8); h.add(tear);
  }
  // Hochgezogene Augenbrauen
  for (const [x, rz] of [[-0.09, 0.4], [0.08, -0.1]]) { const b = box(0.1, 0.02, 0.02, '#16121f', x, 0.2, R * 0.78); b.rotation.z = rz; h.add(b); }
  // Dümmliches Grinsen mit Hasenzähnen
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 16, Math.PI), toon('#e8223a')); mouth.rotation.z = Math.PI; mouth.position.set(0.015, -0.1, R * 0.82); h.add(mouth);
  h.add(box(0.035, 0.05, 0.02, '#ffffff', -0.005, -0.12, R * 0.86)); h.add(box(0.035, 0.05, 0.02, '#ffffff', 0.035, -0.12, R * 0.86));
  h.add(sphere(0.03, toon('#ff8fb0'), -0.12, -0.05, R * 0.72, 8)); h.add(sphere(0.03, toon('#ff8fb0'), 0.12, -0.05, R * 0.72, 8));
  // Baskenmütze (schief)
  const beret = cyl(0.26, 0.2, 0.07, '#16121f', 0.03, R * 1.05, -0.02, 18); beret.rotation.z = 0.3; h.add(beret);
  h.add(cyl(0.012, 0.012, 0.06, '#16121f', 0.07, R * 1.05 + 0.06, -0.02, 6));
  // Roter Schal
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 16), toon('#e8223a')); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.06; rig.neck.add(scarf);
  const tail = box(0.08, 0.25, 0.03, '#e8223a', 0.06, -0.08, 0.1); tail.rotation.z = 0.3; rig.neck.add(tail);
  rig.scarfTail = tail;
  rig.headMeshes = []; h.traverse(o => { if (o.isMesh) rig.headMeshes.push(o); });
  rig.name = 'Copycat';
  rig.headExtra = (st, dt) => { tail.rotation.z = 0.3 + Math.sin(rig.t * 8) * 0.25 * Math.min(1, st.speed / 4); };
  rig.meshes = []; rig.root.traverse(o => { if (o.isMesh) rig.meshes.push(o); });
  return rig;
}
