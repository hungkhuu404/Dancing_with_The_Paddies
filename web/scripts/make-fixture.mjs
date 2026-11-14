// Writes public/scene/_fixture.json: a small hand-shaped dev layout in the layout.json schema.
// Used only until the real public/scene/layout.json exists. Deterministic.
import { writeFileSync } from 'node:fs';
import { distToCanals, centroid } from '../src/data/parcels.js';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const r1 = (v) => Math.round(v * 10) / 10;

const passes = Array.from({ length: 20 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 11 + i * 6)); // 6-day revisit from 11 Aug
  const date = d.toISOString().slice(0, 10);
  return { i, date, track: i % 2 ? '41A' : '148D', source: date === '2026-10-22' || date === '2026-10-28' ? 'radar' : 'sim' };
});

// A bent main canal (E-W), a cross canal (N-S) meeting it near the centre, ditches.
const canals = [
  { id: 'c1', kind: 'canal', name: 'Main canal', width_m: 28, points: [[-1100, -260], [-500, -230], [-60, -170], [400, -150], [1100, -90]] },
  { id: 'c2', kind: 'canal', name: 'Cross canal', width_m: 18, points: [[120, -1100], [100, -500], [70, -160], [40, 300], [10, 1100]] },
  { id: 'd1', kind: 'ditch', name: '', width_m: 5, points: [[-1100, 330], [-400, 320], [30, 320]] },
  { id: 'd2', kind: 'ditch', name: '', width_m: 5, points: [[45, 520], [600, 540], [1100, 560]] },
  { id: 'd3', kind: 'ditch', name: '', width_m: 4, points: [[-420, -232], [-440, 320]] },
];
const roads = [
  { kind: 'track', width_m: 4, points: [[-1100, -290], [-500, -262], [-60, -205], [400, -184], [1100, -124]] },
  { kind: 'track', width_m: 3, points: [[92, -1100], [80, -500], [54, -190]] },
];

// Parcels: strips perpendicular to the main canal, ~45 m x 150 m with 3 m bunds, in the fixture window only.
const parcels = [];
const angle = 0.05;
let id = 0;
for (let bx = -980; bx < 980; bx += 48) {
  for (let bz = -960; bz < 960; bz += 158) {
    const cx = bx + 24, cz = bz + 79;
    const w = 45, h = 152 + (rnd() - 0.5) * 6;
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, z]) => [
      r1(cx + x * Math.cos(angle) - z * Math.sin(angle)), r1(cz + x * Math.sin(angle) + z * Math.cos(angle)),
    ]);
    // keep clear of canals/roads and of the residential strips along them
    const near = Math.min(...corners.map(([x, z]) => distToCanals(x, z, canals.filter((c) => c.kind === 'canal'))));
    if (near < 45) continue;
    if (Math.min(...corners.map(([x, z]) => distToCanals(x, z, canals.filter((c) => c.kind === 'ditch'))) ) < 4) continue;
    if (rnd() < 0.04) continue;
    const c = centroid(corners);
    const d = distToCanals(c[0], c[1], canals);
    const k0 = Math.round(4 + d / 70 + rnd() * 4);
    const k1 = k0 + 5 + Math.round(rnd() * 7);
    let s = '';
    for (let i = 0; i < 20; i++) s += i >= k0 && i < k1 ? 'W' : 'N';
    s = s.split('').map((ch, i) => (rnd() < 0.03 ? '-' : ch)).join('');
    if (rnd() < 0.08) s = s.replace(/W/g, 'N'); // a few never flood (raised plots)
    parcels.push({ id: 'P' + String(++id).padStart(4, '0'), poly: corners, s, src: 'fixture' });
  }
}

// Houses + trees along both banks of the canals (the residential strips), boats on canals.
const houses = [], trees = [];
const along = (pts, step, cb) => {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
    for (let s = 0; s < L; s += step) cb(ax + tx * s, az + tz * s, tx, tz);
  }
};
for (const c of canals.filter((c) => c.kind === 'canal')) {
  along(c.points, 9, (x, z, tx, tz) => {
    for (const side of [-1, 1]) {
      const nx = -tz * side, nz = tx * side, off = c.width_m / 2;
      if (Math.abs(x) > 990 || Math.abs(z) > 990) continue;
      if (rnd() < 0.42) {
        const o = off + 14 + rnd() * 8;
        if (distToCanals(x + nx * o, z + nz * o, canals.filter((k) => k !== c)) > 14)
          houses.push({ x: r1(x + nx * o), z: r1(z + nz * o), rot: r1(Math.atan2(nx, nz) * 100) / 100, variant: Math.floor(rnd() * 3) });
      }
      for (let k = 0; k < 2; k++) {
        const o = off + 4 + rnd() * 30;
        const px = x + nx * o + (rnd() - 0.5) * 8, pz = z + nz * o + (rnd() - 0.5) * 8;
        if (distToCanals(px, pz, canals) < 3) continue;
        const kind = rnd() < 0.5 ? 'palm' : rnd() < 0.6 ? 'banana' : 'bush';
        trees.push({ x: r1(px), z: r1(pz), kind, scale: r1(0.8 + rnd() * 0.5), rot: r1(rnd() * 6.28) });
      }
    }
  });
}
// thin out houses that collide
const hs = [];
for (const h of houses) if (!hs.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < 13)) hs.push(h);

const boats = [
  { path: canals[0].points, speed_mps: 2.2 },
  { path: [...canals[0].points].reverse(), speed_mps: 1.6 },
  { path: canals[1].points, speed_mps: 1.8 },
  { path: [[-1100, 330], [-400, 320], [30, 320]], speed_mps: 0.9 },
];

const layout = {
  version: 1,
  origin: { note: 'dev fixture, not real geography' },
  size_m: [2000, 2000],
  passes, canals, roads, parcels, houses: hs, trees, boats,
  egret_zones: [[-300, 120, 160], [420, 300, 180], [-500, -600, 150]],
};
writeFileSync(new URL('../public/scene/_fixture.json', import.meta.url), JSON.stringify(layout));
console.log(`parcels ${parcels.length}, houses ${hs.length}, trees ${trees.length}`);
