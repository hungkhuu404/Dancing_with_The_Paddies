import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CROWD_PROTOTYPES,createCrowdClone,createCrowdPrototypes} from '../src/world/crowdModels.js';

function rig(){
  const bone=new THREE.Bone(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({map:new THREE.Texture(),alphaTest:.5});
  const vertices=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(vertices*4),4));
  const weights=new Float32Array(vertices*4);for(let i=0;i<vertices;i++)weights[i*4]=1;
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,material);mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
  const scene=new THREE.Group();scene.add(mesh);scene.updateMatrixWorld(true);
  return {scene,animations:[new THREE.AnimationClip('idle',1,[])],mesh,bone,material,geometry};
}
test('warm/live clone constructor preserves real skinning, source geometry and material flags without reparenting sources',()=>{
  const source=rig(),parent=source.mesh.parent;let options;
  const clone=createCrowdClone(source,'motorbike',(object,key,opts)=>{options={key,opts};return object;},1.2);
  const skin=clone.children[0];
  assert.deepEqual(options,{key:'skinmotorbike',opts:{radar:'.5'}});
  assert.equal(source.mesh.parent,parent);assert.equal(source.scene.parent,null);assert.equal(source.mesh.material,source.material);
  assert.equal(skin.isSkinnedMesh,true);assert.equal(skin.geometry,source.geometry);assert.equal(skin.material,source.material);
  assert.notEqual(skin.skeleton,source.mesh.skeleton);assert.notEqual(skin.skeleton.bones[0],source.bone);
  assert.equal(skin.skeleton.bones[0],skin.children[0]);assert.equal(skin.geometry.attributes.skinIndex,source.geometry.attributes.skinIndex);
  assert.equal(skin.material.alphaTest,.5);assert.equal(skin.material.map,source.material.map);assert.equal(clone.scale.x,1.2);
});
test('off-scene prototypes cover adult/animal/traffic crowd configurations, include herder attachment and skip unavailable rigs',()=>{
  const source=rig(),models=new Map([['wader',source],['motorbike',source],['kid',source]]),calls=[];
  const prototypes=createCrowdPrototypes(models,(object,key,opts)=>{calls.push({key,radar:opts.radar});return object;});
  assert.deepEqual(prototypes.names,['wader','herder','motorbike']);assert.equal(prototypes.group.parent,null);
  assert.deepEqual(calls.map(c=>c.key),['skinwader','skinherder','skinmotorbike']);assert.ok(calls.every(c=>c.radar==='.5'));
  assert.equal(prototypes.group.children[1].children.at(-1).castShadow,true);
  assert.equal(source.scene.parent,null);assert.ok(!CROWD_PROTOTYPES.some(c=>c.name==='kid'||c.model==='kid'));
  assert.deepEqual(createCrowdPrototypes(new Map([['fisher',{scene:source.scene,animations:[]}]]),o=>o).names,[]);
});
