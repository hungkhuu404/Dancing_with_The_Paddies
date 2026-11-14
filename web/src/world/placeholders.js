// Procedural stand-ins for the living-world models (used until/unless public/models/<name>.glb exists).
// Vertex-coloured, metres, origin at the base, front +Z (boats: waterline; long structures span +X).
import * as THREE from 'three';
import { paint, merge } from '../scene/props.js';

const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) => {
  if (s) g.scale(...(Array.isArray(s) ? s : [s, s, s]));
  if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
  return g.translate(x, y, z);
};
const C = (g, c, j = 0) => paint(g, c[0], c[1], c[2], j);
const cyl = (r0, r1, h, s = 6) => new THREE.CylinderGeometry(r1, r0, h, s, 1).translate(0, h / 2, 0); // base at y=0
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const ball = (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);
/** a bar between two points */
function bar(a, b, r, col, s = 5) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, s, 1).translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return C(g.translate(A.x, A.y, A.z), col);
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const SKIN = [0.42, 0.26, 0.16], STRAW = [0.62, 0.5, 0.3], DARK = [0.06, 0.06, 0.07], BAMBOO = [0.42, 0.36, 0.2], WOOD = [0.3, 0.2, 0.11];

/** Standing person ~1.6 m. kind: wader | fisher | washer | kid | herder | rider */
export function person(kind = 'wader') {
  const shirt = { wader: [0.32, 0.4, 0.5], fisher: [0.18, 0.2, 0.24], washer: [0.62, 0.3, 0.38], kid: [0.8, 0.8, 0.76], herder: [0.42, 0.3, 0.2], rider: [0.6, 0.6, 0.62] }[kind] || [0.4, 0.4, 0.4];
  const pants = kind === 'washer' ? [0.08, 0.08, 0.1] : kind === 'kid' ? [0.15, 0.2, 0.4] : [0.12, 0.1, 0.08];
  const p = [];
  for (const x of [-0.09, 0.09]) p.push(C(T(cyl(0.06, 0.07, 0.8, 5), x), pants));
  p.push(C(T(cyl(0.16, 0.14, 0.62, 7), 0, 0.78), shirt));
  for (const x of [-0.21, 0.21]) p.push(C(T(cyl(0.045, 0.05, 0.6, 5), x, 0.82, 0.02, 0, 0, x > 0 ? 0.08 : -0.08), shirt));
  p.push(C(T(ball(0.11), 0, 1.5), SKIN));
  if (kind !== 'kid') p.push(C(T(new THREE.ConeGeometry(0.3, 0.2, 10, 1, true).translate(0, 0.1, 0), 0, 1.56), STRAW));
  if (kind === 'herder') p.push(bar([0.2, 1.0, 0.1], [0.3, 1.9, 3.8], 0.02, BAMBOO));
  if (kind === 'fisher') p.push(bar([0.2, 1.1, 0.2], [0.3, 2.2, 2.6], 0.018, BAMBOO));
  const g = merge(p);
  if (kind === 'kid') g.scale(0.72, 0.72, 0.72);
  return g;
}

export function dog() {
  const c = [0.55, 0.4, 0.22];
  return merge([
    C(T(new THREE.BoxGeometry(0.62, 0.26, 0.24), 0, 0.42, 0, 0, Math.PI / 2), c),
    ...[[-0.08, 0.22], [0.08, 0.22], [-0.08, -0.22], [0.08, -0.22]].map(([x, z]) => C(T(cyl(0.03, 0.03, 0.32, 4), x, 0, z), c)),
    C(T(new THREE.BoxGeometry(0.18, 0.2, 0.26), 0, 0.6, 0.36), c),
    C(T(new THREE.BoxGeometry(0.1, 0.1, 0.14), 0, 0.56, 0.52), [0.2, 0.15, 0.1]),
    ...[-0.06, 0.06].map((x) => C(T(new THREE.ConeGeometry(0.035, 0.1, 4), x, 0.74, 0.32), c)),
    bar([0, 0.48, -0.3], [0, 0.66, -0.5], 0.025, c),
  ]);
}

