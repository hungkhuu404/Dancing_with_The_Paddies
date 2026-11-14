// Far field: one cheap ground plane over the whole commune frame (and a margin around it), drawn wherever no near tile
// is shown. Colour from the whole-frame satellite mosaic, flood state per 250 m block from the contract data (the same
// cells as the map): a flooded block is cut out so the water plane shows through, '-' is hatched, outside the commune
// is darker and desaturated. Tree gardens get a clumped-canopy texture so the far field does not read as bare.
import * as THREE from 'three';
import { patch } from './shaderlib.js';
import { packCells } from '../data/commune.js';
import { H } from './land.js';

export const MAX_NEAR = 9; // shader loop bound for the near-tile cut-outs

const PRE = /* glsl */ `
uniform sampler2D uGround; uniform float uHasGround; uniform sampler2D uMaskC; uniform float uHasMask;
uniform sampler2D uCells; uniform sampler2D uParcels; uniform float uHasParcels; uniform vec2 uCellN; uniform vec4 uNear[${MAX_NEAR}]; uniform vec4 uSweep;
vec3 perturbN(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)); vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm; vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

const MAP = /* glsl */ `
  vec2 xz = vWorldP.xz;
  // fixed-count loop and every discard at the end: D3D's compiler is slow (and warns) on discards/branches before derivatives
  bool cut = false;
  for (int i = 0; i < ${MAX_NEAR}; i++) { vec4 r = uNear[i]; cut = cut || (xz.x > r.x && xz.x < r.z && xz.y > r.y && xz.y < r.w); } // a near tile draws here
  vec2 fuv = uvFrame(xz);
  float inF = step(0., fuv.x) * step(fuv.x, 1.) * step(0., fuv.y) * step(fuv.y, 1.);
  float n1 = fbm(xz / 23.), n2 = fbm(xz / 90.);
  vec3 macro = uHasGround > .5 && inF > .5 ? texture2D(uGround, fuv).rgb : mix(vec3(.035, .05, .02), vec3(.09, .075, .04), n2);
  float inside = inF > .5 ? (uHasMask > .5 ? texture2D(uMaskC, fuv).r : 1.) : 0.;
  // Geometry atlas: each field maps to the cell under its CENTROID, never
  // interpolated grid borders or noise pretending to be parcel boundaries.
  vec4 parcel = texture2D(uParcels, clamp(fuv, 0., 1.));
  vec2 cell = floor(parcel.rg * 255. + .5) - 1.;
  vec2 cuv = (cell + .5) / uCellN;
  float field = step(.5, parcel.b) * uHasParcels * inF;
  vec4 c = field > .5 ? texelFetch(uCells, ivec2(cell), 0) : vec4(0.);
  float lvl = c.g;
  if (uSweep.w > .5) { // radar sweep under way: blocks ahead of the front keep the previous state
    vec2 cc = (floor(cuv * uCellN) + .5) / uCellN;
    vec2 cw = vec2(uFrame.x + cc.x * uFrame.z, -(uFrame.y + cc.y * uFrame.w));
    if (dot(cw, uSweep.xy) > uSweep.z) lvl = c.r;
  }
  cut = cut || (c.a > .5 && lvl > .5 && inside > .3); // flooded: the water plane shows
  float lum = dot(macro, vec3(.3, .59, .11));
  float green = macro.g - max(macro.r, macro.b);
  float canopy = smoothstep(.004, .03, green) * smoothstep(.13, .04, lum); // dark greens = tree gardens / villages
  vec3 col = macro * (.82 + .36 * n1);
  float crowns = vnoise(xz / 5.) * .6 + vnoise(xz / 2.1) * .4;
  float fineK = 1. - smoothstep(.4, 2.5, fwidth(xz.x));
  col = mix(col, col * mix(1., .5 + .9 * crowns, fineK) * vec3(.85, 1., .75), canopy);
  float gH = (canopy * crowns * 3. + n1 * .4) * fineK;
  // wet ground around flooded blocks and on blocks that dried recently
  col *= 1. - .25 * smoothstep(.3, .9, c.r) * (1. - lvl);
  // no data on this pass: greyed and hatched, as on the near fields
  if (c.a > .5 && c.b > .5 && inside > .3) {
    float t = (xz.x + xz.y) / 18.; float w = fwidth(t);
    float hatch = mix(smoothstep(.0, .09, fract(t)) * (1. - smoothstep(.18, .27, fract(t))), .15, smoothstep(.15, .45, w));
    col = mix(vec3(lum) * .9, vec3(.16, .17, .16), .35 + .4 * hatch);
  }
  // outside the commune: darker and desaturated so the outline reads from high up
  col = mix(vec3(dot(col, vec3(.3, .59, .11))) * .6, col, .25 + .75 * inside) * mix(.55, 1., inside);
  if (cut) discard;
  diffuseColor.rgb = col;
`;

/**
 * rect: frame in scene coords {x0,x1,z0,z1}; grid: cellGrid() of the contract series (or null);
 * groundTex / maskTex: whole-frame mosaics (or null).
 */
export function createFarField({ rect, grid, groundTex, maskTex, parcelTex, margin = 6000 }) {
  const cols = grid?.cols || 1, rows = grid?.rows || 1;
  const data = new Uint8Array(cols * rows * 4);
  const cells = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);
  cells.magFilter = cells.minFilter = THREE.NearestFilter;
  cells.needsUpdate = true;
  const near = Array.from({ length: MAX_NEAR }, () => new THREE.Vector4(1e9, 1e9, -1e9, -1e9));
  const uniforms = {
    uGround: { value: groundTex }, uHasGround: { value: groundTex ? 1 : 0 },
    uMaskC: { value: maskTex }, uHasMask: { value: maskTex ? 1 : 0 },
    uParcels: { value: parcelTex || maskTex }, uHasParcels: { value: parcelTex ? 1 : 0 },
    uCells: { value: cells }, uCellN: { value: new THREE.Vector2(cols, rows) },
    uNear: { value: near }, uSweep: { value: new THREE.Vector4(0, 1, 0, 0) },
  };
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, envMapIntensity: 0.6 });
  patch(m, {
    key: 'farfield', uniforms, radar: 'radarAt(vWorldP.xz)',
    fragPre: PRE, fragMap: MAP,
    fragNormal: 'normal = perturbN(-vViewPosition, normal, vec2(dFdx(gH), dFdy(gH)) * .08, faceDirection);',
  });
  const w = rect.x1 - rect.x0 + 2 * margin, h = rect.z1 - rect.z0 + 2 * margin;
  const geo = new THREE.PlaneGeometry(w, h, 1, 1).rotateX(-Math.PI / 2).translate((rect.x0 + rect.x1) / 2, H.base, (rect.z0 + rect.z1) / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true; mesh.name = 'farfield';
  mesh.frustumCulled = false;

  return {
    mesh, size: Math.max(w, h), sweep: uniforms.uSweep.value,
    /** States shown: G = pass `to`; R = pass `from` (kept ahead of a sweep front). */
    setPass(from, to = from) { if (grid) { packCells(grid, from, to, data); cells.needsUpdate = true; } },
    /** Squares (scene coords) covered by shown near tiles: [{x, z}], half = tile half size. */
    setNear(tiles, half) {
      const n = Math.min(MAX_NEAR, tiles.length);
      for (let i = 0; i < MAX_NEAR; i++) if (i < n) near[i].set(tiles[i].x - half, tiles[i].z - half, tiles[i].x + half, tiles[i].z + half); else near[i].set(1e9, 1e9, -1e9, -1e9);
    },
  };
}
