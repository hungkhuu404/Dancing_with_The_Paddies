// People, dogs, duck flocks with herders, buffaloes: behaviour (where each one is, what clip it plays) on top of crowd.js.
import * as THREE from 'three';
import * as P from './placeholders.js';
import { createCrowd } from './crowd.js';
import {createHerderPole} from './crowdModels.js';
import { flockSteer, rng } from './paths.js';
import { centroid } from '../data/parcels.js';
import { H } from '../scene/land.js';

const MODEL_OF = { wader: 'wader', herder: 'wader', fisher: 'fisher', washer: 'washer', kid: 'kid', dog: 'dog', duck: 'duck', buffalo: 'buffalo' };

export function createCharacters(ctx) {
  const low = ctx.quality.tier === 'low';
  const group = new THREE.Group(); group.name = 'characters';
  const R = rng(4242);
  const flooded = (pi) => pi >= 0 && ctx.land.level[pi] > 0.5;
  const surfaceAt = (x, z) => { const pi = ctx.parcelAt(x, z); return pi >= 0 ? ctx.land.heightOfParcel(pi) : ctx.terrainAt(x, z); };
  const waterAt = (x, z) => { const pi = ctx.parcelAt(x, z); return pi >= 0 ? flooded(pi) : ctx.terrainAt(x, z) < 0.05; };

  // ---------------------------------------------------------------- people
  const people = ctx.props.people.map((p) => ({ kind: p.kind, hx: p.x, hz: p.z, x: p.x, y: 0, z: p.z, yaw: p.rot || 0, home: p.rot || 0, clip: 'idle', timer: R() * 8, st: 0, vx: 0, vz: 0, vy: 0, ph: R() * 6.28 }));
  const byKind = (k) => people.filter((p) => p.kind === k);
  const crowds = {};
  const pc = (k, agents, opts = {}) => { if (agents.length) crowds[k] = createCrowd(ctx, group, { name: k, agents, geo: P.person(k), model: MODEL_OF[k], near: low ? 70 : 130, far: low ? 120 : 450, pool: low ? 2 : 10, swimDrop: -1.2, ...opts }); };
  pc('wader', byKind('wader')); pc('fisher', byKind('fisher')); pc('washer', byKind('washer')); pc('kid', byKind('kid'));

  // ---------------------------------------------------------------- dogs
  const dogs = ctx.props.dogs.map((d) => ({ hx: d.x, hz: d.z, x: d.x, z: d.z, y: Math.max(0, ctx.groundAt(d.x, d.z)), yaw: d.rot || 0, clip: 'idle', timer: R() * 5, tx: d.x, tz: d.z, ph: R() * 6.28 }));
  if (dogs.length) crowds.dog = createCrowd(ctx, group, { name: 'dog', agents: dogs, geo: P.dog(), near: low ? 50 : 100, far: low ? 100 : 300, pool: low ? 1 : 8, pivot: 0.4, farModel: true });

  // ---------------------------------------------------------------- ducks + herders
  const DUCK_SCALE = low ? 0.4 : 1;
  const flocks = ctx.props.duck_flocks.map((f) => {
    const n = Math.max(4, Math.round((f.n || 60) * DUCK_SCALE));
    const ducks = Array.from({ length: n }, () => { const a = R() * 6.28, r = Math.sqrt(R()) * (f.r || 15); return { x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r, y: 0, vx: 0, vz: 0, yaw: R() * 6.28, clip: 'swim', ph: R() * 6.28, water: true }; });
    const h = f.herder || [f.x + 15, f.z];
    const herder = { kind: 'herder', x: h[0], z: h[1], y: H.dry, yaw: 0, clip: 'walk', ph: R() * 6.28 };
    return { home: [f.x, f.z], r: f.r || 15, ducks, herder, goal: [f.x, f.z], timer: 0, cx: f.x, cz: f.z };
  });
  const allDucks = flocks.flatMap((f) => f.ducks);
  if (allDucks.length) crowds.duck = createCrowd(ctx, group, { name: 'duck', agents: allDucks, geo: P.duck(), near: low ? 40 : 80, far: low ? 150 : 420, pool: low ? 4 : 40, pivot: 0.05, detail: true, farModel: true });
  const herders = flocks.map((f) => f.herder);
  if (herders.length) crowds.herder = createCrowd(ctx, group, { name: 'herder', agents: herders, geo: P.person('herder'), model: 'wader', near: low ? 70 : 130, far: low ? 150 : 450, pool: low ? 1 : 5, attach: createHerderPole });

  // ---------------------------------------------------------------- buffaloes: a few on dry fields near the village (no placement data: deterministic pick)
  const bufs = [];
  for (let i = 0; i < ctx.layout.parcels.length && bufs.length < (low ? 3 : 8); i += 37) {
    const [x, z] = centroid(ctx.layout.parcels[i].poly);
    bufs.push({ pi: i, hx: x, hz: z, x, z, y: H.dry, yaw: R() * 6.28, clip: 'idle', timer: R() * 10, tx: x, tz: z, ph: R() * 6.28 });
  }
  crowds.buffalo = createCrowd(ctx, group, { name: 'buffalo', agents: bufs, geo: P.buffalo(), near: low ? 60 : 120, far: low ? 150 : 500, pool: low ? 1 : 4, pivot: 1, farModel: true });

  // ---------------------------------------------------------------- behaviour
  const wander = (a, dt, speed, radius, idleClip = 'idle') => {
    a.timer -= dt;
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
    if (a.clip === 'walk') {
      if (d < 0.3) { a.clip = R() < 0.4 ? 'sit' : idleClip; a.timer = 4 + R() * 10; }
      else { const s = Math.min(speed * dt, d); a.x += (dx / d) * s; a.z += (dz / d) * s; turn(a, Math.atan2(dx, dz), dt * 3); }
    } else if (a.timer < 0) {
      const ang = R() * 6.28, r = Math.sqrt(R()) * radius;
      a.tx = a.hx + Math.cos(ang) * r; a.tz = a.hz + Math.sin(ang) * r; a.clip = 'walk';
    }
  };
  const turn = (a, yaw, k) => { let dy = yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * Math.min(1, k); };

  function stepPeople(dt, day) {
    for (const a of people) {
      a.timer -= dt;
      if (a.kind === 'wader') {
        const pi = ctx.parcelAt(a.hx, a.hz);
        a.vis = day > 0.35;
        const wet = flooded(pi);
        if (a.clip === 'walk') {
          const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
          if (d < 0.2) { a.clip = 'work'; a.timer = 10 + R() * 20; } else { a.x += (dx / d) * 0.5 * dt; a.z += (dz / d) * 0.5 * dt; turn(a, Math.atan2(dx, dz), dt * 2); }
        } else { a.clip = 'work'; if (a.timer < 0) { a.tx = a.hx + (R() - 0.5) * 10; a.tz = a.hz + (R() - 0.5) * 10; a.clip = 'walk'; } }
        a.y = wet ? H.wet - 0.15 : pi >= 0 ? ctx.land.heightOfParcel(pi) : surfaceAt(a.x, a.z); // waders sink ~0.4 m below the water line
      } else if (a.kind === 'fisher') {
        a.vis = true; a.y = a.yb ??= Math.max(0, ctx.groundAt(a.x, a.z));
        if (a.timer < 0) { a.clip = a.clip === 'cast' ? 'pull' : 'cast'; a.timer = a.clip === 'cast' ? 6 + R() * 6 : 4 + R() * 4; }
      } else if (a.kind === 'washer') {
        a.vis = day > 0.35; a.clip = 'wash'; a.y = 0.08;
      } else if (a.kind === 'kid') {
        kid(a, dt, day);
      }
    }
  }
  // kids: stand on the bank, jump in, swim a lap, climb out, repeat
  function kid(a, dt, day) {
    a.vis = day > 0.5 && ctx.rainHere(a.hx, a.hz) < 0.2;
    const fx = Math.sin(a.home), fz = Math.cos(a.home);
    if (a.st === 0) { // on the bank
      a.x = a.hx; a.z = a.hz; a.y = a.yb ??= Math.max(0.3, ctx.groundAt(a.hx, a.hz)); a.yaw = a.home; a.clip = 'idle'; a.pitch = 0;
      if (a.timer < 0) { a.st = 1; a.t = 0; a.clip = 'jump'; }
    } else if (a.st === 1) { // jump: the glTF clip carries its own root motion (2.05 m out, 1.6 s); the stand-in gets an arc
      a.t += dt; const u = Math.min(1, a.t / 1.6);
      if (a.slot) { a.x = a.hx; a.z = a.hz; a.y = a.yb; a.pitch = 0; }
      else { a.x = a.hx + fx * u * 2.05; a.z = a.hz + fz * u * 2.05; a.y = a.yb + Math.sin(u * Math.PI) * 0.9 - u * (a.yb + 0.3); a.pitch = u * 1.2; }
      if (u >= 1) { a.st = 2; a.t = 0; a.clip = 'swim'; a.x = a.hx + fx * 2.05; a.z = a.hz + fz * 2.05; ctx.splash?.(a.x, a.z); }
    } else { // swim a small loop that starts at the landing point and returns to it
      a.t += dt; const u = a.t / 9, ang = u * Math.PI * 2;
      const cx = a.hx + fx * 3.35, cz = a.hz + fz * 3.35, rx = -fx, rz = -fz, sx = fz, sz = -fx;
      a.x = cx + rx * Math.cos(ang) * 1.3 + sx * Math.sin(ang) * 2.5; a.z = cz + rz * Math.cos(ang) * 1.3 + sz * Math.sin(ang) * 2.5;
      a.y = a.slot ? 0 : -0.05; a.pitch = a.slot ? 0 : 1.35; turn(a, a.home + Math.PI / 2 + ang, dt * 4); // glTF swim: waterline at y=0
      if (u >= 1) { a.st = 0; a.timer = 3 + R() * 6; }
    }
  }
  const SP = { sepR: 0.7, separation: 1.4, cohesion: 0.06, align: 0.4, goal: 0.45, maxSpeed: 0.55 }, steer = {};
  let duckFrame = 0;
  function stepDucks(dt, cam, day) {
    duckFrame++;
    const ff = ctx.land.uniforms.uFloodFrac.value;
    for (const f of flocks) {
      const show = day > 0.3;
      const active = Math.round(f.ducks.length * Math.min(1, 0.45 + ff)); // more ducks out when the fields are flooded
      f.ducks.forEach((d, i) => (d.vis = show && i < active));
      f.herder.vis = show;
      if ((f.cx - cam.x) ** 2 + (f.cz - cam.z) ** 2 > 600 * 600 || !show) continue;
      let cx = 0, cz = 0;
      for (let i = 0; i < active; i++) { cx += f.ducks[i].x; cz += f.ducks[i].z; }
      f.cx = cx / Math.max(1, active); f.cz = cz / Math.max(1, active);
      f.timer -= dt;
      if (f.timer < 0 || Math.hypot(f.goal[0] - f.cx, f.goal[1] - f.cz) < 4) {
        f.timer = 25 + R() * 30;
        let g = null;
        for (let k = 0; k < 10 && !g; k++) { const a = R() * 6.28, r = R() * 70; const x = f.home[0] + Math.cos(a) * r, z = f.home[1] + Math.sin(a) * r; if (waterAt(x, z) && ctx.parcelAt(x, z) >= 0) g = [x, z]; }
        f.goal = g || [f.home[0] + (R() - 0.5) * 60, f.home[1] + (R() - 0.5) * 60]; // dry season: they glean the stubble
      }
      for (let i = 0; i < active; i++) {
        const d = f.ducks[i];
        // a handful of neighbours by index is enough for a cohesive flock and keeps this O(n)
        const nb = NB; nb.length = 0;
        for (let k = -3; k <= 3; k++) nb.push(f.ducks[(i + k + active) % active]);
        flockSteer(d, nb, f.goal, SP, steer);
        d.vx += (steer.x - d.vx) * Math.min(1, dt * 1.5); d.vz += (steer.z - d.vz) * Math.min(1, dt * 1.5);
        d.x += d.vx * dt; d.z += d.vz * dt;
        const sp = Math.hypot(d.vx, d.vz);
        if (sp > 0.05) turn(d, Math.atan2(d.vx, d.vz), dt * 3);
        if ((i + duckFrame) % 8 === 0) { const pi = ctx.parcelAt(d.x, d.z); d.water = pi >= 0 ? flooded(pi) : ctx.terrainAt(d.x, d.z) < 0.05; d.gy = d.water ? 0 : (pi >= 0 ? ctx.land.heightOfParcel(pi) : ctx.terrainAt(d.x, d.z)) + 0.03; }
        d.y = d.gy ?? 0;
        d.clip = !d.water ? 'walk' : sp < 0.18 && Math.sin(d.ph + duckFrame * 0.002) > 0.3 ? 'dabble' : 'swim';
      }
      // herder walks ~11 m behind the flock, on the far side from the goal
      const h = f.herder, gx = f.goal[0] - f.cx, gz = f.goal[1] - f.cz, gl = Math.hypot(gx, gz) || 1;
      const tx = f.cx - (gx / gl) * 11, tz = f.cz - (gz / gl) * 11, dx = tx - h.x, dz = tz - h.z, dd = Math.hypot(dx, dz);
      if (dd > 0.6) { const s = Math.min(dd, 0.9 * dt); h.x += (dx / dd) * s; h.z += (dz / dd) * s; h.clip = 'walk'; turn(h, Math.atan2(dx, dz), dt * 2); }
      else { h.clip = 'idle'; turn(h, Math.atan2(f.cx - h.x, f.cz - h.z), dt); }
      const pi = ctx.parcelAt(h.x, h.z);
      h.y = pi >= 0 ? (flooded(pi) ? H.wet - 0.15 : ctx.land.heightOfParcel(pi)) : ctx.terrainAt(h.x, h.z);
    }
  }
  const NB = [];

  function update(dt, t, cam, cheap = false) {
    const day = 1 - ctx.U.uNight.value;
    stepPeople(dt, day);
    for (const dg of dogs) { wander(dg, dt, 1.3, 7); dg.vis = true; }
    for (const b of bufs) { wander(b, dt, 0.4, 14, 'idle'); if (b.clip === 'sit') b.clip = 'idle'; b.vis = !flooded(b.pi) && day > 0.3; b.y = H.dry; }
    stepDucks(dt, cam, day);
    for (const c of Object.values(crowds)) c.update(dt, t, cam, cheap);
  }

  return {
    group, update,
    upgrade(name, gltf) { let ok = false; for (const c of Object.values(crowds)) if (c.model === name) ok = c.setModel(gltf) || ok; return ok; },
    get mixers() { return Object.values(crowds).reduce((s, c) => s + c.mixers, 0); },
    get counts() { return Object.fromEntries(Object.entries(crowds).map(([k, c]) => [k, c.agents.filter((a) => a.vis).length])); },
  };
}