/** Duck, origin at the waterline (body half under water when y = 0). */
export function duck() {
  const w = rnd() < 0.7 ? [0.82, 0.8, 0.74] : [0.4, 0.3, 0.2];
  return merge([
    C(T(ball(0.13, 8, 6), 0, 0.04, 0, 0, 0, 0, [0.85, 0.7, 1.45]), w),
    C(T(ball(0.065), 0, 0.2, 0.16), w),
    C(T(new THREE.BoxGeometry(0.05, 0.02, 0.08), 0, 0.19, 0.24), [0.85, 0.55, 0.12]),
    C(T(new THREE.ConeGeometry(0.05, 0.1, 5), 0, 0.1, -0.2, -1.2), w),
  ]);
}

export function buffalo() {
  const c = [0.13, 0.12, 0.12];
  const p = [C(T(ball(0.6, 9, 7), 0, 1.0, 0, 0, 0, 0, [0.95, 0.85, 1.75]), c)];
  for (const [x, z] of [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]]) p.push(C(T(cyl(0.09, 0.11, 0.85, 5), x, 0, z), c));
  p.push(C(T(new THREE.BoxGeometry(0.36, 0.38, 0.6), 0, 1.05, 1.15, 0.5), c));
  for (const s of [-1, 1]) p.push(bar([0.14 * s, 1.25, 1.05], [0.62 * s, 1.42, 0.8], 0.045, [0.45, 0.42, 0.36]));
  return merge(p);
}

/** Motorbike + rider, 1.9 m, front +Z. */
export function motorbike() {
  const body = [[0.55, 0.08, 0.1], [0.12, 0.25, 0.55], [0.7, 0.7, 0.72]][Math.floor(rnd() * 3)];
  const p = [];
  for (const z of [-0.66, 0.66]) p.push(C(T(new THREE.TorusGeometry(0.27, 0.06, 5, 12), 0, 0.33, z, 0, Math.PI / 2), DARK));
  p.push(C(T(new THREE.BoxGeometry(0.3, 0.3, 1.1), 0, 0.62, -0.05), body));
  p.push(C(T(new THREE.BoxGeometry(0.28, 0.1, 0.62), 0, 0.82, -0.25), DARK));
  p.push(bar([0, 0.4, 0.62], [0, 1.0, 0.5], 0.03, [0.5, 0.5, 0.5]));
  p.push(bar([-0.32, 1.0, 0.48], [0.32, 1.0, 0.48], 0.02, DARK));
  const rider = person('rider');
  // seated: torso/head above the saddle; legs fold forward
  const pos = rider.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.8) { pos.setZ(i, pos.getZ(i) + (0.8 - y) * 0.6); pos.setY(i, 0.85 - (0.8 - y) * 0.75); }
    else pos.setY(i, y + 0.08);
  }
  rider.translate(0, 0, -0.3);
  rider.computeVertexNormals();
  p.push(rider);
  return merge(p);
}

