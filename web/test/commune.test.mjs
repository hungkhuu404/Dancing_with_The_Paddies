import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneToUtm, utmToScene, cellIdAt, frameRect, tileDist, tileAt, selectTiles, shiftXZ, cellGrid, packCells, cellFractions } from '../src/data/commune.js';

const O = { utm_e: 520375, utm_n: 1121125 };
const FRAME = { e0: 511500, e1: 529250, n0: 1113000, n1: 1129250 };

test('scene <-> UTM and tile-local -> global', () => {
  assert.deepEqual(sceneToUtm(O, 0, 0), [520375, 1121125]);
  assert.deepEqual(sceneToUtm(O, 100, 200), [520475, 1120925]); // +z is south
  assert.deepEqual(utmToScene(O, 520200, 1122600), [-175, -1475]); // the old 2 km window centre
  const [x, z] = utmToScene(O, ...sceneToUtm(O, -1234.5, 987.25));
  assert.equal(x, -1234.5); assert.equal(z, 987.25);
  // a point 10 m east of a tile centre at UTM (522375, 1119125)
  const tile = { utm_e: 522375, utm_n: 1119125 }, [tx, tz] = utmToScene(O, tile.utm_e, tile.utm_n);
  assert.deepEqual([tx, tz], [2000, 2000]);
  assert.deepEqual(sceneToUtm(O, tx + 10, tz), [522385, 1119125]);
  assert.deepEqual(frameRect(O, FRAME), { x0: -8875, x1: 8875, z0: -8125, z1: 8125 });
});

test('cell id: SW corner of the 250 m block', () => {
  assert.equal(cellIdAt(511750, 1117500), 'E511750N1117500');
  assert.equal(cellIdAt(511999.9, 1117749.9), 'E511750N1117500');
  assert.equal(cellIdAt(512000, 1117750), 'E512000N1117750');
  const [e, n] = sceneToUtm(O, -175, -1475);
  assert.equal(cellIdAt(e, n), 'E520000N1122500');
});

test('tile selection: radius, cap, nearest first, hysteresis', () => {
  const tiles = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) tiles.push({ id: `t_${i}_${j}`, x: i * 2000, z: j * 2000 });
  assert.equal(tileDist(tiles[24], 1000, 0, 0), 0);
  assert.equal(tileAt(tiles, 1000, 999, -999).id, 't_0_0');
  assert.equal(tileAt(tiles, 1000, 1e5, 0), null);
  const a = selectTiles(tiles, 1000, 0, 0, { radius: 2400, max: 9 });
  assert.equal(a.length, 9); assert.equal(a[0], 't_0_0');
  assert.ok(a.includes('t_1_1') && a.includes('t_-1_-1') && !a.includes('t_2_0'));
  const low = selectTiles(tiles, 1000, 900, 900, { radius: 1500, max: 4 });
  assert.deepEqual(new Set(low), new Set(['t_0_0', 't_1_0', 't_0_1', 't_1_1']));
  // moving 3.5 km east: t_-1_* are 2.5 km away (> radius) but within radius + hysteresis -> kept while there is room
  const keep = new Set(a);
  const b = selectTiles(tiles, 1000, 3500, 0, { radius: 2400, max: 20, keep });
  assert.ok(b.includes('t_0_0') && !b.includes('t_-1_0'));
  const c = selectTiles(tiles, 1000, 3500, 0, { radius: 2400, max: 20, keep: new Set(['t_0_0']) });
  const d = selectTiles(tiles, 1000, 3500, 0, { radius: 2400, max: 20 });
  assert.ok(c.includes('t_0_0') && !d.includes('t_0_0'), 'hysteresis keeps a tile just outside the radius');
  // with the cap, a loaded tile beats an equally far new one
  const e = selectTiles(tiles, 1000, 1000, 0, { radius: 2400, max: 1, keep: new Set(['t_1_0']) });
  assert.deepEqual(e, ['t_1_0']);
});

test('shiftXZ moves every coordinate of layout/props data into the global frame', () => {
  const layout = {
    origin: { utm_e: 1, utm_n: 2 }, canals: [{ width_m: 8, points: [[0, 0], [10, 0]] }], parcels: [{ poly: [[1, 1], [2, 1], [2, 2]], s: 'W' }],
    houses: [{ x: 5, z: 6, rot: 1 }], boats: [{ path: [[0, 0], [1, 1]] }], egret_zones: [[3, 4, 60]],
  };
  const props = { bridges: [{ x: 1, z: 2, rot: 0.5, len: 18 }], duck_flocks: [{ x: 0, z: 0, r: 14, herder: [7, 8] }], notes: { nearest_real_religious: [{ x: 9, z: 9, dist_m: 2000 }] } };
  shiftXZ(layout, 100, -50); shiftXZ(props, 100, -50);
  assert.deepEqual(layout.canals[0].points, [[100, -50], [110, -50]]);
  assert.deepEqual(layout.parcels[0].poly[2], [102, -48]);
  assert.deepEqual([layout.houses[0].x, layout.houses[0].z, layout.houses[0].rot], [105, -44, 1]);
  assert.deepEqual(layout.boats[0].path[1], [101, -49]);
  assert.deepEqual(layout.egret_zones[0], [103, -46, 60]);
  assert.deepEqual(layout.origin, { utm_e: 1, utm_n: 2 });
  assert.deepEqual([props.bridges[0].x, props.bridges[0].len], [101, 18]);
  assert.deepEqual(props.duck_flocks[0].herder, [107, -42]);
  assert.equal(props.notes.nearest_real_religious[0].x, 109);
});

test('far-field cell texture packing', () => {
  const series = { cells: { E511500N1113000: { s: 'NWW' }, E511750N1113000: { s: 'W-N' }, E529000N1129000: { s: '---' }, E600000N1113000: { s: 'WWW' }, bad: { s: 'W' } } };
  const g = cellGrid(series, FRAME);
  assert.equal(g.cols, 71); assert.equal(g.rows, 65);
  assert.equal(g.cells.length, 3); // outside the frame and malformed ids are dropped
  const px = (o, c, r) => Array.from(o.slice((r * g.cols + c) * 4, (r * g.cols + c) * 4 + 4));
  let o = packCells(g, 0, 1);
  assert.deepEqual(px(o, 0, 0), [0, 255, 0, 255]); // dry -> water
  assert.deepEqual(px(o, 1, 0), [255, 255, 255, 255]); // '-' keeps the last state (water), flagged no data
  assert.deepEqual(px(o, 70, 64), [0, 0, 255, 255]); // never known: dry, no data
  assert.deepEqual(px(o, 2, 0), [0, 0, 0, 0]); // no cell
  o = packCells(g, 2, 2, o);
  assert.deepEqual(px(o, 1, 0), [0, 0, 0, 255]);
  assert.deepEqual(cellFractions(series, 3).map((v) => +v.toFixed(2)), [0.6, 0.4, 0.4]);
});
