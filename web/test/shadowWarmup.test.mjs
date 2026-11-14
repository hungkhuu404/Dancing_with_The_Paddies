import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shadowVariant,shadowVariantKey,warmShadowPrograms} from '../src/scene/shadowWarmup.js';
test('shadow projection matches PCF reversed sides, alpha coverage and displacement',()=>{
  const source=new THREE.MeshStandardMaterial({side:THREE.FrontSide,alphaTest:.25});
  const map=new THREE.Texture(),alpha=new THREE.Texture(),displacement=new THREE.Texture();
  Object.assign(source,{map,alphaMap:alpha,displacementMap:displacement,displacementScale:2,displacementBias:-.2});
  const result=shadowVariant(source);
  assert.equal(result.side,THREE.BackSide);assert.equal(result.alphaTest,.25);
  assert.equal(result.map,map);assert.equal(result.alphaMap,alpha);assert.equal(result.displacementMap,displacement);
  assert.equal(result.displacementScale,2);assert.equal(result.displacementBias,-.2);
  source.alphaToCoverage=true;assert.equal(shadowVariant(source).alphaTest,.5);
  source.shadowSide=THREE.FrontSide;assert.equal(shadowVariant(source).side,THREE.FrontSide);
  source.shadowSide=null;source.side=THREE.DoubleSide;assert.equal(shadowVariant(source).side,THREE.DoubleSide);
});
test('warmup restores live materials/target before asynchronous link completes',async()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(),target={name:'post'};
  scene.fog=new THREE.FogExp2();scene.add(new THREE.DirectionalLight());
  const material=new THREE.MeshStandardMaterial(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),material,2);
  mesh.castShadow=true;root.add(mesh);scene.add(root);
  let release;const linked=new Promise(resolve=>release=resolve);let current=null;
  const renderer={shadowMap:{enabled:true},getRenderTarget:()=>current,setRenderTarget:t=>{current=t;},compileAsync:(group,cam,lighting)=>{
    assert.equal(mesh.material.type,'MeshDepthMaterial');assert.equal(group.children[0],mesh);assert.equal(mesh.parent,root);
    assert.equal(mesh.isInstancedMesh,true);assert.equal(lighting.fog,null);assert.equal(lighting.children[0],scene.children[0]);
    assert.equal(current,target);return linked;
  }};
  const pending=warmShadowPrograms(renderer,root,camera,scene,target);
  assert.equal(mesh.material,material);assert.equal(current,null);release();await pending;
});
test('tile-local materials pool by shadow inputs rather than source identity',()=>{
  const a=new THREE.MeshStandardMaterial(),b=new THREE.MeshStandardMaterial();
  assert.notEqual(a.uuid,b.uuid);assert.equal(shadowVariantKey(a),shadowVariantKey(b));
  a.color.set(0xff0000);assert.equal(shadowVariantKey(a),shadowVariantKey(b));
  a.map=new THREE.Texture();assert.notEqual(shadowVariantKey(a),shadowVariantKey(b));
  b.map=a.map;assert.equal(shadowVariantKey(a),shadowVariantKey(b));
  b.alphaTest=.5;assert.notEqual(shadowVariantKey(a),shadowVariantKey(b));
  a.alphaTest=.5;assert.equal(shadowVariantKey(a),shadowVariantKey(b));
  a.clippingPlanes=[new THREE.Plane()];assert.notEqual(shadowVariantKey(a),shadowVariantKey(b));
  b.clippingPlanes=a.clippingPlanes;assert.equal(shadowVariantKey(a),shadowVariantKey(b));
});
