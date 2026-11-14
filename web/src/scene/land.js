// Land: base ground, field parcels (sink when flooded), bunds, canal banks, roads, canal bed.
// Everything shares one ground shader (ground.webp macro + procedural detail per field state).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patch } from './shaderlib.js';
import { triangulate, levelAt, transitionOrder, distToCanals, centroid } from '../data/parcels.js';
import { fieldAppearance } from './ecologyRules.js';
import { roadClass } from '../world/infrastructureRules.js';

export const H = { dry: 0.35, wet: -0.25, bund: 0.62, base: 0.25, bank: 1.0, bed: -1.6 };
const STW = 256; // state texture width
import { MASK, IDS, rasterise } from './raster.js';

// one shared worker for the rasters; falls back to the main thread when workers / OffscreenCanvas are unavailable
let worker = null, wid = 0;
const waiting = new Map();
function rasterAsync(layout, cx, cz, maskSize = MASK) {
  try {
    if (!worker && typeof OffscreenCanvas === 'function') {
      worker = new Worker(new URL('./rasterWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); if (w) (e.data.error ? w[1](new Error(e.data.error)) : w[0](e.data)); };
    }
  } catch { worker = null; }
  if (!worker) return Promise.resolve(rasterise(layout, cx, cz, maskSize));
  const id = ++wid, data = { parcels: layout.parcels.map((p) => ({ poly: p.poly })), canals: layout.canals, roads: layout.roads };
  return new Promise((res, rej) => { waiting.set(id, [res, rej]); worker.postMessage({ id, layout: data, cx, cz, maskSize }); })
    .catch(() => rasterise(layout, cx, cz, maskSize));
}

/**
 * One 2 km tile of land in global scene coords. opts.centre = tile centre [x, z] (its textures span centre ± 1000 m).
 * Async: `step()` is awaited between the heavy stages so a streaming tile builds in slices.
 */
export async function createLand(layout, groundTex, opts = {}, step = async () => {}) {
  const parcels = layout.parcels;
  const [cx, cz] = opts.centre || [0, 0];
  const n = parcels.length;

  // ---- per-parcel state texture: R flood level (animated), G state at pass, B crop hash, A highlight
  const rows = Math.max(1, Math.ceil(n / STW));
  const stateData = new Uint8Array(STW * rows * 4);
  for (let i = 0; i < n; i++) stateData[i * 4 + 2] = Math.floor(hash(i * 7.31 + 1.7) * 255);
  const stateTex = new THREE.DataTexture(stateData, STW, rows, THREE.RGBAFormat);
  stateTex.needsUpdate = true;
  const ecoData = new Uint8Array(STW * rows * 4);
  const ecoTex = new THREE.DataTexture(ecoData, STW, rows, THREE.RGBAFormat);
  ecoTex.needsUpdate = true;
  const ecoFrom = new Float32Array(n * 3), ecoTo = new Float32Array(n * 3);

  // ---- id raster (nearest, 2 m) so water/base can look up which parcel is underneath, and the soft mask (~1 m):
  // R canal water, G parcel cover, B road. Built in a worker.
  const rast = await rasterAsync(layout, cx, cz, opts.maskSize ?? MASK);
  step.reset?.(); // waiting for the worker is not main-thread work
  const idTex = new THREE.DataTexture(rast.ids, IDS, IDS, THREE.RGBAFormat);
  idTex.needsUpdate = true;

  // uploaded as plain bytes: a 2048² canvas upload stalls the GPU process for ~200 ms
  const maskTex = new THREE.DataTexture(rast.mask, rast.maskSize, rast.maskSize, THREE.RGBAFormat);
  maskTex.colorSpace = THREE.NoColorSpace;
  maskTex.magFilter = THREE.LinearFilter; maskTex.minFilter = THREE.LinearMipmapLinearFilter; maskTex.generateMipmaps = true;
  maskTex.needsUpdate = true;
  maskTex.anisotropy = 4;

  const uniforms = {
    uGround: { value: groundTex }, uHasGround: { value: groundTex ? 1 : 0 },
    uMask: { value: maskTex }, uState: { value: stateTex }, uIds: { value: idTex },
    uEcology: { value: ecoTex },
    uFloodFrac: { value: 0.3 },
    uOuterRot: { value: new THREE.Vector2(1, 0) },
    uWinC: { value: new THREE.Vector2(cx, cz) }, // the tile's window centre (mask / id textures)
  };
  // outside the window, the procedural field mosaic follows the window's dominant field direction
  if (n) {
    const angs = parcels.map((p) => ((rowAngle(p.poly) % Math.PI) + Math.PI) % Math.PI).sort((a, b) => a - b);
    const a = angs[angs.length >> 1];
    uniforms.uOuterRot.value.set(Math.cos(a), Math.sin(a));
  }

  await step('maskbytes');
  // ---- parcels: triangulated tops + skirts, attribute aP = (index, rowAngle, creep, isSkirtBottom)
  const order = transitionOrder(parcels, layout.canals);
  const pos = [], nor = [], ap = [], idx = [];
  parcels.forEach((p, pi) => {
    const poly = p.poly;
    const ang = rowAngle(poly);
    const d = poly.map(([x, z]) => distToCanals(x, z, layout.canals));
    const dmin = Math.min(...d), dmax = Math.max(...d);
    const base = pos.length / 3;
    poly.forEach(([x, z], k) => {
      pos.push(x, H.dry, z); nor.push(0, 1, 0);
      ap.push(pi, ang, dmax > dmin ? (d[k] - dmin) / (dmax - dmin) : 0, 0);
    });
    const tri = triangulate(poly);
    // ShapeUtils returns CCW in (x,z) = clockwise seen from +Y: flip for up-facing
    for (let k = 0; k < tri.length; k += 3) idx.push(base + tri[k], base + tri[k + 2], base + tri[k + 1]);
    // skirt
    for (let k = 0; k < poly.length; k++) {
      const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length];
      const s = pos.length / 3;
      let nx = bz - az, nz = -(bx - ax); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      pos.push(ax, H.dry, az, bx, H.dry, bz, ax, -1.4, az, bx, -1.4, bz);
      for (let q = 0; q < 4; q++) nor.push(nx, 0, nz);
      const ca = dmax > dmin ? (d[k] - dmin) / (dmax - dmin) : 0, cb = dmax > dmin ? (d[(k + 1) % poly.length] - dmin) / (dmax - dmin) : 0;
      ap.push(pi, ang, ca, 0, pi, ang, cb, 0, pi, ang, ca, 1, pi, ang, cb, 1);
      idx.push(s, s + 2, s + 1, s + 1, s + 2, s + 3, s, s + 1, s + 2, s + 1, s + 3, s + 2); // both windings: polygon orientation varies
    }
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  pg.setAttribute('aP', new THREE.Float32BufferAttribute(ap, 4));
  pg.setIndex(idx);
  pg.computeBoundingSphere();

  const group = new THREE.Group();
  const mats = [];
  const mk = (kind, geo, extra = {}) => {
    const m = groundMaterial(kind, uniforms);
    mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    mesh.castShadow = extra.cast ?? false;
    mesh.name = 'land_' + kind;
    group.add(mesh);
    return mesh;
  };
  const parcelMesh = mk('PARCEL', pg);
  await step('parcels');
  mk('BUND', bundGeometry(parcels));
  await step('bunds');
  const banks = bankGeometry(layout.canals);
  if (banks) mk('BANK', banks);
  const roads = roadGeometry(layout.roads);
  if (roads) mk('ROAD', roads);
  // gardens / yards over the tile square only: the far field covers the rest of the commune
  const baseGeo = new THREE.PlaneGeometry(2000, 2000, 8, 8).rotateX(-Math.PI / 2).translate(cx, H.base, cz);
  mk('BASE', baseGeo);

  // ---- flood transitions
  const level = new Float32Array(n), from = new Float32Array(n), to = new Float32Array(n);
  let tStart = -1, animating = false, delays = null, dur = 1.2;
  const DUR = 1.2, STAG = 0.8;
  /** sweep: optional per-parcel start delays (s), e.g. when the radar swath passes each parcel */
  function setPass(i, instant = false, now = 0, sweep = null) {
    delays = sweep; dur = sweep ? 0.7 : DUR;
    let flooded = 0;
    for (let k = 0; k < n; k++) {
      const s = parcels[k].s;
      from[k] = level[k];
      to[k] = levelAt(s, i) ? 1 : 0;
      flooded += s[i] === 'W' ? 1 : 0;
      stateData[k * 4 + 1] = s[i] === 'W' ? 255 : s[i] === '-' ? 128 : 0;
      const appearance = fieldAppearance(s, i, opts.acquisitions);
      for (let j=0;j<3;j++) {
        ecoFrom[k*3+j]=ecoData[k*4+j]/255;
        ecoTo[k*3+j]=[appearance.standing,appearance.drained,appearance.longWet][j];
        if(instant)ecoData[k*4+j]=ecoTo[k*3+j]*255;
      }
      if (instant) { level[k] = to[k]; stateData[k * 4] = to[k] * 255; }
    }
    uniforms.uFloodFrac.value = n ? flooded / n : 0.3;
    stateTex.needsUpdate = true;
    ecoTex.needsUpdate = true;
    tStart = now; animating = !instant;
  }
  function update(now) {
    if (!animating) return;
    let done = true;
    for (let k = 0; k < n; k++) {
      // water creeps in near-canal first; drains in reverse order
      const rising = to[k] > from[k];
      const delay = delays ? delays[k] : (rising ? order[k] : 1 - order[k]) * STAG;
      let u = (now - tStart - delay) / dur;
      if (u < 1) done = false;
      u = Math.min(1, Math.max(0, u));
      u = u * u * (3 - 2 * u);
      level[k] = from[k] + (to[k] - from[k]) * u;
      stateData[k * 4] = Math.round(level[k] * 255);
      for(let j=0;j<3;j++)ecoData[k*4+j]=Math.round((ecoFrom[k*3+j]+(ecoTo[k*3+j]-ecoFrom[k*3+j])*u)*255);
    }
    stateTex.needsUpdate = true;
    ecoTex.needsUpdate = true;
    if (done) animating = false;
  }
  function setHighlight(i, v) {
    if (i < 0 || i >= n) return;
    stateData[i * 4 + 3] = v;
    stateTex.needsUpdate = true;
  }
  /** surface height under a world point (for placing birds/grass on fields) */
  function heightOfParcel(i) { return i < 0 ? H.base : H.dry + (H.wet - H.dry) * level[i]; }

  function dispose() {
    group.traverse((o) => o.geometry?.dispose()); // materials kept: see disposeTree() in life.js
    stateTex.dispose(); ecoTex.dispose(); idTex.dispose(); maskTex.dispose();
  }

  return { group, parcelMesh, uniforms, mats, stateTex, idTex, maskTex, setPass, update, setHighlight, heightOfParcel, level, dispose };
}

/** Canal / field bed seen through the water, one plane under the whole commune. */
export function createBed(size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2).translate(0, H.bed, 0), groundMaterial('BED', { uWinC: { value: new THREE.Vector2(1e6, 1e6) } }));
  m.receiveShadow = true; m.name = 'land_BED';
  return m;
}

/** Height of the built terrain (banks, roads, base) at x,z, ignoring parcels. Matches bank/road profiles. */
export function terrainHeight(layout, x, z) {
  let h = H.base;
  const ramp = (d, a, b, ha, hb) => (d <= a ? ha : d >= b ? hb : ha + ((hb - ha) * (d - a)) / (b - a));
  const near = reachGrid(layout).get(Math.floor(x / RG) * 100003 + Math.floor(z / RG));
  if (!near) return h;
  for (const c of near.canals) {
    const hw = (c.width_m || 4) / 2, pts = c.points;
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegXZ(x, z, pts[i - 1], pts[i]));
    if (hw >= 4) { if (d < hw + 9) h = Math.max(h, d < hw + 0.2 ? -1 : d < hw + 5 ? ramp(d, hw + 0.2, hw + 2.2, -0.1, H.bank) : ramp(d, hw + 5, hw + 9, H.bank, H.base)); }
    else if (d < hw + 3.2) h = Math.max(h, d < hw + 1.2 ? ramp(d, hw - 0.6, hw + 1.2, -0.8, 0.5) : ramp(d, hw + 2.2, hw + 3.2, 0.5, H.base));
  }
  for (const r of near.roads) {
    const hw = (r.width_m || 4) / 2, pts = r.points;
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegXZ(x, z, pts[i - 1], pts[i]));
    if (d < hw + 2) h = Math.max(h, ramp(d, hw, hw + 2, H.bank + 0.06, H.base));
  }
  return h;
}
// cell -> {canals, roads} whose profile (<= half width + 9 m) can reach into the cell; built once per layout
const RG = 64;
function reachGrid(layout) {
  if (layout._reach) return layout._reach;
  const g = new Map();
  const add = (kind, line, reach) => {
    const pts = line.points;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      for (let gx = Math.floor((Math.min(ax, bx) - reach) / RG); gx <= Math.floor((Math.max(ax, bx) + reach) / RG); gx++)
        for (let gz = Math.floor((Math.min(az, bz) - reach) / RG); gz <= Math.floor((Math.max(az, bz) + reach) / RG); gz++) {
          const k = gx * 100003 + gz;
          let e = g.get(k);
          if (!e) g.set(k, (e = { canals: [], roads: [] }));
          if (!e[kind].includes(line)) e[kind].push(line);
        }
    }
  };
  // a segment's bbox can be large: for long diagonal segments this over-covers, which only costs time, not accuracy
  for (const c of layout.canals) add('canals', c, (c.width_m || 4) / 2 + 10);
  for (const r of layout.roads) add('roads', r, (r.width_m || 4) / 2 + 3);
  Object.defineProperty(layout, '_reach', { value: g, enumerable: false });
  return g;
}

