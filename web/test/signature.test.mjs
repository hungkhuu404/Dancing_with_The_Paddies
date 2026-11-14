import test from 'node:test';
import assert from 'node:assert/strict';
import {hourlyWeather,celestial,sideLookingPosition,tourPose,recordingType,fitFrame,sceneDate} from '../src/world/signatureRules.js';
test('weather interpolation crosses north without a 180-degree wind reversal and never fills missing data',()=>{
  const h={hourly:{time:['2026-09-01T00:00','2026-09-01T01:00'],cloud_cover:[80,100],rain:[0,2],wind_speed_10m:[2,4],wind_direction_10m:[350,10]}};
  assert.deepEqual(hourlyWeather(h,'2026-09-01T00:30Z'),{cloud_cover:90,rain:1,wind_speed_10m:3,wind_direction_10m:0});
  assert.equal(hourlyWeather(h,'2026-08-31T23:59Z'),null);assert.equal(hourlyWeather(h,'2026-09-01T01:01Z'),null);
  h.hourly.rain[1]=null;assert.equal(hourlyWeather(h,'2026-09-01T00:30Z'),null);
});
test('side-looking incidence is 40 degrees and cross-track for both flight directions',()=>{
  for(const dir of [[0,1],[0,-1],[-.2,Math.sqrt(.96)]])for(const side of [-1,1]){const p=sideLookingPosition(100,300,dir,1800,side);const dx=p.x-100,dz=p.z-300;assert.ok(Math.abs(Math.atan2(Math.hypot(dx,dz),p.y)*180/Math.PI-40)<1e-10);assert.ok(Math.abs(dx*dir[0]+dz*dir[1])<1e-10);}
});
test('celestial vectors use east/up/south and illumination is date-dependent',()=>{
  const noon=celestial('2026-09-22T05:00:00Z'),night=celestial('2026-09-22T17:00:00Z');assert.ok(noon.elevation>65);assert.ok(night.elevation< -60);
  for(const v of [noon.sun,noon.moon])assert.ok(Math.abs(Math.hypot(...v)-1)<1e-12);
  assert.ok(celestial('2026-09-11T00:00Z').fraction<.03);assert.ok(celestial('2026-09-26T00:00Z').fraction>.95);
  assert.equal(sceneDate('2026-09-22',.33),'2026-09-22T05:00:00.000Z');
});
test('60-second tour reaches all five scenes and stays continuous at segment boundaries',()=>{
  for(let i=0;i<5;i++)assert.equal(tourPose(i*12,[1000,-500]).scene,i);
  for(const t of [12,24,36,48]){const a=tourPose(t-1e-5,[1000,-500]),b=tourPose(t,[1000,-500]);assert.ok(Math.abs(a.r-b.r)<.01);assert.ok(Math.abs(a.az-b.az)<.01);}
  for(let t=0;t<=60;t+=.1){const p=tourPose(t,[1000,-500]);assert.ok(p.r>=38&&p.r<=16000);assert.ok(Number.isFinite(p.x+p.z+p.az+p.polar));}
});
test('recorder selects supported containers and letterboxes without cropping evidence',()=>{
  assert.equal(recordingType(t=>t==='video/mp4'),'video/mp4');assert.equal(recordingType(()=>false),null);
  assert.deepEqual(fitFrame(1000,1000,1280,720),{x:280,y:0,w:720,h:720});
});
