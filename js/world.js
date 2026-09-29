// Kollisionswelt: Kisten/Rampen als einfache Formen, Strahlen (Schüsse, Sichtlinien) und ein Höhen-Raster für die Wegfindung.

export class World {
  constructor(bounds) {
    this.bounds = bounds; // {minX,maxX,minZ,maxZ}
    this.colliders = [];
    this.nav = null;
    this.version = 0;
  }
  add(c) {
    c.alive = true; c.id = this.colliders.length;
    this.colliders.push(c); return c;
  }
  remove(c) { c.alive = false; this.version++; this.nav?.rebuild(); }

  static topAt(c, x, z) {
    if (c.type !== 'ramp') return c.max.y;
    let t = c.axis === 'x' ? (x - c.min.x) / (c.max.x - c.min.x) : (z - c.min.z) / (c.max.z - c.min.z);
    t = Math.min(1, Math.max(0, t));
    if (c.dir < 0) t = 1 - t;
    return c.min.y + (c.max.y - c.min.y) * t;
  }

  // Höchster begehbarer Boden unter einem Kreis, der höchstens `reach` über den Füßen liegt.
  groundHeight(x, z, r, feetY, reach = 0.55) {
    let g = 0;
    for (const c of this.colliders) {
      if (!c.alive || c.noStand) continue;
      if (x + r < c.min.x || x - r > c.max.x || z + r < c.min.z || z - r > c.max.z) continue;
      const cx = Math.min(c.max.x, Math.max(c.min.x, x)), cz = Math.min(c.max.z, Math.max(c.min.z, z));
      const top = c.type === 'ramp' ? World.topAt(c, cx, cz) : c.max.y;
      if (top <= feetY + reach && top > g) g = top;
    }
    return g;
  }

  // Schiebt einen stehenden Zylinder aus Hindernissen heraus. Gibt true zurück, wenn es eine Wand-Berührung gab.
  pushOut(pos, r, feetY, height, step) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.colliders) {
        if (!c.alive) continue;
        if (pos.x + r <= c.min.x || pos.x - r >= c.max.x || pos.z + r <= c.min.z || pos.z - r >= c.max.z) continue;
        if (c.min.y >= feetY + height) continue;
        const cx = Math.min(c.max.x, Math.max(c.min.x, pos.x)), cz = Math.min(c.max.z, Math.max(c.min.z, pos.z));
        const top = World.topAt(c, cx, cz);
        if (top <= feetY + step) continue;
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          if (d >= r) continue;
          pos.x += dx / d * (r - d); pos.z += dz / d * (r - d);
        } else {
          // Mittelpunkt steckt drin: kürzester Weg raus
          const px = Math.min(pos.x - c.min.x, c.max.x - pos.x), pz = Math.min(pos.z - c.min.z, c.max.z - pos.z);
          if (px < pz) pos.x = (pos.x - c.min.x < c.max.x - pos.x) ? c.min.x - r : c.max.x + r;
          else pos.z = (pos.z - c.min.z < c.max.z - pos.z) ? c.min.z - r : c.max.z + r;
        }
        hit = true;
      }
    }
    const b = this.bounds;
    pos.x = Math.min(b.maxX - r, Math.max(b.minX + r, pos.x));
    pos.z = Math.min(b.maxZ - r, Math.max(b.minZ + r, pos.z));
    return hit;
  }

  // Kopf gegen Decke? (für Sprünge unter Plattformen – hier nur Arenagrenzen)
  // Strahl gegen alle Hindernisse. Gibt {t, point, normal, collider} oder null.
  raycast(o, d, maxT = 200, ignore = null) {
    let best = null, bestT = maxT;
    for (const c of this.colliders) {
      if (!c.alive || c === ignore || c.noRay) continue;
      const h = rayCollider(o, d, c, bestT);
      if (h && h.t < bestT) { bestT = h.t; best = h; best.collider = c; }
    }
    // Boden
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t > 0 && t < bestT) { bestT = t; best = { t, normal: { x: 0, y: 1, z: 0 }, collider: null, ground: true }; }
    }
    if (best) best.point = { x: o.x + d.x * best.t, y: o.y + d.y * best.t, z: o.z + d.z * best.t };
    return best;
  }
  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const h = this.raycast(a, { x: dx / len, y: dy / len, z: dz / len }, len - 0.05);
    return !h;
  }
}

