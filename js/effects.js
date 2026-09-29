// Effekte: leuchtende Leuchtspuren, Mündungsblitz mit Licht, Funken, Hülsen, Treffer-Spritzer, Explosionen,
// Staub, Dash-Nachbilder, Heil-Funkeln, Trümmer, Schadenszahlen.
import * as THREE from 'three';
import { toon, glow, LAYER_FX } from './toon.js';
import { prop } from './assets.js';

function canvasSprite(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.translate(size / 2, size / 2); draw(g, size / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TEX = {
  flash: canvasSprite((g, r) => {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(0.25, 'rgba(255,230,120,1)'); grd.addColorStop(0.6, 'rgba(255,140,40,0.7)'); grd.addColorStop(1, 'rgba(255,90,0,0)');
    g.beginPath(); for (let i = 0; i < 16; i++) { const rr = i % 2 ? r * 0.35 : r * (0.8 + Math.random() * 0.2), a = i / 16 * Math.PI * 2; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = grd; g.fill();
  }),
  soft: canvasSprite((g, r) => { const grd = g.createRadialGradient(0, 0, 0, 0, 0, r); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(-r, -r, r * 2, r * 2); }),
  smoke: canvasSprite((g, r) => {
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, d = r * 0.3; const grd = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r * 0.6); grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(-r, -r, r * 2, r * 2); }
  }),
  ring: canvasSprite((g, r) => { g.lineWidth = r * 0.12; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(0, 0, r * 0.85, 0, 7); g.stroke(); }),
  plus: canvasSprite((g, r) => { g.fillStyle = '#7dff7a'; g.fillRect(-r * 0.2, -r * 0.7, r * 0.4, r * 1.4); g.fillRect(-r * 0.7, -r * 0.2, r * 1.4, r * 0.4); g.strokeStyle = '#1e7a2a'; g.lineWidth = r * 0.08; g.strokeRect(-r * 0.2, -r * 0.7, r * 0.4, r * 1.4); }, 64),
  star: canvasSprite((g, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.42 : r * 0.95, a = i / 10 * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fillStyle = '#ffffff'; g.fill(); }, 64),
};
const spriteMat = (tex, color, opts = {}) => new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, toneMapped: false, ...opts });

