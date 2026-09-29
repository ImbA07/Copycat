// Zufällige, spiegelsymmetrische Arenen in vier Themen – mit echten 3D-Modellen (Kenney, CC0).
// Jede Karte wird geprüft: In den ersten Sekunden nach dem Start kann man sich NICHT sehen.
import * as THREE from 'three';
import { toon, flat, box, rbox, sphere, cyl, cone, LAYER_SKY, LAYER_FX } from './toon.js';
import { World, NavGrid } from './world.js';
import { prop } from './assets.js';

export const THEMES = ['vorstadt', 'schulhof', 'supermarkt', 'akw'];
export const THEME_NAMES = { vorstadt: 'VORSTADT', schulhof: 'SCHULHOF', supermarkt: 'SUPERMARKT', akw: 'ATOMKRAFTWERK' };

export const HALF_X = 17, HALF_Z = 28;
export const SPAWN_Z = 20;
const SAFE_REACH = 15; // Meter Laufweg pro Seite, in dem man sich nicht sehen kann (~1,8 s Sprint je Spieler)

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
    grass: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#7fd05a'; g.fillRect(0, 0, w, h); g.fillStyle = '#74c451'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 16, w, 8); g.fillStyle = '#8ada64'; for (let i = 0; i < 40; i++) g.fillRect((i * 53) % w, (i * 97) % h, 3, 6); }, [6, 10]),
    asphalt: () => canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8d8e9c'; g.fillRect(0, 0, w, h); g.fillStyle = '#85869a'; for (let i = 0; i < 60; i++) g.fillRect((i * 97) % w, (i * 57) % h, 6, 6); g.fillStyle = '#9899a6'; for (let i = 0; i < 40; i++) g.fillRect((i * 31) % w, (i * 71) % h, 4, 4); }, [4, 6]),
    tiles: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f2ecdc'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8e8f0'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); g.strokeStyle = '#d6cfbe'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64); g.strokeRect(64, 64, 64, 64); }, [18, 28]),
    concrete: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#bdb9a7'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a9a594'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.fillStyle = '#b3af9d'; for (let i = 0; i < 30; i++) g.fillRect((i * 41) % w, (i * 67) % h, 5, 3); }, [9, 14]),
    planks: () => canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#b97a45'; g.fillRect(0, 0, w, h); g.fillStyle = '#9c6536'; for (let i = 0; i < 8; i++) g.fillRect(i * 16, 0, 3, h); g.fillStyle = '#c98a55'; g.fillRect(0, 6, w, 4); g.fillRect(0, h - 12, w, 4); }, [20, 1]),
    brick: () => canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c7513d'; for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) g.fillRect(c * 32 + (r % 2) * 16 + 2, r * 16 + 2, 28, 12); }, [30, 3]),
    wallpaper: () => canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#ffd6a8'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff9f8a'; g.fillRect(0, 44, w, 20); g.fillStyle = '#ffffff'; g.fillRect(0, 40, w, 4); }, [30, 1]),
    hazard: () => canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#c9c5b3'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd83a'; g.fillRect(0, h - 10, w, 10); g.fillStyle = '#16121f'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, h); g.lineTo(i * 16 + 8, h); g.lineTo(i * 16 + 16, h - 10); g.lineTo(i * 16 + 8, h - 10); g.fill(); } }, [20, 1]),
  };
  return (texCache[name] = T[name]());
}