function hull(L, W, H, col, flat = 0.4) {
  const g = new THREE.BoxGeometry(W, H, L, 3, 2, 14);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i) / (L / 2), y = pos.getY(i);
    const taper = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z), 2.2 + (z > 0 ? 0 : -flat))), 0.6);
    pos.setX(i, pos.getX(i) * Math.max(0.05, taper) * (y < 0 ? 0.55 + 0.45 * taper : 1));
    pos.setY(i, y + H / 2 - 0.12 + (y > 0 ? 0.18 * z * z : 0.06 * z * z));
  }
  g.computeVertexNormals();
  return C(g, col, 0.08);
}
/** Xuong (small rowing boat) without a rower, ~5 m. */
export function xuong() {
  return merge([hull(5.2, 1.05, 0.45, [0.13, 0.085, 0.05]), C(T(new THREE.BoxGeometry(0.8, 0.03, 0.3), 0, 0.25, 0.9), WOOD), C(T(new THREE.BoxGeometry(0.8, 0.03, 0.3), 0, 0.25, -1.1), WOOD)]);
}
export function longtail() {
  const p = [hull(8, 1.25, 0.6, [0.12, 0.22, 0.3], 0.6), C(T(new THREE.BoxGeometry(0.42, 0.34, 0.6), 0, 0.55, -3.5), [0.25, 0.25, 0.25])];
  p.push(bar([0, 0.6, -3.7], [0, -0.05, -6.4], 0.03, [0.4, 0.4, 0.4]));
  p.push(C(T(new THREE.BoxGeometry(1.0, 0.03, 0.4), 0, 0.42, 1.0), WOOD));
  const helm = person('fisher'); helm.translate(0, 0.2, -2.9); p.push(helm);
  return merge(p);
}
export function cargoBoat() {
  return merge([
    hull(22, 4.2, 1.6, [0.16, 0.12, 0.09], 0.2),
    C(T(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.1, 1.5, 0, 0, 0, [1.5, 0.9, 6]), [0.55, 0.45, 0.33], 0.1),
    C(T(box(3.2, 2.0, 3.4), 0, 1.2, -7.6), [0.5, 0.42, 0.3]),
    C(T(box(3.5, 0.15, 3.8), 0, 3.2, -7.6), [0.2, 0.3, 0.32]),
  ]);
}
/** Hyacinth mat ~1.6 m: glossy rosettes with a few lilac spikes, origin at the water surface. */
export function hyacinth() {
  const p = [];
  for (let k = 0; k < 9; k++) {
    const cx = (rnd() - 0.5) * 1.3, cz = (rnd() - 0.5) * 1.3;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rnd();
      const leaf = new THREE.CircleGeometry(0.11, 6).rotateX(-Math.PI / 2 + 0.7).translate(0, 0.08, 0.12).rotateY(a);
      p.push(C(T(leaf, cx, 0.02, cz), [0.12 + rnd() * 0.05, 0.3 + rnd() * 0.08, 0.06], 0.1));
    }
    if (rnd() < 0.35) p.push(C(T(cyl(0.025, 0.012, 0.22, 4), cx, 0.08, cz), [0.55, 0.42, 0.75]));
  }
  return merge(p);
}
export function farHyacinth() {
  const p = [];
  for (let k = 0; k < 4; k++) p.push(C(T(new THREE.IcosahedronGeometry(0.45, 0), (rnd() - 0.5) * 1.2, 0.05, (rnd() - 0.5) * 1.2, 0, 0, 0, [1, 0.25, 1]), [0.14, 0.3, 0.07], 0.15));
  return merge(p);
}
export function strawPile() {
  return C(T(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0, 0, 0, [2.1, 1.25, 2.1]), [0.62, 0.52, 0.3], 0.15);
}

