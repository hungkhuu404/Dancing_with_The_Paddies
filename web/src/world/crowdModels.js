// The same clone constructor is used by lazy live crowd slots and loading-time
// shader prototypes. Prototypes stay off-scene; they do not add visible people.
import * as THREE from 'three';
import {clone as cloneSkinned} from 'three/examples/jsm/utils/SkeletonUtils.js';

export function createHerderPole(){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,4.2,4).rotateX(1.25).translate(.25,1.6,1.9),new THREE.MeshStandardMaterial({color:0x6b5a32,roughness:.8}));
  mesh.castShadow=true;
  return mesh;
}

export const CROWD_PROTOTYPES=Object.freeze([
  {name:'wader',model:'wader'}, {name:'fisher',model:'fisher'}, {name:'washer',model:'washer'},
  {name:'herder',model:'wader',attach:createHerderPole},
  {name:'dog',model:'dog'}, {name:'duck',model:'duck'}, {name:'buffalo',model:'buffalo'},
  // Traffic's motorbike renderer uses createCrowd, hence exactly the same .5
  // radar patch as people/animals. Boat traffic uses .85 and warms on tile build.
  {name:'motorbike',model:'motorbike'},
]);

export function createCrowdClone(gltf,name,patchScene,scale=1,attach=null){
  const object=patchScene(cloneSkinned(gltf.scene),'skin'+name,{radar:'.5'});
  object.scale.setScalar(scale);
  if(attach)object.add(attach());
  return object;
}

export function createCrowdPrototypes(models,patchScene){
  const group=new THREE.Group();group.name='shader_warm_crowds';
  const names=[];
  for(const config of CROWD_PROTOTYPES){
    const gltf=models.get(config.model);
    // Same availability gate as createCrowd.setModel; missing assets keep the
    // original procedural fallback rather than fabricating a rig.
    if(!gltf?.scene||!gltf.animations?.length)continue;
    group.add(createCrowdClone(gltf,config.name,patchScene,1,config.attach));
    names.push(config.name);
  }
  return {group,names};
}
