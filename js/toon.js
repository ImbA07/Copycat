// Moderner Comic-Look: weiche Schatten, Glanzlichter, Randlicht, Umgebungsreflexion, Leuchteffekte (Bloom),
// Farbabstimmung und dezente Umrisse. Materialien werden zentral hier erzeugt.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/addons/environments/RoomEnvironment.js';

// Randlicht (Fresnel) + leichte Zeichentrick-Stufung, in jedes Material eingehängt
function stylize(m, rim = 0.22) {
  m.userData.rim = { value: rim };
  m.onBeforeCompile = sh => {
    sh.uniforms.rimStrength = m.userData.rim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float rimStrength;')
      .replace('#include <opaque_fragment>', `
        float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
        outgoingLight += rimStrength * rimF * mix(vec3(1.0, 0.95, 0.85), diffuseColor.rgb, 0.4);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'stylized';
  return m;
}

const cache = new Map();
// Standard-Material für alles Feste. opts: color-Map, emissive, unique (eigene Kopie), rough, rim, metal
export function toon(color, opts = {}) {
  const { unique, rough, rim, metal, ...params } = opts;
  const key = color + JSON.stringify(opts);
  if (!unique && cache.has(key)) return cache.get(key);
  const m = stylize(new THREE.MeshStandardMaterial({ color, roughness: rough ?? 0.62, metalness: metal ?? 0, envMapIntensity: 0.35, ...params }), rim ?? 0.22);
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
// Leuchtendes Material (wird vom Bloom erfasst)
export function glow(color, strength = 2.5) {
  const key = 'glow' + color + strength;
  if (cache.has(key)) return cache.get(key);
  const c = new THREE.Color(color).multiplyScalar(strength);
  const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  cache.set(key, m); return m;
}

export const LAYER_WORLD = 0;   // bekommt Umrisse
export const LAYER_FX = 1;      // Effekte ohne Umrisse
export const LAYER_SKY = 2;     // Himmel

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const brightShader = {
  uniforms: { tColor: { value: null }, threshold: { value: 2.4 } },
  vertexShader: FS_VERT,
  fragmentShader: `uniform sampler2D tColor; uniform float threshold; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tColor, vUv).rgb; float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c * smoothstep(threshold, threshold * 1.8, l), 1.0); }`,
};
const blurShader = {
  uniforms: { tColor: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: FS_VERT,
  fragmentShader: `uniform sampler2D tColor; uniform vec2 dir; varying vec2 vUv;
    void main(){
      vec3 s = texture2D(tColor, vUv).rgb * 0.227;
      s += (texture2D(tColor, vUv + dir * 1.385).rgb + texture2D(tColor, vUv - dir * 1.385).rgb) * 0.316;
      s += (texture2D(tColor, vUv + dir * 3.231).rgb + texture2D(tColor, vUv - dir * 3.231).rgb) * 0.070;
      gl_FragColor = vec4(s, 1.0); }`,
};
const compositeShader = {
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null }, tBloom: { value: null }, tBloom2: { value: null },
    resolution: { value: new THREE.Vector2() }, near: { value: 0.05 }, far: { value: 600 },
    thickness: { value: 1 }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 0.2, 0.25) },
    desat: { value: 0 }, bloomStrength: { value: 0.45 }, outline: { value: 0.7 }, time: { value: 0 },
  },
  vertexShader: FS_VERT,
  fragmentShader: `
    uniform sampler2D tColor, tDepth, tNormal, tBloom, tBloom2; uniform vec2 resolution;
    uniform float near, far, thickness, flash, desat, bloomStrength, outline, time; uniform vec3 flashColor;
    varying vec2 vUv;
    float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
    void main(){
      vec2 px = thickness / resolution;
      float dc = lin(texture2D(tDepth, vUv).r);
      vec3 nc = texture2D(tNormal, vUv).rgb;
      float de = 0.0, ne = 0.0;
      vec2 offs[4]; offs[0]=vec2(px.x,0.0); offs[1]=vec2(-px.x,0.0); offs[2]=vec2(0.0,px.y); offs[3]=vec2(0.0,-px.y);
      for(int i=0;i<4;i++){
        float d = lin(texture2D(tDepth, vUv + offs[i]).r);
        de = max(de, (dc - d) / max(d, 0.001));
        ne = max(ne, length(nc - texture2D(tNormal, vUv + offs[i]).rgb));
      }
      float fade = 1.0 - smoothstep(40.0, 140.0, dc);
      float edge = max(smoothstep(0.05 + dc * 0.0012, 0.12 + dc * 0.002, de), smoothstep(0.5, 0.9, ne) * 0.55) * fade;
      vec3 col = texture2D(tColor, vUv).rgb;
      col = mix(col, col * vec3(0.18, 0.16, 0.26), edge * outline);
      // Leuchten
      col += (texture2D(tBloom, vUv).rgb * 0.6 + texture2D(tBloom2, vUv).rgb * 0.8) * bloomStrength;
      // Farbabstimmung: etwas mehr Sättigung + warme Lichter
      float g = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(g), col, 1.22);
      col = mix(col, vec3(g) * vec3(1.05, 1.0, 0.92), desat);
      // Vignette
      vec2 q = vUv - 0.5; col *= 1.0 - dot(q, q) * 0.55;
      col = mix(col, flashColor, flash);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export class ComicRenderer {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType };
    this.rtMain = new THREE.WebGLRenderTarget(4, 4, { ...opts, samples: 4, depthTexture: new THREE.DepthTexture(4, 4) });
    this.rtMain.depthTexture.type = THREE.UnsignedIntType;
    this.rtNormal = new THREE.WebGLRenderTarget(4, 4, { ...opts, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtB1 = [new THREE.WebGLRenderTarget(4, 4, opts), new THREE.WebGLRenderTarget(4, 4, opts)];
    this.rtB2 = [new THREE.WebGLRenderTarget(4, 4, opts), new THREE.WebGLRenderTarget(4, 4, opts)];
    this.normalMat = new THREE.MeshNormalMaterial();
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = sh => new THREE.ShaderMaterial({ ...sh, uniforms: THREE.UniformsUtils.clone(sh.uniforms), depthTest: false, depthWrite: false });
    this.compMat = mk(compositeShader); this.compMat.toneMapped = true;
    this.brightMat = mk(brightShader); this.blurMat = mk(blurShader);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    this.quadScene.add(this.quad);
    // Umgebung für Glanzlichter/Reflexionen
    const pm = new THREE.PMREMGenerator(r);
    this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  get uniforms() { return this.compMat.uniforms; }
  resize() {
    const w = innerWidth, h = innerHeight, pr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    const W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.rtMain.setSize(W, H); this.rtNormal.setSize(W, H);
    for (const t of this.rtB1) t.setSize(W >> 2, H >> 2);
    for (const t of this.rtB2) t.setSize(W >> 3, H >> 3);
    this.compMat.uniforms.resolution.value.set(W, H);
    this.compMat.uniforms.thickness.value = Math.max(1.0, H / 800);
    this.aspect = w / h;
  }
  pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); }
  blur(src, pair) {
    const w = pair[0].width, h = pair[0].height;
    this.blurMat.uniforms.tColor.value = src; this.blurMat.uniforms.dir.value.set(1 / w, 0); this.pass(this.blurMat, pair[1]);
    this.blurMat.uniforms.tColor.value = pair[1].texture; this.blurMat.uniforms.dir.value.set(0, 1 / h); this.pass(this.blurMat, pair[0]);
  }
  render(scene, camera) {
    const r = this.renderer;
    if (!scene.environment) scene.environment = this.envMap;
    // 1) Normalen (nur Welt) für Umrisse
    camera.layers.set(LAYER_WORLD);
    const bg = scene.background, fog = scene.fog; scene.background = null; scene.fog = null;
    scene.overrideMaterial = this.normalMat;
    const sh = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rtNormal); r.setClearColor(0x8080ff, 1); r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog; r.shadowMap.autoUpdate = sh;
    // 2) Farbe + Tiefe (alles)
    camera.layers.enable(LAYER_FX); camera.layers.enable(LAYER_SKY);
    r.setRenderTarget(this.rtMain); r.setClearColor(0x7ec8ff, 1); r.clear();
    r.render(scene, camera);
    // 3) Leuchten: helle Stellen herausfiltern und weichzeichnen
    this.brightMat.uniforms.tColor.value = this.rtMain.texture;
    this.pass(this.brightMat, this.rtB1[0]);
    this.blur(this.rtB1[0].texture, this.rtB1);
    this.blur(this.rtB1[0].texture, this.rtB2);
    // 4) Zusammensetzen
    const u = this.compMat.uniforms;
    u.tColor.value = this.rtMain.texture; u.tDepth.value = this.rtMain.depthTexture; u.tNormal.value = this.rtNormal.texture;
    u.tBloom.value = this.rtB1[0].texture; u.tBloom2.value = this.rtB2[0].texture;
    u.near.value = camera.near; u.far.value = camera.far;
    this.pass(this.compMat, null);
  }
}