// ---------------------------------------------------------------- structures
export function bridgeMonkey() {
  // 12 m along +X, deck arching ~1.6 m over the canal centre; bamboo X-legs into the water
  const p = [], N = 8;
  const y = (x) => 0.1 + 1.6 * (1 - Math.pow((x / 6), 2));
  for (let i = 0; i < N; i++) {
    const x0 = -6 + (12 * i) / N, x1 = -6 + (12 * (i + 1)) / N;
    p.push(bar([x0, y(x0), 0], [x1, y(x1), 0], 0.07, BAMBOO));
    p.push(bar([x0, y(x0) + 0.9, 0.35], [x1, y(x1) + 0.9, 0.35], 0.03, BAMBOO));
  }
  for (let i = 1; i < N; i++) {
    const x = -6 + (12 * i) / N;
    p.push(bar([x - 0.3, -1.6, -0.5], [x + 0.1, y(x) + 0.25, 0.1], 0.04, BAMBOO), bar([x + 0.3, -1.6, 0.5], [x - 0.1, y(x) + 0.25, -0.1], 0.04, BAMBOO));
    p.push(bar([x, y(x), 0.35], [x, y(x) + 0.95, 0.35], 0.025, BAMBOO));
  }
  return merge(p);
}
export function bridgeConcrete() {
  // 14 m along +X, 3 m wide deck with railings, slight camber, two piers
  const p = [], grey = [0.55, 0.54, 0.5];
  const deck = new THREE.BoxGeometry(14, 0.35, 3, 14, 1, 1).translate(0, 0.2, 0);
  const pos = deck.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + 0.9 * (1 - Math.pow(pos.getX(i) / 7, 2)));
  deck.computeVertexNormals();
  p.push(C(deck, grey, 0.05));
  for (const z of [-1.45, 1.45]) {
    for (let x = -6.5; x <= 6.5; x += 1) p.push(C(T(box(0.12, 0.85, 0.12), x, 0.35 + 0.9 * (1 - (x / 7) ** 2), z), [0.75, 0.74, 0.7]));
    for (let i = 0; i < 7; i++) { const x0 = -7 + 2 * i, x1 = x0 + 2; p.push(bar([x0, 1.2 + 0.9 * (1 - (x0 / 7) ** 2), z], [x1, 1.2 + 0.9 * (1 - (x1 / 7) ** 2), z], 0.06, [0.75, 0.74, 0.7], 4)); }
  }
  for (const x of [-3.5, 3.5]) p.push(C(T(box(0.6, 4, 2.4), x, -3.0), grey));
  return merge(p);
}
/** Concrete pole 9 m with a cross-arm along X; wire attachments at WIRE (model space). */
export const WIRE = [[-0.8, 8.62, 0], [0, 9.05, 0], [0.8, 8.62, 0]];
export function pole(tx = false) {
  const grey = [0.58, 0.57, 0.53];
  const p = [C(new THREE.CylinderGeometry(0.09, 0.15, 9, 4).translate(0, 4.5, 0), grey), C(T(new THREE.BoxGeometry(1.9, 0.12, 0.12), 0, 8.5), grey)];
  for (const [x, y, z] of WIRE) p.push(C(T(cyl(0.04, 0.03, 0.14, 5), x, y - 0.14, z), [0.75, 0.7, 0.6]));
  if (tx) { p.push(C(T(cyl(0.28, 0.28, 0.9, 8), 0.35, 6.3, 0.0), [0.4, 0.42, 0.4])); p.push(C(T(new THREE.BoxGeometry(0.9, 0.1, 0.1), 0, 6.2, 0), grey)); }
  return merge(p);
}
/** Vó (lift net): returns { base, arm } so the arm can be pitched about its pivot at ARM_PIVOT. +Z = toward the water. */
export const ARM_PIVOT = [0, 1.6, 0.4];
export function liftNet() {
  const base = merge([bar([-0.6, 0, -0.6], [0, 1.8, 0.4], 0.05, BAMBOO), bar([0.6, 0, -0.6], [0, 1.8, 0.4], 0.05, BAMBOO), bar([0, 0, 1.2], [0, 1.8, 0.4], 0.05, BAMBOO),
    C(T(new THREE.BoxGeometry(0.9, 0.08, 0.5), 0, 0.5, -0.2), WOOD)]);
  const arm = [bar([0, 0, -2], [0, 0, 6.5], 0.06, BAMBOO)];
  const c = [0, -1.2, 6.5], s = 2.2;
  const corners = [[-s, -1.6, 6.5 - s], [s, -1.6, 6.5 - s], [s, -1.6, 6.5 + s], [-s, -1.6, 6.5 + s]];
  for (const q of corners) arm.push(bar([0, 0, 6.5], q, 0.03, BAMBOO));
  const net = new THREE.PlaneGeometry(2 * s, 2 * s, 4, 4).rotateX(-Math.PI / 2);
  const np = net.attributes.position;
  for (let i = 0; i < np.count; i++) np.setY(i, -0.5 * (1 - (np.getX(i) / s) ** 2) * (1 - (np.getZ(i) / s) ** 2));
  net.computeVertexNormals();
  arm.push(C(T(net, c[0], -1.6 + 0.0, c[2]), [0.55, 0.55, 0.5]));
  return { base, arm: merge(arm) };
}
export function fishStakes() {
  const p = [];
  for (let x = -5; x <= 5; x += 0.45) p.push(C(T(cyl(0.035, 0.025, 3.2 + rnd() * 0.5, 4), x, -1.6), BAMBOO));
  p.push(C(T(new THREE.PlaneGeometry(10, 0.9), 0, 0.15, 0), [0.25, 0.27, 0.22]));
  return merge(p);
}
export function pump() {
  return merge([C(T(box(0.7, 0.45, 0.5), 0, 0.15), [0.3, 0.42, 0.62]), C(T(cyl(0.12, 0.12, 0.25, 8), 0.1, 0.6), [0.2, 0.2, 0.2]), C(T(box(0.9, 0.12, 0.7), 0, 0.03), WOOD),
    bar([0, 0.3, 0.3], [0, -0.6, 2.4], 0.09, [0.12, 0.3, 0.45]), bar([0, 0.4, -0.25], [0, 0.4, -2.2], 0.08, [0.12, 0.3, 0.45])]);
}
export function shrine() {
  const red = [0.55, 0.12, 0.08], yel = [0.75, 0.6, 0.25];
  return merge([C(T(box(0.18, 1.2, 0.18)), [0.7, 0.68, 0.62]), C(T(box(0.7, 0.55, 0.55), 0, 1.2), yel),
    ...[-1, 1].map((s) => C(T(new THREE.BoxGeometry(0.5, 0.05, 0.75), 0.2 * s, 1.88, 0, 0, 0, -0.6 * s), red)), C(T(box(0.3, 0.2, 0.02), 0, 1.35, 0.28), red)]);
}
export function church() {
  const wall = [0.86, 0.84, 0.78], roof = [0.45, 0.2, 0.14];
  const p = [C(box(9, 7, 20), wall, 0.03)];
  const g = new THREE.CylinderGeometry(0.01, 6.6, 3.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 3.05).translate(0, 7 + 1.8, 0);
  p.push(C(g, roof));
  p.push(C(T(box(4.4, 17, 4.4), 0, 0, 11), wall), C(T(new THREE.ConeGeometry(2.6, 7, 4), 0, 20.5, 11, 0, Math.PI / 4), [0.3, 0.32, 0.35]));
  p.push(C(T(box(0.18, 2.2, 0.18), 0, 24, 11), [0.85, 0.8, 0.6]), C(T(box(1.2, 0.18, 0.18), 0, 25.4, 11), [0.85, 0.8, 0.6]));
  p.push(C(T(box(1.6, 3, 0.1), 0, 0, 13.25), [0.3, 0.18, 0.1]));
  return merge(p);
}
export function pagoda() {
  const wall = [0.82, 0.68, 0.38], roof = [0.6, 0.22, 0.1];
  const tier = (w, d, y) => {
    const g = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1).rotateY(Math.PI / 4).scale(w * 0.75, 1.6, d * 0.75).translate(0, y + 0.8, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < y + 0.2) pos.setY(i, pos.getY(i) + 0.35 * (Math.abs(pos.getX(i)) > w * 0.3 && Math.abs(pos.getZ(i)) > d * 0.3 ? 1 : 0));
    g.computeVertexNormals();
    return C(g, roof, 0.05);
  };
  const p = [C(box(16, 0.8, 22), [0.6, 0.58, 0.54]), C(T(box(12, 5, 16), 0, 0.8), wall), tier(16, 20, 5.8), C(T(box(8, 2, 10), 0, 7.2), wall), tier(11, 13, 9)];
  // five-tier tower beside the hall
  for (let k = 0; k < 5; k++) { const s = 4 - k * 0.55; p.push(C(T(box(s, 2.2, s), 13, k * 2.6), wall), tier(s + 1.6, s + 1.6, k * 2.6 + 2.1)); }
  return merge(p);
}
export function grave() {
  const c = [[0.86, 0.84, 0.8], [0.7, 0.75, 0.8], [0.8, 0.72, 0.6]][Math.floor(rnd() * 3)];
  return merge([C(box(1.2, 0.5, 2.2), c, 0.04), C(T(box(1.0, 0.3, 1.9), 0, 0.5), c), C(T(box(0.9, 1.1, 0.18), 0, 0.5, -1.0), [0.5, 0.48, 0.45]), C(T(new THREE.ConeGeometry(0.6, 0.35, 4), 0, 1.75, -1.0, 0, Math.PI / 4), [0.6, 0.25, 0.15])]);
}
export function jars() {
  const g = [0.32, 0.18, 0.09];
  return merge([[0, 0], [0.9, 0.2], [0.4, 0.85]].map(([x, z], i) => C(T(ball(0.42, 9, 7), x, 0.45 - i * 0.03, z, 0, 0, 0, [1, 1.15, 1]), g, 0.1)));
}
export function clothesline() {
  const p = [bar([-2.2, 0, 0], [-2.2, 1.9, 0], 0.04, BAMBOO), bar([2.2, 0, 0], [2.2, 1.9, 0], 0.04, BAMBOO), bar([-2.2, 1.85, 0], [2.2, 1.85, 0], 0.008, DARK)];
  const cols = [[0.7, 0.2, 0.2], [0.2, 0.4, 0.7], [0.85, 0.85, 0.8], [0.8, 0.6, 0.2], [0.3, 0.5, 0.3]];
  for (let i = 0; i < 6; i++) p.push(C(T(new THREE.PlaneGeometry(0.5, 0.7), -1.6 + i * 0.62, 1.5, 0), cols[i % cols.length]));
  return merge(p);
}
export function hammock() {
  const p = [bar([-1.6, 0, 0], [-1.6, 1.5, 0], 0.05, WOOD), bar([1.6, 0, 0], [1.6, 1.5, 0], 0.05, WOOD)];
  const cloth = new THREE.PlaneGeometry(3.0, 0.9, 10, 1).rotateX(-Math.PI / 2);
  const pos = cloth.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, 1.35 - 0.75 * (1 - (pos.getX(i) / 1.5) ** 2));
  cloth.computeVertexNormals();
  p.push(C(cloth, [0.2, 0.45, 0.4]));
  return merge(p);
}
export function stiltToilet() {
  const p = [];
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) p.push(C(T(cyl(0.05, 0.05, 3.2, 4), x, -1.8, z), BAMBOO));
  p.push(C(T(box(1.4, 0.06, 1.4), 0, 1.3), WOOD), C(T(box(1.3, 1.4, 1.3), 0, 1.36), [0.35, 0.3, 0.2], 0.1));
  for (let z = -1; z > -5; z -= 0.6) p.push(C(T(box(0.35, 0.05, 0.5), 0, 1.1 + z * 0.08, z - 0.4), BAMBOO));
  return merge(p);
}

