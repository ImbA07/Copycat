// Zufällige, spiegelsymmetrische Arenen in vier Themen.
import * as THREE from 'three';
import { toon, flat, box, sphere, cyl, cone, LAYER_SKY, LAYER_FX } from './toon.js';
import { World, NavGrid } from './world.js';

export const THEMES = ['vorstadt', 'schulhof', 'supermarkt', 'akw'];
export const THEME_NAMES = { vorstadt: 'VORSTADT', schulhof: 'SCHULHOF', supermarkt: 'SUPERMARKT', akw: 'ATOMKRAFTWERK' };

export const HALF_X = 17, HALF_Z = 27;
export const SPAWN_Z = 17;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Texturen ----------
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
const texCache = {};
function tex(name) {
  if (texCache[name]) return texCache[name];
  const T = {
    grass: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#7fd05a'; g.fillRect(0, 0, w, h); g.fillStyle = '#74c451'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 16, w, 8); }, [6, 10]),
    asphalt: () => canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8d8e9c'; g.fillRect(0, 0, w, h); g.fillStyle = '#85869a'; for (let i = 0; i < 60; i++) g.fillRect((i * 97) % w, (i * 57) % h, 6, 6); }, [4, 6]),
    tiles: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f2ecdc'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8e8f0'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); }, [18, 28]),
    concrete: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#bdb9a7'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a9a594'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [9, 14]),
    planks: () => canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#b97a45'; g.fillRect(0, 0, w, h); g.fillStyle = '#9c6536'; for (let i = 0; i < 8; i++) g.fillRect(i * 16, 0, 3, h); }, [20, 1]),
    brick: () => canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c7513d'; for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) g.fillRect(c * 32 + (r % 2) * 16 + 2, r * 16 + 2, 28, 12); }, [30, 3]),
    wallpaper: () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#ffd6a8'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff9f8a'; g.fillRect(0, 44, w, 20); g.fillStyle = '#ffffff'; g.fillRect(0, 40, w, 4); }, [30, 1]),
    hazard: () => canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#c9c5b3'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd83a'; g.fillRect(0, h - 10, w, 10); g.fillStyle = '#16121f'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, h); g.lineTo(i * 16 + 8, h); g.lineTo(i * 16 + 16, h - 10); g.lineTo(i * 16 + 8, h - 10); g.fill(); } }, [20, 1]),
    crate: () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#d69a57'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8f5a2c'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); g.beginPath(); g.moveTo(4, 4); g.lineTo(w - 4, h - 4); g.stroke(); }),
  };
  return (texCache[name] = T[name]());
}

// ---------- Bauteile ----------
function roofPrism(w, d, h, color) {
  const shape = new THREE.Shape(); shape.moveTo(-w / 2 - 0.3, 0); shape.lineTo(w / 2 + 0.3, 0); shape.lineTo(0, h); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false }); g.translate(0, 0, -(d + 0.6) / 2);
  return new THREE.Mesh(g, toon(color));
}
function wedge(len, height, width, color) {
  // Rampe entlang +X ansteigend
  const s = new THREE.Shape(); s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, height); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false }); g.translate(0, 0, -width / 2);
  return new THREE.Mesh(g, toon(color));
}
function windowsOn(group, w, h, d, color = '#9fe2ff') {
  const n = Math.max(1, Math.floor(w / 1.6));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    for (const z of [d / 2 + 0.02, -d / 2 - 0.02]) group.add(box(0.8, 0.8, 0.06, color, x, h * 0.62, z));
  }
}
const PASTELS = ['#ff9fb3', '#9fd3ff', '#ffe08a', '#b7f0a5', '#d7b8ff', '#ffc38a'];

