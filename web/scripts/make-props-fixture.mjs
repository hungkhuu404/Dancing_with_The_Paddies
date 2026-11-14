// Development fixture for the living-world placement data (public/scene/props.json schema), derived from
// public/scene/layout.json. Deterministic. The real props.json (from the data pipeline) takes precedence at runtime.
// usage: node scripts/make-props-fixture.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeRoute, sampleRoute, closestOnSeg, rng } from '../src/world/paths.js';
import { centroid, pointInPoly } from '../src/data/parcels.js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(readFileSync(join(WEB, 'public/scene/layout.json'), 'utf8'));
const R = rng(2026);
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
const pick = (a) => a[Math.floor(R() * a.length)];
const inWin = (x, z, m = 0) => Math.abs(x) < 1000 - m && Math.abs(z) < 1000 - m;
const yawOf = (dx, dz) => Math.atan2(dx, dz); // local +Z along (dx, dz)

const canals = layout.canals, roads = layout.roads, parcels = layout.parcels, houses = layout.houses;
const last = (parcels[0]?.s || '').length - 1;
const parcelAt = (x, z) => parcels.findIndex((p) => pointInPoly(x, z, p.poly));
function nearestCanal(x, z) {
  let best = { d: Infinity }; const c = {};
  for (const cn of canals) for (let i = 1; i < cn.points.length; i++) {
    closestOnSeg(x, z, cn.points[i - 1], cn.points[i], c);
    if (c.d < best.d) best = { d: c.d, x: c.x, z: c.z, hw: (cn.width_m || 4) / 2, canal: cn, a: cn.points[i - 1], b: cn.points[i] };
  }
  return best;
}
const onLand = (x, z) => { const n = nearestCanal(x, z); return n.d > n.hw + 2; };
function segX(p, p2, q, q2) {
  const r = [p2[0] - p[0], p2[1] - p[1]], s = [q2[0] - q[0], q2[1] - q[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [p[0] + t * r[0], p[1] + t * r[1]] : null;
}
// walk along a canal at a step, calling fn(x, z, tx, tz, hw) with the unit tangent
function alongCanals(step, fn, filter = () => true) {
  const o = {};
  for (const cn of canals.filter(filter)) {
    const r = makeRoute(cn.points);
    for (let s = step * (0.3 + R() * 0.7); s < r.L; s += step * (0.7 + R() * 0.6)) {
      sampleRoute(r, s, o);
      if (!inWin(o.x, o.z, 20)) continue;
      fn(o.x, o.z, Math.sin(o.yaw), Math.cos(o.yaw), (cn.width_m || 4) / 2, cn);
    }
  }
}

const out = {
  version: 1, origin: layout.origin, fixture: true,
  bridges: [], power_lines: [], lift_nets: [], fish_stakes: [], pumps: [], shrines: [], religious: [], graves: [],
  washing_steps: [], moored_boats: [], cargo_routes: [], longtail_routes: [], motorbike_routes: [], duck_flocks: [],
  people: [], dogs: [], smoke: [], straw_piles: [], veg: [], hyacinth_lanes: [], fish_jump_zones: [],
};

// bridges where roads cross canals
for (const rd of roads) for (let i = 1; i < rd.points.length; i++)
  for (const cn of canals) for (let j = 1; j < cn.points.length; j++) {
    const p = segX(rd.points[i - 1], rd.points[i], cn.points[j - 1], cn.points[j]);
    if (!p || !inWin(p[0], p[1], 10)) continue;
    const dx = rd.points[i][0] - rd.points[i - 1][0], dz = rd.points[i][1] - rd.points[i - 1][1];
    const w = cn.width_m || 8;
    const kind = rd.kind === 'secondary' || w > 14 ? 'concrete' : 'monkey';
    out.bridges.push({ x: r1(p[0]), z: r1(p[1]), rot: r3(Math.atan2(-dz, dx)), len: r1(w + 8), kind });
  }
// a few monkey bridges where paths would cross the smaller canals near houses
// (span perpendicular to the canal: local +X = (cos rot, -sin rot) along the canal normal (tz, -tx))
alongCanals(260, (x, z, tx, tz, hw) => { if (hw <= 6 && R() < 0.6) out.bridges.push({ x: r1(x), z: r1(z), rot: r3(Math.atan2(tx, tz)), len: r1(hw * 2 + 6), kind: 'monkey' }); }, (c) => c.width_m <= 12);

// power lines along the secondary roads, 4 m off the edge, a pole every ~38 m
for (const rd of roads.filter((r) => r.kind === 'secondary')) {
  const r = makeRoute(rd.points), o = {}, pts = [];
  if (r.L < 120) continue;
  for (let s = 5; s < r.L; s += 38) {
    sampleRoute(r, s, o);
    const nx = Math.cos(o.yaw), nz = -Math.sin(o.yaw), off = (rd.width_m || 6) / 2 + 3;
    const x = o.x + nx * off, z = o.z + nz * off;
    if (inWin(x, z, 5) && onLand(x, z)) pts.push([r1(x), r1(z)]);
  }
  if (pts.length >= 3) out.power_lines.push({ points: pts, tx: pts.map((_, i) => i).filter((i) => i % 7 === 3) });
}

// lift nets, fish stakes, pumps, hyacinth, fish jumps along canals
alongCanals(140, (x, z, tx, tz, hw) => {
  const side = R() < 0.5 ? 1 : -1, nx = tz * side, nz = -tx * side; // normal toward one bank
  out.lift_nets.push({ x: r1(x + nx * (hw - 2.5)), z: r1(z + nz * (hw - 2.5)), rot: r3(yawOf(-nx, -nz)) });
});
alongCanals(320, (x, z, tx, tz, hw) => {
  const side = R() < 0.5 ? 1 : -1;
  out.fish_stakes.push({ x: r1(x + tz * side * (hw - 3)), z: r1(z - tx * side * (hw - 3)), rot: r3(Math.atan2(-tz, tx)), len: r1(8 + R() * 6) });
});
alongCanals(230, (x, z, tx, tz, hw) => {
  const side = R() < 0.5 ? 1 : -1, nx = tz * side, nz = -tx * side;
  out.pumps.push({ x: r1(x + nx * (hw + 2.5)), z: r1(z + nz * (hw + 2.5)), rot: r3(yawOf(-nx, -nz)) });
}, (c) => c.width_m <= 12);
for (const cn of canals) {
  const hw = (cn.width_m || 4) / 2;
  for (const side of [-1, 1]) {
    const r = makeRoute(cn.points), o = {}, pts = [];
    for (let s = 0; s <= r.L; s += 25) { sampleRoute(r, s, o); const nx = Math.cos(o.yaw) * side, nz = -Math.sin(o.yaw) * side; pts.push([r1(o.x + nx * hw * 0.55), r1(o.z + nz * hw * 0.55)]); }
    out.hyacinth_lanes.push({ points: pts, speed_mps: r3(0.12 + R() * 0.15), density: r3(hw > 8 ? 0.05 : 0.09) });
  }
}
alongCanals(170, (x, z, tx, tz, hw) => out.fish_jump_zones.push({ x: r1(x), z: r1(z), r: r1(hw * 0.8) }));

// reeds and nipa at canal edges, tram (melaleuca) on the smaller banks
alongCanals(9, (x, z, tx, tz, hw) => {
  for (const side of [-1, 1]) {
    const nx = tz * side, nz = -tx * side, u = R();
    if (u < 0.35) out.veg.push({ x: r1(x + nx * (hw + 0.4 + R())), z: r1(z + nz * (hw + 0.4 + R())), kind: 'reeds', scale: r3(0.8 + R() * 0.5), rot: r3(R() * 6.28) });
    else if (u < 0.55) out.veg.push({ x: r1(x + nx * (hw - 0.6 - R())), z: r1(z + nz * (hw - 0.6 - R())), kind: 'nipa', scale: r3(0.8 + R() * 0.5), rot: r3(R() * 6.28) });
    else if (u < 0.64 && hw <= 10) out.veg.push({ x: r1(x + nx * (hw + 4 + R() * 3)), z: r1(z + nz * (hw + 4 + R() * 3)), kind: 'tram', scale: r3(0.8 + R() * 0.4), rot: r3(R() * 6.28) });
  }
});

// households: veg, shrines, dogs, smoke, washing steps, boats, graves
const nearCanalHouses = [];
houses.forEach((h, i) => {
  if (!inWin(h.x, h.z, 8)) return;
  const fx = Math.sin(h.rot || 0), fz = Math.cos(h.rot || 0), rx = fz, rz = -fx; // front, right
  const at = (f, r) => [r1(h.x + fx * f + rx * r), r1(h.z + fz * f + rz * r)];
  const u = R();
  if (u < 0.55) { const [x, z] = at(-9 - R() * 4, (R() - 0.5) * 10); out.veg.push({ x, z, kind: 'bamboo', scale: r3(0.8 + R() * 0.5), rot: r3(R() * 6.28) }); }
  if (R() < 0.6) for (let k = 0; k < 2 + R() * 3; k++) { const [x, z] = at((R() - 0.5) * 14, (R() < 0.5 ? -1 : 1) * (6 + R() * 5)); out.veg.push({ x, z, kind: 'areca', scale: r3(0.85 + R() * 0.35), rot: r3(R() * 6.28) }); }
  if (R() < 0.35) { const [x, z] = at(-5 - R() * 6, (R() < 0.5 ? -1 : 1) * (7 + R() * 4)); out.veg.push({ x, z, kind: 'mango', scale: r3(0.8 + R() * 0.5), rot: r3(R() * 6.28) }); }
  if (i % 11 === 3) { const [x, z] = at(6, 3); out.shrines.push({ x, z, rot: r3(h.rot || 0) }); }
  if (i % 6 === 1) { const [x, z] = at(4 + R() * 3, (R() - 0.5) * 6); out.dogs.push({ x, z, rot: r3(R() * 6.28) }); }
  if (i % 3 === 0) { const [x, z] = at(-3, 3); out.smoke.push({ x, z, kind: 'kitchen' }); }
  if (i % 23 === 5) { const [x, z] = at(-14, 0); if (onLand(x, z)) out.graves.push({ x, z, rot: r3(h.rot || 0), count: 2 + Math.floor(R() * 4) }); }
  const nc = nearestCanal(h.x, h.z);
  if (nc.d < nc.hw + 30 && nc.d > nc.hw) nearCanalHouses.push([h, nc]);
});
nearCanalHouses.forEach(([h, nc], k) => {
  const dx = nc.x - h.x, dz = nc.z - h.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d; // toward the canal
  const ex = nc.x - nx * nc.hw, ez = nc.z - nz * nc.hw; // water edge
  const tx = nc.b[0] - nc.a[0], tz = nc.b[1] - nc.a[1], tl = Math.hypot(tx, tz) || 1;
  if (k % 4 === 0) {
    out.washing_steps.push({ x: r1(ex), z: r1(ez), rot: r3(yawOf(nx, nz)) });
    out.people.push({ x: r1(ex + nx * 0.6), z: r1(ez + nz * 0.6), rot: r3(yawOf(nx, nz)), kind: 'washer' });
  }
  if (k % 3 === 1) out.moored_boats.push({ x: r1(ex + nx * 1.6 + (tx / tl) * 4), z: r1(ez + nz * 1.6 + (tz / tl) * 4), rot: r3(yawOf(tx, tz)), kind: k % 9 === 1 ? 'longtail' : 'xuong' });
});

// two landmarks near the densest house clusters: a church and a pagoda
const dens = houses.map((h) => houses.reduce((n, g) => n + (Math.hypot(g.x - h.x, g.z - h.z) < 120 ? 1 : 0), 0));
const order = houses.map((_, i) => i).sort((a, b) => dens[b] - dens[a]);
const chosen = [];
for (const i of order) {
  const h = houses[i];
  if (chosen.some((c) => Math.hypot(c.x - h.x, c.z - h.z) < 500) || !inWin(h.x, h.z, 60)) continue;
  const x = h.x - Math.sin(h.rot || 0) * 28, z = h.z - Math.cos(h.rot || 0) * 28;
  if (!onLand(x, z)) continue;
  chosen.push({ x: r1(x), z: r1(z), rot: r3(h.rot || 0), kind: chosen.length ? 'pagoda' : 'church', osm_id: null });
  if (chosen.length === 2) break;
}
out.religious = chosen;

// boat traffic: cargo on the big canals, longtails on the smaller ones
for (const cn of canals) {
  const pts = cn.points.map(([x, z]) => [r1(x), r1(z)]);
  if ((cn.width_m || 0) >= 20) out.cargo_routes.push({ points: pts, speed_mps: r3(2 + R()) });
  out.longtail_routes.push({ points: pts, speed_mps: r3(5 + R() * 3) });
}
// motorbikes on the longer roads
for (const rd of roads) {
  const r = makeRoute(rd.points);
  if (r.L < 250 || rd.kind === 'path') continue;
  out.motorbike_routes.push({ points: rd.points.map(([x, z]) => [r1(x), r1(z)]), speed_mps: r3(rd.kind === 'secondary' ? 9 + R() * 3 : 6 + R() * 3) });
}

// fields: ducks and waders in flooded blocks, straw in dry ones
const wet = parcels.map((p, i) => i).filter((i) => parcels[i].s[last] === 'W');
const dry = parcels.map((p, i) => i).filter((i) => parcels[i].s[last] !== 'W');
for (let k = 0; k < 8 && wet.length; k++) {
  const p = parcels[wet[Math.floor(R() * wet.length)]], [cx, cz] = centroid(p.poly);
  out.duck_flocks.push({ x: r1(cx), z: r1(cz), r: 30, n: 70 + Math.floor(R() * 90), herder: [r1(cx + 22), r1(cz + 8)] });
}
for (let k = 0; k < 26; k++) {
  const all = R() < 0.7 && wet.length ? wet : parcels.map((_, i) => i);
  const p = parcels[pick(all)], [cx, cz] = centroid(p.poly);
  for (let m = 0; m < 1 + R() * 3; m++) {
    const x = cx + (R() - 0.5) * 30, z = cz + (R() - 0.5) * 30;
    if (parcelAt(x, z) >= 0) out.people.push({ x: r1(x), z: r1(z), rot: r3(R() * 6.28), kind: 'wader' });
  }
}
for (const n of out.lift_nets) if (R() < 0.5) {
  const fx = Math.sin(n.rot), fz = Math.cos(n.rot);
  out.people.push({ x: r1(n.x - fx * 3.5), z: r1(n.z - fz * 3.5), rot: n.rot, kind: 'fisher' });
}
// no child figures: Space Apps rules forbid likenesses of minors in the project
for (let k = 0; k < 10 && dry.length; k++) {
  const p = parcels[pick(dry)], [cx, cz] = centroid(p.poly);
  out.smoke.push({ x: r1(cx), z: r1(cz), kind: 'straw' });
}
for (let k = 0; k < 40; k++) {
  const p = parcels[pick(parcels.map((_, i) => i))], [cx, cz] = centroid(p.poly);
  for (let m = 0; m < 3; m++) out.straw_piles.push({ x: r1(cx + (R() - 0.5) * 40), z: r1(cz + (R() - 0.5) * 40), scale: r3(0.7 + R() * 0.6) });
}

writeFileSync(join(WEB, 'public/scene/_props_fixture.json'), JSON.stringify(out));
console.log('props fixture:', Object.entries(out).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${v.length}`).join(', '));
