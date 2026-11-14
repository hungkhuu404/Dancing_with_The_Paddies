import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTuftMesh} from '../src/scene/tufts.js';
import {warmAoPrograms} from '../src/fx/aoWarmup.js';
import {primeFirstView} from '../src/fx/firstView.js';
import {uploadMaterialTextures} from '../src/fx/textureWarmup.js';

test('near crop has the exact instancing/color/state shader inputs before its first visible build',()=>{
  const uState={value:new THREE.DataTexture()},uEcology={value:new THREE.DataTexture()};
  const mesh=createTuftMesh(7000,{uState,uEcology,uCenter:{value:new THREE.Vector3()},uRad:{value:38}});
  assert.equal(mesh.count,0);assert.equal(mesh.isInstancedMesh,true);
  assert.equal(mesh.instanceColor.count,7000);assert.equal(mesh.geometry.getAttribute('aTP').count,7000);
  assert.equal(mesh.material.vertexColors,true);assert.equal(mesh.material.side,THREE.DoubleSide);
  assert.equal(mesh.receiveShadow,true);assert.equal(mesh.castShadow,false);
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <map_fragment>'};
  mesh.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uState,uState);assert.equal(shader.uniforms.uEcology,uEcology);
  assert.match(shader.vertexShader,/attribute vec2 aTP/);assert.match(shader.vertexShader,/texelFetch\(uEcology/);
  mesh.geometry.dispose();mesh.material.dispose();
});

test('hidden pipeline renders both intro modes and restores camera, controls, visibility and renderer state on failure',async()=>{
  const camera=new THREE.PerspectiveCamera(40,1.5,1,20000);camera.position.set(10,20,30);camera.lookAt(0,0,0);
  const position=camera.position.clone(),rotation=camera.quaternion.clone();
  const controls={target:new THREE.Vector3(1,2,3),enabled:false},scene=new THREE.Scene(),child=new THREE.Object3D();
  scene.add(child);scene.fog=new THREE.FogExp2(0,.01);
  const oldTarget={},color=new THREE.Color(.1,.2,.3),mask=new THREE.Texture(),windowCenter=new THREE.Vector2(1e6,1e6),mirrorMatrix=new THREE.Matrix4();
  const water={userData:{reflect:false},material:{uniforms:{uMask:{value:mask},uWinC:{value:windowCenter},textureMatrix:{value:mirrorMatrix}}}};
  let target=oldTarget,alpha=.4;const modes=[];
  const renderer={autoClear:false,toneMappingExposure:.8,shadowMap:{autoUpdate:false,needsUpdate:true},getRenderTarget:()=>target,setRenderTarget:t=>target=t,
    getClearColor:c=>c.copy(color),getClearAlpha:()=>alpha,setClearColor:(c,a)=>{color.copy(c);alpha=a;}};
  const post={ao:{enabled:false},dofPass:{enabled:true}};
  await assert.rejects(primeFirstView({renderer,camera,controls,scene,post,water,yieldFrame:async()=>{},
    prepare(){camera.position.set(99,99,99);camera.near=9;controls.target.set(4,5,6);controls.enabled=true;child.visible=false;scene.fog.density=.2;post.ao.enabled=true;water.userData.reflect=true;water.material.uniforms.uMask.value=null;windowCenter.set(0,0);mirrorMatrix.makeTranslation(1,2,3);},
    render(){modes.push(post.dofPass.enabled);renderer.autoClear=true;target={};if(modes.length===2)throw Error('driver failed');}
  }),/driver failed/);
  assert.deepEqual(modes,[false,true]);assert.deepEqual(camera.position,position);assert.ok(camera.quaternion.equals(rotation));
  assert.equal(camera.near,1);assert.equal(camera.far,20000);assert.deepEqual(controls.target,new THREE.Vector3(1,2,3));
  assert.equal(controls.enabled,false);assert.equal(child.visible,true);assert.equal(scene.fog.density,.01);
  assert.equal(post.ao.enabled,false);assert.equal(post.dofPass.enabled,true);assert.equal(water.userData.reflect,false);
  assert.equal(water.material.uniforms.uMask.value,mask);assert.equal(water.material.uniforms.uWinC.value,windowCenter);
  assert.deepEqual(windowCenter,new THREE.Vector2(1e6,1e6));assert.deepEqual(mirrorMatrix.elements,new THREE.Matrix4().elements);
  assert.equal(renderer.autoClear,false);assert.equal(target,oldTarget);assert.equal(renderer.toneMappingExposure,.8);
});

test('loading texture upload covers PBR maps and shader uniforms, deduplicates and skips render-target textures',async()=>{
  const map=new THREE.Texture(),normalMap=new THREE.Texture(),atlas=new THREE.Texture(),target=new THREE.WebGLRenderTarget();
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial({map,normalMap});
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.ShaderMaterial({uniforms:{atlas:{value:atlas},output:{value:target.texture}}})));
  const uploaded=[];
  const count=await uploadMaterialTextures({initTexture:texture=>uploaded.push(texture)},[scene,scene],[atlas],async()=>{});
  assert.equal(count,3);assert.deepEqual(new Set(uploaded),new Set([map,normalMap,atlas]));
  assert.equal(material.map,map);assert.equal(scene.children[0].parent,scene);
  scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});target.dispose();
});

test('AO warmup detects transparency before gathering internal quads and restores render target synchronously',async()=>{
  const previous={},target={},calls=[],mesh=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.ShaderMaterial());
  let current=previous,finish;
  const pending=new Promise(resolve=>finish=resolve);
  const renderer={getRenderTarget:()=>current,setRenderTarget:t=>current=t,compileAsync:(object,camera)=>{calls.push([object,camera,current]);return pending;}};
  const ao={detectTransparency(){this.depthCopyPass={_mesh:mesh};},effectShaderQuad:{_mesh:mesh},copyQuad:{_mesh:mesh}};
  const warmed=warmAoPrograms(renderer,ao,target);
  assert.equal(current,previous);assert.equal(calls.length,3);
  assert.ok(calls.every(([object,camera,t])=>object===mesh&&camera.isOrthographicCamera&&t===target));
  assert.equal(mesh.parent,null);finish();await warmed;
  renderer.compileAsync=()=>{throw Error('compile failed');};
  assert.throws(()=>warmAoPrograms(renderer,ao,target),/compile failed/);assert.equal(current,previous);
  mesh.geometry.dispose();mesh.material.dispose();
});
