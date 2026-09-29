// Comic-Effekte: Leuchtspuren, Mündungsfeuer, Einschläge, Explosionen, Trümmer, Schadenszahlen.
import * as THREE from 'three';
import { toon, LAYER_FX } from './toon.js';
import { prop } from './assets.js';

const starTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.translate(32, 32); g.beginPath();
  for (let i = 0; i < 16; i++) { const r = i % 2 ? 12 : 30, a = i / 16 * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fillStyle = '#ffe14a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#ff7a1a'; g.stroke();
  g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fillStyle = '#fff'; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

export class Effects {
  constructor(scene, camera, floatLayer) {
    this.scene = scene; this.camera = camera; this.layer = floatLayer;
    this.items = []; this.decals = [];
    this.tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); this.tracerGeo.rotateX(Math.PI / 2); this.tracerGeo.translate(0, 0, 0.5);
    this.tracerMat = { player: new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, depthWrite: false }), bot: new THREE.MeshBasicMaterial({ color: '#ff6fc0', transparent: true, depthWrite: false }) };
    this.flashMat = new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false });
    this.decalGeo = new THREE.CircleGeometry(0.07, 8);
    this.decalMat = new THREE.MeshBasicMaterial({ color: '#2a2433', polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, transparent: true, opacity: 0.85 });
    this.puffGeo = new THREE.IcosahedronGeometry(1, 0);
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.shake = 0;
    this.v = new THREE.Vector3();
  }
  add(obj, life, update) { obj.layers.set(LAYER_FX); obj.traverse(o => o.layers.set(LAYER_FX)); this.scene.add(obj); this.items.push({ obj, life, max: life, update }); }

  tracer(from, to, who) {
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat[who].clone());
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
    m.position.set(from.x, from.y, from.z); m.scale.set(0.025, 0.025, len);
    m.lookAt(to.x, to.y, to.z);
    this.add(m, 0.07, (it, k) => { m.material.opacity = k; m.scale.x = m.scale.y = 0.025 * (0.5 + k); });
  }
  muzzle(pos, scale = 0.5) {
    const s = new THREE.Sprite(this.flashMat); s.position.copy(pos); s.scale.setScalar(scale); s.material.rotation = Math.random() * 6;
    this.add(s, 0.05, () => {});
  }
  impact(point, normal, color = '#d8d0c0') {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.puffGeo, toon(color));
      const s = 0.05 + Math.random() * 0.05; m.scale.setScalar(s);
      m.position.set(point.x, point.y, point.z);
      const v = { x: normal.x * 2 + (Math.random() - 0.5) * 2, y: normal.y * 2 + Math.random() * 2, z: normal.z * 2 + (Math.random() - 0.5) * 2 };
      this.add(m, 0.35, (it, k, dt) => { m.position.x += v.x * dt; m.position.y += v.y * dt; m.position.z += v.z * dt; v.y -= 9 * dt; m.scale.setScalar(s * k); });
    }
    if (normal) {
      const d = new THREE.Mesh(this.decalGeo, this.decalMat);
      d.position.set(point.x + normal.x * 0.01, point.y + normal.y * 0.01, point.z + normal.z * 0.01);
      d.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
      d.layers.set(LAYER_FX); this.scene.add(d); this.decals.push(d);
      if (this.decals.length > 80) this.scene.remove(this.decals.shift());
    }
  }
  clearDecals() { for (const d of this.decals) this.scene.remove(d); this.decals.length = 0; }

  explosion(pos) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), toon('#ffb52e', { unique: true, emissive: '#ff6a00', emissiveIntensity: 0.6 }));
    ball.position.set(pos.x, pos.y + 0.6, pos.z); ball.layers.set(0);
    this.scene.add(ball);
    this.items.push({ obj: ball, life: 0.55, max: 0.55, update: (it, k) => { const e = 1 - k; ball.scale.setScalar(0.5 + e * 4.2); ball.material.color.set(e < 0.4 ? '#fff27a' : '#ff8a1f'); if (k < 0.3) ball.scale.multiplyScalar(k / 0.3); } });
    for (let i = 0; i < 14; i++) this.debrisPiece(pos, i % 2 ? '#3a3440' : '#ff8a1f', 0.12 + Math.random() * 0.15, 9);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.puffGeo, toon('#9d97a8')); const s = 0.4 + Math.random() * 0.5;
      m.position.set(pos.x + (Math.random() - 0.5), pos.y + 0.5, pos.z + (Math.random() - 0.5));
      const vy = 1.5 + Math.random() * 2;
      this.add(m, 1.4, (it, k, dt) => { m.position.y += vy * dt; m.scale.setScalar(s * (1.6 - k)); });
    }
    this.shake = Math.max(this.shake, 0.9);
  }
  debrisPiece(pos, color, size, speed = 6) {
    const m = new THREE.Mesh(this.debrisGeo, toon(color)); m.scale.setScalar(size);
    m.position.set(pos.x + (Math.random() - 0.5) * 0.8, (pos.y || 0) + 0.5 + Math.random() * 0.6, pos.z + (Math.random() - 0.5) * 0.8);
    const v = { x: (Math.random() - 0.5) * speed, y: 2 + Math.random() * speed * 0.7, z: (Math.random() - 0.5) * speed };
    const spin = { x: Math.random() * 10, z: Math.random() * 10 };
    m.layers.set(0);
    this.scene.add(m);
    this.items.push({ obj: m, life: 1.6, max: 1.6, update: (it, k, dt) => {
      m.position.x += v.x * dt; m.position.y += v.y * dt; m.position.z += v.z * dt; v.y -= 18 * dt;
      if (m.position.y < size / 2) { m.position.y = size / 2; v.y *= -0.3; v.x *= 0.6; v.z *= 0.6; }
      m.rotation.x += spin.x * dt; m.rotation.z += spin.z * dt; if (k < 0.25) m.scale.setScalar(size * k / 0.25);
    } });
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
    for (let i = 0; i < 12; i++) this.debrisPiece(pos, color, 0.15 + Math.random() * 0.25, 6);
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
      if (it.life <= 0) { this.scene.remove(it.obj); this.items.splice(i, 1); continue; }
      it.update(it, it.life / it.max, dt);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
  clear() { for (const it of this.items) this.scene.remove(it.obj); this.items.length = 0; this.clearDecals(); this.layer.innerHTML = ''; }
}