// ---------- Eigene Bauteile (wo es kein passendes Modell gibt) ----------
function wedge(len, height, width, color) {
  const s = new THREE.Shape(); s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, height); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false }); g.translate(0, 0, -width / 2);
  return new THREE.Mesh(g, toon(color));
}
function windowsOn(group, w, h, d, color = '#9fe2ff') {
  const n = Math.max(1, Math.floor(w / 1.6));
  for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * (w / n); for (const z of [d / 2 + 0.02, -d / 2 - 0.02]) group.add(box(0.8, 0.8, 0.06, color, x, h * 0.62, z)); }
}
const custom = {
  hedge(r, w, d, h) {
    const g = new THREE.Group();
    g.add(box(w, h, d, '#34a043', 0, h / 2, 0));
    const n = Math.round(w * 1.3);
    for (let i = 0; i < n; i++) g.add(sphere(0.4 + r() * 0.12, '#42b851', -w / 2 + 0.35 + i * (w - 0.7) / Math.max(1, n - 1), h - 0.05, (r() - 0.5) * 0.2, 8));
    for (let i = 0; i < n; i++) g.add(sphere(0.12, PASTEL[(i * 3) % PASTEL.length], -w / 2 + 0.5 + i * (w - 1) / Math.max(1, n - 1), h * 0.5 + r() * h * 0.3, d / 2 + 0.02, 6));
    return g;
  },
  lockers(r, w, d, h) {
    const g = new THREE.Group(), n = Math.max(2, Math.round(w / 0.6));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * w / n;
      g.add(box(w / n - 0.03, h, d, i % 2 ? '#3f86e0' : '#3577c9', x, h / 2, 0));
      for (const s of [1, -1]) { g.add(box(0.2, 0.06, 0.02, '#16121f', x, h * 0.82, s * (d / 2 + 0.01))); for (let v = 0; v < 3; v++) g.add(box(0.28, 0.02, 0.02, '#2a5aa0', x, h * 0.62 - v * 0.06, s * (d / 2 + 0.01))); }
    }
    g.add(box(w + 0.05, 0.08, d + 0.05, '#2a5aa0', 0, h + 0.04, 0));
    return g;
  },
  pipes(r, w, d, h) {
    const g = new THREE.Group();
    g.add(box(w, h, d * 0.4, '#8f96a3', 0, h / 2, 0));
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const p = cyl(0.22, 0.22, w, i === 1 ? '#e36b2d' : '#c9ced6', 0, 0.5 + i * 0.72, s * d * 0.3); p.rotation.z = Math.PI / 2; g.add(p); }
    for (let x = -w / 2 + 0.4; x < w / 2; x += 1.6) for (const s of [1, -1]) g.add(box(0.12, h, 0.12, '#5a5a66', x, h / 2, s * d * 0.48));
    const valve = cyl(0.3, 0.3, 0.2, '#e8412c', w * 0.25, 1.95, d * 0.45); valve.rotation.x = Math.PI / 2; g.add(valve);
    return g;
  },
  concrete(r, w, d, h) {
    const g = new THREE.Group();
    g.add(box(w, h, d, '#b3b0a2', 0, h / 2, 0));
    g.add(box(w + 0.02, 0.18, d + 0.02, '#ffd83a', 0, h - 0.22, 0));
    for (let x = -w / 2 + 0.2; x < w / 2; x += 0.45) g.add(box(0.2, 0.19, d + 0.03, '#16121f', x, h - 0.22, 0));
    return g;
  },
  fence(r, w, d, h, theme) {
    const g = new THREE.Group();
    const col = { vorstadt: '#ffffff', schulhof: '#e6e1d3', supermarkt: '#ff6fa8', akw: '#9aa3ad' }[theme];
    if (theme === 'supermarkt') {
      g.add(box(w, h, d, col, 0, h / 2, 0)); g.add(box(w * 0.7, h * 0.35, d + 0.02, '#ffd83a', 0, h * 0.6, 0));
      g.add(box(w * 0.5, h * 0.12, d + 0.03, '#16121f', 0, h * 0.62, 0));
      return g;
    }
    const n = Math.max(3, Math.round(w / 0.35));
    for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; g.add(box(0.2, h, d, col, x, h / 2, 0)); if (theme === 'vorstadt') g.add(cone(0.14, 0.25, col, x, h + 0.12, 0, 4)); }
    g.add(box(w, 0.12, d + 0.04, col, 0, h * 0.3, 0)); g.add(box(w, 0.12, d + 0.04, col, 0, h * 0.75, 0));
    return g;
  },
  toxic(r) {
    const g = new THREE.Group();
    g.add(cyl(0.42, 0.42, 1.1, toon('#6be83a', { emissive: '#2a7a10', emissiveIntensity: 0.6 }), 0, 0.55, 0));
    g.add(cyl(0.44, 0.44, 0.1, '#2d2d2d', 0, 0.3, 0)); g.add(cyl(0.44, 0.44, 0.1, '#2d2d2d', 0, 0.85, 0));
    g.add(sphere(0.12, flat('#c8ff6a'), 0, 1.1, 0.1, 8));
    return g;
  },
  bus(r, w, d, h) {
    const g = new THREE.Group();
    g.add(box(w, h * 0.8, d, '#ffc21a', 0, h * 0.45, 0));
    g.add(box(w + 0.02, h * 0.22, d * 0.8, '#1f1f2b', 0, h * 0.62, 0));
    g.add(box(w + 0.04, 0.1, d, '#16121f', 0, h * 0.35, 0));
    g.add(box(w * 0.9, 0.3, 0.1, '#16121f', 0, h * 0.2, d / 2));
    for (const sx of [-1, 1]) for (const sz of [-0.35, 0.35]) { const wh = cyl(0.45, 0.45, 0.3, '#222', sx * w / 2, 0.45, sz * d); wh.rotation.z = Math.PI / 2; g.add(wh); }
    return g;
  },
  platform(r, w, d, h, theme) {
    const g = new THREE.Group();
    const col = { vorstadt: '#c98a4b', schulhof: '#e05a5a', supermarkt: '#8a93a6', akw: '#7d8795' }[theme];
    g.add(box(w, 0.3, d, col, 0, h - 0.15, 0));
    for (let x = -w / 2 + 0.25; x < w / 2; x += 0.5) g.add(box(0.06, 0.02, d, '#5a4a3a', x, h + 0.01, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.25, h - 0.3, 0.25, '#5a5a66', sx * (w / 2 - 0.2), (h - 0.3) / 2, sz * (d / 2 - 0.2)));
    g.add(box(w * 0.9, h - 0.3, d * 0.9, toon('#4a4a58'), 0, (h - 0.3) / 2, 0));
    return g;
  },
};
function stepBox(r, w, d, h, theme) {
  const g = new THREE.Group();
  const col = { vorstadt: ['#c98a4b', '#8f5a2c'], schulhof: ['#3d7fd8', '#2a5aa0'], supermarkt: ['#caa06a', '#8a6a42'], akw: ['#b3b0a2', '#ffd83a'] }[theme];
  if (theme === 'schulhof') { for (let i = 0; i < 4; i++) g.add(rbox(w - i * 0.02, h / 4 - 0.02, d - i * 0.02, i % 2 ? col[0] : col[1], 0, h / 8 + i * h / 4, 0, 0.08)); return g; }
  if (theme === 'supermarkt') { g.add(box(w, 0.15, d, col[1], 0, 0.075, 0)); for (let i = 0; i < 4; i++) g.add(rbox(w / 2 - 0.04, h - 0.2, d / 2 - 0.04, i % 2 ? '#d9b07a' : '#e8c48e', (i % 2 - 0.5) * w / 2, 0.15 + (h - 0.2) / 2, ((i >> 1) - 0.5) * d / 2, 0.03)); return g; }
  g.add(rbox(w, h, d, col[0], 0, h / 2, 0, 0.05));
  for (const y of [0.15, h - 0.15]) g.add(box(w + 0.02, 0.12, d + 0.02, col[1], 0, y, 0));
  const brace = box(w * 1.2, 0.1, 0.06, col[1], 0, h / 2, d / 2 + 0.01); brace.rotation.z = Math.atan2(h - 0.3, w); g.add(brace);
  return g;
}
const STAIR_COL = { vorstadt: ['#c98a4b', '#a86e38'], schulhof: ['#e05a5a', '#b84444'], supermarkt: ['#9aa3b5', '#7b8496'], akw: ['#ffcf3a', '#7d8795'] };
function stairs(it, theme) {
  const g = new THREE.Group(), [c1, c2] = STAIR_COL[theme];
  const len = it.axis === 'x' ? it.fw : it.fd, wid = it.axis === 'x' ? it.fd : it.fw;
  const n = Math.max(4, Math.round(it.h / 0.32)), sl = len / n;
  const inner = new THREE.Group(); g.add(inner);
  for (let i = 0; i < n; i++) {
    const h = it.h * (i + 1) / n;
    inner.add(box(sl + 0.01, 0.12, wid, i % 2 ? c1 : c2, -len / 2 + sl * (i + 0.5), h - 0.06, 0));
    inner.add(box(sl + 0.01, h - 0.12, wid * 0.9, '#5a5a66', -len / 2 + sl * (i + 0.5), (h - 0.12) / 2, 0));
  }
  for (const sz of [-1, 1]) { const rail = box(len * 1.05, 0.06, 0.06, '#3a3440', 0, 0, sz * wid / 2); rail.position.y = it.h / 2 + 0.9; rail.rotation.z = Math.atan2(it.h, len); inner.add(rail); }
  // steigt entlang +X; dir > 0 heißt: steigt zur +Achse
  if (it.axis === 'x') { if (it.dir < 0) inner.rotation.y = Math.PI; } else inner.rotation.y = it.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  g.position.set(it.x, 0, it.z);
  return g;
}
function bridge(it, theme) {
  const g = new THREE.Group(), [c1, c2] = STAIR_COL[theme];
  const alongX = it.fw > it.fd, L = alongX ? it.fw : it.fd, W = alongX ? it.fd : it.fw;
  const inner = new THREE.Group(); g.add(inner); if (!alongX) inner.rotation.y = Math.PI / 2;
  const n = Math.max(3, Math.round(L / 0.45));
  for (let i = 0; i < n; i++) inner.add(box(L / n - 0.04, 0.12, W, i % 2 ? c1 : c2, -L / 2 + (i + 0.5) * L / n, -0.08, 0));
  inner.add(box(L, 0.1, 0.1, '#3a3440', 0, -0.2, W / 2 - 0.05)); inner.add(box(L, 0.1, 0.1, '#3a3440', 0, -0.2, -W / 2 + 0.05));
  for (const sz of [-1, 1]) { inner.add(box(L, 0.05, 0.05, '#3a3440', 0, 0.85, sz * W / 2)); for (let x = -L / 2; x <= L / 2 + 0.01; x += L / Math.ceil(L / 1.2)) inner.add(box(0.05, 0.85, 0.05, '#3a3440', x, 0.42, sz * W / 2)); }
  g.position.set(it.x, it.h, it.z);
  return g;
}
const PASTEL = ['#ff9fb3', '#9fd3ff', '#ffe08a', '#b7f0a5', '#d7b8ff', '#ffc38a'];

