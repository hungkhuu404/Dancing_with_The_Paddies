// Procedural placeholder meshes (used until/unless public/models/*.glb exist). Vertex-coloured,
// real metres, origin at base, +Y up; boat bow +Z with origin at the waterline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let seed = 17;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function paint(g, r, gr, b, jitter = 0) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (rnd() - 0.5) * jitter;
    for (let k = 0; k < 3 && i + k < n; k++) c.set([r * j, gr * j, b * j], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
export const merge = (parts) => { const g = mergeGeometries(parts); g.computeBoundingSphere(); return g; };

function frond(len, width, droop, leaflets = true, seg = 12) {
  // a strip along +X curving down; leaflet notches by alternating width
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, x = t * len, y = -droop * t * t * len;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (leaflets && i % 2 ? 0.55 : 1);
    pos.push(x, y, -w, x, y + w * 0.25, 0, x, y, w);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function palm() {
  const H = 7 + rnd() * 2;
  const trunk = new THREE.CylinderGeometry(0.13, 0.2, H, 7, 8).translate(0, H / 2, 0);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + 0.35 * (y / H) ** 2); }
  trunk.computeVertexNormals();
  const parts = [paint(trunk, 0.2, 0.16, 0.11, 0.25)];
  for (let i = 0; i < 11; i++) {
    const f = frond(3 + rnd(), 0.42, 0.25 + rnd() * 0.3);
    f.rotateZ(0.5 - rnd() * 0.5).rotateY((i / 11) * Math.PI * 2 + rnd() * 0.3).translate(0.35, H, 0);
    parts.push(paint(f, 0.07 + rnd() * 0.04, 0.16 + rnd() * 0.05, 0.035, 0.3));
  }
  const crown = new THREE.SphereGeometry(0.35, 6, 4).translate(0.35, H - 0.1, 0);
  parts.push(paint(crown, 0.18, 0.14, 0.07));
  return merge(parts);
}

export function banana() {
  const parts = [];
  for (let s = 0; s < 3; s++) {
    const h = 2 + rnd() * 1.2, ox = (rnd() - 0.5) * 0.8, oz = (rnd() - 0.5) * 0.8;
    parts.push(paint(new THREE.CylinderGeometry(0.08, 0.13, h, 6).translate(ox, h / 2, oz), 0.17, 0.2, 0.08, 0.2));
    for (let i = 0; i < 7; i++) {
      const f = frond(1.9 + rnd() * 0.7, 0.5, 0.3 + rnd() * 0.25, false);
      f.rotateZ(0.75 - rnd() * 0.5).rotateY((i / 7) * Math.PI * 2 + rnd() * 0.5).translate(ox, h - 0.1, oz);
      const dry = rnd() < 0.15;
      parts.push(paint(f, dry ? 0.25 : 0.1, dry ? 0.2 : 0.3 + rnd() * 0.08, dry ? 0.07 : 0.05, 0.15));
    }
  }
  return merge(parts);
}

export function bush() {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const r = 0.45 + rnd() * 0.6;
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.9 + rnd() * 0.25), p.getY(k) * 0.8, p.getZ(k) * (0.9 + rnd() * 0.25));
    g.translate((rnd() - 0.5) * 1.8, r * 0.75 + rnd() * 0.3, (rnd() - 0.5) * 1.8); // keeps the smooth sphere normals: no faceted 'rock' look
    parts.push(paint(g, 0.05 + rnd() * 0.03, 0.13 + rnd() * 0.05, 0.03, 0.3));
  }
  return merge(parts);
}

function gable(w, d, h, over = 0.5) {
  // corrugated-looking gable roof: two slabs
  const slope = Math.hypot(w / 2 + over, h);
  const a = new THREE.BoxGeometry(slope, 0.06, d + over * 2, 1, 1, 1);
  const ang = Math.atan2(h, w / 2 + over);
  const l = a.clone().rotateZ(ang).translate(-(w / 2 + over) / 2, h / 2, 0);
  const r = a.clone().rotateZ(-ang).translate((w / 2 + over) / 2, h / 2, 0);
  return [l, r];
}