const BUILD = {
  crate(r, t, w, d, h) {
    const g = new THREE.Group();
    const m = toon('#ffffff', { map: tex('crate') });
    if (h > 1.5) { g.add(box(w, h / 2, d, m, 0, h / 4, 0)); const top = box(w * 0.9, h / 2, d * 0.9, m, 0, h * 0.75, 0); top.rotation.y = 0.15; g.add(top); }
    else g.add(box(w, h, d, m, 0, h / 2, 0));
    return g;
  },
  barrel(r, t) {
    const g = new THREE.Group();
    if (t === 'akw') {
      g.add(cyl(0.45, 0.45, 1.1, toon('#6be83a', { emissive: '#2a7a10', emissiveIntensity: 0.6 }), 0, 0.55, 0));
      g.add(cyl(0.47, 0.47, 0.1, '#2d2d2d', 0, 0.3, 0)); g.add(cyl(0.47, 0.47, 0.1, '#2d2d2d', 0, 0.85, 0));
      g.add(sphere(0.14, flat('#c8ff6a'), 0, 1.12, 0.1, 8));
    } else {
      g.add(cyl(0.45, 0.45, 1.1, '#e8412c', 0, 0.55, 0));
      g.add(cyl(0.47, 0.47, 0.16, '#ffd83a', 0, 0.62, 0));
      g.add(cyl(0.15, 0.15, 0.12, '#bbbbbb', 0.2, 1.16, 0));
    }
    return g;
  },
  low(r, t, w, d, h) {
    const g = new THREE.Group();
    if (t === 'vorstadt') {
      if (r() < 0.5) { // Hecke
        g.add(box(w, h, d, '#3fae4a', 0, h / 2, 0));
        for (let i = 0; i < Math.round(w * 1.5); i++) g.add(sphere(0.32, '#4cc257', -w / 2 + 0.3 + i * (w - 0.6) / Math.max(1, Math.round(w * 1.5) - 1), h, (r() - 0.5) * d * 0.4, 8));
      } else { // Blumenkasten
        g.add(box(w, h * 0.8, d, '#c56b3a', 0, h * 0.4, 0));
        for (let i = 0; i < 4; i++) g.add(sphere(0.2, PASTELS[i % 6], -w / 2 + 0.3 + i * (w - 0.6) / 3, h * 0.85, 0, 8));
      }
    } else if (t === 'schulhof') { // Bank
      g.add(box(w, 0.15, d * 0.8, '#3d7fd8', 0, h * 0.55, 0));
      g.add(box(w, h * 0.5, 0.15, '#3d7fd8', 0, h * 0.8, -d / 2 + 0.1));
      g.add(box(w * 0.95, h * 0.55, d * 0.6, '#2d5fa8', 0, h * 0.27, 0));
    } else if (t === 'supermarkt') { // Kasse
      g.add(box(w, h, d, '#e84a5f', 0, h / 2, 0));
      g.add(box(w * 0.95, 0.06, d * 0.8, '#2b2b2b', 0, h + 0.03, 0));
      g.add(box(0.4, 0.3, 0.4, '#d9d9d9', w / 2 - 0.3, h + 0.15, 0));
    } else { // Betonblock
      g.add(box(w, h, d, '#b3b0a2', 0, h / 2, 0));
      g.add(box(w + 0.02, 0.2, d + 0.02, '#ffd83a', 0, h - 0.25, 0));
    }
    return g;
  },
  car(r, t, w, d, h) {
    const g = new THREE.Group(), col = PASTELS[(r() * PASTELS.length) | 0];
    g.add(box(w, h * 0.55, d, col, 0, h * 0.4, 0));
    g.add(box(w * 0.55, h * 0.4, d * 0.9, '#bfe9ff', -w * 0.05, h * 0.85, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = cyl(0.33, 0.33, 0.25, '#222', sx * w * 0.32, 0.33, sz * d / 2); wh.rotation.x = Math.PI / 2; g.add(wh); }
    return g;
  },
  wall(r, t, w, d, h) {
    const g = new THREE.Group();
    if (t === 'vorstadt') {
      g.add(box(w, h, d, '#34a043', 0, h / 2, 0));
      for (let i = 0; i < Math.round(w * 1.2); i++) g.add(sphere(0.38, '#42b851', -w / 2 + 0.35 + i * (w - 0.7) / Math.max(1, Math.round(w * 1.2) - 1), h, 0, 8));
    } else if (t === 'schulhof') { // Spinde
      const n = Math.max(2, Math.round(w / 0.6));
      for (let i = 0; i < n; i++) g.add(box(w / n - 0.03, h, d, i % 2 ? '#3f86e0' : '#3577c9', -w / 2 + (i + 0.5) * w / n, h / 2, 0));
      for (let i = 0; i < n; i++) for (const s of [1, -1]) g.add(box(0.2, 0.06, 0.02, '#16121f', -w / 2 + (i + 0.5) * w / n, h * 0.8, s * (d / 2 + 0.01)));
    } else if (t === 'supermarkt') { // Regal
      g.add(box(w, h, d * 0.3, '#9aa0ad', 0, h / 2, 0));
      g.add(box(w, 0.1, d, '#7e8594', 0, 0.05, 0));
      for (let lv = 0; lv < 4; lv++) {
        const y = 0.2 + lv * (h - 0.3) / 4;
        g.add(box(w, 0.06, d, '#c5cad3', 0, y, 0));
        for (let i = 0; i < Math.round(w * 2); i++) {
          const hh = 0.2 + r() * 0.25;
          for (const s of [1, -1]) g.add(box(0.36, hh, 0.3, PASTELS[(r() * 6) | 0], -w / 2 + 0.25 + i * 0.5, y + 0.03 + hh / 2, s * d * 0.3));
        }
      }
    } else { // Rohre
      g.add(box(w, h, d * 0.4, '#8f96a3', 0, h / 2, 0));
      for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const p = cyl(0.2, 0.2, w, i === 1 ? '#e36b2d' : '#c9ced6', 0, 0.5 + i * 0.75, s * d * 0.3); p.rotation.z = Math.PI / 2; g.add(p); }
    }
    return g;
  },
  fence(r, t, w, d, h) {
    const g = new THREE.Group();
    const col = { vorstadt: '#ffffff', schulhof: '#e6e1d3', supermarkt: '#ff6fa8', akw: '#9aa3ad' }[t];
    if (t === 'supermarkt') { // Aufsteller aus Pappe
      g.add(box(w, h, d, col, 0, h / 2, 0));
      g.add(box(w * 0.7, h * 0.35, d + 0.02, '#ffd83a', 0, h * 0.6, 0));
      return g;
    }
    const n = Math.max(3, Math.round(w / 0.35));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * w / n;
      g.add(box(0.2, h, d, col, x, h / 2, 0));
      if (t === 'vorstadt') g.add(cone(0.14, 0.25, col, x, h + 0.12, 0, 4));
    }
    g.add(box(w, 0.12, d + 0.04, col, 0, h * 0.3, 0)); g.add(box(w, 0.12, d + 0.04, col, 0, h * 0.75, 0));
    return g;
  },
  big(r, t, w, d, h) {
    const g = new THREE.Group();
    if (t === 'vorstadt') { // Haus
      const col = PASTELS[(r() * PASTELS.length) | 0];
      g.add(box(w, h * 0.7, d, col, 0, h * 0.35, 0));
      const roof = roofPrism(w, d, h * 0.35, '#b8423a'); roof.position.y = h * 0.7; g.add(roof);
      windowsOn(g, w, h * 0.7, d);
      g.add(box(0.7, 1.3, 0.06, '#7a4a2a', w * 0.25, 0.65, d / 2 + 0.03));
    } else if (t === 'schulhof') {
      if (d > w * 1.4 || w > d * 1.4) { // Schulbus
        g.add(box(w, h * 0.8, d, '#ffc21a', 0, h * 0.45, 0));
        g.add(box(w + 0.02, h * 0.22, d * 0.8, '#1f1f2b', 0, h * 0.62, 0));
        g.add(box(w + 0.04, 0.1, d, '#16121f', 0, h * 0.35, 0));
        for (const sx of [-1, 1]) for (const sz of [-0.35, 0.35]) { const wh = cyl(0.45, 0.45, 0.3, '#222', sx * w / 2, 0.45, sz * d); wh.rotation.z = Math.PI / 2; g.add(wh); }
      } else { // Container-Klassenzimmer
        g.add(box(w, h * 0.85, d, '#efe3c2', 0, h * 0.425, 0));
        g.add(box(w + 0.2, 0.2, d + 0.2, '#8a7c62', 0, h * 0.86, 0));
        windowsOn(g, w, h * 0.85, d);
      }
    } else if (t === 'supermarkt') { // Kühltruhe / Palettenstapel
      if (r() < 0.5) {
        g.add(box(w, h * 0.45, d, '#f4f7fb', 0, h * 0.225, 0));
        g.add(box(w * 0.92, 0.05, d * 0.85, '#8fdcff', 0, h * 0.45 + 0.03, 0));
        g.add(box(w, h * 0.55, 0.2, '#f4f7fb', 0, h * 0.72, 0));
        g.add(box(w * 0.9, h * 0.4, 0.22, '#bfefff', 0, h * 0.72, 0));
      } else {
        for (let yy = 0; yy < 3; yy++) g.add(box(w * (1 - yy * 0.05), h / 3 - 0.05, d * (1 - yy * 0.05), PASTELS[(r() * 6) | 0], 0, yy * h / 3 + h / 6, 0));
      }
    } else { // Container
      const col = ['#e36b2d', '#2f7fd8', '#2fa65a'][(r() * 3) | 0];
      g.add(box(w, h, d, col, 0, h / 2, 0));
      const ribs = Math.round(w / 0.5);
      for (let i = 0; i < ribs; i++) for (const s of [1, -1]) g.add(box(0.12, h * 0.9, 0.08, col, -w / 2 + (i + 0.5) * w / ribs, h / 2, s * (d / 2 + 0.03)));
    }
    return g;
  },
  platform(r, t, w, d, h) {
    const g = new THREE.Group();
    const col = { vorstadt: '#c98a4b', schulhof: '#e05a5a', supermarkt: '#8a93a6', akw: '#7d8795' }[t];
    g.add(box(w, 0.3, d, col, 0, h - 0.15, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.25, h - 0.3, 0.25, '#5a5a66', sx * (w / 2 - 0.2), (h - 0.3) / 2, sz * (d / 2 - 0.2)));
    g.add(box(w * 0.9, h - 0.3, d * 0.9, toon('#4a4a58'), 0, (h - 0.3) / 2, 0));
    return g;
  },
};

