import test from 'node:test';
import assert from 'node:assert/strict';
import {dateRange,blockSummary} from '../src/ui/blockSummary.js';

test('compact dates retain month/year changes and exact endpoints',()=>{
  assert.equal(dateRange('2026-09-12','2026-09-16'),'12 to 16 Sep 2026');
  assert.equal(dateRange('2026-09-28','2026-10-03'),'28 Sep to 3 Oct 2026');
  assert.equal(dateRange('2025-12-29','2026-01-03'),'29 Dec 2025 to 3 Jan 2026');
  assert.equal(dateRange('2026-09-12','2026-09-12'),'12 Sep 2026');
});
const receded={status:'water_gone',onset_after_local:'2026-09-12',onset_by_local:'2026-09-16',flood_days_min:36.1,flood_days_max:45.8,ongoing:false,end_after_local:'2026-10-22',end_by_local:'2026-10-27',last_obs_local:'2026-10-27',status_confirmed:false,n_obs:18};
test('three answers preserve duration bounds, receding interval and single-image warning',()=>{
  const s=blockSummary(receded);assert.equal(s.rows.length,3);assert.equal(s.rows[0].value,'12 to 16 Sep 2026');assert.equal(s.rows[1].value,'36 to 46 days');assert.equal(s.rows[2].label,'Water recession');assert.equal(s.rows[2].value,'22 to 27 Oct 2026');assert.equal(s.unconfirmed,true);
});
test('ongoing water and an unbounded start are never presented as a known arrival or recession',()=>{
  const s=blockSummary({...receded,status:'flooded',ongoing:true,onset_after_local:null,flood_days_max:null,status_confirmed:true});
  assert.equal(s.rows[0].value,'Present in first image');assert.equal(s.rows[1].value,'At least 36 days');assert.equal(s.rows[2].value,'27 Oct 2026');assert.equal(s.rows[2].label,'Last observed');assert.equal(s.unconfirmed,false);
});
test('never/always/no-data states do not invent onset or duration values',()=>{
  for(const status of ['never_water','always_water','no_data']){const s=blockSummary({status,n_obs:status==='no_data'?2:20,last_obs_local:null});assert.equal(s.rows.length,1);assert.equal(s.rows[0].label,'Coverage');assert.ok(!JSON.stringify(s).includes('null'));}
});