// Stapel aus zwei Stufen (1,3 m und 2,4 m hoch) – wie eine kleine Treppe zum Hochspringen
function stackOf(r, w, d, h, theme) {
  const g = new THREE.Group();
  const a = stepBox(r, w / 2, d, 1.2, theme); a.position.x = -w / 4; g.add(a);
  const b = stepBox(r, w / 2, d, 1.2, theme); b.position.x = w / 4; g.add(b);
  const c = stepBox(r, w / 2, d, 1.2, theme); c.position.set(w / 4, 1.2, 0); g.add(c);
  return g;
}
// ---------- Katalog je Thema ----------
// Jeder Eintrag erzeugt {obj, w, d, h} (w = Breite in x, d = Tiefe in z, Höhe h). Modelle stehen mittig auf y=0.
const M = (name, opt, extra = {}) => r => { const o = prop(name, opt); const s = o.userData.size; return { obj: o, w: s.x, d: s.z, h: s.y, ...extra }; };
const C = (fn, w, d, h, extra = {}) => (r, theme) => ({ obj: fn(r, w, d, h, theme), w, d, h, ...extra });
const tinted = (name, opt, color) => r => { const o = prop(name, opt); o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.set(color); } }); const s = o.userData.size; return { obj: o, w: s.x, d: s.z, h: s.y }; };
const row = (names, n, opt) => r => {
  const g = new THREE.Group(); let w = 0, d = 0, h = 0; const parts = [];
  for (let i = 0; i < n; i++) { const o = prop(names[i % names.length], opt); parts.push(o); w += o.userData.size.x; d = Math.max(d, o.userData.size.z); h = Math.max(h, o.userData.size.y); }
  let x = -w / 2; for (const o of parts) { o.position.x = x + o.userData.size.x / 2; x += o.userData.size.x; g.add(o); }
  return { obj: g, w, d, h };
};
const SHELVES = ['mini-market/shelf-boxes', 'mini-market/shelf-bags'];
const CATALOG = {
  vorstadt: {
    big: ['building-type-a', 'building-type-c', 'building-type-f', 'building-type-h', 'building-type-d'].map(n => M('city-kit-suburban/' + n, { length: 6.4 }, { noClimb: true })),
    car: ['sedan', 'suv', 'hatchback-sports', 'van', 'taxi', 'police'].map(n => M('car-kit/' + n, { length: 4.4 }, { shape: 'car' })),
    wall: [C(custom.hedge, 4.4, 1.0, 2.3), C(custom.hedge, 3.6, 1.0, 2.3)],
    low: [M('city-kit-suburban/planter', { width: 2.3 }), C(custom.concrete, 2.2, 1.0, 1.1)],
    crate: [M('furniture/cardboardBoxClosed', { height: 1.25 })],
    barrel: [tinted('survival-kit/barrel', { height: 1.15 }, '#ff8a80')],
    fence: [C(custom.fence, 3.2, 0.25, 1.5)],
    stack: [C(stackOf, 2.6, 1.3, 2.4)],
  },
  schulhof: {
    big: [M('car-kit/garbage-truck', { length: 6.6 }), M('car-kit/delivery', { length: 6.2 }), M('car-kit/truck', { length: 6.2 }), C(custom.bus, 2.6, 8, 3.1)],
    car: ['van', 'sedan', 'suv'].map(n => M('car-kit/' + n, { length: 4.4 }, { shape: 'car' })),
    wall: [C(custom.lockers, 3.6, 0.7, 2.3), C(custom.lockers, 4.8, 0.7, 2.3)],
    low: [M('furniture/bench', { width: 2.4 }), C(custom.concrete, 2.2, 1.0, 1.1)],
    crate: [M('furniture/cardboardBoxClosed', { height: 1.25 })],
    barrel: [tinted('survival-kit/barrel', { height: 1.15 }, '#ff8a80')],
    fence: [C(custom.fence, 3.2, 0.25, 1.5)],
    stack: [C(stackOf, 2.6, 1.3, 2.4)],
  },
  supermarkt: {
    big: [row(['mini-market/freezers-standing'], 2, { height: 2.7 }), row(SHELVES, 3, { height: 2.5 }), row(['mini-market/shelf-bags', 'mini-market/shelf-boxes'], 3, { height: 2.5 })],
    car: [M('mini-market/freezer', { height: 1.2 }), M('mini-market/display-bread', { height: 1.3 })],
    wall: [row(SHELVES, 2, { height: 2.5 }), row(['mini-market/shelf-bags', 'mini-market/shelf-boxes'], 2, { height: 2.5 })],
    low: [M('mini-market/cash-register', { height: 1.2 }), M('mini-market/display-fruit', { height: 1.2 }), M('mini-market/freezer', { height: 1.05 })],
    crate: [M('furniture/cardboardBoxClosed', { height: 1.25 })],
    barrel: [tinted('survival-kit/barrel', { height: 1.15 }, '#ff8a80')],
    fence: [C(custom.fence, 3.0, 0.25, 1.5)],
    stack: [C(stackOf, 2.6, 1.3, 2.4)],
  },
  akw: {
    big: ['a', 'b', 'c'].map(n => M('city-kit-industrial/shipping-container-' + n, { length: 6.6 })).concat([M('city-kit-industrial/detail-tank-large', { length: 4.8 })]),
    car: [M('city-kit-industrial/detail-tank', { length: 3.4 })],
    wall: [C(custom.pipes, 5, 1.0, 2.4), C(custom.pipes, 3.8, 1.0, 2.4)],
    low: [C(custom.concrete, 2.2, 1.2, 1.1)],
    crate: [M('survival-kit/box', { height: 1.25 })],
    barrel: [C(custom.toxic, 0.84, 0.84, 1.1)],
    fence: [C(custom.fence, 3.2, 0.25, 1.5)],
    stack: [C(stackOf, 2.6, 1.3, 2.4)],
  },
};