// Schatten für alle Meshes eines Objekts einschalten
export function shadows(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh && !o.material?.isMeshBasicMaterial) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

// Kleine Helfer zum Bauen von Modellen
const mat = c => typeof c === 'string' || typeof c === 'number' ? toon(c) : c;
export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); return m;
}
export function rbox(w, h, d, color, x = 0, y = 0, z = 0, r = 0.06) {
  // Box mit abgerundeten Kanten (wirkt hochwertiger)
  const s = new THREE.Shape(), rr = Math.min(r, w / 2, h / 2);
  s.moveTo(-w / 2 + rr, -h / 2); s.lineTo(w / 2 - rr, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rr);
  s.lineTo(w / 2, h / 2 - rr); s.quadraticCurveTo(w / 2, h / 2, w / 2 - rr, h / 2); s.lineTo(-w / 2 + rr, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rr); s.lineTo(-w / 2, -h / 2 + rr); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rr, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - rr * 2, bevelEnabled: true, bevelThickness: rr, bevelSize: 0, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(d - rr * 2) / 2);
  const m = new THREE.Mesh(g, mat(color)); m.position.set(x, y, z); return m;
}
export function sphere(r, color, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75 | 0)), mat(color)); m.position.set(x, y, z); return m;
}
export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color)); m.position.set(x, y, z); return m;
}
export function cone(r, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color)); m.position.set(x, y, z); return m;
}
export function capsule(r, len, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 12), mat(color)); m.position.set(x, y, z); return m;
}
