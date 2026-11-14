import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  firstWater, stillThere, duration, levelAt, floodFractions, polyArea, pointInPoly,
  transitionOrder, triangulate, cleanPoly, buildGrid, pickParcel, fmtDate,
} from '../src/data/parcels.js';

const passes = Array.from({ length: 20 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 11 + i * 6));
  return { i, date: d.toISOString().slice(0, 10) };
});

test('firstWater / stillThere', () => {
  assert.equal(firstWater('NNNNWWWNNNNNNNNNNNNN'), 4);
  assert.equal(firstWater('NNNNNNNNNNNNNNNNNNNN'), -1);
  assert.equal(stillThere('NNNNNNNNNNNNNNNNNNNW'), true);
  assert.equal(stillThere('WWWWWWWWWWWWWWWWWWWN'), false);
  assert.equal(stillThere('WWWWWWWWWWWWWWWWWWW-'), null);
});

test('duration brackets the episode by pass dates', () => {
  const d = duration('NNNNWWWNNNNNNNNNNNNN', passes); // W at 4..6, N at 7, 6-day spacing
  assert.equal(d.from, 4); assert.equal(d.last, 6); assert.equal(d.end, 7);
  assert.equal(d.days, 18); // (3+12+3)
  assert.equal(d.minDays, 12); assert.equal(d.maxDays, 24);
  assert.equal(d.ongoing, false);
  assert.equal(duration('NNNNNNNNNNNNNNNNNNNN', passes), null);
});

test("duration: '-' does not break an episode, open ended when no N follows", () => {
  const d = duration('NNW--WWWWWWWWWWWWWWW', passes);
  assert.equal(d.ongoing, true);
  assert.equal(d.last, 19);
  const e = duration('NNW--NNNNNNNNNNNNNNN', passes);
  assert.equal(e.last, 2); assert.equal(e.end, 5);
  assert.equal(duration('WNNNNNNNNNNNNNNNNNNN', passes).days, 3);
});

test('levelAt carries the last known state over missing passes', () => {
  assert.equal(levelAt('NW--N', 3), true);
  assert.equal(levelAt('--WNN', 0), true);
  assert.equal(levelAt('-----', 2), false);
});

test('floodFractions', () => {
  assert.deepEqual(floodFractions([{ s: 'WN' }, { s: 'WW' }], 2), [1, 0.5]);
});

test('triangulation covers the polygon area (concave L shape, closing vertex)', () => {
  const L = cleanPoly([[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10], [0, 0]]);
  assert.equal(L.length, 6);
  const idx = triangulate(L);
  assert.equal(idx.length, (L.length - 2) * 3);
  let sum = 0;
  for (let i = 0; i < idx.length; i += 3) sum += Math.abs(polyArea([L[idx[i]], L[idx[i + 1]], L[idx[i + 2]]]));
  assert.ok(Math.abs(sum - Math.abs(polyArea(L))) < 1e-9);
  assert.equal(Math.abs(polyArea(L)), 64);
});

test('picking and transition order', () => {
  const parcels = [
    { poly: [[0, 0], [10, 0], [10, 10], [0, 10]] },
    { poly: [[100, 0], [110, 0], [110, 10], [100, 10]] },
  ];
  assert.ok(pointInPoly(5, 5, parcels[0].poly));
  assert.ok(!pointInPoly(15, 5, parcels[0].poly));
  const g = buildGrid(parcels, 50);
  assert.equal(pickParcel(g, parcels, 105, 5), 1);
  assert.equal(pickParcel(g, parcels, 50, 5), -1);
  const order = transitionOrder(parcels, [{ width_m: 4, points: [[-10, -100], [-10, 100]] }]);
  assert.equal(order[1], 1);
  assert.ok(order[0] < 0.2);
});

test('fmtDate', () => assert.equal(fmtDate('2026-10-27'), '27 Oct 2026'));
