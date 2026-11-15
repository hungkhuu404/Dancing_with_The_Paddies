import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {atlasPoint,bypassAtlas,publishedSite,entrancePose} from '../src/ui/entryRules.js';

test('regional projection keeps east right and north away from the viewer',()=>{
  assert.deepEqual(atlasPoint(103.5,14),[0,0]);
  assert.ok(atlasPoint(105,14)[0]>0);
  assert.ok(atlasPoint(103.5,16)[1]<0);
});
test('direct data links bypass the chooser, ordinary and reduced-motion visits do not',()=>{
  for(const q of ['?view=map&cell=E520250N1122000','?at=0,-1000','?nointro','?village=house'])assert.equal(bypassAtlas(q),true);
  assert.equal(bypassAtlas(''),false);assert.equal(bypassAtlas('?reduced'),false);
});
test('a registry entry alone or a synthetic export cannot be offered as published observations',()=>{
  assert.equal(publishedSite({id:'bang_rakam'},null),false);
  assert.equal(publishedSite({id:'x'},{fixture:true,acquisitions:[{}]}),false);
  assert.equal(publishedSite({id:'x'},{acquisitions:[]}),false);
  assert.equal(publishedSite({id:'x'},{acquisitions:[{}]}),true);
});
const start={target:{x:-700,z:900},r:4200,polar:10*Math.PI/180,az:1.05};
const end={target:{x:0,z:0},r:135,polar:73*Math.PI/180,az:0};
test('entrance camera preserves endpoints, bounds bank/FOV and approaches monotonically',()=>{
  const a={},b={};assert.equal(entrancePose(0,start,end,a),a);entrancePose(1,start,end,b);
  assert.ok(Math.abs(a.r-start.r)<1e-8);assert.equal(a.x,-700);assert.equal(a.z,900);
  assert.ok(Math.abs(b.r-end.r)<1e-8);assert.equal(b.x,0);assert.equal(b.z,0);assert.equal(b.fov,40);
  let previous=Infinity;
  for(let i=0;i<=1000;i++){entrancePose(i/1000,start,end,a);assert.ok(a.r<=previous+1e-8);previous=a.r;for(const v of Object.values(a))assert.ok(Number.isFinite(v));assert.ok(Math.abs(a.roll)<=.045);assert.ok(a.fov>=40&&a.fov<=59);}
});
test('atlas geography is bounded and small, and is not a fabricated flood layer',async()=>{
  const data=JSON.parse(await readFile(new URL('../public/atlas/region.json',import.meta.url)));
  const manifest=JSON.parse(await readFile(new URL('../public/atlas/manifest.json',import.meta.url)));
  assert.ok(data.land.length>0&&data.rivers.length>0);assert.equal(manifest.license,'Public domain');
  for(const p of [...data.land.flat(2),...data.rivers.flat()]){assert.ok(p[0]>=91&&p[0]<=123);assert.ok(p[1]>=2&&p[1]<=27);}
  assert.ok(JSON.stringify(data).length<750000);
});