/** Distant stand-in (~60 tris): trunk prism + a few low-segment drooping fronds. */
export function farTree(kind) {
  if (kind === 'bush') return merge([paint(new THREE.IcosahedronGeometry(1.1, 0).scale(1.2, 0.8, 1.2).translate(0, 0.8, 0), 0.05, 0.12, 0.03, 0.3)]);
  const palm = kind === 'palm', H = palm ? 10 : 2.6, n = palm ? 7 : 5;
  const parts = [paint(new THREE.CylinderGeometry(0.12, 0.2, H, 4, 1, true).translate(palm ? 0.5 : 0, H / 2, 0), 0.2, 0.16, 0.11)];
  for (let i = 0; i < n; i++) {
    const f = frond(palm ? 4 : 1.9, palm ? 0.55 : 0.5, palm ? 0.45 : 0.4, false, 3);
    f.rotateZ(palm ? 0.35 : 0.7).rotateY((i / n) * Math.PI * 2).translate(palm ? 0.5 : 0, H, 0);
    parts.push(paint(f, palm ? 0.08 : 0.1, palm ? 0.17 : 0.28, 0.04, 0.2));
  }
  return merge(parts);
}

/** returns { body, windows } geometries for house variant 0/1/2 */
export function house(variant) {
  const parts = [], win = [];
  const addWin = (x, y, z, ry, w = 0.9, h = 0.9) => win.push(new THREE.PlaneGeometry(w, h).rotateY(ry).translate(x, y, z));
  if (variant === 0) {
    // timber house on stilts, tin roof
    const W = 5.5, D = 8, F = 1.1;
    for (const [x, z] of [[-2.5, -3.7], [2.5, -3.7], [-2.5, 3.7], [2.5, 3.7], [0, 0], [-2.5, 0], [2.5, 0]])
      parts.push(paint(new THREE.CylinderGeometry(0.09, 0.09, F + 1.6, 5).translate(x, (F - 1.6) / 2, z), 0.12, 0.09, 0.06));
    parts.push(paint(new THREE.BoxGeometry(W, 2.7, D).translate(0, F + 1.35, 0), 0.24, 0.16, 0.1, 0.15));
    for (const g of gable(W, D, 1.7)) parts.push(paint(g.translate(0, F + 2.7, 0), 0.34, 0.3, 0.27, 0.2));
    parts.push(paint(new THREE.BoxGeometry(W + 0.2, 0.15, 2).translate(0, F, D / 2 + 1), 0.2, 0.14, 0.09));
    addWin(-1.4, F + 1.5, D / 2 + 0.01, 0); addWin(1.4, F + 1.5, D / 2 + 0.01, 0);
    addWin(W / 2 + 0.01, F + 1.5, -1.5, Math.PI / 2); addWin(-W / 2 - 0.01, F + 1.5, 1.5, -Math.PI / 2);
  } else if (variant === 1) {
    // painted concrete house, front parapet, tin roof behind
    const W = 6, D = 11, Hh = 3.4;
    const tints = [[0.32, 0.5, 0.55], [0.55, 0.45, 0.32], [0.5, 0.52, 0.45], [0.55, 0.36, 0.33]];
    const t = tints[Math.floor(rnd() * tints.length)];
    parts.push(paint(new THREE.BoxGeometry(W + 0.4, 0.5, D + 0.4).translate(0, 0.0, 0), 0.3, 0.29, 0.27));
    parts.push(paint(new THREE.BoxGeometry(W, Hh, D).translate(0, Hh / 2 + 0.25, 0), t[0], t[1], t[2], 0.08));
    parts.push(paint(new THREE.BoxGeometry(W, 0.9, 0.25).translate(0, Hh + 0.7, D / 2 - 0.1), t[0] * 1.1, t[1] * 1.1, t[2] * 1.1));
    for (const g of gable(W, D - 0.5, 1.2, 0.3)) parts.push(paint(g.translate(0, Hh + 0.25, -0.3), 0.36, 0.22, 0.16, 0.25));
    parts.push(paint(new THREE.BoxGeometry(1.4, 2.2, 0.1).translate(0, 1.35, D / 2 + 0.02), 0.12, 0.1, 0.08));
    addWin(-1.9, 1.9, D / 2 + 0.02, 0, 1.0, 1.1); addWin(1.9, 1.9, D / 2 + 0.02, 0, 1.0, 1.1);
    addWin(W / 2 + 0.01, 1.9, 1, Math.PI / 2); addWin(W / 2 + 0.01, 1.9, -3, Math.PI / 2);
    addWin(-W / 2 - 0.01, 1.9, -1, -Math.PI / 2);
  } else {
    // small hut with nipa-palm roof
    const W = 3.6, D = 4.5, F = 0.8;
    for (const [x, z] of [[-1.6, -2], [1.6, -2], [-1.6, 2], [1.6, 2]])
      parts.push(paint(new THREE.CylinderGeometry(0.07, 0.07, F + 1.6, 5).translate(x, (F - 1.6) / 2, z), 0.13, 0.1, 0.06));
    parts.push(paint(new THREE.BoxGeometry(W, 2.1, D).translate(0, F + 1.05, 0), 0.3, 0.24, 0.15, 0.2));
    for (const g of gable(W, D, 1.6, 0.6)) parts.push(paint(g.scale(1, 3, 1).translate(0, F + 2.1, 0), 0.26, 0.2, 0.12, 0.3));
    addWin(0.8, F + 1.2, D / 2 + 0.01, 0, 0.7, 0.7); addWin(W / 2 + 0.01, F + 1.2, 0, Math.PI / 2, 0.7, 0.7);
  }
  return { body: merge(parts), windows: merge(win.map((g) => paint(g, 1, 1, 1))) };
}

