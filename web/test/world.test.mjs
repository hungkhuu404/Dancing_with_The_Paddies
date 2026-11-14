import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRoute, sampleRoute, pingPong, resample, catenary, sagFor, flockSteer, clampToCanals,
  localHour, hourToTod, trackDir, sweepDelay, rng,
} from '../src/world/paths.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('route following: position, heading, wrap and clamp', () => {
  const r = makeRoute([[0, 0], [10, 0], [10, 10]]);
  assert.equal(r.L, 20);
  const o = sampleRoute(r, 5);
  close(o.x, 5); close(o.z, 0); close(o.yaw, Math.PI / 2); // +x travel = yaw 90°
  sampleRoute(r, 15, o); close(o.x, 10); close(o.z, 5); close(o.yaw, 0); // +z travel = yaw 0
  sampleRoute(r, 25, o, true); close(o.x, 5); close(o.z, 0); // wraps
  sampleRoute(r, 25, o, false); close(o.x, 10); close(o.z, 10); // clamps
  const c = makeRoute([[0, 0], [10, 0], [10, 10]], true);
  close(c.L, 20 + Math.hypot(10, 10));
  assert.deepEqual(pingPong(10, 12), { s: 8, dir: -1 });
  assert.deepEqual(pingPong(10, 3), { s: 3, dir: 1 });
  const rs = resample([[0, 0], [10, 0]], 2.5);
  assert.equal(rs.length, 5); close(rs[2][0], 5);
});

test('catenary: endpoints fixed, sag at mid-span, symmetric', () => {
  const p = catenary([0, 9, 0], [40, 9, 0], 0.6, 8);
  assert.equal(p.length, 9);
  assert.deepEqual(p[0], [0, 9, 0]); assert.deepEqual(p[8], [40, 9, 0]);
  close(p[4][1], 8.4); close(p[2][1], p[6][1]);
  assert.ok(p.every((q) => q[1] <= 9));
  close(sagFor(40), 0.6); close(sagFor(2), 0.15);
});

test('flock steering: separation, cohesion, goal, speed cap', () => {
  const P = { sepR: 1, separation: 2, cohesion: 0.5, align: 0.3, goal: 0.4, maxSpeed: 0.8 };
  const a = { x: 0, z: 0, vx: 0, vz: 0 }, b = { x: 0.5, z: 0, vx: 0, vz: 0 };
  const o = flockSteer(a, [a, b], [0, 0], P);
  assert.ok(o.x < 0, 'too close: pushed away'); // separation beats cohesion at 0.5 m
  const far = { x: 6, z: 0, vx: 0, vz: 0 };
  flockSteer(a, [a, far], [0, 0], P, o);
  assert.ok(o.x > 0, 'far member: pulled together');
  flockSteer(a, [a], [100, 0], P, o);
  assert.ok(o.x > 0 && Math.abs(o.z) < 1e-9, 'alone: heads to goal');
  const many = Array.from({ length: 20 }, (_, i) => ({ x: 50 + i, z: 0, vx: 5, vz: 0 }));
  flockSteer(a, [a, ...many], [100, 0], P, o);
  assert.ok(Math.hypot(o.x, o.z) <= P.maxSpeed + 1e-9, 'speed capped');
});

test('clampToCanals keeps a boat in the water', () => {
  const canals = [{ width_m: 12, points: [[0, -100], [0, 100]] }];
  const inside = clampToCanals(3, 10, canals, 1);
  assert.equal(inside.inside, true); close(inside.x, 3);
  const out = clampToCanals(20, 10, canals, 1);
  assert.equal(out.inside, false); close(out.x, 5); close(out.z, 10);
});

test('acquisition time -> local hour -> scene time of day; track direction', () => {
  close(localHour('2026-08-11T11:31:40Z'), 18 + 31 / 60 + 0, 0.01); // 18:31 ICT
  close(localHour('2026-08-18T22:36:00Z'), 5.6, 0.001);
  close(hourToTod(12), 0.33); close(hourToTod(5.5), 0); assert.equal(hourToTod(23), 1); assert.equal(hourToTod(3), 1);
  const t = hourToTod(18.5); assert.ok(t > 0.83 && t < 1);
  assert.ok(trackDir('148D')[1] > 0.9, 'descending flies south (+z)');
  assert.ok(trackDir('083A')[1] < -0.9, 'ascending flies north (-z)');
  const d = trackDir('148D');
  assert.ok(sweepDelay(0, 500, d, -1000, 500) > sweepDelay(0, -500, d, -1000, 500), 'south fields are swept later on a descending pass');
});

test('field transition and scan front share the same lead-in for both track directions', () => {
  for(const track of ['148D','083A']){
    const dir=trackDir(track),speed=1200,start=-4000,lead=1.5;
    const x=180,z=900,delay=sweepDelay(x,z,dir,start,speed,lead);
    close(start+(delay-lead)*speed,x*dir[0]+z*dir[1],1e-8);
    assert.equal(sweepDelay(-10000*dir[0],-10000*dir[1],dir,start,speed,lead),lead);
  }
});

test('rng is deterministic and in [0,1)', () => {
  const a = rng(5), b = rng(5);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});
