// Pure geometry/behaviour helpers for the living world. No DOM, no WebGL: tested in node (test/world.test.mjs).

/** Polyline route with cumulative lengths. points: [[x,z],...]. */
export function makeRoute(points, closed = false) {
  const pts = points.map((p) => [+p[0], +p[1]]);
  if (closed && pts.length > 2) pts.push(pts[0].slice());
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, L: cum[cum.length - 1], closed };
}

/** Segment index i such that cum[i] <= s < cum[i+1] (binary search). */
function segAt(cum, s) {
  let lo = 0, hi = cum.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
  return lo;
}

/**
 * Position + heading at arc length s. Loops (closed routes, or wrap=true) or clamps.
 * out = {x, z, yaw, seg}; yaw is atan2(dx, dz) so a model with front +Z faces the travel direction.
 */
export function sampleRoute(r, s, out = {}, wrap = r.closed) {
  if (r.L <= 0) { out.x = r.pts[0][0]; out.z = r.pts[0][1]; out.yaw = 0; out.seg = 0; return out; }
  s = wrap ? ((s % r.L) + r.L) % r.L : Math.min(r.L, Math.max(0, s));
  const i = segAt(r.cum, s), a = r.pts[i], b = r.pts[i + 1];
  const len = r.cum[i + 1] - r.cum[i] || 1e-6, u = (s - r.cum[i]) / len;
  out.x = a[0] + (b[0] - a[0]) * u; out.z = a[1] + (b[1] - a[1]) * u;
  out.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); out.seg = i;
  return out;
}

/** Ping-pong arc length: travels 0..L..0 for an open route. Returns {s, dir}. */
export function pingPong(L, d) {
  const p = ((d % (2 * L)) + 2 * L) % (2 * L);
  return p <= L ? { s: p, dir: 1 } : { s: 2 * L - p, dir: -1 };
}

/** Resample a polyline at a fixed step (keeps both ends). */
export function resample(points, step) {
  const r = makeRoute(points), out = [], o = {};
  const n = Math.max(1, Math.ceil(r.L / step));
  for (let k = 0; k <= n; k++) { sampleRoute(r, (k / n) * r.L, o, false); out.push([o.x, o.z]); }
  return out;
}

/**
 * Sagging wire between two attachment points (parabolic approximation of the catenary, < 1% error for sag/span < 0.1).
 * Returns n+1 points [x,y,z]; the lowest point sits `sag` metres below the chord at mid-span.
 */
export function catenary(a, b, sag, n = 8) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

/** Wire sag for a span (m): ~1.5% of the span, at least 0.15 m. */
export const sagFor = (span) => Math.max(0.15, span * 0.015);

/**
 * Boids-lite steering for one member of a small flock on the ground plane.
 * me/others: {x, z, vx, vz}; goal: [x, z]. Returns desired velocity in out {x, z}.
 * Separation within sepR, cohesion toward the flock centre, alignment, and a pull to the goal.
 */
export function flockSteer(me, others, goal, p, out = {}) {
  let cx = 0, cz = 0, ax = 0, az = 0, sx = 0, sz = 0, n = 0;
  const r2 = p.sepR * p.sepR;
  for (const o of others) {
    if (o === me) continue;
    const dx = me.x - o.x, dz = me.z - o.z, d2 = dx * dx + dz * dz;
    cx += o.x; cz += o.z; ax += o.vx; az += o.vz; n++;
    if (d2 < r2 && d2 > 1e-8) { const w = (r2 - d2) / r2 / Math.sqrt(d2); sx += dx * w; sz += dz * w; }
  }
  let x = 0, z = 0;
  if (n) {
    x += (cx / n - me.x) * p.cohesion + (ax / n - me.vx) * p.align;
    z += (cz / n - me.z) * p.cohesion + (az / n - me.vz) * p.align;
  }
  x += sx * p.separation; z += sz * p.separation;
  const gx = goal[0] - me.x, gz = goal[1] - me.z, gd = Math.hypot(gx, gz);
  if (gd > 1e-6) { x += (gx / gd) * p.goal * Math.min(1, gd / 10); z += (gz / gd) * p.goal * Math.min(1, gd / 10); }
  const sp = Math.hypot(x, z);
  if (sp > p.maxSpeed) { x *= p.maxSpeed / sp; z *= p.maxSpeed / sp; }
  out.x = x; out.z = z;
  return out;
}