// ---------- Planung ----------
function plan(r, theme) {
  const cat = CATALOG[theme];
  const items = [], rects = [];
  const clear = [{ x: 0, z: -SPAWN_Z, r: 2.6 }, { x: 0, z: 0, r: 4.4 }];
  const rectOf = it => ({ minX: it.x - it.fw / 2, maxX: it.x + it.fw / 2, minZ: it.z - it.fd / 2, maxZ: it.z + it.fd / 2 });
  const overl = (a, b, m) => a.minX < b.maxX + m && a.maxX > b.minX - m && a.minZ < b.maxZ + m && a.maxZ > b.minZ - m;
  const fits = (it, margin) => {
    const R = rectOf(it);
    if (R.minX < -HALF_X + 0.4 || R.maxX > HALF_X - 0.4 || R.minZ < -HALF_Z + 0.4 || R.maxZ > -0.8) return false;
    for (const c of clear) { const cx = Math.max(R.minX, Math.min(c.x, R.maxX)), cz = Math.max(R.minZ, Math.min(c.z, R.maxZ)); if (Math.hypot(cx - c.x, cz - c.z) < c.r) return false; }
    for (const o of rects) { if (overl(R, o, margin)) return false; if (overl(R, { minX: -o.maxX, maxX: -o.minX, minZ: -o.maxZ, maxZ: -o.minZ }, margin)) return false; }
    return true;
  };
  const place = (kind, zone, { tries = 60, margin = 1.7, rot = null, minH = 0 } = {}) => {
    if (!cat[kind]) return null;
    const list = cat[kind];
    for (let k = 0; k < tries; k++) {
      const make = list[(r() * list.length) | 0];
      const it = { kind, make, rot: r() < 0.5, x: zone.x0 + r() * (zone.x1 - zone.x0), z: zone.z0 + r() * (zone.z1 - zone.z0), seed: (r() * 1e9) | 0 };
      if (!dimCache.has(make)) { const p = make(rng(1), theme); dimCache.set(make, { w: p.w, d: p.d, h: p.h, shape: p.shape, noClimb: p.noClimb }); }
      Object.assign(it, dimCache.get(make));
      if (it.h < minH) continue;
      if (rot === 'wide') it.rot = it.w < it.d; else if (rot !== null) it.rot = rot;
      it.fw = it.rot ? it.d : it.w; it.fd = it.rot ? it.w : it.d;
      if (fits(it, margin)) { rects.push(rectOf(it)); items.push(it); return it; }
    }
    return null;
  };
  // 1) Sichtschutz in der Mitte (quer), damit man sich nicht quer über die Flagge sofort sieht
  place('big', { x0: -3, x1: 3, z0: -9, z1: -6.5 }, { rot: 'wide', margin: 1.4, tries: 80 }) || place('wall', { x0: -3, x1: 3, z0: -8, z1: -6.5 }, { rot: 'wide', margin: 1.4 });
  // 2) Sichtschutz vor dem Spawn
  place(r() < 0.5 ? 'big' : 'car', { x0: -3, x1: 3, z0: -15.5, z1: -13.5 }, { rot: 'wide', margin: 1.5, tries: 80 });
  // 3) Seitliche Deckung auf den Flanken
  place('wall', { x0: -15, x1: -8, z0: -12, z1: -4 }, { margin: 1.6 });
  place('wall', { x0: 8, x1: 15, z0: -12, z1: -4 }, { margin: 1.6 });
  // 4) Plattformen mit Rampe (eine normale, eine hohe Aussichtsplattform)
  const placePlatform = (zone, h, size, len) => {
    const plat = { kind: 'platform', make: C(custom.platform, size, size, h), rot: false, w: size, d: size, h, fw: size, fd: size };
    for (let k = 0; k < 60; k++) {
      plat.x = zone.x0 + r() * (zone.x1 - zone.x0); plat.z = zone.z0 + r() * (zone.z1 - zone.z0);
      if (!fits(plat, 4)) continue;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => r() - 0.5);
      for (const [dx, dz] of dirs) {
        const rx = plat.x + dx * (size / 2 + len / 2), rz = plat.z + dz * (size / 2 + len / 2);
        const ramp = { kind: 'ramp', x: rx, z: rz, w: dx ? len : 2.2, d: dx ? 2.2 : len, h, axis: dx ? 'x' : 'z', dir: -(dx || dz), rot: false };
        ramp.fw = ramp.w; ramp.fd = ramp.d;
        const Rr = rectOf(ramp);
        if (Rr.minX < -HALF_X + 0.8 || Rr.maxX > HALF_X - 0.8 || Rr.minZ < -HALF_Z + 0.8 || Rr.maxZ > -1.5 || Math.hypot(rx, rz + SPAWN_Z) < 4) continue;
        if (rects.some(o => overl(Rr, o, 1.2))) continue;
        rects.push(rectOf(plat), Rr); items.push(plat, ramp); return plat;
      }
    }
    return null;
  };
  placePlatform({ x0: -12, x1: 12, z0: -22, z1: -8 }, 1.9, 3.2, 4.2);
  // Objekt direkt neben ein anderes stellen (für Treppen)
  const tryAdd = (it, margin, own) => {
    const Rr = rectOf(it);
    if (Rr.minX < -HALF_X + 0.4 || Rr.maxX > HALF_X - 0.4 || Rr.minZ < -HALF_Z + 0.4 || Rr.maxZ > -0.8) return false;
    for (const c of clear) { const cx = Math.max(Rr.minX, Math.min(c.x, Rr.maxX)), cz = Math.max(Rr.minZ, Math.min(c.z, Rr.maxZ)); if (Math.hypot(cx - c.x, cz - c.z) < c.r) return false; }
    for (const o of rects) { if (o !== own && overl(Rr, o, margin)) return false; if (overl(Rr, { minX: -o.maxX, maxX: -o.minX, minZ: -o.maxZ, maxZ: -o.minZ }, margin)) return false; }
    rects.push(Rr); items.push(it); return true;
  };
  const rectFor = it => rects.find(o => Math.abs((o.minX + o.maxX) / 2 - it.x) < 1e-6 && Math.abs((o.minZ + o.maxZ) / 2 - it.z) < 1e-6);
  return { items, place, tryAdd, rectFor, placePlatform };
}

