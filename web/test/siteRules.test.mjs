import {localHour} from '../src/world/paths.js';
﻿import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {siteProfile,requestedSite,siteBounds,framePolygon,checkSiteIndex,checkSiteMeta,SiteMismatchError} from '../src/data/siteRules.js';
import {utm,inverseUtm} from '../src/data/projection.js';
import {siteOptions} from '../tools/site-options.mjs';
import {fieldAppearance,bankPlantings,roadsidePlantings} from '../src/scene/ecologyRules.js';
import {roadClass,toScene} from '../src/world/infrastructureRules.js';
import {tileInfrastructure} from '../src/world/infrastructurePlacement.js';
import {sceneDate,celestial} from '../src/world/signatureRules.js';
const tan=siteProfile(),bang=siteProfile('bang_rakam');
test('site selection is explicit, defaults to Tan Hoi and rejects unknown/ambiguous CLI sites',()=>{
 assert.equal(requestedSite(''),tan.id);assert.equal(requestedSite('?site=bang_rakam'),bang.id);
 assert.throws(()=>requestedSite('?site=other'));assert.throws(()=>requestedSite('?site=constructor'));assert.throws(()=>siteOptions(['--site']));assert.throws(()=>siteOptions(['--site','--buildings-only']));assert.throws(()=>siteOptions(['--site','tan_hoi','--site','bang_rakam']));
 assert.deepEqual(siteOptions(['source.json','--site','bang_rakam','out.json']).args,['source.json','out.json']);
 assert.match(siteOptions(['--site','bang_rakam']).sceneURL.pathname,/scene\/bang_rakam\/$/);
});
test('both northern UTM zones round-trip every frame corner within 0.5 m, with independent central-meridian control',()=>{
 // WGS84 meridional arc from Simpson integration of curvature, independently of the projection series.
 const a=6378137,e2=0.0066943799901413165;
 for(const p of [tan,bang]){
  const lat=p.center[1],phi=lat*Math.PI/180,steps=10000,h=phi/steps;
  const fn=t=>a*(1-e2)/(1-e2*Math.sin(t)**2)**1.5;
  let sum=fn(0)+fn(phi);for(let i=1;i<steps;i++)sum+=fn(i*h)*(i%2?4:2);
  const center=utm(p.zone*6-183,lat,p.zone);assert.ok(Math.abs(center[0]-500000)<1e-6);assert.ok(Math.abs(center[1]-sum*h/3*.9996)<.5);
  for(const [e,n] of framePolygon(p)){const [lon,lat]=inverseUtm(e,n,p.zone),again=utm(lon,lat,p.zone);assert.ok(Math.hypot(again[0]-e,again[1]-n)<.5);}
  const b=siteBounds(p);for(const [e,n] of framePolygon(p)){const [lon,lat]=inverseUtm(e,n,p.zone);assert.ok(lon>=b[0]&&lon<=b[2]&&lat>=b[1]&&lat<=b[3]);}
 }
 assert.throws(()=>utm(100,16,0));assert.throws(()=>utm(100,-1,47));assert.throws(()=>inverseUtm(NaN,0,47));
 const [lon,lat]=inverseUtm(bang.origin.utm_e,bang.origin.utm_n,47);assert.ok(toScene(lon,lat,bang).every(v=>Math.abs(v)<.01));
});
test('a square frame is a closed 144 km2 study window, fully covered by its configured tile grid',()=>{
 const f=bang.frame,g=bang.tile_grid;assert.deepEqual(f,{e0:613250,e1:625250,n0:1846250,n1:1858250});assert.deepEqual(bang.start_utm,[619250,1852250]);assert.deepEqual(framePolygon(bang)[0],framePolygon(bang).at(-1));assert.equal((f.e1-f.e0)*(f.n1-f.n0)/1e6,144);
 assert.ok(g.first_e-g.size/2<=f.e0&&g.first_n-g.size/2<=f.n0);assert.ok(g.first_e+(g.cols-.5)*g.size>=f.e1&&g.first_n+(g.rows-.5)*g.size>=f.n1);
});
test('scene/observation identity and frame mismatches cannot silently load another site',()=>{
 const real=JSON.parse(readFileSync(new URL('../public/scene/commune/index.json',import.meta.url)));assert.equal(checkSiteIndex(tan,real),real);assert.throws(()=>checkSiteIndex(bang,real),SiteMismatchError);
 assert.throws(()=>checkSiteIndex(tan,{...real,frame:bang.frame}),SiteMismatchError);assert.throws(()=>checkSiteIndex(bang,{tiles:[]}));
 const meta=JSON.parse(readFileSync(new URL('../../data/tan_hoi/meta.json',import.meta.url)));assert.equal(checkSiteMeta(tan,meta),meta);assert.throws(()=>checkSiteMeta(bang,meta),SiteMismatchError);
});
test('ecology recipes retain Tan Hoi standing rice and make dry Bang Rakam stubble without future inference',()=>{
 assert.equal(fieldAppearance('NNW',0,[],tan.ecology).kind,'standing');assert.equal(fieldAppearance('NNW',0,[],bang.ecology).kind,'stubble');assert.equal(fieldAppearance('NNW',0,[],bang.ecology).standing,0);
 for(const p of [tan,bang]){assert.equal(fieldAppearance('WN',1,[],p.ecology).kind,'water_gone');assert.equal(fieldAppearance('-',0,[],p.ecology).kind,'missing');}
 const canal=[{width_m:12,points:[[0,0],[0,200]]}];assert.ok(bankPlantings(canal,26,20,tan.ecology).some(p=>p.kind==='acacia'));assert.ok(bankPlantings(canal,26,20,bang.ecology).every(p=>bang.ecology.bank_margin.includes(p.kind)));
 assert.deepEqual(roadsidePlantings([{width_m:7,points:[[0,0],[0,300]]}],20,bang.ecology),[]);
 assert.equal(tan.fields.strip_min,25);assert.equal(tan.fields.cross_max,450);assert.ok(bang.fields.strip_min>tan.fields.strip_max);
 assert.equal(roadClass({ref:'961'},bang.roads).arterial,false);
 const layout={houses:[],roads:[],parcels:[],canals:[{width_m:10,points:[[0,0],[100,0]]}]},props={pumps:[{x:0,z:0}]};
 assert.equal(tileInfrastructure(layout,props,null,0,0,false,bang).gates.length,0);
});
test('site astronomy uses the same instant with explicit local time zones',()=>{
 assert.equal(localHour('2026-09-12T22:46:00Z',bang.timezone),5+46/60);assert.equal(localHour('2026-09-12T22:46:00Z','UTC'),22+46/60);
 assert.equal(sceneDate('2026-09-12',.33,tan.timezone),'2026-09-12T05:00:00.000Z');assert.equal(sceneDate('2026-09-12',.33,bang.timezone),'2026-09-12T05:00:00.000Z');
 assert.notDeepEqual(celestial('2026-09-12T05:00Z',...tan.center.toReversed()),celestial('2026-09-12T05:00Z',...bang.center.toReversed()));
});
test('OSM builder projects English and source names in zone 47 and clips unknown boundaries to the frame',()=>{
 const dir=mkdtempSync(join(tmpdir(),'flood-site-'));try{
  const input=join(dir,'osm.json'),out=join(dir,'infrastructure.json');
  const ll=inverseUtm(bang.origin.utm_e,bang.origin.utm_n,bang.zone),outside=inverseUtm(bang.frame.e1+1000,bang.origin.utm_n,bang.zone);
  writeFileSync(input,JSON.stringify({elements:[{type:'node',id:1,lon:ll[0],lat:ll[1],tags:{amenity:'school','name:en':'Example school',name:'Source name'}},{type:'node',id:2,lon:outside[0],lat:outside[1],tags:{amenity:'school',name:'Outside'}}]}));
  const result=spawnSync(process.execPath,['web/tools/build-infrastructure.mjs',input,out,'--site','bang_rakam'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const built=JSON.parse(readFileSync(out,'utf8'));assert.equal(built.origin.epsg,32647);assert.equal(built.buildings.length,1);assert.equal(built.buildings[0].name,'Example school');assert.equal(built.buildings[0].source_name,'Source name');assert.equal(built.buildings[0].x,0);assert.equal(built.buildings[0].z,0);assert.ok(built.places.every(p=>p.osm_id&&p.name));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
