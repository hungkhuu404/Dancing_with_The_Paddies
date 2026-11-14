// Original procedural village details, in metres. No models/textures/network requests.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patch } from './shaderlib.js';
import { H, terrainHeight } from './land.js';
import { pickParcel, distToCanals } from '../data/parcels.js';
import { roadRoute, roadPoint, roadPose } from './ruralPaths.js';

function colored(g, color, x = 0, y = 0, z = 0) {
  g.translate(x, y, z);const c = new THREE.Color(color), data = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) data.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));return g.toNonIndexed();
}
const box = (w,h,d,c,x=0,y=0,z=0) => colored(new THREE.BoxGeometry(w,h,d),c,x,y,z);
const sphere = (w,h,d,c,x=0,y=0,z=0) => colored(new THREE.SphereGeometry(1,8,6).scale(w,h,d),c,x,y,z);
const cylinder = (r,h,c,x=0,y=0,z=0) => colored(new THREE.CylinderGeometry(r,r,h,8),c,x,y,z);
const merge = parts => {const g=mergeGeometries(parts);for(const p of parts)p.dispose();return g;};
const wheel = (r,x,y,z) => colored(new THREE.CylinderGeometry(r,r,.12,10).rotateZ(Math.PI/2),'#252b28',x,y,z);

function person(riding=false,cart=false) {
  const y=riding?.24:0;
  return merge([box(.39,.56,.25,'#4b6658',0,.95+y,0),sphere(.14,.18,.14,'#bb8d67',0,1.43+y,0),
    riding?sphere(.165,.12,.165,'#526d71',0,1.57+y,0):colored(new THREE.ConeGeometry(.31,.17,10),'#c7b784',0,1.64+y,0),
    ...(riding?[box(.1,.12,.6,'#bb8d67',-.25,1.1,.3),box(.1,.12,.6,'#bb8d67',.25,1.1,.3)]:cart?[box(.1,.16,.55,'#bb8d67',-.25,.94,-.26),box(.1,.16,.55,'#bb8d67',.25,.94,-.26)]:[box(.1,.47,.12,'#bb8d67',-.25,.95,.03),box(.1,.47,.12,'#bb8d67',.25,.95,.03)]),
    ...(riding?[box(.13,.52,.15,'#303b41',-.17,.67,0),box(.13,.52,.15,'#303b41',.17,.67,0)]:[])]);
}
function motorcycle() {
  return merge([wheel(.3,0,.3,-.7),wheel(.3,0,.3,.7),box(.34,.22,1.04,'#723c32',0,.64,0),box(.32,.12,.67,'#282d2c',0,.85,-.16),
    box(.06,.64,.07,'#a5aba7',0,.69,.67),box(.69,.06,.07,'#a5aba7',0,1,.67),sphere(.14,.12,.05,'#eee0b5',0,.94,.81),person(true)]);
}
function pickup() {
  return merge([box(1.48,.44,3.1,'#82928b',0,.7,0),box(1.4,.73,1.2,'#b7bbb0',0,1.26,.6),box(1.27,.4,.03,'#34494c',0,1.37,1.22),
    box(1.3,.2,1.45,'#655e4c',0,.94,-.69),...[-.76,.76].flatMap(x=>[-.95,.95].map(z=>wheel(.34,x,.34,z))),
    ...[-.53,.53].map(x=>box(.24,.17,.05,'#e8d6a0',x,.75,1.57))]);
}
function cart() {
  return merge([box(1.05,.12,1.25,'#8b7049',0,.57,-.95),box(1.08,.4,.09,'#997d52',0,.82,-1.56),
    ...[-.55,.55].map(x=>wheel(.38,x,.38,-1.02)),
    ...[-.25,.25].map(x=>box(.06,.07,1.7,'#796345',x,.94,-.95)),
    sphere(.48,.41,.56,'#b79a53',0,.95,-.95),person(false,true)]);
}
function cow() {
  return merge([sphere(.39,.44,.86,'#91745a',0,1.08,0),sphere(.25,.32,.36,'#96775b',0,1.4,.77),sphere(.22,.16,.21,'#5b4b3c',0,1.24,1.04),
    box(.1,.63,.11,'#6c5743',0,.94,-.83),sphere(.12,.15,.09,'#3a3229',0,.61,-.86),
    ...[-1,1].flatMap(s=>[colored(new THREE.ConeGeometry(.055,.27,6),'#d7cfb2',s*.21,1.77,.72),sphere(.17,.055,.1,'#826346',s*.3,1.49,.76)])]);
}
function straw() {
  const profile=[[0,0],[1.35,.05],[1.7,.35],[1.6,.9],[1.2,1.65],[.6,2.25],[.08,2.65]].map(p=>new THREE.Vector2(...p));
  const parts=[colored(new THREE.LatheGeometry(profile,16),'#af914b'),cylinder(.035,2.8,'#79613b',0,1.4,0)];
  for(let i=0;i<38;i++){const a=i*Math.PI*2/38,dir=new THREE.Vector3(-Math.sin(a)*.55,1,-Math.cos(a)*.55).normalize();const strand=new THREE.CylinderGeometry(.012,.018,1.45,4).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir));parts.push(colored(strand,i%2?'#d2b778':'#947c49',Math.sin(a)*1.38,1.2,Math.cos(a)*1.38));}
  return merge(parts);
}