// Treppen an hohe Objekte + Stege zwischen gleich hohen Dächern -> mehr Ebenen zum Draufspringen
function addAccess(items, tryAdd, rectFor, r) {
  const tall = items.filter(it => ['big', 'wall', 'platform'].includes(it.kind) && !it.noClimb && it.h >= 2.2 && it.h <= 3.4);
  for (const it of tall) {
    if (it.kind === 'platform' || r() < 0.25) continue;
    const own = rectFor(it); if (!own) continue;
    const len = it.h * 1.75, wid = 1.4;
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => r() - 0.5);
    for (const [dx, dz] of sides) {
      const along = dx ? it.fd : it.fw; if (along < wid + 0.2) continue;
      const off = (r() - 0.5) * (along - wid);
      const st = { kind: 'stairs', h: it.h, rot: false, axis: dx ? 'x' : 'z', dir: -(dx || dz) };
      st.fw = dx ? len : wid; st.fd = dx ? wid : len; st.w = st.fw; st.d = st.fd;
      st.x = dx ? (dx > 0 ? own.maxX + len / 2 : own.minX - len / 2) : it.x + off;
      st.z = dz ? (dz > 0 ? own.maxZ + len / 2 : own.minZ - len / 2) : it.z + off;
      if (tryAdd(st, 0.9, own)) break;
    }
  }
  // Sprung-Stufen: stabile Kiste neben hohen Objekten (per Sprung + Hochziehen erreichbar)
  for (const it of items.filter(i => ['big', 'wall', 'car'].includes(i.kind) && !i.noClimb && i.h > 2.35 && i.h <= 3.4)) {
    const own = rectFor(it); if (!own) continue;
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => r() - 0.5);
    for (const [dx, dz] of sides) {
      const sz = 1.3, st = { kind: 'step', h: 1.3, rot: false, fw: sz, fd: sz, w: sz, d: sz };
      const along = dx ? it.fd : it.fw; if (along < sz) continue;
      const off = (r() - 0.5) * (along - sz);
      st.x = dx ? (dx > 0 ? own.maxX + sz / 2 : own.minX - sz / 2) : it.x + off;
      st.z = dz ? (dz > 0 ? own.maxZ + sz / 2 : own.minZ - sz / 2) : it.z + off;
      if (tryAdd(st, 0.9, own)) break;
    }
  }
  // Stege zwischen zwei hohen Flächen (nur wenn man bequem darunter durchlaufen kann)
  const tops = items.filter(it => ['big', 'wall', 'platform'].includes(it.kind) && !it.noClimb && it.h >= 2.5 && it.h <= 3.4);
  let bridges = 0;
  for (let i = 0; i < tops.length && bridges < 2; i++) for (let j = i + 1; j < tops.length && bridges < 2; j++) {
    const A = rectFor(tops[i]), B = rectFor(tops[j]); if (!A || !B) continue;
    const h = Math.min(tops[i].h, tops[j].h); if (Math.abs(tops[i].h - tops[j].h) > 0.4) continue;
    const ox0 = Math.max(A.minX, B.minX), ox1 = Math.min(A.maxX, B.maxX), oz0 = Math.max(A.minZ, B.minZ), oz1 = Math.min(A.maxZ, B.maxZ);
    let br = null;
    if (ox1 - ox0 >= 1.4) { const gap = B.minZ > A.maxZ ? [A.maxZ, B.minZ] : A.minZ > B.maxZ ? [B.maxZ, A.minZ] : null; if (gap && gap[1] - gap[0] >= 1.5 && gap[1] - gap[0] <= 8) br = { x: (ox0 + ox1) / 2, z: (gap[0] + gap[1]) / 2, fw: 1.4, fd: gap[1] - gap[0] + 0.4 }; }
    else if (oz1 - oz0 >= 1.4) { const gap = B.minX > A.maxX ? [A.maxX, B.minX] : A.minX > B.maxX ? [B.maxX, A.minX] : null; if (gap && gap[1] - gap[0] >= 1.5 && gap[1] - gap[0] <= 8) br = { x: (gap[0] + gap[1]) / 2, z: (oz0 + oz1) / 2, fw: gap[1] - gap[0] + 0.4, fd: 1.4 }; }
    if (!br) continue;
    const it = { kind: 'bridge', ...br, w: br.fw, d: br.fd, h, rot: false };
    const Rr = { minX: it.x - it.fw / 2, maxX: it.x + it.fw / 2, minZ: it.z - it.fd / 2, maxZ: it.z + it.fd / 2 };
    if (Rr.maxZ > -0.8) continue;
    items.push(it); bridges++;
  }
}

function fillArena(place) {
  const r = Math.random;
  const full = { x0: -15, x1: 15, z0: -26, z1: -2 };
  place('big', full, { margin: 2.2 });
  if (r() < 0.8) place('car', full, { margin: 1.8 });
  place('car', full, { margin: 1.8 });
  for (let i = 0; i < 3; i++) place('crate', full, { margin: 1.5 });
  for (let i = 0; i < 2; i++) place('stack', full, { margin: 1.5 });
  place('fence', full, { margin: 1.6 });
  for (let i = 0; i < 2; i++) place('low', full, { margin: 1.6 });
  place('low', { x0: 2.5, x1: 7, z0: -6.5, z1: -3.5 }, { margin: 1.2 });
  const nb = 1 + (r() < 0.6 ? 1 : 0);
  for (let i = 0; i < nb; i++) place('barrel', full, { margin: 1.4 });
  place('low', { x0: -12, x1: 12, z0: -26.5, z1: -23 }, { margin: 1.6 });
  place('crate', { x0: -12, x1: 12, z0: -26.5, z1: -23 }, { margin: 1.6 });
}

