// Pure helpers for the whole-commune scene: global frame <-> UTM, tile selection for streaming, 250 m cell ids,
// the far-field cell texture, and moving tile-local data into the global frame. No DOM, no WebGL (test/commune.test.mjs).

/** Scene (x east, z south, metres from the frame origin) -> UTM [e, n]. */
export const sceneToUtm = (origin, x, z) => [origin.utm_e + x, origin.utm_n - z];
/** UTM -> scene [x, z]. */
export const utmToScene = (origin, e, n) => [e - origin.utm_e, origin.utm_n - n];

/** 250 m block id of a UTM point; the id names the block's SW corner (the contract's cell_id). */
export const cellIdAt = (e, n, step = 250) => `E${Math.floor(e / step) * step}N${Math.floor(n / step) * step}`;

/** Frame rectangle in scene coords: {x0, x1, z0, z1}. */
export function frameRect(origin, frame) {
  return { x0: frame.e0 - origin.utm_e, x1: frame.e1 - origin.utm_e, z0: origin.utm_n - frame.n1, z1: origin.utm_n - frame.n0 };
}

/** Distance from (x,z) to a square tile of half-size `half` centred at (t.x, t.z); 0 inside. */
export function tileDist(t, half, x, z) {
  const dx = Math.max(0, Math.abs(x - t.x) - half), dz = Math.max(0, Math.abs(z - t.z) - half);
  return Math.hypot(dx, dz);
}

/** The tile whose square contains (x,z), from `tiles` (any iterable of {x,z}), or null. */
export function tileAt(tiles, half, x, z) {
  for (const t of tiles) if (Math.abs(x - t.x) <= half && Math.abs(z - t.z) <= half) return t;
  return null;
}

/**
 * Tiles to keep loaded around (x,z): every tile within `radius` of the point (nearest first), at most `max`.
 * Tiles already loaded (`keep`) stay until `radius + hysteresis` and win ties against new ones by `hysteresis`,
 * so a target wobbling on a boundary does not load/unload the same tile back and forth.
 */
export function selectTiles(tiles, half, x, z, { radius, max, keep = new Set(), hysteresis = 400 }) {
  const c = [];
  for (const t of tiles) {
    const d = tileDist(t, half, x, z), k = keep.has(t.id);
    if (d <= radius || (k && d <= radius + hysteresis)) c.push([d - (k ? hysteresis : 0), t.id]);
  }
  c.sort((a, b) => a[0] - b[0]);
  return c.slice(0, max).map((q) => q[1]);
}

/** Moves tile-local placement data (layout.json / props.json, coords around the tile centre) by (dx, dz), in place. */
export function shiftXZ(v, dx, dz, key = '') {
  if (Array.isArray(v)) {
    if (key === 'herder') { v[0] += dx; v[1] += dz; }
    else if (key === 'points' || key === 'path' || key === 'poly' || key === 'egret_zones') for (const p of v) { p[0] += dx; p[1] += dz; }
    else for (const e of v) if (e && typeof e === 'object') shiftXZ(e, dx, dz);
    return v;
  }
  if (v && typeof v === 'object') {
    if (typeof v.x === 'number' && typeof v.z === 'number') { v.x += dx; v.z += dz; }
    for (const k of Object.keys(v)) if (k !== 'origin' && v[k] && typeof v[k] === 'object') shiftXZ(v[k], dx, dz, k);
  }
  return v;
}

/** Parses series.json cell ids into grid positions of the frame: [{col, row, s}] (row 0 = southernmost). */
export function cellGrid(series, frame, step = 250) {
  const out = [];
  const cols = Math.round((frame.e1 - frame.e0) / step), rows = Math.round((frame.n1 - frame.n0) / step);
  for (const [id, c] of Object.entries(series.cells || {})) {
    const m = /^E(\d+)N(\d+)$/.exec(id);
    if (!m) continue;
    const col = Math.floor((+m[1] - frame.e0) / step), row = Math.floor((+m[2] - frame.n0) / step);
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
    out.push({ col, row, s: c.s || '' });
  }
  return { cells: out, cols, rows };
}

/** '-' keeps the last known state (else the next one), like levelAt() for parcels. */
function wet(s, i) {
  for (let j = i; j >= 0; j--) if (s[j] && s[j] !== '-') return s[j] === 'W';
  for (let j = i + 1; j < s.length; j++) if (s[j] !== '-') return s[j] === 'W';
  return false;
}

/**
 * Far-field cell texture (RGBA8, cols x rows, row 0 south): R water at pass `from`, G water at pass `to`,
 * B no data at `to`, A 255 where the cell exists (inside the commune). The shader shows G, or R ahead of a radar sweep.
 */
export function packCells(grid, from, to, out = new Uint8Array(grid.cols * grid.rows * 4)) {
  out.fill(0);
  for (const c of grid.cells) {
    const o = (c.row * grid.cols + c.col) * 4;
    out[o] = wet(c.s, from) ? 255 : 0;
    out[o + 1] = wet(c.s, to) ? 255 : 0;
    out[o + 2] = (c.s[to] || '-') === '-' ? 255 : 0;
    out[o + 3] = 255;
  }
  return out;
}

/** Share of cells with water ('W') at each pass, for the season strip. */
export function cellFractions(series, n) {
  const out = new Array(n).fill(0), cells = Object.values(series.cells || {});
  if (!cells.length) return out;
  for (const c of cells) for (let i = 0; i < n; i++) if (c.s?.[i] === 'W') out[i]++;
  return out.map((v) => v / cells.length);
}
