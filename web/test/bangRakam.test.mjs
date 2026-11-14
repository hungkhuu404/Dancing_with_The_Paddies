import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeSiteFixture} from '../scripts/make-site-fixture.mjs';
import {fixtureHistory,distanceToRiver} from '../scripts/fixtureRules.mjs';
import {siteProfile} from '../src/data/siteRules.js';
import {entryKind,publishedSite} from '../src/ui/entryRules.js';
import {joinedRings,osmFeatures} from '../tools/osm-geometry.mjs';
import {catalogueAcquisitions} from '../tools/catalogue.mjs';
const profile=siteProfile('bang_rakam');
test('OSM relation stitching closes only connected rings, preserves holes and source tags',()=>{
 assert.deepEqual(joinedRings([[[0,0],[2,0]],[[2,2],[2,0]],[[2,2],[0,2],[0,0]]]),[[[0,0],[2,0],[2,2],[0,2],[0,0]]]);assert.deepEqual(joinedRings([[[0,0],[2,0]]]),[]);
 const g=r=>r.map(([lon,lat])=>({lon,lat})),outer=[[0,0],[4,0],[4,4],[0,4],[0,0]],inner=[[1,1],[2,1],[2,2],[1,2],[1,1]];
 const result=osmFeatures({elements:[{type:'relation',id:7,tags:{type:'multipolygon',natural:'water','name:en':'Mapped water'},members:[{role:'outer',geometry:g(outer)},{role:'inner',geometry:g(inner)}]}]});
 assert.equal(result.water.features[0].geometry.coordinates.length,2);assert.equal(result.water.features[0].properties.osm_id,'relation/7');
});
test('catalogue selection rejects SHSH, excludes other frames and deduplicates processing revisions',()=>{
 const f=(mode,rev,frame='080')=>({properties:{sceneName:`NISAR_L2_UR_GCOV_034_105_D_${frame}_2005_${mode}_A_20261031T115458_20261031T115532_P05023_F_F_J_00${rev}`,startTime:'2026-10-31T11:54:58Z'}});
 const out=catalogueAcquisitions([f('SHSH',1),f('DHDH',1),f('DHDH',2),f('DHDH',1,'081')],profile.observation_selection);assert.equal(out.acquisitions.length,1);assert.match(out.acquisitions[0].scene_name,/002$/);assert.equal(out.skipped[0].reason,'other');
});
test('fixture histories are deterministic and use distance to the mapped river without pretending to model depth',()=>{
 const acq=['08-15','09-20','10-25'].map(d=>({acq_utc:'2026-'+d+'T00:00:00Z'})),line=[[[0,0],[0,1000]]];assert.equal(distanceToRiver(100,500,line),100);assert.equal(fixtureHistory(100,500,acq,line),fixtureHistory(100,500,acq,line));assert.match(fixtureHistory(100,500,acq,line),/^[WN-]{3}$/);
});
test('fixture export covers all 2304 blocks, uses true catalogue local dates and reconciles every summary area',()=>{
 const out=mkdtempSync(join(tmpdir(),'flood-br-'));try{
  writeFileSync(join(out,'sites.json'),JSON.stringify({sites:[{id:'tan_hoi',default:true}]}));makeSiteFixture(out,profile);
  const load=n=>JSON.parse(readFileSync(join(out,'bang_rakam',n),'utf8')),meta=load('meta.json'),cells=load('cells.geojson'),series=load('series.json'),summary=load('summary.json');
  assert.equal(meta.fixture,true);assert.equal(meta.grid.epsg,32647);assert.equal(cells.features.length,2304);assert.equal(meta.acquisitions.length,18);assert.equal(meta.acquisitions.at(-1).date_local,'2026-11-01');assert.equal(load('aoi.geojson').features[0].properties.osm_relation,null);
  const ids=new Set(cells.features.map(f=>f.properties.cell_id));assert.equal(ids.size,2304);assert.equal(Object.keys(series.cells).length,2304);assert.ok(ids.has('E613250N1846250'));
  for(const f of cells.features){const s=series.cells[f.properties.cell_id];assert.equal(s.s.length,meta.acquisitions.length);assert.ok(s.hh.every(v=>v===null||Number.isInteger(v)));}
  for(const p of summary.passes){const states=Object.values(series.cells).map(r=>r.s[p.i]);assert.equal(p.water_ha,states.filter(s=>s==='W').length*6.25);assert.equal(p.valid_ha,states.filter(s=>s!=='-').length*6.25);}
  assert.equal(Object.values(summary.totals.status_ha).reduce((a,b)=>a+b,0),14400);
  const before=readFileSync(join(out,'bang_rakam','meta.json'));assert.throws(()=>makeSiteFixture(out,profile));assert.deepEqual(readFileSync(join(out,'bang_rakam','meta.json')),before);
  assert.equal(JSON.parse(readFileSync(join(out,'sites.json'),'utf8')).sites[0].default,true);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('fixture entry is explicit and never becomes published observations',()=>{
 const site={id:profile.id},meta={site:profile.id,fixture:true,acquisitions:[{}]};assert.equal(publishedSite(site,meta),false);assert.equal(entryKind(profile,site,meta),'fixture');assert.equal(entryKind(siteProfile(),site,meta),'pending');assert.equal(entryKind(profile,site,{...meta,site:'tan_hoi'}),'pending');
});

test('school-ground filtering removes nearby adult actors while retaining external placements and preserving source objects',async()=>{
 const {reviewSiteProps}=await import('../tools/site-props.mjs');const props={people:[{x:0,z:0},{x:500,z:500}],graves:[{x:0,z:0}]},result=reviewSiteProps(props,[100,100],[{ring:[[90,90],[110,90],[110,110],[90,110],[90,90]]}],profile.architecture);assert.deepEqual(result.people,[{x:500,z:500}]);assert.deepEqual(result.graves,[]);assert.equal(props.people.length,2);assert.equal(props.graves.length,1);
});

test('source building centroids replace duplicate illustrative houses, respect tile ownership and avoid school grounds',async()=>{
 const {polygonCentre,sourceHouseLayout}=await import('../tools/site-props.mjs');assert.deepEqual(polygonCentre([[0,0],[10,0],[10,10],[0,10],[0,0]]),[5,5]);
 const l={houses:[{x:1,z:1},{x:50,z:50}],trees:[]},tile={x:0,z:0},sources=[{x:2,z:2,rot:0,osm_id:'way/1'},{x:1000,z:0,rot:0,osm_id:'way/2'}],schools=[{ring:[[40,40],[60,40],[60,60],[40,60],[40,40]]}];
 const result=sourceHouseLayout(l,tile,sources,schools);assert.equal(result.houses.length,1);assert.equal(result.houses[0].osm_id,'way/1');assert.equal(l.houses.length,2);assert.deepEqual(sourceHouseLayout(result,tile,sources,schools),result);
});

// A manual development command must never replace the real published site.
test('fixture CLI rejects published-site output before creating files',async()=>{
 const {execFileSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const out=mkdtempSync(join(tmpdir(),'published-no-fixture-'));
 try{for(const args of [[],['--site','tan_hoi']]){assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/make-contract-fixture.mjs',import.meta.url)),out,...args],{stdio:'pipe'}),/Published sites do not allow synthetic water exports/);}
 const {readdirSync}=await import('node:fs');assert.deepEqual(readdirSync(out),[]);
 }finally{rmSync(out,{recursive:true,force:true});}
});
