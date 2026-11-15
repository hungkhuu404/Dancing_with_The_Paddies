// Optional site architecture and floodplain activity. Shared batches; no per-frame object allocation.
import * as THREE from 'three';
import {InstSet,gltfParts,litMaterial} from './common.js';
import {identityPlan,floodVisibility,floodBob,homeWindows,fishingRhythm} from './identityRules.js';
import {U} from '../scene/shaderlib.js';

export function createIdentity(ctx,source,models){
 const group=new THREE.Group();group.name='site-identity';
 const recipe=ctx.profile.identity;
 const plan=identityPlan(ctx.layout,source,ctx.centre,recipe,ctx.quality.tier==='low');
 const sets=new Map(),dynamic=[],dummy=new THREE.Object3D();
 let elapsed=0;
 function put(target,index,p,scale=1,bob=0){
  dummy.position.set(p.x,p.y+(p.kind==='adult-fisher'?.22:0)+bob,p.z);
  const work=p.kind==='adult-fisher'&&!ctx.reduced?Math.sin(elapsed*.45)*.035*fishingRhythm(ctx.sky.state.tod):0;
  dummy.rotation.set(0,(p.rot||0)+work,0);dummy.scale.setScalar(scale);dummy.updateMatrix();
  if(target.isInstancedMesh)target.setMatrixAt(index,dummy.matrix);
  else target.set(index,dummy.matrix);
 }
 function visibility(p){
  return p.base==='flood'?floodVisibility(ctx.land.level[p.parcel],ctx.land.stateTex.image.data[p.parcel*4+1]===255):1;
 }
 function upgrade(name,gltf){
  const batch=sets.get(name);if(!batch||!gltf)return false;
  const parts=gltfParts(gltf);if(!parts.length)return false;
  for(const mesh of batch.set.meshes)mesh.geometry.dispose();
  batch.set.setParts(parts,m=>litMaterial(m,'identity-'+name,{radar:recipe.trees.includes(name)?'.36':'.92'}));
  return true;
 }
 for(const p of plan){
  if(!sets.has(p.model))sets.set(p.model,{items:[],set:null});
  sets.get(p.model).items.push({...p,y:p.base==='terrain'?ctx.terrainAt(p.x,p.z)+.03:0});
 }
 for(const [name,batch]of sets){
  const moving=batch.items.some(p=>p.base==='flood'||p.base==='water');
  batch.set=new InstSet(group,name,batch.items.length,{cast:ctx.quality.tier!=='low',dynamic:moving});
  batch.set.setParts([{geometry:new THREE.BoxGeometry(.01,.01,.01),material:null}],m=>litMaterial(m,'identity-pending'));
  batch.items.forEach((p,i)=>put(batch.set,i,p,p.base==='flood'?0:1));
  batch.set.count=batch.items.length;batch.set.commit();if(moving)dynamic.push(batch);
  upgrade(name,models.get(name));
 }
 const lanterns=plan.filter(p=>p.kind==='field-boat');
 const bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(.065,5,3),new THREE.MeshBasicMaterial({color:0xffd6a1,transparent:true,opacity:0}),Math.max(1,lanterns.length));
 bulbs.name='illustrative-fishing-lamps';bulbs.count=lanterns.length;bulbs.layers.set(1);bulbs.frustumCulled=false;group.add(bulbs);
 const windows=[];
 for(const p of plan)if(p.kind==='home')for(const [x,y,z]of homeWindows(p.model,recipe)){
  const a=p.rot||0;
  windows.push({x:p.x+Math.cos(a)*x+Math.sin(a)*z,z:p.z-Math.sin(a)*x+Math.cos(a)*z,y:ctx.terrainAt(p.x,p.z)+.03+y,rot:a});
 }
 const windowMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(.65,.85),new THREE.MeshBasicMaterial({color:0xffd09c,transparent:true,opacity:0,depthWrite:false}),Math.max(1,windows.length));
 windowMesh.name='illustrative-home-windows';windowMesh.count=windows.length;
 windows.forEach((p,i)=>put(windowMesh,i,p));windowMesh.instanceMatrix.needsUpdate=true;windowMesh.computeBoundingSphere();group.add(windowMesh);
 function update(dt,time,cam){
  windowMesh.material.opacity=Math.max(0,U.uNight.value-.2)*.65;
  if(Math.hypot(cam.x-ctx.centre[0],cam.z-ctx.centre[1],cam.y)>3000)return;
  if(!ctx.reduced)elapsed+=Math.min(dt,.1);
  for(const batch of dynamic){
   for(let i=0;i<batch.items.length;i++){
    const p=batch.items[i];put(batch.set,i,p,visibility(p),p.kind==='field-net'?0:floodBob(elapsed+i,ctx.reduced));
   }
   batch.set.commit();
  }
  bulbs.material.opacity=U.uNight.value*.85;
  for(let i=0;i<lanterns.length;i++){
   const p=lanterns[i];dummy.position.set(p.x+.24,.68+floodBob(elapsed+i,ctx.reduced),p.z);
   dummy.rotation.set(0,0,0);dummy.scale.setScalar(visibility(p));dummy.updateMatrix();bulbs.setMatrixAt(i,dummy.matrix);
  }
  bulbs.instanceMatrix.needsUpdate=true;
 }
 return {group,plan,upgrade,update,dispose(){
  for(const batch of sets.values())batch.set.dispose();
  for(const mesh of [windowMesh,bulbs]){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}
  group.removeFromParent();
 }};
}
