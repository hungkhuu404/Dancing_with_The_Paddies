import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellMetrics, flagGt30, stateAsOf, cellSentences, onsetBins, durationColor, STEPS } from '../src/map/contract.js';

const acq = ['2026-08-11', '2026-08-16', '2026-08-23', '2026-08-28', '2026-09-04', '2026-09-09'].map((d, i) => ({
  i, date_local: d, track: ['148D', '047D'][i % 2],
}));

test('flooded: onset bounds, ongoing days to last image', () => {
  const m = cellMetrics('NNNWWW', acq);
  assert.equal(m.status, 'flooded');
  assert.equal(m.onset_after_local, '2026-08-23');
  assert.equal(m.onset_by_local, '2026-08-28');
  assert.equal(m.flood_days_min, 12); // 08-28 -> 09-09
  assert.equal(m.flood_days_max, 17); // 08-23 -> 09-09
  assert.equal(m.end_after_local, null);
  assert.equal(m.n_tracks, 2);
  assert.equal(flagGt30(m, true), 'possible');
});

test('water_gone: end bounds and flag no', () => {
  const m = cellMetrics('NWWNNN', acq);
  assert.equal(m.status, 'water_gone');
  assert.equal(m.end_after_local, '2026-08-23');
  assert.equal(m.end_by_local, '2026-08-28');
  assert.equal(m.flood_days_min, 7); // 08-16 -> 08-23
  assert.equal(m.flood_days_max, 17); // 08-11 -> 08-28
  assert.equal(flagGt30(m, true), 'no');
  assert.equal(flagGt30(m, false), 'na');
});

test('status order and missing passes', () => {
  assert.equal(cellMetrics('WW-W--', acq).status, 'no_data'); // 3 valid, all W -> still no_data
  assert.equal(cellMetrics('NNNNNN', acq).status, 'never_water');
  assert.equal(cellMetrics('WW-WWW', acq).status, 'always_water');
  const m = cellMetrics('WWNN-W', acq); // main episode = latest-starting
  assert.equal(m.status, 'flooded');
  assert.equal(m.n_episodes, 2);
  assert.equal(m.onset_by_local, '2026-09-09');
  assert.equal(m.status_confirmed, false);
  assert.equal(cellMetrics('WWWNNN', acq).onset_after_local, null);
});

test('state as of a pass skips missing images', () => {
  assert.equal(stateAsOf('NW--N', 3), 'W');
  assert.equal(stateAsOf('--NW', 1), '-');
});

test('sentences never print null', () => {
  const s = cellSentences({ status: 'flooded', ...cellMetrics('WWWWNW', acq) }).join(' ');
  assert.ok(!/null|NaN|undefined/.test(s), s);
  const g = cellSentences({ ...cellMetrics('WWNNNN', acq) }).join(' ');
  assert.match(g, /Water was already there in the first image\./);
  assert.match(g, /at least 12 days|Under water/);
});

test('scales: 5 onset bins, earliest brightest; 30 days is an edge', () => {
  const cells = ['08-16', '08-23', '08-28', '09-04', '09-09', '09-16'].map((d) => ({ onset_by_local: '2026-' + d }));
  const b = onsetBins(cells);
  assert.equal(b.length, 5);
  assert.equal(b[0].color, STEPS[4]);
  assert.notEqual(durationColor(29.9), durationColor(30));
});

test('onset note only when there is a real onset window', async () => {
  const { ONSET_NOTE } = await import('../src/map/contract.js');
  assert.ok(cellSentences({ status: 'flooded', ...cellMetrics('NNNWWW', acq) }).includes(ONSET_NOTE));
  assert.ok(!cellSentences({ ...cellMetrics('WWWNNN', acq) }).includes(ONSET_NOTE)); // water already there in the first image
  assert.ok(!cellSentences({ ...cellMetrics('NNNNNN', acq) }).includes(ONSET_NOTE));
});