const DESTRUCT = { crate: 70, fence: 50, barrel: 25 };
const dimCache = new Map();

function buildWorld(items) {
  const all = [...items, ...items.map(it => ({ ...it, x: -it.x, z: -it.z, dir: it.dir !== undefined ? -it.dir : undefined, mirror: true }))];
  const world = new World({ minX: -HALF_X, maxX: HALF_X, minZ: -HALF_Z, maxZ: HALF_Z });
  const cols = [];
  for (const it of all) {
    if (it.shape === 'car') {
      // Karosserie (halbe Höhe, ganze Länge) + Kabine (mittig, volle Höhe)
      const alongZ = it.fd >= it.fw, L = alongZ ? it.fd : it.fw, hb = it.h * 0.52;
      const body = { type: 'box', min: { x: it.x - it.fw / 2, y: 0, z: it.z - it.fd / 2 }, max: { x: it.x + it.fw / 2, y: hb, z: it.z + it.fd / 2 }, kind: it.kind, item: it };
      const c0 = -0.05 * L * (it.mirror ? -1 : 1), cl = L * 0.5;
      const cab = alongZ
        ? { type: 'box', min: { x: it.x - it.fw / 2 + 0.1, y: hb, z: it.z + c0 - cl / 2 }, max: { x: it.x + it.fw / 2 - 0.1, y: it.h, z: it.z + c0 + cl / 2 }, kind: it.kind, item: it, sub: true }
        : { type: 'box', min: { x: it.x + c0 - cl / 2, y: hb, z: it.z - it.fd / 2 + 0.1 }, max: { x: it.x + c0 + cl / 2, y: it.h, z: it.z + it.fd / 2 - 0.1 }, kind: it.kind, item: it, sub: true };
      world.add(body); world.add(cab); cols.push(body, cab);
      continue;
    }
    if (it.kind === 'stack') {
      const alongX = !it.rot, sgn = it.mirror ? -1 : 1;
      const halves = alongX
        ? [[it.x - sgn * it.fw / 4, it.fw / 2, it.fd, 1.2], [it.x + sgn * it.fw / 4, it.fw / 2, it.fd, 2.4]]
        : [[it.x, it.fw, it.fd / 2, 1.2, it.z + sgn * it.fd / 4], [it.x, it.fw, it.fd / 2, 2.4, it.z - sgn * it.fd / 4]];
      for (const [x, w, d, h, z] of halves) { const zz = z ?? it.z; const c = { type: 'box', min: { x: x - w / 2, y: 0, z: zz - d / 2 }, max: { x: x + w / 2, y: h, z: zz + d / 2 }, kind: 'stack', item: it }; world.add(c); cols.push(c); }
      continue;
    }
    if (it.kind === 'bridge') {
      const c = { type: 'box', min: { x: it.x - it.fw / 2, y: it.h - 0.2, z: it.z - it.fd / 2 }, max: { x: it.x + it.fw / 2, y: it.h, z: it.z + it.fd / 2 }, kind: 'bridge', item: it, overhead: true };
      world.add(c); cols.push(c); continue;
    }
    const c = {
      type: it.kind === 'ramp' || it.kind === 'stairs' ? 'ramp' : 'box',
      min: { x: it.x - it.fw / 2, y: 0, z: it.z - it.fd / 2 }, max: { x: it.x + it.fw / 2, y: it.h, z: it.z + it.fd / 2 },
      axis: it.axis, dir: it.dir, kind: it.kind, item: it,
    };
    if (DESTRUCT[it.kind]) { c.hp = c.maxHp = DESTRUCT[it.kind]; c.destructible = true; }
    if (it.kind === 'barrel') c.explosive = true;
    if (it.kind === 'fence') c.noStand = true;
    world.add(c); cols.push(c);
  }
  for (const [x, z, w, d] of [[0, -HALF_Z - 0.5, HALF_X * 2 + 2, 1], [0, HALF_Z + 0.5, HALF_X * 2 + 2, 1], [-HALF_X - 0.5, 0, 1, HALF_Z * 2], [HALF_X + 0.5, 0, 1, HALF_Z * 2]])
    world.add({ type: 'box', min: { x: x - w / 2, y: 0, z: z - d / 2 }, max: { x: x + w / 2, y: 4.2, z: z + d / 2 }, kind: 'perimeter', perimeter: [x, z, w, d] });
  const nav = new NavGrid(world, 0.5, 0.45);
  return { world, nav, cols };
}

// Gibt eine offene Sichtlinie zwischen den Bereichen zurück, die beide Seiten in den ersten Sekunden erreichen (oder null)
function openSightline(world, nav) {
  const A = nav.reachable({ x: 0, z: -SPAWN_Z }, SAFE_REACH), B = nav.reachable({ x: 0, z: SPAWN_Z }, SAFE_REACH);
  const pick = (L, n) => { const out = []; const step = Math.max(1, Math.floor(L.length / n)); for (let i = 0; i < L.length; i += step) out.push(L[i]); return out; };
  const a = pick(A, 80), b = pick(B, 80);
  for (const p of a) for (const q of b) {
    const P = { x: p.x, y: p.y + 1.7, z: p.z }, Qp = { x: q.x, y: q.y + 1.7, z: q.z };
    if (world.lineOfSight(P, Qp)) return [P, Qp];
  }
  return null;
}

