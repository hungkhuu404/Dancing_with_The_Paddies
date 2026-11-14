// Pure data helpers for parcel flood states. No DOM, no WebGL: tested in node (test/parcels.test.mjs).
import { ShapeUtils, Vector2 } from 'three';

const DAY = 86400000;
const t = (d) => Date.parse(d + 'T00:00:00Z');

/** Index of the first pass with water, or -1. */
export function firstWater(s) {
  return s.indexOf('W');
}

/** true / false from the last pass; null when the last pass has no data. */
export function stillThere(s) {
  const c = s[s.length - 1];
  return c === 'W' ? true : c === 'N' ? false : null;
}

/**
 * How long the first flood episode lasted, bracketed by pass dates.
 * Entry = midpoint between the last dry/unknown pass and the first W; exit = midpoint between the
 * last W and the first N after it. '-' inside an episode does not break it.
 * Returns null when never flooded; ongoing=true when no N follows.
 */
export function duration(s, passes) {
  const f = firstWater(s);
  if (f < 0) return null;
  let lastW = f, end = -1;
  for (let j = f + 1; j < s.length; j++) {
    if (s[j] === 'W') lastW = j;
    else if (s[j] === 'N') { end = j; break; }
  }
  const tf = t(passes[f].date);
  const entry = f > 0 ? (t(passes[f - 1].date) + tf) / 2 : tf;
  const tl = t(passes[lastW].date);
  const exit = end >= 0 ? (tl + t(passes[end].date)) / 2 : tl;
  return {
    days: Math.max(1, Math.round((exit - entry) / DAY)),
    minDays: Math.round((tl - tf) / DAY),
    maxDays: Math.round(((end >= 0 ? t(passes[end].date) : tl) - (f > 0 ? t(passes[f - 1].date) : tf)) / DAY),
    from: f, last: lastW, end, ongoing: end < 0,
  };
}

/** Water state used to place the field at pass i: '-' keeps the last known state (else next known, else dry). */
export function levelAt(s, i) {
  for (let j = i; j >= 0; j--) if (s[j] !== '-') return s[j] === 'W';
  for (let j = i + 1; j < s.length; j++) if (s[j] !== '-') return s[j] === 'W';
  return false;
}

/** Share of parcels with W at each pass (for the timeline bars). */
export function floodFractions(parcels, n) {
  const out = new Array(n).fill(0);
  if (!parcels.length) return out;
  for (const p of parcels) for (let i = 0; i < n; i++) if (p.s[i] === 'W') out[i]++;
  return out.map((c) => c / parcels.length);
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return a / 2;
}

export function centroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let u = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = ax + u * dx - px, ez = az + u * dz - pz;
  return Math.sqrt(ex * ex + ez * ez);
}

/** Distance to the nearest canal water edge (centre-line distance minus half width), >= 0. */
export function distToCanals(x, z, canals) {
  let best = Infinity;
  for (const c of canals) {
    const pts = c.points, hw = (c.width_m || 4) / 2;
    for (let i = 1; i < pts.length; i++) {
      const d = distToSeg(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) - hw;
      if (d < best) best = d;
    }
  }
  return Math.max(0, best);
}

/** Per-parcel stagger in [0,1] by distance of its centroid from the nearest canal (near floods first). */
export function transitionOrder(parcels, canals) {
  const d = parcels.map((p) => { const c = centroid(p.poly); return distToCanals(c[0], c[1], canals); });
  const max = Math.max(1e-6, ...d);
  return d.map((v) => v / max);
}

/** Drops a repeated closing vertex and returns CCW-agnostic triangle indices (ShapeUtils/earcut). */
export function cleanPoly(poly) {
  const out = poly.filter((p, i) => i === 0 || p[0] !== poly[i - 1][0] || p[1] !== poly[i - 1][1]);
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

export function triangulate(poly) {
  const tris = ShapeUtils.triangulateShape(poly.map((p) => new Vector2(p[0], p[1])), []);
  return tris.flat();
}

/** Uniform grid over parcel bounding boxes for fast picking. */
export function buildGrid(parcels, cell = 50) {
  const grid = new Map();
  parcels.forEach((p, idx) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of p.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
      for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
        const k = i * 100003 + j;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(idx);
      }
  });
  return { grid, cell };
}

export function pickParcel(index, parcels, x, z) {
  const list = index.grid.get(Math.floor(x / index.cell) * 100003 + Math.floor(z / index.cell));
  if (list) for (const i of list) if (pointInPoly(x, z, parcels[i].poly)) return i;
  return -1;
}

/** Human date "27 Oct 2026". */
export function fmtDate(d) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, mo, da] = d.split('-').map(Number);
  return `${da} ${m[mo - 1]} ${y}`;
}
