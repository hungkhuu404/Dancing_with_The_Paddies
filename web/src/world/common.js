// Shared helpers for the living world: lazy model cache, patched materials, instanced sets with a shared matrix buffer.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadModel } from '../data/load.js';
import { gltfParts } from '../scene/life.js';
import { patch } from '../scene/shaderlib.js';

export { cloneSkinned, gltfParts };

const cache = new Map();
/** public/models/<name>.glb, loaded once; resolves to null when missing. */
export const getModel = (name) => { if (!cache.has(name)) cache.set(name, loadModel(name)); return cache.get(name); };

/**
 * One material per (kind, source material, options) for the whole app: every tile shares it. Fewer materials = less
 * per-draw program bookkeeping in three (it re-checks each material when the water mirror renders the scene again).
 * Shared materials must not carry per-tile uniforms.
 */
const SHARED = new Map();
export function shared(key, make) {
  let m = SHARED.get(key);
  if (!m) SHARED.set(key, (m = make()));
  return m;
}

/** Lit, patched (cloud shadow, wet, radar) material from a glTF material or vertex colours (shared, see shared()). */
export function litMaterial(src, key, opts = {}) {
  if (opts.patch) return makeLit(src, key, opts);
  return shared(`lit|${key}|${src?.uuid || '-'}|${JSON.stringify(opts)}`, () => makeLit(src, key, opts));
}
function makeLit(src, key, opts) {
  const m = src ? src.clone() : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  m.side = opts.side ?? THREE.DoubleSide;
  if (m.transparent && m.map) { m.transparent = false; m.alphaTest = 0.5; }
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
  // one program key for all plain lit world materials (sway/radar are part of the cache key anyway): far fewer shader compiles
  return patch(m, { key: opts.patch ? key : 'lit', radar: opts.radar || '.4', sway: opts.sway || 0, ...(opts.patch || {}) });
}

/** Swap every mesh material of a cloned glTF scene for a patched copy (shared per source material). */
export function patchScene(root, key, opts = {}) {
  const mats = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => { if (!mats.has(m)) mats.set(m, litMaterial(m, key, opts)); return mats.get(m); });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.castShadow = opts.cast ?? true; o.receiveShadow = true;
    o.frustumCulled = !o.isSkinnedMesh; // skinned bounds don't follow the animation
  });
  return root;
}

/**
 * One logical instanced object made of several parts (one InstancedMesh per material) sharing a single matrix buffer.
 * parts: [{geometry, material}] ; makeMat(material) -> Material.
 */
export class InstSet {
  // detail: layer 1 = drawn by the main camera, skipped by the water mirror (small things whose reflection nobody sees)
  constructor(group, name, cap, { cast = true, dynamic = false, detail = false } = {}) {
    this.group = group; this.name = name; this.cap = cap; this.cast = cast; this.dynamic = dynamic; this.detail = detail;
    this.matrix = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 16), 16);
    if (dynamic) this.matrix.setUsage(THREE.DynamicDrawUsage);
    this.meshes = []; this.n = 0;
  }
  setParts(parts, makeMat) {
    for (const m of this.meshes) { this.group.remove(m); m.dispose(); }
    this.meshes = parts.map(({ geometry, material }) => {
      const im = new THREE.InstancedMesh(geometry, makeMat(material), Math.max(1, this.cap));
      im.instanceMatrix = this.matrix;
      if (this.detail) im.layers.set(1);
      im.count = this.n; im.castShadow = this.cast; im.receiveShadow = true; im.frustumCulled = false; im.name = this.name;
      this.group.add(im);
      return im;
    });
    return this;
  }
  set(i, m) { m.toArray(this.matrix.array, i * 16); }
  get(i, m) { return m.fromArray(this.matrix.array, i * 16); }
  set count(n) { this.n = Math.min(n, this.cap); for (const im of this.meshes) im.count = this.n; }
  get count() { return this.n; }
  commit() { this.matrix.needsUpdate = true; }
  set visible(v) { for (const im of this.meshes) im.visible = v; }
  dispose() { for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); m.dispose(); } this.meshes = []; }
}

/** Static instanced kind: placeholder geometry now, glTF parts when the model lands. items: [{x,y,z,rot,sx?,sy?,sz?}] */
export function staticKind(group, name, items, placeholder, opts = {}) {
  const set = new InstSet(group, name, items.length, { cast: opts.cast ?? true, detail: opts.detail });
  const d = new THREE.Object3D();
  items.forEach((it, i) => {
    d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot || 0, 0);
    d.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    d.updateMatrix(); set.set(i, d.matrix);
  });
  set.count = items.length;
  set.setParts([{ geometry: placeholder, material: null }], (m) => litMaterial(m, name, opts));
  set.commit();
  return {
    set, items,
    upgrade(gltf) { if (!gltf) return false; const parts = gltfParts(gltf); if (!parts.length) return false; set.setParts(parts, (m) => litMaterial(m, name, opts)); return true; },
  };
}

export const hashf = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
