import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {roadRoute,roadPoint,roadPose} from '../src/scene/ruralPaths.js';
import {createRuralLife} from '../src/scene/rural.js';
import {buildGrid,pickParcel,distToCanals} from '../src/data/parcels.js';

test('road motion remains finite and continuous through endpoint reversals',()=>{
 const r=roadRoute({points:[[0,0],[0,0],[100,0],[100,100]],width_m:4});
 assert.equal(r.length,200);assert.equal(roadPoint(r,0).x,0);assert.equal(roadPoint(r,200).z,100);
 for(let t=0;t<200;t+=.3){const a=roadPose(r,t,4,0,.6),b=roadPose(r,t+.001,4,0,.6);assert.ok(Number.isFinite(a.yaw));assert.ok(a.distance>=0&&a.distance<=r.length);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.02);}
 assert.equal(roadPose(roadRoute({points:[[0,0]]}),10,1),null);
});
test('real layout gets road actors, cows and straw on non-parcel dry verges',()=>{
 const layout=JSON.parse(readFileSync(new URL('../public/scene/layout.json',import.meta.url),'utf8'));
 const index=buildGrid(layout.parcels,50),scene=new THREE.Scene();
 const original=JSON.stringify(layout);
 const rural=createRuralLife(scene,layout,index,{tier:'high'});
 assert.ok(rural.info.actors>0);assert.ok(rural.info.cattle>0);assert.ok(rural.info.haystacks>0);
 for(const p of rural.info.placements){assert.equal(pickParcel(index,layout.parcels,p.x,p.z),-1);assert.ok(distToCanals(p.x,p.z,layout.canals)>4);}
 const before=rural.positions;rural.update(.1,new THREE.Vector3(),100);assert.notDeepEqual(rural.positions,before);
 assert.ok(rural.group.children.length<=9,'bounded number of instanced draw calls');
 assert.equal(JSON.stringify(layout),original,'decoration must not mutate scientific/layout data');
});
test('empty roads and explicit opt-out leave no moving decoration',()=>{
 const layout={roads:[],parcels:[],canals:[],houses:[],trees:[]};
 const rural=createRuralLife(new THREE.Scene(),layout,buildGrid([],50),{tier:'low'},{enabled:false});
 rural.update(1,new THREE.Vector3(),100);assert.equal(rural.group.visible,false);assert.equal(rural.info.actors,0);
});
test('reduced motion freezes village actors and low tier reduces the population',()=>{
 const layout=JSON.parse(readFileSync(new URL('../public/scene/layout.json',import.meta.url),'utf8')),index=buildGrid(layout.parcels,50);
 const rural=createRuralLife(new THREE.Scene(),layout,index,{tier:'low'},{reduced:true,motorbikes:false});
 const before=rural.positions;rural.update(10,new THREE.Vector3(),100);assert.deepEqual(rural.positions,before);assert.ok(rural.info.actors<=8);
 assert.ok(!rural.positions.some(p=>p.kind==='moto'),'existing world owns motorbike traffic');
 assert.ok(rural.positions.some(p=>p.kind==='cart'),'each handcart includes its puller');
});