/** Distance from (x,z) to segment a-b, plus the closest point. */
export function closestOnSeg(x, z, a, b, out = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  let u = l2 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0;
  u = Math.max(0, Math.min(1, u));
  out.x = a[0] + u * dx; out.z = a[1] + u * dz; out.d = Math.hypot(out.x - x, out.z - z);
  return out;
}

/**
 * Keep a point inside the canal water: canals are centre-lines with width_m. If the point is further than
 * width/2 - margin from every centre-line, it is pulled back onto the nearest allowed edge. Returns {x, z, inside}.
 */
export function clampToCanals(x, z, canals, margin = 1, out = {}) {
  let best = Infinity, bx = x, bz = z, bhw = 0; const c = {};
  for (const cn of canals) {
    const hw = Math.max(0.5, (cn.width_m || 4) / 2 - margin), P = cn.points;
    for (let i = 1; i < P.length; i++) {
      closestOnSeg(x, z, P[i - 1], P[i], c);
      if (c.d - hw < best) { best = c.d - hw; bx = c.x; bz = c.z; bhw = hw; }
    }
  }
  if (best <= 0) { out.x = x; out.z = z; out.inside = true; return out; }
  const dx = x - bx, dz = z - bz, d = Math.hypot(dx, dz) || 1;
  out.x = bx + (dx / d) * bhw; out.z = bz + (dz / d) * bhw; out.inside = false;
  return out;
}

/** Local clock hour (0..24) of a UTC timestamp at a fixed offset (Vietnam: +7, no DST). */
export function localHour(utcIso, offsetH = 7) {
  const d = new Date(utcIso);
  if (Number.isNaN(+d)) return null;
  return (((d.getUTCHours() + d.getUTCMinutes() / 60 + offsetH) % 24) + 24) % 24;
}

/** Scene time-of-day value (0 dawn · .33 noon · .66 golden hour · .83 dusk · 1 night) for a clock hour. */
export function hourToTod(h) {
  const K = [[5.5, 0], [12, 0.33], [17, 0.66], [18.2, 0.83], [19.5, 1]];
  if (h < K[0][0] - 0.5 || h >= K[4][0]) return 1;
  if (h < K[0][0]) return 0;
  for (let i = 1; i < K.length; i++) if (h <= K[i][0]) return K[i - 1][1] + ((h - K[i - 1][0]) / (K[i][0] - K[i - 1][0])) * (K[i][1] - K[i - 1][1]);
  return 1;
}

/**
 * Satellite ground-track heading for a NISAR track id: '...D' descending flies north->south, '...A' south->north.
 * Sun-synchronous at ~10°N: the track leans ~12° west of the meridian. Returns a unit direction [x, z] (z = south).
 */
export function trackDir(track) {
  const asc = /A\s*$/i.test(track || '');
  const lean = (12 * Math.PI) / 180;
  return asc ? [-Math.sin(lean), -Math.cos(lean)] : [-Math.sin(lean), Math.cos(lean)];
}

/** Seconds until the front reaches (x,z), including optional satellite lead-in. start is its initial along-track coordinate. */
export function sweepDelay(x, z, dir, start, speed, leadIn = 0) {
  return leadIn + Math.max(0, (x * dir[0] + z * dir[1] - start) / speed);
}

/** Deterministic PRNG (Park-Miller) returning a function in [0,1). */
export function rng(seed = 1) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