function distToSegXZ(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  let u = l2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / l2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(a[0] + u * dx - px, a[1] + u * dz - pz);
}

function hash(x) { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); }

// Dominant edge direction (longest edge) so rice rows follow the field.
function rowAngle(poly) {
  let best = 0, ang = 0;
  for (let k = 0; k < poly.length; k++) {
    const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l > best) { best = l; ang = Math.atan2(bz - az, bx - ax); }
  }
  return ang;
}

// Profile ribbon along a polyline. profile = [[offset, y], ...] across (left to right).
function ribbon(points, profile, step = 0) {
  const pts = step ? resample(points, step) : points;
  const nP = profile.length, pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    // miter: scale by 1/cos of half angle (bounded)
    let m = 1;
    if (i > 0 && i < pts.length - 1) {
      const t1x = p[0] - a[0], t1z = p[1] - a[1], l1 = Math.hypot(t1x, t1z) || 1;
      m = 1 / Math.max(0.5, (t1x / l1) * tx + (t1z / l1) * tz);
    }
    const nx = -tz, nz = tx;
    for (const [o, y] of profile) pos.push(p[0] + nx * o * m, y, p[1] + nz * o * m);
  }
  for (let i = 0; i + 1 < pts.length; i++)
    for (let k = 0; k + 1 < nP; k++) {
      const a = i * nP + k, b = a + 1, c = a + nP, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make normals face up whatever the winding
  const nA = g.attributes.normal;
  for (let i = 0; i < nA.count; i++) if (nA.getY(i) < 0) nA.setXYZ(i, -nA.getX(i), -nA.getY(i), -nA.getZ(i));
  return g;
}