export function createRuralLife(scene,layout,pickIndex,quality,{reduced=false,enabled=true,motorbikes=true}={}) {
  const group=new THREE.Group();group.name='rural-life';scene.add(group);
  const material=patch(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88}),{key:'rural-life',radar:'radarAt(vWorldP.xz)'});
  const routes=(layout.roads||[]).map(roadRoute).filter(r=>r.length>90&&r.width>=3).sort((a,b)=>b.length-a.length);
  const actors=[],props=[],matrix=new THREE.Object3D();
  function batch(geo,count,name){const m=new THREE.InstancedMesh(geo,material,count);m.name=name;m.castShadow=quality.tier!=='low';m.receiveShadow=true;m.frustumCulled=false;group.add(m);return m;}
  const counts=quality.tier==='low'?{walk:3,moto:motorbikes?3:0,cart:1,car:1,cow:2,straw:5}:{walk:10,moto:motorbikes?7:0,cart:3,car:2,cow:5,straw:12};
  const batches={walk:batch(person(),counts.walk,'villagers'),moto:batch(motorcycle(),counts.moto,'motorcycles'),cart:batch(cart(),counts.cart,'straw-carts'),car:batch(pickup(),counts.car,'farm-pickups')};
  for(const [kind,n]of Object.entries(counts)){
    if(!batches[kind]||!routes.length)continue;
    for(let i=0;i<n;i++){const route=routes[(i*3+Object.keys(batches).indexOf(kind))%Math.min(routes.length,18)];actors.push({kind,index:i,route,phase:(i*.371+Object.keys(batches).indexOf(kind)*.23)%2,speed:{walk:.85,moto:4,cart:.65,car:3}[kind],lane:kind==='walk'?route.width*.28:(i%2?-.6:.6)});}
  }
  // Placement is checked against parcel polygons, canal edges and existing homes.
  const safe=(x,z)=>pickParcel(pickIndex,layout.parcels,x,z)<0&&distToCanals(x,z,layout.canals)>4&&!(layout.houses||[]).some(h=>Math.hypot(h.x-x,h.z-z)<10)&&!(layout.trees||[]).some(t=>Math.hypot(t.x-x,t.z-z)<3);
  for(let i=0;i<routes.length&&props.length<counts.straw+counts.cow;i++){
    const r=routes[i];
    for(let j=1;j<7&&props.length<counts.straw+counts.cow;j++){
      const p=roadPoint(r,r.length*j/7);
      for(const sign of [-1,1]){const d=sign*(r.width/2+5),x=p.x+Math.cos(p.yaw)*d,z=p.z-Math.sin(p.yaw)*d;
        if(!safe(x,z)||props.some(q=>Math.hypot(q.x-x,q.z-z)<12))continue;
        props.push({x,z,y:terrainHeight(layout,x,z),yaw:p.yaw,kind:props.length<counts.straw?'straw':'cow'});
        if(props.length>=counts.straw+counts.cow)break;
      }
    }
  }
  const stacks=props.filter(p=>p.kind==='straw'),cows=props.filter(p=>p.kind==='cow');
  const stackBatch=batch(straw(),stacks.length,'haystacks'),cowBatch=batch(cow(),cows.length,'cattle');
  const humanLegs=batch(box(.13,.62,.15,'#303b41',0,-.31,0),counts.walk*2+counts.cart*2,'walking-legs');
  const cowLegs=batch(cylinder(.075,.78,'#705b46',0,-.39,0),cows.length*4,'cattle-legs');
  const put=(mesh,i,x,y,z,yaw=0,rx=0)=>{matrix.position.set(x,y,z);matrix.rotation.set(rx,yaw,0,'YXZ');matrix.scale.setScalar(1);matrix.updateMatrix();mesh.setMatrixAt(i,matrix.matrix);};
  stacks.forEach((p,i)=>put(stackBatch,i,p.x,p.y,p.z,p.yaw));stackBatch.instanceMatrix.needsUpdate=true;
  if(!routes.length)for(const b of Object.values(batches))b.count=0;
  let elapsed=0;
  function update(dt,target,camDist){
    if(enabled&&!reduced)elapsed+=Math.min(dt,.1);
    group.visible=enabled&&camDist<1700;if(!group.visible)return;
    let leg=0;
    for(const a of actors){const p=roadPose(a.route,elapsed,a.speed,a.phase,a.lane),gait=(a.phase*9+elapsed*a.speed*5),walk=a.kind==='walk'||a.kind==='cart';
      put(batches[a.kind],a.index,p.x,H.bank+.06+(walk?Math.abs(Math.sin(gait))*.015:0),p.z,p.yaw);
      if(walk)for(const side of [-1,1]){const x=p.x+Math.cos(p.yaw)*side*.13,z=p.z-Math.sin(p.yaw)*side*.13;put(humanLegs,leg++,x,H.bank+.06+.65,z,p.yaw,reduced?0:Math.sin(gait)*.4*side);}
    }
    for(const b of Object.values(batches))b.instanceMatrix.needsUpdate=true;
    humanLegs.count=leg;humanLegs.instanceMatrix.needsUpdate=true;
    cows.forEach((p,i)=>{put(cowBatch,i,p.x,p.y,p.z,p.yaw);for(let k=0;k<4;k++){const dx=k%2?-.25:.25,dz=k<2?-.52:.5;put(cowLegs,i*4+k,p.x+Math.cos(p.yaw)*dx+Math.sin(p.yaw)*dz,p.y+.78,p.z-Math.sin(p.yaw)*dx+Math.cos(p.yaw)*dz,p.yaw,reduced?0:Math.sin(elapsed*.6+i+k)*.025);}});
    cowBatch.instanceMatrix.needsUpdate=true;cowLegs.instanceMatrix.needsUpdate=true;
  }
  update(0,new THREE.Vector3(),0);
  return {group,update,info:{actors:actors.length,haystacks:stacks.length,cattle:cows.length,routes:routes.length,placements:props},get positions(){return actors.map(a=>({...roadPose(a.route,elapsed,a.speed,a.phase,a.lane),kind:a.kind}));}};
}
