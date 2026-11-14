// Vegetation from props.veg: bamboo, tram (melaleuca), areca, mango, nipa, reeds. Instanced, wind sway,
// detailed near the camera and a cheap stand-in further out (the same LOD scheme as life.js trees).
import * as THREE from 'three';
import * as P from './placeholders.js';
import { InstSet, litMaterial, gltfParts } from './common.js';
import { treeImpostor } from '../scene/impostors.js';

const KINDS = ['bamboo', 'tram', 'areca', 'mango', 'nipa', 'reeds'];
const SWAY = { bamboo: 0.006, tram: 0.004, areca: 0.003, mango: 0.002, nipa: 0.03, reeds: 0.09 };
const FAR_MAX = { reeds: 450, nipa: 700 }; // small plants vanish beyond this (sub-pixel)

export async function createVeg(ctx,step=async()=>{}) {
  const low = ctx.quality.tier === 'low';
  const NEAR = low ? 110 : 160, CAP = low ? 200 : 500;
  const group = new THREE.Group(); group.name = 'veg';
  const d = new THREE.Object3D();
  const kinds = {};
  for (const k of KINDS) {
    const items = ctx.props.veg.filter((v) => v.kind === k);
    if (!items.length) continue;
    const mats = [];
    for(let i=0;i<items.length;i++){
      const v=items[i];
      d.position.set(v.x, Math.max(ctx.groundAt(v.x, v.z), 0) - 0.05, v.z);
      d.rotation.set(0, v.rot || 0, 0); d.scale.setScalar(v.scale || 1); d.updateMatrix();
      mats.push(d.matrix.clone());
      if((i&63)===63)await step('veg-placements:'+k);
    }
    const small = k === 'reeds' || k === 'nipa';
    const near = new InstSet(group, k, Math.min(CAP, mats.length), { cast: k !== 'reeds', detail: k === 'reeds' });
    near.setParts([{ geometry: P[k](), material: null }], (m) => litMaterial(m, 'veg' + k, { sway: SWAY[k], radar: '.36' }));
    const impostor=treeImpostor(k);
    const far = new InstSet(group, k + '_far', mats.length, { cast: !impostor && !low && !small, detail: true });
    far.setParts([{ geometry: impostor?impostor.geometry.clone():P.farVeg(k), material: null }], () => impostor?impostor.material:litMaterial(null, 'vegfar' + k, { sway: SWAY[k] * 0.6, radar: '.36' }));
    kinds[k] = { mats, near, far };
    await step('veg-kind:'+k);
  }
  const at = new THREE.Vector3(1e9, 0, 0);
  const [cx, cz] = ctx.centre || [0, 0];
  let allFar = false;
  function refresh(cam, force) {
    if (!force && cam.distanceToSquared(at) < 30 * 30) return;
    // camera far from the tile: same answer as last time (all stand-ins, small plants culled)
    const far = Math.hypot(Math.max(0, Math.abs(cam.x - cx) - 1000), Math.max(0, Math.abs(cam.z - cz) - 1000), cam.y) > 760;
    if (far && allFar && !force) return;
    allFar = far;
    at.copy(cam);
    const n2 = NEAR * NEAR;
    for (const [k, s] of Object.entries(kinds)) {
      const f2 = (FAR_MAX[k] || 1e9) ** 2;
      let nn = 0, nf = 0;
      for (const m of s.mats) {
        const e = m.elements, dx = e[12] - cam.x, dy = e[13] - cam.y, dz = e[14] - cam.z, q = dx * dx + dy * dy + dz * dz;
        if (q < n2 && nn < s.near.cap) s.near.set(nn++, m);
        else if (q < f2) s.far.set(nf++, m);
      }
      s.near.count = nn; s.far.count = nf; s.near.commit(); s.far.commit();
    }
  }
  let dirty = true;
  return {
    group,
    update(dt, camPos) { refresh(camPos, dirty); dirty = false; },
    upgrade(name, gltf) {
      const s = kinds[name];
      if (!s || !gltf) return false;
      const parts = gltfParts(gltf);
      if (!parts.length) return false;
      s.near.setParts(parts, (m) => litMaterial(m, 'vegglb' + name, { sway: SWAY[name], radar: '.36' }));
      dirty = true;
      return true;
    },
    names: Object.keys(kinds),
  };
}
