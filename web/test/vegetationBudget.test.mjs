import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {registerHooks} from 'node:module';
// Isolate only the unused browser model-fetch boundary; exercise the real
// instancing, placement and LOD implementation without changing contract readers.
const hooks=registerHooks({resolve(specifier,context,next){if(specifier==='../data/load.js'&&context.parentURL?.endsWith('/world/common.js'))return {url:'data:text/javascript,export const loadModel=async()=>null;',shortCircuit:true};return next(specifier,context);}});
const {createVeg}=await import('../src/world/veg.js'),{disposeTree}=await import('../src/scene/life.js');hooks.deregister();
test('large vegetation placements yield in bounded batches without changing transforms or LOD population',async()=>{
  const veg=Array.from({length:129},(_,i)=>({x:i%10,z:Math.floor(i/10),rot:0,scale:1,kind:'reeds'}));
  const labels=[],system=await createVeg({quality:{tier:'low'},props:{veg},groundAt:()=>1.05,centre:[0,0]},async label=>labels.push(label));
  assert.equal(labels.filter(s=>s==='veg-placements:reeds').length,2);assert.ok(labels.includes('veg-kind:reeds'));
  system.update(0,new THREE.Vector3(0,0,0));const near=system.group.getObjectByName('reeds');assert.equal(near.count,129);const m=new THREE.Matrix4();near.getMatrixAt(64,m);assert.equal(m.elements[12],4);assert.equal(m.elements[14],6);assert.equal(m.elements[13],1);disposeTree(system.group);
});