function resample(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(L / step));
    for (let j = 1; j <= k; j++) out.push([ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k]);
  }
  return out;
}

function bundGeometry(parcels) {
  // per edge: a low earthen mound centred on the boundary, extended a little at both ends to close corners
  // trapezoid: flat walkable crest, steep-ish flanks (reads as packed earth, not a pipe)
  const prof = [[-1.7, -0.7], [-0.75, H.bund - 0.08], [-0.45, H.bund], [0.45, H.bund], [0.75, H.bund - 0.08], [1.7, -0.7]];
  const P = prof.length;
  const pos = [], idx = [];
  for (const p of parcels) {
    const poly = p.poly;
    for (let k = 0; k < poly.length; k++) {
      const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length];
      let tx = bx - ax, tz = bz - az; const L = Math.hypot(tx, tz); if (L < 0.5) continue; tx /= L; tz /= L;
      const nx = -tz, nz = tx, e = 0.7, base = pos.length / 3;
      for (const [px, pz] of [[ax - tx * e, az - tz * e], [bx + tx * e, bz + tz * e]])
        for (const [o, y] of prof) pos.push(px + nx * o, y, pz + nz * o);
      for (let q = 0; q < P - 1; q++) idx.push(base + q, base + q + 1, base + P + q, base + q + 1, base + P + 1 + q, base + P + q);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nA = g.attributes.normal;
  for (let i = 0; i < nA.count; i++) if (nA.getY(i) < 0) nA.setXYZ(i, -nA.getX(i), -nA.getY(i), -nA.getZ(i));
  return g;
}

function bankGeometry(canals) {
  const parts = [];
  for (const c of canals) {
    const hw = (c.width_m || 4) / 2;
    const big = hw >= 4;
    const side = big
      ? [[hw - 1.6, -1.45], [hw + 0.2, -0.1], [hw + 2.2, H.bank], [hw + 5, H.bank + 0.05], [hw + 9, H.base - 0.05]]
      : [[hw - 0.6, -0.8], [hw + 0.5, 0.1], [hw + 1.2, 0.5], [hw + 2.2, 0.5], [hw + 3.2, H.base - 0.05]];
    parts.push(ribbon(c.points, side, 6));
    parts.push(ribbon(c.points, side.map(([o, y]) => [-o, y]).reverse(), 6));
  }
  return parts.length ? mergeGeometries(parts) : null;
}

function roadGeometry(roads) {
  const parts = roads.map((r) => {
    const hw = (r.width_m || 4) / 2;
    const g=ribbon(r.points, [[-hw - 2, H.base - 0.05], [-hw, H.bank + 0.06], [hw, H.bank + 0.06], [hw + 2, H.base - 0.05]], 6);
    const type=roadClass(r).surface;
    g.setAttribute('aRoad',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(type==='asphalt'?2:type==='concrete'?1:0),1));return g;
  });
  return parts.length ? mergeGeometries(parts) : null;
}