// Welche Teile es in welchem Thema gibt (Maße: w × d × h)
const PALETTE = {
  vorstadt: { big: [[4, 4, 4.2], [4.5, 3.5, 4.2]], wall: [[4.5, 0.9, 2.2], [3.5, 0.9, 2.2]], low: [[2, 1, 1.1]], fence: true, car: true, crate: true },
  schulhof: { big: [[2.6, 8, 3.1], [4, 3.5, 3.4]], wall: [[3.6, 0.7, 2.3], [4.8, 0.7, 2.3]], low: [[2.4, 1, 1.1]], fence: true, crate: true },
  supermarkt: { big: [[3.6, 2, 2.4], [2.4, 2.4, 2.4]], wall: [[6, 1.2, 2.5], [4.5, 1.2, 2.5]], low: [[2.6, 1, 1.1]], fence: true, crate: true },
  akw: { big: [[2.6, 6.2, 2.7], [3, 3, 2.7]], wall: [[5, 1, 2.4], [3.8, 1, 2.4]], low: [[2, 1.2, 1.1]], fence: true, crate: true },
};

// ---------- Planung ----------
function plan(r, theme) {
  const P = PALETTE[theme];
  const items = [];
  const rects = [];
  const clear = [{ x: 0, z: -SPAWN_Z, r: 2.8 }, { x: 0, z: 0, r: 4.2 }];
  const fits = (it, margin) => {
    const w = it.rot ? it.d : it.w, d = it.rot ? it.w : it.d;
    const minX = it.x - w / 2, maxX = it.x + w / 2, minZ = it.z - d / 2, maxZ = it.z + d / 2;
    if (minX < -HALF_X + 0.4 || maxX > HALF_X - 0.4 || minZ < -HALF_Z + 0.4 || maxZ > -0.6) return false;
    if (it.x > -w / 2 - 1 && it.x < w / 2 + 1 && Math.abs(it.z) < d / 2 + 1.5) return false; // Mitte / Spiegelnaht
    for (const c of clear) {
      const cx = Math.max(minX, Math.min(c.x, maxX)), cz = Math.max(minZ, Math.min(c.z, maxZ));
      if (Math.hypot(cx - c.x, cz - c.z) < c.r) return false;
    }
    for (const o of rects) if (minX < o.maxX + margin && maxX > o.minX - margin && minZ < o.maxZ + margin && maxZ > o.minZ - margin) return false;
    // auch gegen gespiegelte Teile prüfen
    for (const o of rects) { const m = { minX: -o.maxX, maxX: -o.minX, minZ: -o.maxZ, maxZ: -o.minZ }; if (minX < m.maxX + margin && maxX > m.minX - margin && minZ < m.maxZ + margin && maxZ > m.minZ - margin) return false; }
    return true;
  };
  const place = (kind, dims, zone, tries = 60, margin = 1.7) => {
    for (let k = 0; k < tries; k++) {
      const it = { kind, w: dims[0], d: dims[1], h: dims[2], rot: r() < 0.5, x: zone.x0 + r() * (zone.x1 - zone.x0), z: zone.z0 + r() * (zone.z1 - zone.z0) };
      if (fits(it, margin)) {
        const w = it.rot ? it.d : it.w, d = it.rot ? it.w : it.d;
        rects.push({ minX: it.x - w / 2, maxX: it.x + w / 2, minZ: it.z - d / 2, maxZ: it.z + d / 2 });
        items.push(it); return it;
      }
    }
    return null;
  };
  const pick = a => a[(r() * a.length) | 0];
  const full = { x0: -15, x1: 15, z0: -25, z1: -2 };
  // Deckung vor dem Spawn
  place(r() < 0.5 ? 'low' : 'crate', r() < 0.5 ? pick(P.low) : [1.3, 1.3, 1.3], { x0: -4, x1: 4, z0: -13.5, z1: -12 }, 40, 1.2);
  // Deckung um die Flagge
  place('low', pick(P.low), { x0: 3, x1: 7, z0: -6.5, z1: -3.5 }, 40, 1.2);
  place(r() < 0.5 ? 'crate' : 'fence', r() < 0.5 ? [1.2, 1.2, 1.2] : [3, 0.25, 1.5], { x0: -8, x1: -3, z0: -7, z1: -3 }, 40, 1.2);
  // Plattform mit Rampe
  const plat = place('platform', [3.2, 3.2, 1.9], { x0: -12, x1: 12, z0: -21, z1: -8 }, 80, 5.2);
  if (plat) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => r() - 0.5);
    for (const [dx, dz] of dirs) {
      const len = 4.2, rx = plat.x + dx * (1.6 + len / 2), rz = plat.z + dz * (1.6 + len / 2);
      const ramp = { kind: 'ramp', x: rx, z: rz, w: dx ? len : 2.2, d: dx ? 2.2 : len, h: 1.9, axis: dx ? 'x' : 'z', dir: -(dx || dz), rot: false };
      const minX = rx - ramp.w / 2, maxX = rx + ramp.w / 2, minZ = rz - ramp.d / 2, maxZ = rz + ramp.d / 2;
      if (minX < -HALF_X + 0.8 || maxX > HALF_X - 0.8 || minZ < -HALF_Z + 0.8 || maxZ > -1.5) continue;
      if (Math.hypot(rx, rz + SPAWN_Z) < 4) continue;
      rects.push({ minX, maxX, minZ, maxZ }); items.push(ramp); break;
    }
  }
  for (let i = 0; i < 2; i++) place('big', pick(P.big), full, 60, 2.2);
  for (let i = 0; i < 2; i++) place('wall', pick(P.wall), full, 60, 1.8);
  if (P.car && r() < 0.8) place('car', [3.6, 1.8, 1.45], full, 40, 1.7);
  for (let i = 0; i < 2; i++) place('crate', r() < 0.4 ? [1.3, 1.3, 2.4] : [1.3, 1.3, 1.3], full, 40, 1.5);
  place('fence', [3.2, 0.25, 1.5], full, 40, 1.6);
  for (let i = 0; i < 2; i++) place('low', pick(P.low), full, 40, 1.6);
  const nb = 1 + (r() < 0.6 ? 1 : 0);
  for (let i = 0; i < nb; i++) place('barrel', [0.9, 0.9, 1.1], full, 40, 1.4);
  // Rückzugsraum hinter dem Spawn: ein paar Deckungen
  place('low', pick(P.low), { x0: -12, x1: 12, z0: -25.5, z1: -20 }, 40, 1.6);
  place('crate', [1.3, 1.3, 1.3], { x0: -12, x1: 12, z0: -25.5, z1: -20 }, 40, 1.6);
  return items;
}