export function boat() {
  const L = 7.5, Wd = 1.35;
  const hull = new THREE.BoxGeometry(Wd, 0.75, L, 4, 2, 16);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / (L / 2), y = p.getY(i);
    const taper = Math.pow(Math.max(0, 1 - z * z), 0.55);
    const keel = y < 0 ? 0.35 + 0.65 * taper : 1;
    p.setX(i, p.getX(i) * Math.max(0.04, taper) * keel);
    p.setY(i, y + 0.08 + (y > 0 ? 0.25 * z * z * (z > 0 ? 1.4 : 0.7) : 0.1 * z * z));
  }
  hull.computeVertexNormals();
  const deck = new THREE.BoxGeometry(Wd * 0.75, 0.04, L * 0.6).translate(0, 0.25, 0);
  const canopy = new THREE.CylinderGeometry(0.72, 0.72, 2.4, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(0).translate(0, 0.45, -0.6);
  const blue = rnd() < 0.5;
  return merge([
    paint(hull, blue ? 0.1 : 0.22, blue ? 0.16 : 0.13, blue ? 0.22 : 0.07, 0.1),
    paint(deck, 0.25, 0.17, 0.09),
    paint(canopy, 0.22, 0.17, 0.1, 0.2),
  ]);
}

/** Egret with flagged wings: attribute aWing = side (-1/1) * distance-from-body factor. Bow (beak) +Z. */
export function egret() {
  const parts = [], wings = [];
  const white = (g) => paint(g, 0.92, 0.92, 0.88, 0.04);
  parts.push(white(new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1, 2.6).translate(0, 0.72, 0)));
  const neck = new THREE.CylinderGeometry(0.035, 0.05, 0.42, 6).rotateX(-0.35).translate(0, 0.98, 0.26);
  parts.push(white(neck));
  parts.push(white(new THREE.SphereGeometry(0.055, 6, 5).scale(1, 1, 1.4).translate(0, 1.18, 0.34)));
  parts.push(paint(new THREE.ConeGeometry(0.018, 0.16, 5).rotateX(Math.PI / 2).translate(0, 1.17, 0.48), 0.9, 0.7, 0.1));
  for (const x of [-0.04, 0.04]) parts.push(paint(new THREE.CylinderGeometry(0.009, 0.009, 0.66, 4).translate(x, 0.33, -0.02), 0.05, 0.05, 0.05));
  for (const s of [-1, 1]) {
    const w = new THREE.PlaneGeometry(0.75, 0.32, 3, 1).rotateX(-Math.PI / 2).translate(s * 0.4, 0.76, -0.02);
    wings.push(white(w));
  }
  const g = merge([...parts, ...wings]);
  const aw = new Float32Array(g.attributes.position.count);
  const bodyCount = parts.reduce((s, q) => s + q.attributes.position.count, 0);
  for (let i = bodyCount; i < aw.length; i++) aw[i] = g.attributes.position.getX(i); // signed span distance
  g.setAttribute('aWing', new THREE.BufferAttribute(aw, 1));
  return g;
}

/** A stubble / rice tuft: thin blades fanning out, ~0.35 m. */
export function tuft() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd(), lean = 0.15 + rnd() * 0.2, h = 0.28 + rnd() * 0.14;
    const b = new THREE.PlaneGeometry(0.025, h, 1, 2).translate(0, h / 2, 0);
    const p = b.attributes.position;
    for (let k = 0; k < p.count; k++) p.setZ(k, p.getZ(k) + lean * (p.getY(k) / h) ** 2 * h);
    b.rotateY(a).translate(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03);
    b.computeVertexNormals();
    parts.push(paint(b, 1, 1, 1));
  }
  return merge(parts);
}