// ---------------------------------------------------------------- ground shader
const GROUND_PRE = /* glsl */ `
uniform sampler2D uGround; uniform float uHasGround; uniform sampler2D uMask; uniform sampler2D uState; uniform sampler2D uIds;
uniform float uFloodFrac; uniform vec2 uOuterRot; uniform vec2 uWinC;
varying vec4 vSt; varying vec2 vRow; varying vec3 vEcology;
#if KIND == 3
varying float vRoad;
#endif
vec4 parcelState(vec2 xz){
  vec2 uv = (xz - uWinC + 1000.) / 2000.;
  if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return vec4(-1.);
  vec4 c = texelFetch(uIds, ivec2(uv * 1024.), 0);
  float id = floor(c.r * 255. + .5) + floor(c.g * 255. + .5) * 256. - 1.;
  if (id < 0.) return vec4(-1.);
  return texelFetch(uState, ivec2(int(mod(id, 256.)), int(id / 256.)), 0);
}
vec3 perturbN(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)); vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm; vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
// anti-aliased stripe 0..1 with period p along coordinate t; fades to its mean when sub-pixel
float stripe(float t, float p, float duty){
  float w = fwidth(t) / p; float f = fract(t / p);
  float s = smoothstep(0., .5 * duty, f) * (1. - smoothstep(duty, duty + .25, f));
  return mix(s, duty * .8, smoothstep(.15, .45, w));
}
`;