const DESTRUCT = { crate: 70, fence: 50, barrel: 25 };

export function buildArena(theme, seed) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const r = rng(seed + attempt * 7919);
    const items = plan(r, theme);
    const all = [...items, ...items.map(it => ({ ...it, x: -it.x, z: -it.z, dir: it.dir !== undefined ? -it.dir : undefined, mirror: true }))];
    const world = new World({ minX: -HALF_X, maxX: HALF_X, minZ: -HALF_Z, maxZ: HALF_Z });
    const cols = [];
    for (const it of all) {
      const w = it.rot ? it.d : it.w, d = it.rot ? it.w : it.d;
      const c = {
        type: it.kind === 'ramp' ? 'ramp' : 'box',
        min: { x: it.x - w / 2, y: 0, z: it.z - d / 2 }, max: { x: it.x + w / 2, y: it.h, z: it.z + d / 2 },
        axis: it.axis, dir: it.dir, kind: it.kind, item: it,
      };
      if (DESTRUCT[it.kind]) { c.hp = c.maxHp = DESTRUCT[it.kind]; c.destructible = true; }
      if (it.kind === 'barrel') c.explosive = true;
      if (it.kind === 'fence') c.noStand = true;
      world.add(c); cols.push(c);
    }
    const nav = new NavGrid(world, 0.5, 0.45);
    const ps = { x: 0, z: -SPAWN_Z }, bs = { x: 0, z: SPAWN_Z };
    if (!nav.connected(ps, bs) || !nav.connected(ps, { x: 0, z: 0 })) continue;
    return finishArena(theme, r, world, nav, cols);
  }
  throw new Error('Arena konnte nicht erzeugt werden');
}

