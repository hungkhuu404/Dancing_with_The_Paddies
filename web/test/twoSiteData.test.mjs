import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siteProfile} from '../src/data/siteRules.js';
import {utm} from '../src/data/projection.js';
import {assertSceneMeta} from '../src/data/contractPolicy.js';
import {radarReference,radarUv,releaseContext,siteLimitText} from '../src/data/releaseContext.js';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
for(const [id,count] of [['tan_hoi',22],['bang_rakam',11]])test(`${id} registered real export retains matching cells, series and local dates`,()=>{
 const profile=siteProfile(id),meta=read(`data/${id}/meta.json`),cells=read(`data/${id}/cells.geojson`),series=read(`data/${id}/series.json`),registry=read('data/sites.json');
 assert.equal(assertSceneMeta(profile,meta),meta);assert.ok(!meta.fixture);assert.equal(meta.acquisitions.length,count);
 assert.equal(cells.features.length,meta.grid.n_cells);assert.equal(Object.keys(series.cells).length,cells.features.length);
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:meta.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
 for(const a of meta.acquisitions){assert.equal(format.format(new Date(a.acq_utc)),a.date_local);assert.ok(readFileSync(new URL(`../../data/${id}/${a.backdrop}`,import.meta.url)).length>1000);}
 const site=registry.sites.find(v=>v.id===id);assert.ok(site);for(const f of cells.features){assert.equal(series.cells[f.properties.cell_id].s.length,count);const visit=v=>{if(typeof v[0]==='number'){assert.ok(v[0]>=site.bounds[0]&&v[0]<=site.bounds[2]&&v[1]>=site.bounds[1]&&v[1]<=site.bounds[3]);}else v.forEach(visit);};visit(f.geometry.coordinates);}
});
test('Bang Rakam backdrop corners project to the existing 12 km scene frame',()=>{
 const p=siteProfile('bang_rakam'),m=read('data/bang_rakam/meta.json'),west=Math.floor(p.frame.e0/20)*20,east=Math.ceil(p.frame.e1/20)*20,south=Math.floor(p.frame.n0/20)*20,north=Math.ceil(p.frame.n1/20)*20,expected=[[west,north],[east,north],[east,south],[west,south]];
 m.backdrop.corners.forEach((v,i)=>{const actual=utm(...v,p.zone);assert.ok(Math.hypot(actual[0]-expected[i][0],actual[1]-expected[i][1])<.5);});
 const uv=radarUv(p,m);assert.ok(Math.abs(uv[0]-10/12020)<.00001);assert.ok(Math.abs(uv[1]-10/12020)<.00001);assert.ok(Math.abs(uv[2]-12000/12020)<.00001);assert.ok(Math.abs(uv[3]-12000/12020)<.00001);
 const aoi=read('data/bang_rakam/aoi.geojson').features[0].properties;assert.equal(aoi.aoi_type,'study_bbox');assert.equal(aoi.osm_relation,undefined);assert.equal(aoi.area_ha,14400);
});
test('reference dates describe the displayed fixed image, not a synthetic or selected observation',()=>{
 const p=siteProfile('bang_rakam'),meta=read('data/bang_rakam/meta.json'),r=radarReference(p,{textures:{radar:null}},meta);
 assert.equal(r.date,'2026-10-31');assert.equal(r.path,'data/bang_rakam/'+meta.acquisitions.at(-1).backdrop);assert.equal(radarReference(p,{}, {...meta,fixture:true}),null);
 assert.deepEqual(radarReference(p,{textures:{radar:'fixed.webp'},radar_date:'2026-08-14'},meta),{path:p.scene.base+'fixed.webp',date:'2026-08-14'});
});
test('published site labels retain post-hoc limitations and do not apply to other exports',()=>{
 const tan=read('data/tan_hoi/meta.json'),bang=read('data/bang_rakam/meta.json');
 assert.match(releaseContext(tan).label,/Tân Hội radar data/);assert.match(releaseContext(tan).details,/post-hoc/i);assert.doesNotMatch(releaseContext(tan).details,/interim|not the final/i);
 assert.match(releaseContext(bang).details,/per-image thresholds/i);assert.match(releaseContext(bang).details,/not independent/i);assert.doesNotMatch(releaseContext(bang).details,/review.*pending/i);
 for(const meta of [tan,bang]){assert.equal(releaseContext({...meta,fixture:true}),null);const other=releaseContext({...meta,generated_utc:'2026-01-01T00:00:00Z'});assert.doesNotMatch(other.label,/Tân Hội radar data/i);assert.doesNotMatch(other.details,/per-image thresholds/i);}
});
test('Bang Rakam square study limits remain explicit',()=>{
 const meta=read('data/bang_rakam/meta.json');
 const text=siteLimitText(meta,read('data/bang_rakam/aoi.geojson').features[0].properties);assert.match(text,/12 × 12 km/);assert.match(text,/not an administrative boundary/);assert.match(text,/20 m/);assert.match(text,/112A/);assert.doesNotMatch(text,/kappa|precision|recall/i);
});