function rayCollider(o, d, c, maxT) {
  let t0 = 0, t1 = maxT, nAxis = -1, nSign = 0;
  const mins = [c.min.x, c.min.y, c.min.z], maxs = [c.max.x, c.max.y, c.max.z];
  const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-9) {
      if (os[i] < mins[i] || os[i] > maxs[i]) return null;
      continue;
    }
    let ta = (mins[i] - os[i]) / ds[i], tb = (maxs[i] - os[i]) / ds[i];
    let s = -1;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
    if (ta > t0) { t0 = ta; nAxis = i; nSign = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  if (c.type !== 'ramp') {
    if (nAxis < 0) return { t: 0, normal: { x: -d.x, y: -d.y, z: -d.z } };
    const n = { x: 0, y: 0, z: 0 }; n[['x', 'y', 'z'][nAxis]] = nSign;
    return { t: t0, normal: n };
  }
  // Rampe: Punkt muss unter der schrägen Fläche liegen
  const f = t => {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    return y - World.topAt(c, x, z);
  };
  const f0 = f(t0), f1 = f(t1);
  if (f0 <= 0.001) {
    const n = { x: 0, y: 0, z: 0 };
    if (nAxis >= 0) n[['x', 'y', 'z'][nAxis]] = nSign; else n.y = 1;
    return { t: t0, normal: n };
  }
  if (f1 > 0) return null;
  const t = t0 + (t1 - t0) * (f0 / (f0 - f1));
  const len = c.axis === 'x' ? c.max.x - c.min.x : c.max.z - c.min.z;
  const rise = (c.max.y - c.min.y) / len;
  const n = { x: 0, y: 1, z: 0 };
  if (c.axis === 'x') n.x = -rise * c.dir; else n.z = -rise * c.dir;
  const l = Math.hypot(n.x, n.y, n.z); n.x /= l; n.y /= l; n.z /= l;
  return { t, normal: n };
}

// Strahl gegen Kugel / senkrechten Zylinder (Treffer-Zonen der Figuren)
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (cc < 0 ? 0 : -1);
}
export function rayCylinder(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  let tHit = -1;
  if (a > 1e-9) {
    const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0) { const y = o.y + d.y * t; if (y >= y0 && y <= y1) tHit = t; }
    }
  }
  // Deckel
  if (Math.abs(d.y) > 1e-9) {
    for (const yy of [y1, y0]) {
      const t = (yy - o.y) / d.y;
      if (t >= 0 && (tHit < 0 || t < tHit)) {
        const x = ox + d.x * t, z = oz + d.z * t;
        if (x * x + z * z <= r * r) tHit = t;
      }
    }
  }
  return tHit;
}