function finishArena(theme, r, world, nav, cols) {
  const group = new THREE.Group();
  // Boden
  const groundMat = toon('#ffffff', { map: tex({ vorstadt: 'grass', schulhof: 'asphalt', supermarkt: 'tiles', akw: 'concrete' }[theme]) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2), groundMat);
  ground.rotation.x = -Math.PI / 2; group.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), toon({ vorstadt: '#6cc24a', schulhof: '#7ab85a', supermarkt: '#9c9c9c', akw: '#a8a58f' }[theme]));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; group.add(outer);
  decorateGround(group, theme, r);

  // Teile
  for (const c of cols) {
    const it = c.item;
    let obj;
    if (it.kind === 'ramp') {
      const len = it.axis === 'x' ? it.w : it.d, width = it.axis === 'x' ? it.d : it.w;
      obj = wedge(len, it.h, width, { vorstadt: '#c98a4b', schulhof: '#e05a5a', supermarkt: '#8a93a6', akw: '#7d8795' }[theme]);
      // wedge steigt entlang +X; dir=+1 heißt: steigt zur +Achse
      if (it.axis === 'x') { if (it.dir < 0) obj.rotation.y = Math.PI; }
      else obj.rotation.y = it.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      obj.position.set(it.x, 0, it.z);
      group.add(obj);
    } else {
      const builder = BUILD[it.kind] || BUILD.low;
      obj = builder(r, theme, it.w, it.d, it.h);
      obj.position.set(it.x, 0, it.z);
      if (it.rot) obj.rotation.y = Math.PI / 2;
      if (it.mirror) obj.rotation.y += Math.PI;
      group.add(obj);
    }
    c.mesh = obj;
  }

  // Außenmauer
  const wallMat = { vorstadt: toon('#ffffff', { map: tex('planks') }), schulhof: toon('#ffffff', { map: tex('brick') }), supermarkt: toon('#ffffff', { map: tex('wallpaper') }), akw: toon('#ffffff', { map: tex('hazard') }) }[theme];
  const WH = 4.2;
  for (const [x, z, w, d] of [[0, -HALF_Z - 0.5, HALF_X * 2 + 2, 1], [0, HALF_Z + 0.5, HALF_X * 2 + 2, 1], [-HALF_X - 0.5, 0, 1, HALF_Z * 2], [HALF_X + 0.5, 0, 1, HALF_Z * 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WH, d), wallMat); m.position.set(x, WH / 2, z); group.add(m);
    world.add({ type: 'box', min: { x: x - w / 2, y: 0, z: z - d / 2 }, max: { x: x + w / 2, y: WH, z: z + d / 2 }, kind: 'perimeter', noNav: true });
  }
  decorateOutside(group, theme, r);
  const sky = buildSky(theme, r); group.add(sky);

  const flag = buildFlag();
  group.add(flag.group);

  return {
    theme, group, world, nav, flag,
    spawns: { player: { x: 0, z: -SPAWN_Z, yaw: 0 }, bot: { x: 0, z: SPAWN_Z, yaw: Math.PI } },
    dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); },
  };
}

