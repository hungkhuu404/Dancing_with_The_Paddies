import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';

// These lifecycle tests do not load glTF models. Isolate the unused upgrade
// dependency from Vite's browser-only loader; material rendering is checked in Edge.
const hook=registerHooks({resolve(specifier,context,next){
  if(specifier==='./common.js'&&context.parentURL?.endsWith('/world/nisar.js'))return {url:'data:text/javascript,export const patchScene = object => object;',shortCircuit:true};
  return next(specifier,context);
}});
const {createNisar}=await import('../src/world/nisar.js');hook.deregister();

function setup(reduced=false){
  const calls={settled:[],sweeps:[],ended:[],light:[]};
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,500,1000);
  const ctx={camera,reduced,passes:[{track:'148D'},{track:'083A'}],acq:[{acq_utc:'2026-09-24T11:30:00Z'}],
    U:{uTime:{value:0},uNight:{value:0},uScan:{value:new THREE.Vector4(0,1,0,0)},uScanWidth:{value:420}},
    farSweep:new THREE.Vector4(0,1,0,0),target:()=>new THREE.Vector3(0,0,0),
    setPassAll:i=>calls.settled.push(i),sweepPass:(i,s)=>calls.sweeps.push({i,...s}),
    onPassMomentEnd:i=>calls.ended.push(i),setTod:v=>calls.light.push(v)};
  return {nisar:createNisar(ctx),ctx,calls};
}

test('stopping an idle scan preserves invisible shader warm-up; stopping an active scan clears its state once',()=>{
  const {nisar,ctx,calls}=setup();
  nisar.stop();assert.equal(nisar.group.visible,true);
  nisar.update(.016);nisar.update(.016);nisar.update(.016);
  assert.equal(nisar.group.visible,false);
  nisar.play(0,{keepTime:true});nisar.update(2);
  assert.ok(ctx.U.uScan.value.w>0);assert.equal(calls.light.length,0);
  assert.equal(calls.sweeps[0].leadIn,1.5);
  nisar.stop();assert.equal(nisar.active,false);assert.equal(nisar.group.visible,false);
  assert.equal(ctx.U.uScan.value.w,0);assert.equal(ctx.farSweep.w,0);
  assert.deepEqual(calls.settled,[0]);assert.deepEqual(calls.ended,[0]);
  nisar.stop();assert.deepEqual(calls.ended,[0]);
  nisar.play(1,{keepTime:true});assert.equal(nisar.state.pass,1);
  nisar.update(30);assert.equal(nisar.active,false);assert.equal(ctx.U.uScan.value.w,0);
});

test('reduced motion applies the observation without a sweep or an illustration cue',()=>{
  const {nisar,ctx,calls}=setup(true);
  nisar.play(0,{keepTime:true});
  assert.deepEqual(calls.settled,[0]);assert.equal(calls.sweeps.length,0);
  assert.equal(nisar.active,false);assert.equal(ctx.U.uScan.value.w,0);
  assert.equal(calls.light.length,0);
});