export const arenaDebug = [];
export function buildArena(theme, seed) {
  let fallback = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = rng(seed + attempt * 7919);
    const { items, place, tryAdd, rectFor, placePlatform } = plan(r, theme);
    let W = buildWorld(items);
    const ps = { x: 0, z: -SPAWN_Z }, bs = { x: 0, z: SPAWN_Z };
    let ok = false;
    for (let fix = 0; fix < 18; fix++) {
      if (!W.nav.connected(ps, bs) || !W.nav.connected(ps, { x: 0, z: 0 })) { arenaDebug.push('disconnected fix' + fix); break; }
      if (!fallback) fallback = { r, ...W };
      const line = openSightline(W.world, W.nav);
      if (!line) { ok = true; break; }
      // Hindernis auf die Sichtlinie stellen (auf Mangos Hälfte; wird für Copycat gespiegelt)
      let [P, Qp] = line; if (P.z > Qp.z) [P, Qp] = [Qp, P];
      const steep = Math.abs(Qp.z - P.z) > Math.abs(Qp.x - P.x);
      let added = null;
      for (const zc of [-9, -11, -7.5, -10, -12.5, -14, -8, -15.5, -6, -17]) {
        if (zc < P.z + 1.2 || zc > Qp.z) continue;
        const t = (zc - P.z) / ((Qp.z - P.z) || 1), xc = P.x + (Qp.x - P.x) * t;
        const zone = { x0: xc - 2, x1: xc + 2, z0: zc - 1, z1: zc + 1 };
        for (const kind of ['big', 'wall', 'car']) { added = place(kind, zone, { rot: steep ? 'wide' : null, margin: 1.0, tries: 30, minH: 2.0 }); if (added) break; }
        if (added) break;
      }
      if (!added) { arenaDebug.push(`noplace fix${fix} line ${P.x.toFixed(1)},${P.z.toFixed(1)} -> ${Qp.x.toFixed(1)},${Qp.z.toFixed(1)}`); break; }
      W = buildWorld(items);
    }
    if (!ok) continue;
    // Jetzt auffüllen (zusätzliche Objekte können Sichtlinien nur blockieren, nie öffnen)
    const base = items.length;
    fillArena(place);
    let F = buildWorld(items);
    if (!F.nav.connected(ps, bs) || !F.nav.connected(ps, { x: 0, z: 0 })) { items.length = base; F = buildWorld(items); }
    // Höhere Ebenen: hohe Plattform, Treppen, Stege – danach nochmal prüfen, ob man von oben zu früh sieht
    const base2 = items.length;
    placePlatform({ x0: -14, x1: 14, z0: -24, z1: -5 }, 2.8, 3.6, 5.6);
    addAccess(items, tryAdd, rectFor, r);
    F = buildWorld(items);
    for (let k = 0; k < 14; k++) {
      const line = F.nav.connected(ps, bs) ? openSightline(F.world, F.nav) : [{ x: 0, z: 0 }, { x: 0, z: 0 }];
      if (!line) break;
      const extra = items.slice(base2);
      if (!extra.length) break;
      // Das Zusatz-Objekt entfernen, das am nächsten an der Sichtlinie liegt
      const pts = line.map(p => p.z < 0 ? p : { x: -p.x, z: -p.z });
      let best = null, bd = Infinity;
      for (const it of extra) for (const p of pts) { const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < bd) { bd = d; best = it; } }
      const rm = [best];
      if (best.kind === 'platform' || best.kind === 'ramp') for (const it of extra) if ((it.kind === 'platform' || it.kind === 'ramp') && Math.hypot(it.x - best.x, it.z - best.z) < 6) rm.push(it);
      for (const it of rm) { const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); }
      F = buildWorld(items);
    }
    if (openSightline(F.world, F.nav) || !F.nav.connected(ps, bs)) { items.length = base2; F = buildWorld(items); }
    return Object.assign(finishArena(theme, r, F.world, F.nav, F.cols), { attempts: attempt + 1, safe: true });
  }
  const f = fallback; // sollte praktisch nie passieren
  return Object.assign(finishArena(theme, f.r, f.world, f.nav, f.cols), { attempts: 30, safe: false });
}

function finishArena(theme, r, world, nav, cols) {
  const group = new THREE.Group();
  const groundMat = toon({ vorstadt: '#e6f0dc', schulhof: '#b9bac4', supermarkt: '#e2ddd0', akw: '#b8b5a8' }[theme], { map: tex({ vorstadt: 'grass', schulhof: 'asphalt', supermarkt: 'tiles', akw: 'concrete' }[theme]), rough: 0.9 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2), groundMat);
  ground.rotation.x = -Math.PI / 2; group.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), toon({ vorstadt: '#6cc24a', schulhof: '#7ab85a', supermarkt: '#9c9c9c', akw: '#a8a58f' }[theme]));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; group.add(outer);
  decorateGround(group, theme, r);
  const built = new Map();
  for (const c of cols) {
    const it = c.item;
    if (built.has(it)) { c.mesh = built.get(it); continue; }
    let obj;
    if (it.kind === 'stairs') obj = stairs(it, theme);
    else if (it.kind === 'step') obj = stepBox(null, it.fw, it.fd, it.h, theme);
    else if (it.kind === 'bridge') obj = bridge(it, theme);
    else if (it.kind === 'ramp') {
      const len = it.axis === 'x' ? it.w : it.d, width = it.axis === 'x' ? it.d : it.w;
      obj = wedge(len, it.h, width, { vorstadt: '#c98a4b', schulhof: '#e05a5a', supermarkt: '#8a93a6', akw: '#7d8795' }[theme]);
      if (it.axis === 'x') { if (it.dir < 0) obj.rotation.y = Math.PI; } else obj.rotation.y = it.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      obj = it.make(rng(it.seed || 1), theme).obj;
      if (it.rot) obj.rotation.y = Math.PI / 2;
      if (it.mirror) obj.rotation.y += Math.PI;
    }
    if (it.kind !== 'stairs' && it.kind !== 'bridge') obj.position.set(it.x, 0, it.z);
    group.add(obj);
    c.mesh = obj; built.set(it, obj);
  }
  const wallMat = { vorstadt: toon('#ffffff', { map: tex('planks') }), schulhof: toon('#ffffff', { map: tex('brick') }), supermarkt: toon('#ffffff', { map: tex('wallpaper') }), akw: toon('#ffffff', { map: tex('hazard') }) }[theme];
  for (const c of world.colliders) if (c.perimeter) {
    const [x, z, w, d] = c.perimeter;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), wallMat); m.position.set(x, 2.1, z); group.add(m);
  }
  decorateOutside(group, theme, r);
  group.add(buildSky(theme, r));
  const flag = buildFlag();
  group.add(flag.group);
  return {
    theme, group, world, nav, flag,
    spawns: { player: { x: 0, z: -SPAWN_Z, yaw: 0 }, bot: { x: 0, z: SPAWN_Z, yaw: Math.PI } },
    dispose() { group.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); },
  };
}