function decorateGround(g, theme, r) {
  if (theme === 'schulhof') {
    const lineMat = flat('#ffffff');
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.8, 48), lineMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
    const mid = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, 0.2), lineMat); mid.rotation.x = -Math.PI / 2; mid.position.y = 0.01; g.add(mid);
    for (const s of [1, -1]) { const k = new THREE.Mesh(new THREE.RingGeometry(5.8, 6, 48, 1, 0, Math.PI), lineMat); k.rotation.x = -Math.PI / 2; k.rotation.z = s > 0 ? Math.PI : 0; k.position.set(0, 0.01, s * HALF_Z); g.add(k); }
  } else if (theme === 'vorstadt') {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.2, HALF_Z * 2), toon('#e8e1cf')); path.rotation.x = -Math.PI / 2; path.position.y = 0.01; g.add(path);
  } else if (theme === 'akw') {
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 4.8, 6), flat('#ffd83a')); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
  }
}

function lollipopTree(x, z, s = 1) {
  const t = new THREE.Group();
  t.add(cyl(0.25 * s, 0.35 * s, 2.5 * s, '#8a5a32', 0, 1.25 * s, 0, 8));
  t.add(sphere(1.6 * s, '#3fb24d', 0, 3.4 * s, 0, 12));
  t.position.set(x, 0, z); return t;
}

