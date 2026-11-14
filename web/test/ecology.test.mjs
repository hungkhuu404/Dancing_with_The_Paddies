import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldAppearance,bankPlantings,gardenPlantings,roadsidePlantings} from '../src/scene/ecologyRules.js';
import {cellForParcel,paintPolygon} from '../src/scene/parcelAtlas.js';
import {loadingFacts} from '../src/ui/loadingFacts.js';
test('appearance uses only past observations, with missing explicitly unknown',()=>{
  assert.equal(fieldAppearance('NNWWNN',1).kind,'standing');
  assert.equal(fieldAppearance('NNWWNN',4).kind,'water_gone');
  assert.deepEqual(fieldAppearance('W-W',1),{kind:'missing',standing:0,drained:0,longWet:0});
  const acq=[{acq_utc:'2026-08-01T00:00:00Z'},{acq_utc:'2026-08-31T00:00:00Z'},{acq_utc:'2026-09-01T00:00:00Z'}];
  assert.equal(fieldAppearance('WWW',1,acq).longWet,0);
  assert.equal(fieldAppearance('WWW',2,acq).longWet,1);
  assert.equal(fieldAppearance('WNW',2,acq).longWet,0);
  assert.equal(fieldAppearance('WWW',2).longWet,0);
});
test('parcel straddling a cell edge takes its centroid cell for every pixel',()=>{
  const poly=[[220,0],[300,0],[300,100],[220,100]],o={utm_e:0,utm_n:500},frame={e0:0,n0:0};
  assert.deepEqual(cellForParcel(poly,{x:0,z:0},o,frame),[1,1]);
  const data=new Uint8Array(8*8*4);
  paintPolygon(data,8,8,[[1,1],[7,1],[3,7]],[2,2,255,255]);
  assert.equal(data[(2*8+2)*4+2],255);
  assert.equal(data[(6*8+6)*4+2],0);
  assert.equal(data[(0*8+0)*4+3],0);
  for(let i=0;i<data.length;i+=4)if(data[i+3])assert.deepEqual([...data.slice(i,i+4)],[2,2,255,255]);
});
test('plantings follow banks, remain bounded and repeat deterministically',()=>{
  const canal=[{width_m:8,points:[[0,0],[200,0]]}];
  const a=bankPlantings(canal,26,7);assert.equal(a.length,7);assert.deepEqual(a,bankPlantings(canal,26,7));
  assert.ok(a.every(p=>Math.abs(p.z)===7.6&&p.x>=0&&p.x<=200));
  assert.deepEqual(bankPlantings(canal,26,0),[]);
  assert.deepEqual(gardenPlantings([{x:0,z:0}],81,0),[]);
  assert.equal(gardenPlantings([{x:0,z:0}],81,2).length,2);
  assert.deepEqual(gardenPlantings([]),[]);
});
test('loading numbers report block coverage and truthfully label fixtures',()=>{
  assert.match(loadingFacts({props:new Map([['a',{}],['b',{}]]),step:250,acq:[{}],meta:{fixture:true}}),/2 blocks cover 0.1 km². 1 observation. Water states are simulated, not results/);
  assert.match(loadingFacts(null),/unavailable/);
});
test('roadside windbreaks skip unsuitable roads and respect roadside offsets and caps',()=>{
  const roads=[{width_m:3,points:[[0,0],[200,0]]},{width_m:6,points:[[0,0],[40,0]]}];
  assert.deepEqual(roadsidePlantings(roads),[]);
  roads.push({width_m:6,points:[[0,0],[250,0]]});
  const out=roadsidePlantings(roads,2);
  assert.equal(out.length,2);
  assert.deepEqual(out,roadsidePlantings(roads,2));
  assert.ok(out.every(p=>Number.isFinite(p.x)&&p.z===6&&p.x>0&&p.x<250));
  assert.deepEqual(out.map(p=>p.kind),['dau','tram_bau']);
  assert.deepEqual(roadsidePlantings(roads,0),[]);
});