// gCol / gH (bump height) / gRough are computed here from KIND
const GROUND_MAP = /* glsl */ `
  vec2 xz = vWorldP.xz;
  vec2 wuv = uvWin(xz - uWinC);
  float inWin = step(0., wuv.x) * step(wuv.x, 1.) * step(0., wuv.y) * step(wuv.y, 1.);
  vec4 mask = inWin > .5 ? texture2D(uMask, wuv) : vec4(0.);
  float n1 = fbm(xz / 3.1), n2 = fbm(xz / 17.), n3 = fbm(xz / 70.);
  // fine grain only where it can resolve (fades with pixel footprint)
  float fine = mix(vnoise(xz * 2.3) * .6 + vnoise(xz * 6.1) * .4, .5, smoothstep(.15, .6, fwidth(xz.x) * 2.3));
  vec3 gCol; float gH = 0.; float gRough = .92;
  vec3 straw = mix(vec3(.30, .22, .11), vec3(.46, .37, .20), n1);
  vec3 grass = mix(vec3(.07, .13, .03), vec3(.16, .23, .06), n1);
  vec3 soil  = mix(vec3(.13, .095, .06), vec3(.22, .16, .10), n2);
  vec3 wetmud = vec3(.055, .045, .032);
#if KIND == 0
  // PARCEL
  float crop = vSt.b, state = vSt.g, flood = vSt.r;
  vec2 rd = vec2(cos(vRow.x), sin(vRow.x));
  float along = dot(xz, rd), across = dot(xz, vec2(-rd.y, rd.x));
  float rows = stripe(across, .32, .45);
  float swath = stripe(across + n2 * 1.5, 2.3, .5);
  vec3 c;
  if (crop < .55) { c = mix(straw * .82, straw * 1.12, swath) * mix(.86, 1., rows); gH = rows * .6 + swath * .4; }
  else if (crop < .74) { c = mix(soil * .7, soil, n1) * (.9 + .2 * stripe(across, .9, .5)); gH = stripe(across, .9, .5); gRough = .8; }
  else { float young = smoothstep(.74, 1., crop); c = mix(grass, mix(grass, straw, .25), n2) * mix(.75, 1.05, rows); c = mix(c, c * vec3(.9, 1.15, .7), young); gH = rows; }
  // patchy green regrowth and wet hollows
  c = mix(c, grass * 1.1, smoothstep(.62, .8, n2) * .35 * step(crop, .55));
  float wet = max(flood, smoothstep(.55, .75, n3) * .4);
  c = mix(c, wetmud * (1. + .6 * n1), wet);
  gRough = mix(gRough, .45, wet);
  gCol = c;
  // A standing crop, post-flood silt and submerged stubble have distinct
  // appearances. Species and management practices remain illustrative.
  vec3 rice = mix(vec3(.10,.23,.035),vec3(.43,.37,.095),crop*.65) * (.8+.35*rows);
  float crack = smoothstep(.46,.5,vnoise(xz*1.8));
  vec3 silt = mix(vec3(.12,.075,.04),vec3(.22,.15,.085),n1) * mix(.55,1.,crack);
  silt = mix(silt,vec3(.09,.20,.04),smoothstep(.65,.78,n2)*.55);
  gCol = mix(gCol,rice,vEcology.r*(1.-flood));
  gCol = mix(gCol,silt,vEcology.g*(1.-flood));
  // Sparse illustrative post-harvest ash patches, not a burn detection layer.
  float ash = step(.87,crop)*smoothstep(.56,.72,n2)*vEcology.g*(1.-flood);
  gCol = mix(gCol,mix(vec3(.035,.033,.03),vec3(.16,.15,.13),fine),ash);
  gRough = mix(gRough,.38,vEcology.g*(1.-flood));
#elif KIND == 1
  // BUND: grass top, bare soil flanks, wet near water
  gCol = mix(soil, grass, smoothstep(.3, .58, vWorldP.y) * (.6 + .4 * n1));
  gH = n1 * .4 + fine; gCol *= .75 + .5 * fine;
#elif KIND == 2
  // BANK
  gCol = mix(soil * .8, grass, smoothstep(.15, .6, vWorldP.y) * (.75 + .25 * n2));
  gH = n1 * .4 + fine; gCol *= .75 + .5 * fine;
#elif KIND == 3
  // Roads follow source highway classes, not a single laterite texture.
  gCol = mix(vec3(.15, .095, .06), vec3(.21, .15, .10), n1) * (.8 + .4 * fine);
  if(vRoad>.5)gCol=mix(vec3(.32,.33,.31),vec3(.48,.49,.46),fine)*(.92+.08*n1);
  if(vRoad>1.5)gCol=mix(vec3(.045,.052,.050),vec3(.09,.10,.095),fine);
  gRough = .85; gH = n1 * .3 + fine * .5;
#elif KIND == 4
  // BASE: gardens, house plots, outside window a mosaic of fields that floods with the season
  if (inWin > .5) {
    if (mask.r > .5 || mask.g > .55) discard;
    // home gardens: dense dark greens with lighter grass openings and bare yards
    vec3 garden = mix(vec3(.035, .07, .02), vec3(.06, .11, .03), n1);
    vec3 litter = mix(soil*.85,straw*.65,smoothstep(.66,.74,fine));
    gCol = mix(garden, litter, smoothstep(.35, .67, n2));
    gCol = mix(gCol,wetmud,smoothstep(.65,.76,n3)*.45);
    gCol = mix(gCol, soil * .9, smoothstep(.62, .8, n3) * .6);
    gCol *= .7 + .6 * fine;
  } else {
    vec2 q = vec2(dot(xz, uOuterRot), dot(xz, vec2(-uOuterRot.y, uOuterRot.x)));
    vec2 cell = floor(q / vec2(150., 46.));
    vec2 f = fract(q / vec2(150., 46.));
    float h = hash12(cell);
    float border = min(min(f.x, 1. - f.x) * 150., min(f.y, 1. - f.y) * 46.);
    if (h < uFloodFrac * 1.1 && border > 1.2) discard;
    gCol = border < 1.2 ? grass : (h > .8 ? grass * 1.2 : mix(straw * .85, soil, step(.6, fract(h * 7.))));
  }
  gH = n1;
  gH = n1 * .4 + fine;
#else
  // BED (seen through water)
  gCol = vec3(.05, .045, .03); gRough = 1.;
#endif
  // satellite macro colour: keeps the real field mosaic visible from far
  vec2 fuv = uvFrame(xz);
  if (uHasGround > .5 && inWin > .5 && fuv == clamp(fuv, 0., 1.)) {
    // the mosaic is growing season (green): use only its brightness near; blend toward it far away (meets the far field)
    vec3 macro = texture2D(uGround, fuv).rgb;
    float ml = dot(macro, vec3(.3, .59, .11));
    gCol *= clamp(.7 + ml * 3.5, .7, 1.35);
    float far = smoothstep(150., 1200., length(vViewPosition)) * .2 + smoothstep(1200., 5000., length(vViewPosition)) * .55;
    gCol = mix(gCol, macro * .8, far);
  }
  // darker wet rim at the water line
  gCol *= mix(.55, 1., smoothstep(.0, .18, vWorldP.y));
  gRough = mix(.4, gRough, smoothstep(.0, .15, vWorldP.y));
  gCol *= .9 + .2 * n2;
#if KIND == 0
  // no-data hatch (greyed) and highlight
  if (state > .3 && state < .7) {
    float hatch = stripe(xz.x + xz.y, 6., .18);
    gCol = mix(vec3(dot(gCol, vec3(.3, .59, .11))) * .9, vec3(.16, .17, .16), .35 + .4 * hatch);
  }
  gCol = mix(gCol, vec3(.86, .88, .84) * .5, step(.3, vSt.a) * step(vSt.a, .7) * .22);
  gCol = mix(gCol, vec3(.84, .47, .1) * .6, step(.7, vSt.a) * .3);
#endif
#if KIND == 1 || KIND == 2
  if (inWin > .5 && mask.r > .8 && vWorldP.y > .05) discard; // no dams across other canals
#endif
  diffuseColor.rgb = gCol;
`;