// ---------------------------------------------------------------- vegetation (near + far)
function leafCard(w, l, col) { return C(new THREE.PlaneGeometry(w, l).translate(0, l / 2, 0), col, 0.25); }
export function bamboo() {
  const p = [];
  for (let i = 0; i < 11; i++) {
    const a = rnd() * 6.28, r = rnd() * 0.6, lean = 0.08 + rnd() * 0.22, H = 7 + rnd() * 4;
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r, x1 = x0 + Math.cos(a) * H * lean, z1 = z0 + Math.sin(a) * H * lean;
    p.push(bar([x0, 0, z0], [x1, H, z1], 0.045, [0.35, 0.4, 0.18], 4));
    for (let k = 0; k < 6; k++) {
      const t = 0.45 + k * 0.1, lf = leafCard(0.5, 1.6, [0.2 + rnd() * 0.08, 0.36 + rnd() * 0.1, 0.08]);
      p.push(T(lf, x0 + (x1 - x0) * t, H * t, z0 + (z1 - z0) * t, 1.1 + rnd() * 0.6, rnd() * 6.28));
    }
  }
  return merge(p);
}
export function tram() {
  const p = [bar([0, 0, 0], [0.3, 9, 0.2], 0.13, [0.72, 0.68, 0.6])];
  for (let k = 0; k < 6; k++) p.push(C(T(ball(1.1, 6, 4), 0.3 + (rnd() - 0.5) * 1.2, 6 + k * 0.7, 0.2 + (rnd() - 0.5) * 1.2, 0, 0, 0, [1, 1.3, 1]), [0.18, 0.28, 0.12], 0.2));
  return merge(p);
}
export function areca() {
  const p = [bar([0, 0, 0], [0.15, 10, 0], 0.09, [0.6, 0.6, 0.56], 5)];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.PlaneGeometry(0.55, 2.4, 1, 4).translate(0, 1.2, 0);
    const pos = f.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); pos.setZ(k, -0.28 * y * y); }
    p.push(C(T(f, 0.15, 9.9, 0, 0.5 + rnd() * 0.5, (i / 9) * 6.28), [0.2, 0.36, 0.1], 0.2));
  }
  p.push(C(T(cyl(0.12, 0.1, 1.0, 5), 0.15, 9.2), [0.3, 0.42, 0.18]));
  return merge(p);
}
export function mango() {
  const p = [C(T(cyl(0.3, 0.22, 3, 6)), [0.25, 0.18, 0.12])];
  for (let k = 0; k < 9; k++) p.push(C(T(ball(1.8 + rnd() * 0.8, 7, 5), (rnd() - 0.5) * 3, 4.6 + rnd() * 2.2, (rnd() - 0.5) * 3), [0.07 + rnd() * 0.03, 0.17 + rnd() * 0.05, 0.05], 0.2));
  return merge(p);
}
export function nipa() {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const L = 3.5 + rnd() * 2, f = new THREE.PlaneGeometry(0.8, L, 1, 5).translate(0, L / 2, 0);
    const pos = f.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); pos.setZ(k, -0.07 * y * y); }
    p.push(C(T(f, 0, 0, 0, 0.35 + rnd() * 0.3, (i / 10) * 6.28 + rnd() * 0.3), [0.2, 0.34, 0.12], 0.2));
  }
  return merge(p);
}
export function reeds() {
  const p = [];
  for (let i = 0; i < 22; i++) {
    const a = rnd() * 6.28, r = rnd() * 0.7, h = 1.3 + rnd() * 1.0;
    p.push(T(leafCard(0.05, h, [0.36, 0.42, 0.2]), Math.cos(a) * r, 0, Math.sin(a) * r, (rnd() - 0.5) * 0.4, rnd() * 6.28));
    if (rnd() < 0.3) p.push(C(T(ball(0.06, 4, 3), Math.cos(a) * r, h, Math.sin(a) * r, 0, 0, 0, [1, 3, 1]), [0.7, 0.62, 0.5]));
  }
  return merge(p);
}
/** lumpy crown: subdivided icosahedron with radial noise, smooth normals, dark leaf colour */
function blob(r, x, y, z, s) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.82 + 0.3 * Math.abs(Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3 + p.getZ(i) * 1.7)); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  const m = T(g, x, y, z, 0, 0, 0, s);
  const out = C(m, [0.075, 0.15, 0.045]);
  out.computeVertexNormals();
  return out;
}
/** Far stand-ins (~20-80 tris). */
export function farVeg(kind) {
  if (kind === 'reeds' || kind === 'nipa') return C(T(new THREE.ConeGeometry(1.2, kind === 'nipa' ? 3.5 : 1.8, 5, 1, true), 0, kind === 'nipa' ? 1.6 : 0.9), [0.22, 0.34, 0.12]);
  if (kind === 'mango') return merge([C(T(cyl(0.3, 0.2, 3, 4)), [0.2, 0.15, 0.1]), blob(3.4, 0, 5.2, 0, [1, 0.8, 1])]);
  const H = kind === 'bamboo' ? 9 : kind === 'tram' ? 9 : 10;
  return merge([C(T(cyl(0.12, 0.08, H, 3)), [0.45, 0.43, 0.36]), blob(kind === 'bamboo' ? 2.6 : 1.5, 0, H - (kind === 'bamboo' ? 3 : 1.2), 0, [1, kind === 'bamboo' ? 1.7 : 1.1, 1])]);
}
