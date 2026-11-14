import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {waterCalendar,calendarColor,calendarMapQuery,methodRows} from '../src/science/calendarModel.js';
import {methodDescription} from '../src/science/pixelMethod.js';
const cells=names=>({features:names.map((name,i)=>({properties:{cell_id:String(i),nearest_hamlet:name}}))});
const acq=[{date_local:'2026-08-11',track:'148D'},{date_local:'2026-08-16',track:'047D'}];
test('calendar denominator uses W+N for this image only, never carries missing observations',()=>{
 const rows=waterCalendar(cells(['A','A','A','A']),{cells:{0:{s:'W-'},1:{s:'WN'},2:{s:'N-'},3:{s:'--'}}},acq),[a,b]=rows[0].values;
 assert.equal(a.ratio,2/3);assert.equal(a.coverage,.75);assert.equal(a.display,true);
 assert.equal(b.valid,1);assert.equal(b.wet,0);assert.equal(b.ratio,0);assert.equal(b.display,false);assert.equal(calendarColor(b),null);
});
test('exactly half coverage is shown, no-coverage groups stay unknown and all five bins are bounded',()=>{
 const rows=waterCalendar(cells(['A','A']),{cells:{0:{s:'WN'},1:{s:'--'}}},acq,{features:[{properties:{name:'Empty'}}]});
 assert.equal(rows.find(r=>r.name==='A').values[0].display,true);
 const empty=rows.find(r=>r.name==='Empty');assert.equal(empty.values[0].ratio,null);assert.equal(empty.values[0].display,false);
 assert.equal(new Set([0,.2,.4,.6,.8,1].map(ratio=>calendarColor({display:true,ratio}))).size,5);
});
test('groups sort by observed water with deterministic names, without inventing onset for dry groups',()=>{
 const rows=waterCalendar(cells(['Later','Earlier','Dry']),{cells:{0:{s:'NW'},1:{s:'WN'},2:{s:'NN'}}},acq);
 assert.deepEqual(rows.map(r=>r.name),['Earlier','Later','Dry']);assert.equal(rows[2].first,Infinity);
});
test('mismatched series and duplicate blocks fail instead of generating percentages',()=>{
 assert.throws(()=>waterCalendar(cells(['A']),{cells:{}},acq),/incomplete/);
 assert.throws(()=>waterCalendar(cells(['A']),{cells:{0:{s:'WX'}}},acq),/incomplete/);
 const c=cells(['A']);c.features.push(c.features[0]);assert.throws(()=>waterCalendar(c,{cells:{0:{s:'WN'}}},acq),/Duplicate/);
});
test('acquisition overrides, zero and explicit null survive method presentation',()=>{
 const rows=methodRows({method:{rule:'Q0',hh_db_max:-14,hv_db_max:-20},acquisitions:[{date_local:'d',track:'t'},{date_local:'e',track:'u',rule:'Q1',hh_db_max:-16.741,hv_db_max:0},{date_local:'f',hh_db_max:null}]});
 assert.equal(rows[0].hh,-14);assert.equal(rows[1].rule,'Q1');assert.equal(rows[1].hh,-16.741);assert.equal(rows[1].hv,0);assert.equal(rows[2].hh,null);
});
test('pixel method explains 75% classification and asymmetric 50% filter',()=>{
 const text=methodDescription({classification:'pixel_fraction_75_dual_50',water_fraction:.75,fill_min_fraction:.5,joint_valid_fraction:.7,selection_status:'post_hoc',single_flip_filter:true});
 assert.match(text,/75%/);assert.match(text,/50%/);assert.match(text,/70%/);assert.match(text,/N-W-N/);assert.match(text,/post-hoc/i);
 assert.throws(()=>methodDescription({classification:'unknown'}),/Unsupported/);
});
test('map query preserves hamlet names and selects the actual image scope',()=>{
 const q=new URLSearchParams(calendarMapQuery('tan_hoi',4,'Tân Hội & <x>'));assert.equal(q.get('hamlet'),'Tân Hội & <x>');assert.equal(q.get('scope'),'image');assert.equal(q.get('pass'),'4');
});
test('every public calendar count reconciles with the real series for all 24 groups and acquisitions',()=>{
 const get=f=>JSON.parse(readFileSync(new URL('../../data/tan_hoi/'+f,import.meta.url)));
 const meta=get('meta.json'),series=get('series.json'),c=get('cells.geojson'),rows=waterCalendar(c,series,meta.acquisitions,get('places.geojson'));
 assert.equal(rows.length,24);assert.equal(rows.reduce((n,r)=>n+r.total,0),meta.grid.n_cells);
 for(let i=0;i<meta.acquisitions.length;i++){
  const all=c.features.map(f=>series.cells[f.properties.cell_id].s[i]);assert.equal(rows.reduce((n,r)=>n+r.values[i].wet,0),all.filter(s=>s==='W').length);assert.equal(rows.reduce((n,r)=>n+r.values[i].valid,0),all.filter(s=>s==='W'||s==='N').length);
 }
 for(const r of rows)for(const v of r.values){assert.equal(v.display,v.valid>=r.total/2&&v.valid>0);if(v.display)assert.equal(v.ratio,v.wet/v.valid);}
});