const RADAR = {
  0: 'mix(radarAt(vWorldP.xz), .42, .45 * step(radarAt(vWorldP.xz), .2))',
  1: 'radarAt(vWorldP.xz) * 1.1', 2: 'radarAt(vWorldP.xz) * 1.15', 3: '.28', 4: 'radarAt(vWorldP.xz)', 5: '.02',
};

const KINDS = { PARCEL: 0, BUND: 1, BANK: 2, ROAD: 3, BASE: 4, BED: 5 };

function groundMaterial(kind, uniforms) {
  const K = KINDS[kind];
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0.6 });
  m.defines = { KIND: K };
  if (K === 5) m.dithering = true;
  patch(m, {
    key: 'ground' + K,
    uniforms,
    radar: RADAR[K],
    vertexPre: K === 0 ? `attribute vec4 aP; uniform sampler2D uState; uniform sampler2D uEcology; varying vec4 vSt; varying vec2 vRow; varying vec3 vEcology;` : `varying vec4 vSt; varying vec2 vRow; varying vec3 vEcology;${K===3?'attribute float aRoad; varying float vRoad;':''}`,
    vertexMain: K === 0
      ? `vec4 st = texelFetch(uState, ivec2(int(mod(aP.x, 256.)), int(aP.x / 256.)), 0);
         vSt = st; vRow = aP.yz;
         vEcology = texelFetch(uEcology, ivec2(int(mod(aP.x,256.)),int(aP.x/256.)),0).rgb;
         float k = clamp(st.r * 1.6 - aP.z * .6, 0., 1.); k = k * k * (3. - 2. * k);
         if (aP.w < .5) transformed.y = mix(${H.dry.toFixed(2)}, ${H.wet.toFixed(2)}, k);`
      : `vSt = vec4(0.); vRow = vec2(0.); vEcology=vec3(0.);${K===3?'vRoad=aRoad;':''}`,
    fragPre: GROUND_PRE,
    fragMap: GROUND_MAP,
    fragRough: 'float roughnessFactor = gRough;',
    fragNormal: 'normal = perturbN(-vViewPosition, normal, vec2(dFdx(gH), dFdy(gH)) * .06, faceDirection);',
  });
  return m;
}
