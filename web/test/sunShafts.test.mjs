import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shaftStrength,shaftMaskSize} from '../src/fx/sunShaftRules.js';
import {impostorLayout,impostorView} from '../src/scene/impostorView.js';
import * as THREE from 'three';
import {createSunShafts} from '../src/fx/sunShafts.js';
import {glareBloom,glareExposure} from '../src/fx/cameraLightRules.js';
test('shafts reject low, disabled, reduced, radar, night, behind-camera and off-screen sun',()=>{
  const day={tier:'high',enabled:true,forward:1,x:0,y:0,elevation:40,cloud:.4,night:0};
  assert.ok(shaftStrength(day)>0&&shaftStrength(day)<=.11);
  for(const patch of [{tier:'low'},{enabled:false},{reduced:true},{radar:true},{forward:-1},{night:1},{elevation:0},{x:2},{y:-2},{x:NaN},{cloud:0},{cloud:1},{rain:.25},{rain:NaN}])assert.equal(shaftStrength({...day,...patch}),0);
  assert.ok(shaftStrength({...day,rain:.15})<shaftStrength(day));
  assert.ok(shaftStrength({...day,x:1.4})<shaftStrength(day));
});
test('cloud mask resolution preserves aspect and is bounded in portrait and landscape',()=>{
  assert.deepEqual(shaftMaskSize(1600,900),{width:384,height:216});
  assert.deepEqual(shaftMaskSize(900,1600),{width:216,height:384});
  assert.deepEqual(shaftMaskSize(100,50),{width:100,height:50});
  assert.deepEqual(shaftMaskSize(0,0),{width:1,height:1});
});
test('impostor metadata validates geometry span and configured elevation transition',()=>{
  const meta={span:8,center:4,azimuths:8,elevations:[20,65]};
  assert.equal(impostorLayout(meta).splitRadians,42.5*Math.PI/180);
  for(const patch of [{span:0},{span:NaN},{center:Infinity},{azimuths:4},{elevations:[65,20]},{elevations:[20]}])assert.throws(()=>impostorLayout({...meta,...patch}),TypeError);
});
test('impostor angle selection wraps sectors, respects model yaw and switches elevation',()=>{
  assert.deepEqual(impostorView(0,0,1),{column:0,row:0});
  assert.deepEqual(impostorView(1,0,0),{column:2,row:0});
  assert.deepEqual(impostorView(-1,0,0),{column:6,row:0});
  assert.deepEqual(impostorView(1,0,0,Math.PI/2),{column:0,row:0});
  assert.deepEqual(impostorView(0,10,1),{column:0,row:1});
});
test('cloud-mask render failure restores the caller render target and graphics state',()=>{
  const camera=new THREE.PerspectiveCamera(40,16/9,1,20000);
  camera.lookAt(0,.5,-1);camera.updateMatrixWorld();
  const oldTarget={name:'caller'},color=new THREE.Color(0x765432),original=color.clone();
  let current=oldTarget,alpha=.4,scissor=true;
  const scene=new THREE.Scene();
  const renderer={autoClear:false,shadowMap:{autoUpdate:true,needsUpdate:true},
    getRenderTarget:()=>current,setRenderTarget:target=>{current=target;},
    getClearAlpha:()=>alpha,getClearColor:out=>out.copy(color),setClearColor:(next,a)=>{color.set(next);alpha=a;},
    getScissorTest:()=>scissor,setScissorTest:value=>{scissor=value;},
    render:(actualScene,actualCamera)=>{assert.equal(actualScene,scene);assert.equal(actualCamera,camera);assert.notEqual(current,oldTarget);throw Error('forced mask failure');},
  };
  const rays=createSunShafts(renderer,camera,{occlusionScene:scene},{tier:'high'});
  rays.setSize(1600,900);
  const state={sunDir:new THREE.Vector3(0,.5,-1).normalize(),sunColor:new THREE.Color(1,1,.8),elev:30,cloud:.4,night:0};
  assert.throws(()=>rays.update(state,true),/forced mask failure/);
  assert.equal(current,oldTarget);assert.equal(renderer.autoClear,false);assert.equal(scissor,true);
  assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(renderer.shadowMap.needsUpdate,true);
  assert.equal(alpha,.4);assert.ok(color.equals(original));rays.dispose();
});
test('direct sunlight limits bloom/exposure while other views and the off toggle retain their grade',()=>{
  assert.equal(glareBloom(0),.6);assert.equal(glareBloom(.5,false),0);
  assert.ok(Math.abs(glareBloom(1)-.036)<1e-12);
  assert.equal(glareBloom(-3),.6);assert.equal(glareBloom(NaN),.6);
  assert.equal(glareExposure(.8,0),.8);assert.ok(Math.abs(glareExposure(1,1)-.45)<1e-12);
  assert.equal(glareExposure(.8,Infinity),.8);
});