function decorateOutside(g, theme, r) {
  const ring = (fn, n, rad0, rad1) => { for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = rad0 + r() * (rad1 - rad0); fn(Math.cos(a) * d * 0.75, Math.sin(a) * d); } };
  if (theme === 'vorstadt') {
    ring((x, z) => g.add(lollipopTree(x, z, 1 + r() * 0.6)), 26, 36, 70);
    ring((x, z) => { const h = BUILD.big(r, 'vorstadt', 6, 6, 6); h.position.set(x, 0, z); h.rotation.y = Math.atan2(-x, -z); g.add(h); }, 12, 50, 90);
  } else if (theme === 'schulhof') {
    const school = new THREE.Group();
    school.add(box(50, 9, 10, '#e8a86c', 0, 4.5, 0)); windowsOn(school, 50, 9, 10, '#a8e4ff');
    school.add(box(10, 3, 10.5, '#d94a3a', 0, 10, 0)); school.add(box(3, 2, 0.3, '#ffffff', 0, 10.2, 5.3));
    school.position.set(0, 0, HALF_Z + 12); g.add(school);
    ring((x, z) => g.add(lollipopTree(x, z, 1.2)), 20, 38, 70);
    const hoop = new THREE.Group(); hoop.add(cyl(0.1, 0.1, 3.2, '#555', 0, 1.6, 0)); hoop.add(box(1.8, 1.1, 0.1, '#fff', 0, 3.3, 0.3)); hoop.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 16), toon('#ff6a1f')));
    hoop.children[2].position.set(0, 2.9, 0.65); hoop.children[2].rotation.x = Math.PI / 2; hoop.position.set(0, 0, -HALF_Z - 1.2); g.add(hoop);
  } else if (theme === 'supermarkt') {
    const sign = new THREE.Group();
    const t = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#ff4fa3'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd83a'; c.font = 'bold 84px Bangers, Impact, sans-serif'; c.textAlign = 'center'; c.fillText('KAUF-O-MAT', w / 2, 96); });
    sign.add(new THREE.Mesh(new THREE.BoxGeometry(24, 6, 0.5), toon('#ffffff', { map: t })));
    sign.position.set(0, 9, HALF_Z + 4); g.add(sign);
    const sign2 = sign.clone(); sign2.position.set(0, 9, -HALF_Z - 4); sign2.rotation.y = Math.PI; g.add(sign2);
    // Hallendach-Träger als Deko
    for (let i = -3; i <= 3; i++) { const b = box(HALF_X * 2 + 4, 0.5, 0.5, '#8c93a3', 0, 7.5, i * 8); g.add(b); }
    for (let i = -3; i <= 3; i++) for (const s of [1, -1]) g.add(box(0.6, 7.5, 0.6, '#8c93a3', s * (HALF_X + 1.6), 3.75, i * 8));
  } else {
    for (const [x, z] of [[-38, 42], [34, 50], [-30, -55]]) g.add(coolingTower(x, z));
    ring((x, z) => { const c = BUILD.big(r, 'akw', 6, 12, 6); c.position.set(x, 0, z); c.rotation.y = r() * 3; g.add(c); }, 8, 38, 60);
  }
}

