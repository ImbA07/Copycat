// Comic-Look: Zeichentrick-Schattierung (3 Farbstufen) + schwarze Umrisse per Nachbearbeitung.
import * as THREE from 'three';

const gradient = (() => {
  const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const cache = new Map();
export function toon(color, opts = {}) {
  const { unique, ...params } = opts;
  const key = color + JSON.stringify(params);
  if (!unique && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...params });
  if (!unique) cache.set(key, m);
  return m;
}
export function flat(color, opts = {}) {
  const key = 'flat' + color + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  cache.set(key, m);
  return m;
}

export const LAYER_WORLD = 0;   // bekommt Umrisse
export const LAYER_FX = 1;      // Effekte ohne Umrisse
export const LAYER_SKY = 2;     // Himmel

const compositeShader = {
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null },
    resolution: { value: new THREE.Vector2() }, near: { value: 0.05 }, far: { value: 600 },
    thickness: { value: 1 }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 0.2, 0.25) },
    desat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tColor, tDepth, tNormal; uniform vec2 resolution; uniform float near, far, thickness, flash, desat; uniform vec3 flashColor;
    varying vec2 vUv;
    float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
    void main(){
      vec2 px = thickness / resolution;
      float dc = lin(texture2D(tDepth, vUv).r);
      vec3 nc = texture2D(tNormal, vUv).rgb;
      float de = 0.0; float ne = 0.0;
      vec2 offs[4]; offs[0]=vec2(px.x,0.0); offs[1]=vec2(-px.x,0.0); offs[2]=vec2(0.0,px.y); offs[3]=vec2(0.0,-px.y);
      for(int i=0;i<4;i++){
        float d = lin(texture2D(tDepth, vUv + offs[i]).r);
        de = max(de, (dc - d) / max(d, 0.001));
        vec3 n = texture2D(tNormal, vUv + offs[i]).rgb;
        ne = max(ne, length(nc - n));
      }
      float edge = max(step(0.06 + dc * 0.0015, de), step(0.55, ne) * step(dc, 120.0));
      vec3 col = texture2D(tColor, vUv).rgb;
      col = mix(col, vec3(0.086, 0.07, 0.12), edge * 0.95);
      float g = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(g) * vec3(1.05, 1.0, 0.92), desat);
      col = mix(col, flashColor, flash);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
};

export class ComicRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const opts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType };
    this.rtMain = new THREE.WebGLRenderTarget(4, 4, { ...opts, depthTexture: new THREE.DepthTexture(4, 4) });
    this.rtMain.depthTexture.type = THREE.UnsignedIntType;
    this.rtNormal = new THREE.WebGLRenderTarget(4, 4, opts);
    this.normalMat = new THREE.MeshNormalMaterial();
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.compMat = new THREE.ShaderMaterial({ ...compositeShader, uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms), depthTest: false, depthWrite: false });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat));
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  get uniforms() { return this.compMat.uniforms; }
  resize() {
    const w = innerWidth, h = innerHeight, pr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    this.rtMain.setSize(w * pr, h * pr);
    this.rtNormal.setSize(w * pr, h * pr);
    this.compMat.uniforms.resolution.value.set(w * pr, h * pr);
    this.compMat.uniforms.thickness.value = Math.max(1.5, h * pr / 560);
    this.aspect = w / h;
  }
  render(scene, camera) {
    const r = this.renderer;
    // 1) Normalen (nur Welt) für Kanten
    camera.layers.set(LAYER_WORLD);
    const bg = scene.background; scene.background = null;
    scene.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.rtNormal); r.setClearColor(0x8080ff, 1); r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = null; scene.background = bg;
    // 2) Farbe + Tiefe (alles)
    camera.layers.enable(LAYER_FX); camera.layers.enable(LAYER_SKY);
    r.setRenderTarget(this.rtMain); r.setClearColor(0x7ec8ff, 1); r.clear();
    r.render(scene, camera);
    // 3) Zusammensetzen
    const u = this.compMat.uniforms;
    u.tColor.value = this.rtMain.texture; u.tDepth.value = this.rtMain.depthTexture; u.tNormal.value = this.rtNormal.texture;
    u.near.value = camera.near; u.far.value = camera.far;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}

// Kleine Helfer zum Bauen von Modellen
export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' || typeof color === 'number' ? toon(color) : color);
  m.position.set(x, y, z); return m;
}
export function sphere(r, color, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75 | 0)), typeof color === 'object' ? color : toon(color));
  m.position.set(x, y, z); return m;
}
export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'object' ? color : toon(color));
  m.position.set(x, y, z); return m;
}
export function cone(r, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), typeof color === 'object' ? color : toon(color));
  m.position.set(x, y, z); return m;
}
export function capsule(r, len, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 12), typeof color === 'object' ? color : toon(color));
  m.position.set(x, y, z); return m;
}
