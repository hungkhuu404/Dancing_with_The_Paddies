import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {observationAt,observationAreas,readView,viewParams,sceneCellCentre,escapeHTML} from '../src/map/presentation.js';
import {stateAsOf,CELL_HA} from '../src/map/contract.js';

test('a missing image carries the earlier observation, never a future state',()=>{
  assert.deepEqual(observationAt('--W-N',3),{state:'W',index:2,carried:true,missing:true});
  assert.deepEqual(observationAt('--W-N',1),{state:'-',index:-1,carried:false,missing:true});
  assert.deepEqual(observationAt('--W-N',4),{state:'N',index:4,carried:false,missing:false});
});
test('area key separates no observation from no water and counts carried area',()=>{
  assert.deepEqual(observationAreas(['W-','NN','--','NW'],1,6.25),{W:12.5,N:6.25,'-':6.25,carried:6.25});
});
test('URL state round-trips scope and bounded dates without accepting invalid layers',()=>{
  const state={mode:'onset',scope:'image',pass:0,cell:'E520250N1122000'};
  assert.deepEqual(readView(viewParams(state,'tan_hoi'),20),state);
  assert.deepEqual(readView('?layer=unknown&pass=-2&scope=bad',20),{mode:'status',scope:'season',pass:19,cell:null});
  assert.equal(readView('?pass=1.5',20).pass,19);
  assert.equal(readView('',20).pass,19);
  assert.equal(readView('?pass=0',20).pass,0);
});
test('return to 3D uses the block centre and the south-positive scene axis',()=>{
  assert.deepEqual(sceneCellCentre('E520250N1122000',{utm_e:520375,utm_n:1121125}),{x:0,z:-1000});
  assert.equal(sceneCellCentre('not-a-block',{utm_e:0,utm_n:0}),null);
});
test('text supplied by the public export is escaped in panel and legend markup',()=>{
  assert.equal(escapeHTML('<Tân Hội & "fields">'), '&lt;Tân Hội &amp; &quot;fields&quot;&gt;');
});
test('every migrated public record retains CONTRACT-001 as-of state and area',async()=>{
  const data=JSON.parse(await readFile(new URL('../../data/tan_hoi/series.json',import.meta.url)));
  const records=Object.values(data.cells).map(c=>c.s);
  assert.ok(records.length>0);
  for(let pass=0;pass<records[0].length;pass++){
    for(const s of records)assert.equal(observationAt(s,pass).state,stateAsOf(s,pass));
    const a=observationAreas(records,pass,CELL_HA);
    assert.equal(a.W+a.N+a['-'],records.length*CELL_HA);
  }
});