function coolingTower(x, z) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(9 - Math.sin(t * Math.PI * 0.9) * 3.2 + t * 0.8, t * 26)); }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), toon('#d8d6cc', { side: THREE.DoubleSide })));
  for (let i = 0; i < 5; i++) { const s = sphere(3 + i * 0.8, '#ffffff', (i % 2 ? 1.5 : -1.5), 27 + i * 3.2, 0, 12); g.add(s); }
  g.position.set(x, 0, z); return g;
}

function buildSky(theme, r) {
  const g = new THREE.Group();
  const top = new THREE.Color(theme === 'akw' ? '#8fc6e8' : '#5fb4ff'), bottom = new THREE.Color('#d8f0ff');
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: top }, bottom: { value: bottom } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.5, h)), 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), skyMat);
  sky.layers.set(LAYER_SKY); g.add(sky);
  const cloudMat = toon('#ffffff', { emissive: '#dfe9ff', emissiveIntensity: 0.4 });
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const n = 3 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) c.add(sphere(6 + r() * 5, cloudMat, (k - n / 2) * 7, r() * 3, r() * 4, 12));
    const a = r() * Math.PI * 2, d = 170 + r() * 150;
    c.position.set(Math.cos(a) * d, 60 + r() * 70, Math.sin(a) * d);
    c.lookAt(0, c.position.y, 0);
    g.add(c);
  }
  return g;
}

function buildFlag() {
  const group = new THREE.Group();
  const pole = cyl(0.07, 0.07, 3.6, '#e8e8e8', 0, 1.8, 0, 8); group.add(pole);
  group.add(sphere(0.14, '#ffd83a', 0, 3.65, 0, 8));
  const clothGeo = new THREE.PlaneGeometry(1.4, 0.9, 8, 4); clothGeo.translate(0.7, 0, 0);
  const cloth = new THREE.Mesh(clothGeo, toon('#ff3b3b', { side: THREE.DoubleSide, unique: true }));
  cloth.position.set(0.05, 3.1, 0); group.add(cloth);
  const zone = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.25, 48), flat('#ffffff', { transparent: true, opacity: 0.85 }));
  zone.rotation.x = -Math.PI / 2; zone.position.y = 0.03; zone.layers.set(LAYER_FX); group.add(zone);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(3.0, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.025; fill.layers.set(LAYER_FX); group.add(fill);
  group.visible = false;
  const base = clothGeo.attributes.position.array.slice();
  return {
    group, cloth, zone, fill,
    update(t, rise, owner) {
      group.position.y = (rise - 1) * 3.8;
      const p = clothGeo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.array[i * 3 + 2] = Math.sin(t * 6 + x * 4) * 0.12 * x; }
      p.needsUpdate = true;
      const col = owner === 'player' ? '#ff8a1f' : owner === 'bot' ? '#9aa3b5' : owner === 'both' ? '#ff3b3b' : '#ffffff';
      zone.material.color.set(col); fill.material.color.set(col);
      zone.scale.setScalar(1 + Math.sin(t * 4) * 0.02);
    },
  };
}
