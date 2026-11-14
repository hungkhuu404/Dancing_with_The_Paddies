import {siteOptions} from '../tools/site-options.mjs';
import {makeSiteFixture} from './make-site-fixture.mjs';
const {profile,args}=siteOptions();
if(profile.scene.fixture_preview){if(!args[0])throw Error('An explicit fixture output directory is required');console.log(makeSiteFixture(args[0],profile));process.exit(0);}
// FIXTURE data in CONTRACT-001 format for building the web before the data team's files exist.
// Real: grid frame, commune boundary, hamlets, pass dates/tracks, raw HH backdrops (web/fixtures/).
// FAKE: every water state, HH/HV value and validation number (synthetic, seeded; no radar used).
// Usage: node scripts/make-contract-fixture.mjs <out data dir>   -> <out>/sites.json, <out>/tan_hoi/*
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { cellMetrics, flagGt30, CELL_HA, stateAsOf } from '../src/map/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = join(HERE, '..', 'fixtures', 'tan_hoi');
const OUT = args[0] || join(HERE, '..', 'public', 'data');
const SITE = join(OUT, 'tan_hoi');
mkdirSync(join(SITE, 'backdrop'), { recursive: true });

// ---- UTM 48N (WGS84) inverse, Snyder; fixture-grade accuracy (< 1 m)
const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996, E2 = F * (2 - F), EP2 = E2 / (1 - E2);
function utmInv(x, y) {
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const mu = y / K0 / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64));
  const p = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const n1 = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2), t1 = Math.tan(p) ** 2, c1 = EP2 * Math.cos(p) ** 2;
  const r1 = A * (1 - E2) / (1 - E2 * Math.sin(p) ** 2) ** 1.5, d = (x - 500000) / (n1 * K0);
  const lat = p - (n1 * Math.tan(p) / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6 / 720);
  const lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5 / 120) / Math.cos(p);
  return [+(105 + lon * 180 / Math.PI).toFixed(6), +(lat * 180 / Math.PI).toFixed(6)];
}
const inside = (px, py, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

let seed = 20261112;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

// ---- real inputs
const aoi = JSON.parse(readFileSync(join(IN, 'aoi.geojson'), 'utf8'));
const places = JSON.parse(readFileSync(join(IN, 'places.geojson'), 'utf8'));
const bd = JSON.parse(readFileSync(join(IN, 'backdrop.json'), 'utf8'));
const ring = aoi.features[0].geometry.coordinates[0];
for (const f of ['20261027_047d_hh.webp', '20261022_148d_hh.webp']) copyFileSync(join(IN, 'backdrop', f), join(SITE, 'backdrop', f));
writeFileSync(join(SITE, 'aoi.geojson'), JSON.stringify(aoi));
writeFileSync(join(SITE, 'places.geojson'), JSON.stringify(places));

// passes: real dates/tracks of the catalogue (H0 2_danh_muc_anh); 083A crosses midnight UTC -> next local day
const P = [
  ...['08-16', '08-28', '09-09', '09-21', '10-03', '10-15', '10-27'].map((d) => ['047D', `2026-${d}T11:23:21Z`]),
  ...['08-18', '08-30', '09-11', '09-23', '10-05', '10-17'].map((d) => ['083A', `2026-${d}T22:36:00Z`]),
  ...['08-11', '08-23', '09-04', '09-16', '09-28', '10-10', '10-22'].map((d) => ['148D', `2026-${d}T11:31:40Z`]),
].sort((a, b) => a[1].localeCompare(b[1]));
const localDate = (utc) => new Date(Date.parse(utc) + 7 * 3600e3).toISOString().slice(0, 10);
const acquisitions = P.map(([track, utc], i) => ({
  i, acq_utc: utc, date_local: localDate(utc), track, frame: track === '083A' ? '007' : '083',
  crid: utc >= '2026-10-20' ? 'P05036' : 'P05023', valid_share: track === '148D' ? 0.86 : 1.0,
  rule: 'Q0', hh_db_max: -14.0, hv_db_max: -20.0,
  // shortcut: fixture has only two real backdrops; every pass reuses its track's nearest one
  backdrop: track === '148D' ? 'backdrop/20261022_148d_hh.webp' : 'backdrop/20261027_047d_hh.webp',
}));
const n = acquisitions.length;

// ---- grid: 250 m cells of the UTM frame (spec_backend §3.1); a cell belongs to the commune if its centre does
const E0 = 511500, E1 = 529250, N0 = 1113000, N1 = 1129250, CELL = 250;
const placePts = places.features.map((f) => ({ name: f.properties.name, c: f.geometry.coordinates }));
const features = [], series = {};
const rawCells = [];
for (let e = E0; e < E1; e += CELL) for (let nn = N0; nn < N1; nn += CELL) {
  const c = utmInv(e + CELL / 2, nn + CELL / 2);
  if (!inside(c[0], c[1], ring)) continue;
  rawCells.push({ e, n: nn, c, cell_id: `E${e}N${nn}` }); // shortcut: cell_id = SW corner (to confirm at H1)
}
rawCells.sort((a, b) => a.cell_id.localeCompare(b.cell_id));
assert.ok(rawCells.length > 2300 && rawCells.length < 2400, `cells ${rawCells.length}`);

rawCells.forEach((cell, id) => {
  const east = (cell.e - E0) / (E1 - E0), north = (cell.n - N0) / (N1 - N0);
  // FAKE water history: water released west -> east, a few canal/pond cells, some never flooded
  const roll = rnd();
  let s;
  if (roll < 0.02) s = 'W'.repeat(n);
  else if (roll < 0.17) s = 'N'.repeat(n);
  else {
    const on = Math.max(0, Math.round(2 + east * 11 + north * 2 + gauss() * 2));
    const end = rnd() < 0.25 ? on + 5 + Math.floor(rnd() * 6) : n;
    s = Array.from({ length: n }, (_, i) => (i >= on && i < end ? 'W' : 'N')).join('');
  }
  let raw = [...s];
  // track 148D misses the east ~13.5% of the commune (real coverage gap); scattered missing elsewhere
  raw = raw.map((ch, i) => ((acquisitions[i].track === '148D' && east > 0.86) || rnd() < 0.03 ? '-' : ch));
  if (rnd() < 0.01) raw = raw.map(() => (rnd() < 0.8 ? '-' : 'N')); // a few no_data cells
  const sFilt = raw.join('');
  // s_raw: one isolated flip somewhere, removed by the single-flip filter
  const sRaw = [...sFilt];
  if (rnd() < 0.08) { const k = 2 + Math.floor(rnd() * (n - 4)); if (sRaw[k] !== '-' && sRaw[k - 1] === sRaw[k + 1]) sRaw[k] = sRaw[k] === 'W' ? 'N' : 'W'; }
  const hh = [], hv = [];
  for (let i = 0; i < n; i++) {
    const ch = sRaw[i];
    hh.push(ch === '-' ? null : Math.round((ch === 'W' ? -185 : -85) + gauss() * 18));
    hv.push(ch === '-' ? null : Math.round((ch === 'W' ? -255 : -165) + gauss() * 18));
  }
  series[cell.cell_id] = { s: sFilt, s_raw: sRaw.join(''), hh, hv };

  const m = cellMetrics(sFilt, acquisitions);
  const cropland = rnd() < 0.88;
  let best = null, bd2 = Infinity;
  for (const p of placePts) { const d2 = (p.c[0] - cell.c[0]) ** 2 + (p.c[1] - cell.c[1]) ** 2; if (d2 < bd2) { bd2 = d2; best = p.name; } }
  const poly = [[cell.e, cell.n], [cell.e + CELL, cell.n], [cell.e + CELL, cell.n + CELL], [cell.e, cell.n + CELL], [cell.e, cell.n]].map(([x, y]) => utmInv(x, y));
  features.push({
    type: 'Feature', id,
    geometry: { type: 'Polygon', coordinates: [poly] },
    properties: { cell_id: cell.cell_id, ...m, flag_gt30: flagGt30(m, cropland), cropland, nearest_hamlet: best },
  });
});

// ---- summary (spec_backend §5.6 definitions)
const passes = acquisitions.map((a, i) => {
  let valid = 0, water = 0, neu = 0, gone = 0, asofObs = 0, asofWater = 0;
  for (const id in series) {
    const s = series[id].s;
    if (s[i] !== '-') {
      valid++; if (s[i] === 'W') water++;
      const prev = stateAsOf(s, i - 1);
      if (s[i] === 'W' && prev === 'N') neu++;
      if (s[i] === 'N' && prev === 'W') gone++;
    }
    const st = stateAsOf(s, i);
    if (st !== '-') { asofObs++; if (st === 'W') asofWater++; }
  }
  return { i, date_local: a.date_local, track: a.track, valid_ha: valid * CELL_HA, water_ha: water * CELL_HA,
    new_water_ha: neu * CELL_HA, water_gone_ha: gone * CELL_HA, asof_obs_ha: asofObs * CELL_HA, asof_water_ha: asofWater * CELL_HA };
});
const count = (key) => features.reduce((o, f) => ((o[f.properties[key]] = (o[f.properties[key]] || 0) + CELL_HA), o), {});
const status_ha = { flooded: 0, water_gone: 0, never_water: 0, always_water: 0, no_data: 0, ...count('status') };
const gt30_ha = { yes: 0, possible: 0, no: 0, na: 0, ...count('flag_gt30') };
const area_ha = features.length * CELL_HA;
assert.equal(Object.values(status_ha).reduce((a, b) => a + b, 0), area_ha);
assert.equal(Object.values(gt30_ha).reduce((a, b) => a + b, 0), area_ha);
const summary = { passes, totals: { n_cells: features.length, area_ha, last_obs_local: acquisitions[n - 1].date_local, status_ha, gt30_ha } };

const meta = {
  contract_version: '1.0.0', site: 'tan_hoi', fixture: true, generated_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  timezone: 'Asia/Ho_Chi_Minh', grid: { epsg: 32648, cell_m: CELL, n_cells: features.length },
  method: { rule: 'Q0', hh_db_max: -14.0, hv_db_max: -20.0, single_flip_filter: true, frozen_utc: null },
  acquisitions, skipped: [], backdrop: bd,
  sources: ['NISAR L2 GCOV (NASA/ISRO), ASF DAAC', 'OpenStreetMap contributors (ODbL)'],
};
const validation = {
  reference: 'FIXTURE - not a validation result', frozen_utc: null, first_dswx_read_utc: null,
  filtered: { n_pairs: null, kappa_median: null, kappa_min: null, kappa_max: null }, unfiltered: {}, pairs: [], posthoc: [],
};

writeFileSync(join(OUT, 'sites.json'), JSON.stringify({ sites: [{ id: 'tan_hoi', name: 'Tân Hội', region: 'An Giang, Vietnam', epsg: 32648,
  center: [105.186, 10.143], bounds: [105.105, 10.069, 105.267, 10.216], default: true }] }));
writeFileSync(join(SITE, 'meta.json'), JSON.stringify(meta));
writeFileSync(join(SITE, 'cells.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
writeFileSync(join(SITE, 'series.json'), JSON.stringify({ cells: series }));
writeFileSync(join(SITE, 'summary.json'), JSON.stringify(summary));
writeFileSync(join(SITE, 'validation.json'), JSON.stringify(validation));
console.log(`fixture: ${features.length} cells, ${n} passes ->`, OUT, '| status_ha', JSON.stringify(status_ha));
