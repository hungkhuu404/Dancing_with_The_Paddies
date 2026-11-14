import test from 'node:test';
import assert from 'node:assert/strict';
import {renderChart} from '../src/map/panel.js';

test('chart distinguishes diagnostic averages from pixel classification',()=>{
  const chart=renderChart({hh:[-130],hv:[-200],s:'W',s_raw:'W'},[{date_local:'2026-08-11',track:'148D',hh_db_max:-14,hv_db_max:-20}],0,{});
  assert.match(chart,/average block backscatter/);
  assert.match(chart,/fraction of pixels meeting both thresholds/);
  assert.match(chart,/not these averages/);
});
