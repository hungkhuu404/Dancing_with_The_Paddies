import {tourRecordPriority} from '../src/ui/tourRules.js';
﻿import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {historyWindow,historyCoverage} from '../tools/history-rules.mjs';
import {hourlyWeather,tourPose} from '../src/world/signatureRules.js';
import {scriptFor,tourCaption,TOUR_SCRIPT} from '../src/world/tourScript.js';
import {siteProfile} from '../src/data/siteRules.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
test('weather request bounds use UTC acquisitions and include the interpolation hour',()=>{
 assert.deepEqual(historyWindow([{acq_utc:'2026-08-13T22:46:00Z',date_local:'2026-08-14'},{acq_utc:'2026-11-03T23:46:00Z'}]),{start_date:'2026-08-13',end_date:'2026-11-04'});
 assert.throws(()=>historyWindow([]));assert.throws(()=>historyWindow([{acq_utc:'bad'}]));
});
test('hourly archive validation preserves missing values and rejects invalid axes/ranges',()=>{
 const h={time:['2026-08-13T22:00','2026-08-13T23:00'],cloud_cover:[0,100],rain:[0,1],wind_speed_10m:[0,2],wind_direction_10m:[350,10]},acq=[{i:0,acq_utc:'2026-08-13T22:30:00Z'}];
 assert.equal(historyCoverage(h,acq).complete,true);assert.equal(hourlyWeather({hourly:h},acq[0].acq_utc).wind_direction_10m,0);
 assert.equal(historyCoverage({...h,rain:[0,null]},acq).complete,false);
 assert.throws(()=>historyCoverage({...h,time:[h.time[0],h.time[0]]},acq));assert.throws(()=>historyCoverage({...h,cloud_cover:[0,101]},acq));assert.throws(()=>historyCoverage({...h,rain:[0]},acq));
});
for(const id of ['tan_hoi','bang_rakam'])test(id+' has real ERA5 coverage for every published acquisition',()=>{
 const p=siteProfile(id),m=read(`../../data/${id}/meta.json`),h=read('../public/'+p.scene.weather),coverage=historyCoverage(h.hourly,m.acquisitions);
 assert.equal(coverage.complete,true);assert.equal(coverage.total,m.acquisitions.length);assert.equal(h.error,null);assert.equal(h.provenance.site,id);assert.equal(h.provenance.license,'CC BY 4.0');assert.equal(h.provenance.units.wind_speed_10m,'m/s');assert.ok(h.provenance.url.includes('models=era5'));assert.equal(h.provenance.grid.resolution_degrees,.25);
 for(const a of m.acquisitions)assert.ok(hourlyWeather(h,a.acq_utc));
});
test('Bang tour copy and actual voice timestamps are distinct from Tan Hoi',()=>{
 const script=scriptFor('bang_rakam'),m=read('../public/audio/tour-bang-rakam/manifest.json');assert.equal(script.length,5);assert.equal(m.site,'bang_rakam');assert.equal(m.script_sha256,createHash('sha256').update(JSON.stringify(script)).digest('hex'));assert.notDeepEqual(script,TOUR_SCRIPT);assert.throws(()=>scriptFor('other'));
 for(let i=0;i<5;i++){const c=m.clips[i];assert.equal(c.text,script[i].join('. ')+'.');assert.ok(c.duration_seconds>0&&c.duration_seconds<11.8);assert.equal(c.sha256,createHash('sha256').update(readFileSync(new URL('../public/audio/tour-bang-rakam/'+c.file,import.meta.url))).digest('hex'));for(let j=0;j<3;j++){assert.ok(script[i][j].length<=48);assert.equal(tourCaption(i*12+c.cue_starts[j]+.001,m,script),script[i][j]);assert.ok(!/[\r\n]/.test(script[i][j]));}}
 assert.ok(m.clips[2].reused_from);assert.ok(m.clips[3].reused_from);assert.ok(!m.clips[0].text.includes('Tân Hội'));
});
test('Bang route is continuous, bounded in the study frame and targets the real selected record',()=>{
 const p=siteProfile('bang_rakam'),r=p.tour.route,anchor=[125,-300];assert.equal(p.tour.enabled,true);assert.equal(r.length,5);
 for(const t of [12,24,36,48]){const a=tourPose(t-1e-6,anchor,{},r),b=tourPose(t,anchor,{},r);for(const k of ['r','x','z','polar','az'])assert.ok(Math.abs(a[k]-b[k])<.01);}
 const record=tourPose(36,anchor,{},r);assert.equal(record.x,anchor[0]);assert.equal(record.z,anchor[1]);
 for(let t=0;t<=60;t+=.1){const v=tourPose(t,anchor,{},r);assert.ok(v.r>=55&&v.r<=12500);assert.ok(Math.abs(v.x)<=6000&&Math.abs(v.z)<=6000);assert.ok(Object.values(v).every(Number.isFinite));}
 const osm=read('../public/scene/bang_rakam/infrastructure.json');const place=osm.places.find(v=>v.osm_id==='node/1068830365');assert.deepEqual(r[0].target,[place.x,place.z]);
});

test('tour prefers confirmed informative records without changing uncertain source records',()=>{const record={status:'flooded',onset_by_local:'2026-09-01',flood_days_min:6};assert.equal(tourRecordPriority({...record,status_confirmed:true}),2);assert.equal(tourRecordPriority({...record,status_confirmed:false}),1);assert.equal(tourRecordPriority({...record,status:'never_water'}),0);assert.equal(tourRecordPriority(null),0);});