function decorateGround(g, theme, r) {
  const lineMat = flat('#ffffff');
  if (theme === 'schulhof') {
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.8, 48), lineMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
    const mid = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, 0.2), lineMat); mid.rotation.x = -Math.PI / 2; mid.position.y = 0.01; g.add(mid);
    for (const s of [1, -1]) { const k = new THREE.Mesh(new THREE.RingGeometry(5.8, 6, 48, 1, 0, Math.PI), lineMat); k.rotation.x = -Math.PI / 2; k.rotation.z = s > 0 ? Math.PI : 0; k.position.set(0, 0.01, s * HALF_Z); g.add(k); }
    for (let i = 0; i < 8; i++) { const hop = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), flat(PASTEL[i % 6])); hop.rotation.x = -Math.PI / 2; hop.position.set(-12 + (i % 2) * 1, 0.012, -20 + i * 1.1); g.add(hop); }
  } else if (theme === 'vorstadt') {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.2, HALF_Z * 2), toon('#e8e1cf')); path.rotation.x = -Math.PI / 2; path.position.y = 0.01; g.add(path);
    for (let i = 0; i < 30; i++) { const f = sphere(0.08, PASTEL[i % 6], (r() - 0.5) * 32, 0.05, (r() - 0.5) * 54, 6); g.add(f); }
  } else if (theme === 'akw') {
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 4.8, 6), flat('#ffd83a')); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
    for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.3, HALF_Z * 2), flat('#ffd83a')); st.rotation.x = -Math.PI / 2; st.position.set(s * 6, 0.01, 0); g.add(st); }
  } else {
    for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, 0.15), flat('#e84a5f')); st.rotation.x = -Math.PI / 2; st.position.set(0, 0.012, s * 10); g.add(st); }
  }
}

function decorateOutside(g, theme, r) {
  const ring = (fn, n, rad0, rad1) => { for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = rad0 + r() * (rad1 - rad0); fn(Math.cos(a) * d * 0.7, Math.sin(a) * d, a); } };
  if (theme === 'vorstadt') {
    const trees = ['city-kit-suburban/tree-large', 'nature/tree_oak', 'nature/tree_detailed', 'city-kit-suburban/tree-small'];
    ring((x, z) => { const t = prop(trees[(r() * trees.length) | 0], { height: 5 + r() * 4 }); t.position.set(x, 0, z); t.rotation.y = r() * 6; g.add(t); }, 30, 36, 75);
    const houses = ['a', 'c', 'f', 'h', 'd', 'k'];
    ring((x, z) => { const h = prop('city-kit-suburban/building-type-' + houses[(r() * 6) | 0], { length: 9 }); h.position.set(x, 0, z); h.rotation.y = Math.atan2(-x, -z); g.add(h); }, 14, 48, 90);
  } else if (theme === 'schulhof') {
    const school = new THREE.Group();
    school.add(box(50, 9, 10, '#e8a86c', 0, 4.5, 0)); windowsOn(school, 50, 9, 10, '#a8e4ff');
    school.add(box(10, 3, 10.5, '#d94a3a', 0, 10, 0)); school.add(box(3, 2, 0.3, '#ffffff', 0, 10.2, 5.3));
    school.position.set(0, 0, HALF_Z + 12); g.add(school);
    ring((x, z) => { const t = prop('nature/tree_oak', { height: 6 + r() * 3 }); t.position.set(x, 0, z); g.add(t); }, 22, 38, 70);
    for (let i = 0; i < 6; i++) { const c = prop(['car-kit/sedan', 'car-kit/van', 'car-kit/suv'][i % 3], { length: 4.4 }); c.position.set(-15 + i * 6, 0, -HALF_Z - 6); c.rotation.y = Math.PI / 2; g.add(c); }
  } else if (theme === 'supermarkt') {
    const sign = new THREE.Group();
    const t = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#ff4fa3'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd83a'; c.font = 'bold 84px Bangers, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('KAUF-O-MAT', w / 2, h / 2 + 4); });
    sign.add(new THREE.Mesh(new THREE.BoxGeometry(24, 6, 0.5), toon('#ffffff', { map: t })));
    sign.position.set(0, 9, HALF_Z + 4); g.add(sign);
    const sign2 = sign.clone(); sign2.position.set(0, 9, -HALF_Z - 4); sign2.rotation.y = Math.PI; g.add(sign2);
    for (let i = -3; i <= 3; i++) g.add(box(HALF_X * 2 + 4, 0.5, 0.5, '#8c93a3', 0, 7.5, i * 8));
    for (let i = -3; i <= 3; i++) for (const s of [1, -1]) g.add(box(0.6, 7.5, 0.6, '#8c93a3', s * (HALF_X + 1.6), 3.75, i * 8));
    for (let i = 0; i < 8; i++) { const c = prop('mini-market/shopping-cart', { height: 1.1 }); c.position.set(-HALF_X - 3, 0, -20 + i * 1.2); c.rotation.y = Math.PI / 2; g.add(c); }
  } else {
    for (const [x, z] of [[-38, 42], [34, 50], [-30, -55]]) g.add(coolingTower(x, z));
    const ind = ['city-kit-industrial/chimney-large', 'city-kit-industrial/water-tower', 'city-kit-industrial/detail-tank-large', 'city-kit-industrial/building-a', 'city-kit-industrial/building-d'];
    ring((x, z) => { const o = prop(ind[(r() * ind.length) | 0], { height: 8 + r() * 8 }); o.position.set(x, 0, z); o.rotation.y = r() * 6; g.add(o); }, 12, 40, 70);
  }
}

function coolingTower(x, z) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(9 - Math.sin(t * Math.PI * 0.9) * 3.2 + t * 0.8, t * 26)); }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), toon('#d8d6cc', { side: THREE.DoubleSide })));
  for (let i = 0; i < 5; i++) g.add(sphere(3 + i * 0.8, '#ffffff', (i % 2 ? 1.5 : -1.5), 27 + i * 3.2, 0, 12));
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
    const c = new THREE.Group(), n = 3 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) c.add(sphere(6 + r() * 5, cloudMat, (k - n / 2) * 7, r() * 3, r() * 4, 12));
    const a = r() * Math.PI * 2, d = 170 + r() * 150;
    c.position.set(Math.cos(a) * d, 60 + r() * 70, Math.sin(a) * d); c.lookAt(0, c.position.y, 0);
    g.add(c);
  }
  return g;
}

function buildFlag() {
  const group = new THREE.Group();
  group.add(cyl(0.07, 0.07, 3.6, '#e8e8e8', 0, 1.8, 0, 8));
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
