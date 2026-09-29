// Lädt alle 3D-Modelle (Figuren von Quaternius, Objekte von Kenney – beide CC0) und stellt sie im Comic-Look bereit.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/addons/utils/SkeletonUtils.js';
import { toon } from './toon.js';

export const PROPS = [
  'city-kit-suburban/building-type-a', 'city-kit-suburban/building-type-c', 'city-kit-suburban/building-type-f', 'city-kit-suburban/building-type-h',
  'city-kit-suburban/building-type-d', 'city-kit-suburban/building-type-k', 'city-kit-suburban/fence-1x3', 'city-kit-suburban/tree-large',
  'city-kit-suburban/tree-small', 'city-kit-suburban/planter',
  'car-kit/sedan', 'car-kit/suv', 'car-kit/van', 'car-kit/delivery', 'car-kit/hatchback-sports', 'car-kit/taxi', 'car-kit/police', 'car-kit/truck',
  'car-kit/cone', 'car-kit/garbage-truck',
  'city-kit-industrial/shipping-container-a', 'city-kit-industrial/shipping-container-b', 'city-kit-industrial/shipping-container-c',
  'city-kit-industrial/detail-tank', 'city-kit-industrial/detail-tank-large', 'city-kit-industrial/chimney-large', 'city-kit-industrial/water-tower',
  'city-kit-industrial/building-a', 'city-kit-industrial/building-d',
  'mini-market/shelf-boxes', 'mini-market/shelf-bags', 'mini-market/shelf-end', 'mini-market/freezer', 'mini-market/freezers-standing',
  'mini-market/cash-register', 'mini-market/display-fruit', 'mini-market/display-bread', 'mini-market/shopping-cart', 'mini-market/bottle-return',
  'mini-market/column',
  'survival-kit/barrel', 'survival-kit/box-large', 'survival-kit/box', 'survival-kit/structure-metal-wall', 'survival-kit/metal-panel',
  'survival-kit/fence-fortified',
  'nature/plant_bushLarge', 'nature/plant_bushDetailed', 'nature/tree_oak', 'nature/tree_default', 'nature/tree_detailed', 'nature/rock_largeB',
  'nature/fence_planks',
  'furniture/bench', 'furniture/trashcan', 'furniture/cardboardBoxClosed',
  'blaster/blaster-d', 'blaster/clip-large',
];
const CHARS = ['Casual_Bald', 'OldClassy_Male'];

const store = { props: {}, chars: {} };

// Materialien in Comic-Materialien umwandeln (Textur + Farbe bleiben erhalten)
const matCache = new Map();
function toToon(m) {
  if (matCache.has(m)) return matCache.get(m);
  const t = toon(m.color ? '#' + m.color.getHexString() : '#ffffff', { unique: true, map: m.map || null, vertexColors: m.vertexColors, side: m.side, transparent: m.transparent, opacity: m.opacity, rough: 0.58 });
  t.name = m.name;
  matCache.set(m, t); return t;
}

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const url = p => new URL(`../assets/${p}.glb`, import.meta.url).href;
  const all = [...PROPS.map(p => ['prop', p, url('props/' + p)]), ...CHARS.map(c => ['char', c, url('characters/' + c)])];
  let done = 0;
  await Promise.all(all.map(([kind, name, url]) => new Promise((res, rej) => loader.load(url, g => {
    if (kind === 'prop') {
      g.scene.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(toToon) : toToon(o.material); } });
      const box = new THREE.Box3().setFromObject(g.scene);
      store.props[name] = { scene: g.scene, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), min: box.min.clone() };
    } else store.chars[name] = g;
    onProgress?.(++done / all.length); res();
  }, undefined, e => rej(new Error('Modell fehlt: ' + url))))));
}

// Kopie eines Objekts, auf Zielhöhe/-länge skaliert, Unterseite auf y=0, mittig
export function prop(name, { height, length, width, fit } = {}) {
  const p = store.props[name];
  if (!p) throw new Error('Unbekanntes Modell ' + name);
  const o = p.scene.clone(true);
  o.traverse(m => { m.userData.shared = true; });
  let s = 1;
  if (fit) s = Math.min(fit[0] / p.size.x, fit[1] / p.size.y, fit[2] / p.size.z);
  else if (height) s = height / p.size.y;
  else if (length) s = length / Math.max(p.size.x, p.size.z);
  else if (width) s = width / p.size.x;
  const g = new THREE.Group();
  o.scale.setScalar(s);
  o.position.set(-p.center.x * s, -p.min.y * s, -p.center.z * s);
  g.add(o);
  g.userData.size = new THREE.Vector3(p.size.x * s, p.size.y * s, p.size.z * s);
  return g;
}
export function propSize(name) { return store.props[name].size; }
export function charGltf(name) { return store.chars[name]; }
export function cloneSkinned(obj) { return SkeletonUtils.clone(obj); }