// ---------------- Wegfindung (Höhenraster + A*) ----------------
export class NavGrid {
  constructor(world, cell = 0.5, radius = 0.5) {
    this.world = world; this.cell = cell; this.radius = radius;
    const b = world.bounds;
    this.w = Math.ceil((b.maxX - b.minX) / cell); this.h = Math.ceil((b.maxZ - b.minZ) / cell);
    this.height = new Float32Array(this.w * this.h);
    this.blocked = new Uint8Array(this.w * this.h);
    world.nav = this;
    this.rebuild();
  }
  rebuild() {
    const { w, h, cell, radius } = this, b = this.world.bounds;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = b.minX + (i + 0.5) * cell, z = b.minZ + (j + 0.5) * cell;
      let top = 0, tall = false;
      for (const c of this.world.colliders) {
        if (!c.alive) continue;
        if (x + radius <= c.min.x || x - radius >= c.max.x || z + radius <= c.min.z || z - radius >= c.max.z) continue;
        const cx = Math.min(c.max.x, Math.max(c.min.x, x)), cz = Math.min(c.max.z, Math.max(c.min.z, z));
        const t = World.topAt(c, cx, cz);
        if (c.noStand) { if (t > 0.5) tall = true; continue; }
        if (t > top) top = t;
      }
      const edge = x - radius < b.minX || x + radius > b.maxX || z - radius < b.minZ || z + radius > b.maxZ;
      this.height[j * w + i] = top;
      this.blocked[j * w + i] = (edge || tall || top > 2.6) ? 1 : 0;
    }
  }
  toCell(x, z) {
    const b = this.world.bounds;
    return [Math.min(this.w - 1, Math.max(0, Math.floor((x - b.minX) / this.cell))), Math.min(this.h - 1, Math.max(0, Math.floor((z - b.minZ) / this.cell)))];
  }
  toWorld(i, j) { const b = this.world.bounds; return { x: b.minX + (i + 0.5) * this.cell, z: b.minZ + (j + 0.5) * this.cell }; }
  canStep(a, b) { return !this.blocked[b] && Math.abs(this.height[a] - this.height[b]) <= 0.55; }
  nearestFree(i, j) {
    if (!this.blocked[j * this.w + i]) return [i, j];
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const a = i + di, bb = j + dj;
      if (a < 0 || bb < 0 || a >= this.w || bb >= this.h) continue;
      if (!this.blocked[bb * this.w + a]) return [a, bb];
    }
    return [i, j];
  }
  findPath(from, to, maxIter = 6000) {
    const { w, h } = this;
    let [si, sj] = this.nearestFree(...this.toCell(from.x, from.z));
    let [ti, tj] = this.nearestFree(...this.toCell(to.x, to.z));
    const start = sj * w + si, goal = tj * w + ti;
    const g = new Float32Array(w * h).fill(Infinity), came = new Int32Array(w * h).fill(-1), closed = new Uint8Array(w * h);
    const open = new MinHeap();
    g[start] = 0; open.push(start, 0);
    const hfn = k => { const i = k % w, j = (k / w) | 0; const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let iter = 0, found = false;
    while (open.size && iter++ < maxIter) {
      const cur = open.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue; closed[cur] = 1;
      const ci = cur % w, cj = (cur / w) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const n = nj * w + ni;
        if (closed[n] || !this.canStep(cur, n)) continue;
        if (di && dj && (!this.canStep(cur, cj * w + ni) || !this.canStep(cur, nj * w + ci))) continue;
        const ng = g[cur] + (di && dj ? 1.414 : 1);
        if (ng < g[n]) { g[n] = ng; came[n] = cur; open.push(n, ng + hfn(n)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    // Glätten: Punkte überspringen, solange die gerade Linie begehbar bleibt
    const pts = cells.map(k => ({ ...this.toWorld(k % w, (k / w) | 0), y: this.height[k] }));
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !this.walkable(pts[a], pts[b])) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }
  walkable(a, b) {
    const dist = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(dist / (this.cell * 0.5));
    let [pi, pj] = this.toCell(a.x, a.z), prev = pj * this.w + pi;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const [i, j] = this.toCell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      const k = j * this.w + i;
      if (k !== prev) { if (!this.canStep(prev, k)) return false; prev = k; }
    }
    return true;
  }
  connected(a, b) { return !!this.findPath(a, b, 20000); }
  // Alle Zellen, die man vom Startpunkt aus mit höchstens maxDist Metern Laufweg erreicht
  reachable(from, maxDist) {
    const { w, h, cell } = this;
    const [si, sj] = this.nearestFree(...this.toCell(from.x, from.z));
    const dist = new Float32Array(w * h).fill(Infinity), open = new MinHeap(), out = [];
    const start = sj * w + si; dist[start] = 0; open.push(start, 0);
    while (open.size) {
      const cur = open.pop(), dc = dist[cur];
      if (dc === -1) continue;
      out.push(cur);
      const ci = cur % w, cj = (cur / w) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const n = nj * w + ni;
        if (!this.canStep(cur, n)) continue;
        const nd = dc + (di && dj ? 1.414 : 1) * cell;
        if (nd <= maxDist && nd < dist[n]) { dist[n] = nd; open.push(n, nd); }
      }
      dist[cur] = -1;
    }
    return out.map(k => ({ ...this.toWorld(k % w, (k / w) | 0), y: this.height[k] }));
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k, P = this.p; let i = K.length; K.push(k); P.push(p);
    while (i > 0) { const par = (i - 1) >> 1; if (P[par] <= p) break; K[i] = K[par]; P[i] = P[par]; i = par; }
    K[i] = k; P[i] = p;
  }
  pop() {
    const K = this.k, P = this.p, top = K[0], lk = K.pop(), lp = P.pop();
    if (K.length) {
      let i = 0; const n = K.length;
      while (true) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && P[c + 1] < P[c]) c++;
        if (P[c] >= lp) break;
        K[i] = K[c]; P[i] = P[c]; i = c;
      }
      K[i] = lk; P[i] = lp;
    }
    return top;
  }
}