export class Effects {
  constructor(scene, camera, floatLayer) {
    this.scene = scene; this.camera = camera; this.layer = floatLayer;
    this.items = []; this.decals = [];
    this.tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); this.tracerGeo.rotateX(Math.PI / 2); this.tracerGeo.translate(0, 0, 0.5);
    this.tracerCol = { player: new THREE.Color('#ffe98a').multiplyScalar(4), bot: new THREE.Color('#ff7ad0').multiplyScalar(4) };
    this.decalGeo = new THREE.CircleGeometry(0.075, 10);
    this.decalMat = new THREE.MeshBasicMaterial({ color: '#2a2433', polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, transparent: true, opacity: 0.8 });
    this.decalRing = new THREE.MeshBasicMaterial({ color: '#5a4a3a', polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false, transparent: true, opacity: 0.35 });
    this.puffGeo = new THREE.IcosahedronGeometry(1, 1);
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.sparkGeo = new THREE.BoxGeometry(0.02, 0.02, 0.22); this.sparkGeo.translate(0, 0, -0.11);
    this.shellGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8); this.shellGeo.rotateZ(Math.PI / 2);
    // Zwei Lichter für Mündungsblitze/Explosionen (immer in der Szene, damit nichts neu kompiliert wird)
    this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight('#ffb050', 0, 7, 1.6); scene.add(l); return { l, t: 0, max: 1 }; });
    this.shake = 0;
    this.v = new THREE.Vector3();
  }
  add(obj, life, update) { obj.traverse(o => o.layers.set(LAYER_FX)); this.scene.add(obj); this.items.push({ obj, life, max: life, update }); }
  addWorld(obj, life, update) { this.scene.add(obj); this.items.push({ obj, life, max: life, update }); }
  flashLight(pos, color, intensity, dur, dist = 7) {
    const L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.copy(pos); L.l.color.set(color); L.l.distance = dist; L.t = dur; L.max = dur; L.peak = intensity;
  }
  sprite(tex, color, pos, size, life, upd, opts) {
    const s = new THREE.Sprite(spriteMat(tex, color, opts)); s.material.userData.temp = true; s.position.copy(pos); s.scale.setScalar(size);
    this.add(s, life, (it, k, dt) => upd ? upd(s, k, dt) : (s.material.opacity = k));
    return s;
  }

  // ---------- Schuss ----------
  tracer(from, to, who) {
    const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color: this.tracerCol[who], transparent: true, depthWrite: false, toneMapped: false })); m.material.userData.temp = true;
    const len = from.distanceTo ? from.distanceTo(to) : Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    m.position.set(from.x, from.y, from.z); m.scale.set(0.03, 0.03, len); m.lookAt(to.x, to.y, to.z);
    this.add(m, 0.09, (it, k) => { m.material.opacity = k; m.scale.x = m.scale.y = 0.03 * (0.4 + k); m.position.lerp(new THREE.Vector3(to.x, to.y, to.z), 0.25); });
  }
  muzzle(pos, dir, big = 1) {
    const p = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z);
    this.sprite(TEX.flash, new THREE.Color('#ffffff').multiplyScalar(3), p, 0.55 * big * (0.8 + Math.random() * 0.4), 0.05, (s, k) => { s.material.opacity = k; s.material.rotation += 0.3; }, { rotation: Math.random() * 6 });
    this.flashLight(p, '#ffc070', 5 * big, 0.06);
    if (Math.random() < 0.5) {
      const sm = p.clone().addScaledVector(dir || new THREE.Vector3(), 0.2);
      this.sprite(TEX.smoke, '#e8e2dc', sm, 0.25, 0.6, (s, k, dt) => { s.material.opacity = k * 0.35; s.scale.setScalar(0.25 + (1 - k) * 0.5); s.position.y += dt * 0.5; });
    }
  }
  // Patronenhülse fliegt rechts heraus
  shell(pos, right) {
    const m = new THREE.Mesh(this.shellGeo, toon('#e0b040', { metal: 0.9, rough: 0.25 }));
    m.position.copy(pos);
    const v = new THREE.Vector3(right.x * 2.2 + (Math.random() - 0.5) * 0.5, 2 + Math.random(), right.z * 2.2 + (Math.random() - 0.5) * 0.5);
    const spin = 15 + Math.random() * 10;
    this.addWorld(m, 1.2, (it, k, dt) => {
      if (m.position.y > 0.02) { v.y -= 14 * dt; m.position.addScaledVector(v, dt); m.rotation.x += spin * dt; m.rotation.y += spin * 0.5 * dt; }
      else { m.position.y = 0.02; v.set(v.x * 0.5, Math.abs(v.y) * 0.3 > 0.4 ? Math.abs(v.y) * 0.3 : 0, v.z * 0.5); if (v.y) m.position.y = 0.021; }
      if (k < 0.2) m.scale.setScalar(k / 0.2);
    });
  }
  // Einschlag in Wand/Boden: Funken + Staub + Einschussloch
  impact(point, normal, color = '#d8d0c0') {
    const P = new THREE.Vector3(point.x, point.y, point.z), N = new THREE.Vector3(normal?.x || 0, normal?.y || 1, normal?.z || 0);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(this.sparkGeo, glow('#ffd070', 4));
      sp.position.copy(P);
      const v = N.clone().multiplyScalar(3 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5));
      this.add(sp, 0.18 + Math.random() * 0.1, (it, k, dt) => { v.y -= 12 * dt; sp.position.addScaledVector(v, dt); sp.lookAt(sp.position.clone().add(v)); sp.scale.z = k; });
    }
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(this.puffGeo, toon(color, { rough: 1 }));
      const s = 0.05 + Math.random() * 0.06; m.scale.setScalar(s); m.position.copy(P);
      const v = N.clone().multiplyScalar(1.5).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5));
      this.add(m, 0.45, (it, k, dt) => { m.position.addScaledVector(v, dt); v.multiplyScalar(0.9); m.scale.setScalar(s * (0.6 + (1 - k) * 1.4) * k); });
    }
    if (normal) {
      const d = new THREE.Mesh(this.decalGeo, this.decalMat), r = new THREE.Mesh(this.decalGeo, this.decalRing);
      r.scale.setScalar(1.9);
      for (const o of [d, r]) { o.position.copy(P).addScaledVector(N, 0.01); o.lookAt(P.clone().add(N)); o.layers.set(LAYER_FX); this.scene.add(o); this.decals.push(o); }
      d.rotation.z = Math.random() * 6;
      while (this.decals.length > 120) this.scene.remove(this.decals.shift());
    }
  }
  clearDecals() { for (const d of this.decals) this.scene.remove(d); this.decals.length = 0; }
  // Treffer an einer Figur: bunte Comic-Spritzer + Sternchen
  hitSplat(point, head, colors = ['#ff4fa3', '#ffd83a', '#7ec8ff']) {
    const P = new THREE.Vector3(point.x, point.y, point.z);
    const n = head ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.puffGeo, glow(colors[i % colors.length], 1.4));
      const s = 0.035 + Math.random() * 0.04; m.scale.setScalar(s); m.position.copy(P);
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5);
      this.add(m, 0.45, (it, k, dt) => { v.y -= 10 * dt; m.position.addScaledVector(v, dt); m.scale.setScalar(s * k); });
    }
    if (head) for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      this.sprite(TEX.star, new THREE.Color('#ffe14a').multiplyScalar(2), P.clone(), 0.16, 0.5, (s, k, dt) => { s.position.x += Math.cos(a) * dt * 2; s.position.z += Math.sin(a) * dt * 2; s.position.y += dt * 1.5; s.material.opacity = k; s.material.rotation += dt * 6; });
    }
  }
  // Staubwolke (Rutschen, Landen, Dash)
  dust(pos, n = 5, size = 0.3, color = '#e8e0d0') {
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.6, (pos.y || 0) + 0.15, pos.z + (Math.random() - 0.5) * 0.6);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 2);
      this.sprite(TEX.smoke, color, p, size, 0.6 + Math.random() * 0.3, (s, k, dt) => { s.position.addScaledVector(v, dt); v.multiplyScalar(0.94); s.scale.setScalar(size * (1 + (1 - k) * 1.5)); s.material.opacity = k * 0.55; });
    }
  }
  // Dash: Speed-Streifen + leuchtende Nachbilder
  dashTrail(pos, dir, color = '#7ec8ff') {
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(this.sparkGeo, glow(color, 2.5));
      sp.scale.set(2, 2, 3 + Math.random() * 3);
      sp.position.set(pos.x + (Math.random() - 0.5) * 0.7, (pos.y || 0) + 0.3 + Math.random() * 1.4, pos.z + (Math.random() - 0.5) * 0.7);
      sp.lookAt(sp.position.x + dir.x, sp.position.y, sp.position.z + dir.z);
      this.add(sp, 0.25, (it, k) => { sp.scale.x = sp.scale.y = 2 * k; });
    }
    this.dust(pos, 3, 0.25);
  }
  // Heilen: grüne Plus-Zeichen steigen auf
  healSparkles(pos) {
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.8, (pos.y || 0) + 0.5 + Math.random() * 1.2, pos.z + (Math.random() - 0.5) * 0.8);
      this.sprite(TEX.plus, new THREE.Color('#ffffff').multiplyScalar(1.8), p, 0.18, 0.8, (s, k, dt) => { s.position.y += dt * 1.2; s.material.opacity = k; });
    }
  }

  // ---------- Explosion ----------
  explosion(pos) {
    const P = new THREE.Vector3(pos.x, (pos.y || 0) + 0.6, pos.z);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2a0').multiplyScalar(4), transparent: true, toneMapped: false }));
    core.position.copy(P);
    this.add(core, 0.35, (it, k) => { const e = 1 - k; core.scale.setScalar(0.4 + e * 3.2); core.material.opacity = k; core.material.color.set('#ffd060').multiplyScalar(2 + k * 3); });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), toon('#ff8a1f', { unique: true, emissive: '#ff5a00', emissiveIntensity: 2 }));
    ball.position.copy(P);
    this.addWorld(ball, 0.7, (it, k) => { const e = 1 - k; ball.scale.setScalar((0.5 + e * 3.6) * Math.min(1, k * 3)); ball.material.emissiveIntensity = 2 * k; });
    this.sprite(TEX.ring, new THREE.Color('#ffe8b0').multiplyScalar(2), P.clone().setY(0.3), 1, 0.45, (s, k) => { s.scale.setScalar(1 + (1 - k) * 11); s.material.opacity = k; });
    for (let i = 0; i < 16; i++) this.debrisPiece(pos, i % 2 ? '#3a3440' : '#ff8a1f', 0.1 + Math.random() * 0.15, 11);
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Mesh(this.sparkGeo, glow('#ffc050', 4));
      sp.position.copy(P); sp.scale.set(2, 2, 2);
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5)).normalize().multiplyScalar(10 + Math.random() * 8);
      this.add(sp, 0.5, (it, k, dt) => { v.y -= 12 * dt; sp.position.addScaledVector(v, dt); sp.lookAt(sp.position.clone().add(v)); });
    }
    for (let i = 0; i < 9; i++) {
      const p = P.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2));
      const vy = 1 + Math.random() * 2, size = 1.4 + Math.random() * 1.2;
      this.sprite(TEX.smoke, '#6f6878', p, size, 2 + Math.random(), (s, k, dt) => { s.position.y += vy * dt; s.scale.setScalar(size * (1 + (1 - k) * 1.2)); s.material.opacity = Math.min(1, k * 1.5) * 0.7; });
    }
    this.flashLight(P, '#ff9a40', 60, 0.45, 18);
    this.shake = Math.max(this.shake, 1);
  }
  debrisPiece(pos, color, size, speed = 6) {
    const m = new THREE.Mesh(this.debrisGeo, toon(color)); m.scale.setScalar(size); m.castShadow = true;
    m.position.set(pos.x + (Math.random() - 0.5) * 0.8, (pos.y || 0) + 0.5 + Math.random() * 0.6, pos.z + (Math.random() - 0.5) * 0.8);
    const v = { x: (Math.random() - 0.5) * speed, y: 2 + Math.random() * speed * 0.7, z: (Math.random() - 0.5) * speed };
    const spin = { x: Math.random() * 10, z: Math.random() * 10 };
    this.addWorld(m, 1.8, (it, k, dt) => {
      m.position.x += v.x * dt; m.position.y += v.y * dt; m.position.z += v.z * dt; v.y -= 18 * dt;
      if (m.position.y < size / 2) { m.position.y = size / 2; v.y *= -0.3; v.x *= 0.6; v.z *= 0.6; }
      m.rotation.x += spin.x * dt; m.rotation.z += spin.z * dt; if (k < 0.25) m.scale.setScalar(size * k / 0.25);
    });
  }
  // Leeres Magazin fällt beim Nachladen zu Boden
  dropMag(src) {
    const m = prop('blaster/clip-large', { height: 0.17 });
    src.getWorldPosition(m.position); m.position.y -= 0.05;
    src.getWorldQuaternion(m.quaternion);
    this.scene.add(m);
    const v = { x: (Math.random() - 0.5) * 0.8, y: -0.5, z: (Math.random() - 0.5) * 0.8 }, spin = (Math.random() - 0.5) * 8;
    this.items.push({ obj: m, life: 3, max: 3, update: (it, k, dt) => {
      if (m.position.y > 0.05) { v.y -= 18 * dt; m.position.x += v.x * dt; m.position.y += v.y * dt; m.position.z += v.z * dt; m.rotation.x += spin * dt; }
      else { m.position.y = 0.05; m.rotation.x = Math.PI / 2; }
      if (k < 0.15) m.scale.setScalar(k / 0.15);
    } });
  }
  breakApart(collider, color) {
    const c = collider, pos = { x: (c.min.x + c.max.x) / 2, y: c.min.y, z: (c.min.z + c.max.z) / 2 };
    for (let i = 0; i < 14; i++) this.debrisPiece(pos, color, 0.12 + Math.random() * 0.25, 6);
    this.dust({ x: pos.x, y: 0.3, z: pos.z }, 6, 0.6);
  }

  // ---- DOM (über dem Bild) ----
  project(p) {
    this.v.set(p.x, p.y, p.z).project(this.camera);
    if (this.v.z > 1) return null;
    return { x: (this.v.x * 0.5 + 0.5) * innerWidth, y: (-this.v.y * 0.5 + 0.5) * innerHeight };
  }
  floatText(p, text, cls, life = 800, off = [0, 0]) {
    const s = this.project(p); if (!s) return;
    const el = document.createElement('div'); el.className = cls; el.textContent = text;
    el.style.left = (s.x + off[0] + (Math.random() - 0.5) * 16) + 'px'; el.style.top = (s.y + off[1]) + 'px';
    this.layer.appendChild(el); setTimeout(() => el.remove(), life);
  }
  // seitlich versetzt, damit das Ziel nicht verdeckt wird
  damageNumber(p, dmg, head) { this.floatText(p, '-' + Math.round(dmg), head ? 'dmg head' : 'dmg', 800, [55, -35]); }
  pow(p, word) { this.floatText(p, word, 'pow', 650, [-80, -70]); }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.life -= dt;
      if (it.life <= 0) { this.scene.remove(it.obj); if (it.obj.material?.userData.temp) it.obj.material.dispose(); this.items.splice(i, 1); continue; }
      it.update(it, it.life / it.max, dt);
    }
    for (const L of this.lights) { L.t = Math.max(0, L.t - dt); L.l.intensity = L.t > 0 ? (L.peak || 0) * (L.t / L.max) : 0; }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
  clear() { for (const it of this.items) this.scene.remove(it.obj); this.items.length = 0; this.clearDecals(); this.layer.innerHTML = ''; for (const L of this.lights) { L.t = 0; L.l.intensity = 0; } }
}
