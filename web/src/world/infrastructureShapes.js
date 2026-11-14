// Original procedural illustrations: no downloaded meshes, textures, brands or
// figures. Metres, +Y up, feet at y=0 and front +Z. Bridge span is local +X.
// Factories own their returned indexed geometry; cache/share it at runtime and
// dispose it only when its final instance is released. No material is created.
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C={wall:0xd8d2be,white:0xe7e9e1,concrete:0x93978e,steel:0x59615e,dark:0x252c2a,
  glass:0x365760,roof:0x74584c,blue:0x526f79,wood:0x705639,grain:0xc4a166,leaf:0x536743};
const paints=[0xd7d4bf,0xb8c6bb,0xd7c2ad,0xc1cbd1,0xd8cfb3];
const kinds=['shophouse','house','field_hut','church','civic','school','arch','dryer','mill','silo','bts','bridge',
  'streetlight','car','truck','container_truck','bus','tricycle','sluice_frame','sluice_gate','pump_outlet'];
const aliases={modern_house:'house',fieldhut:'field_hut',solar_light:'streetlight',container:'container_truck',pump:'pump_outlet'};
export const INFRASTRUCTURE_KINDS=Object.freeze([...kinds,...Object.keys(aliases)]);
const variantNumber=v=>Number.isFinite(v)?Math.abs(Math.trunc(v)):0;
function bridgeSize(options){
  const length=options.length??14,width=options.width??5;
  if(!Number.isFinite(length)||length<4||length>80||!Number.isFinite(width)||width<2||width>16)throw new RangeError('Bridge length must be 4–80 m and width 2–16 m');
  return {length,width};
}

/** Canonical footprints include projections/fences, heights include equipment.
 * Bounds on the returned geometry are authoritative. Extra anchors are useful
 * for a flat bridge road deck, separate lifting door, lamps and illustrative jets. */
export function infrastructureDimensions(kind,variant=0,options={}){
  kind=aliases[kind]||kind;
  const v=variantNumber(variant);
  switch(kind){
    case 'shophouse':return {width:5.8,height:3.25*(2+v%3)+2.5,depth:11.2,floors:2+v%3};
    case 'house':return {width:12,height:6.1,depth:15};
    case 'field_hut':return {width:4.7,height:3.9,depth:5.6};
    case 'church':return {width:[13,17,14][v%3],height:[25,20,24][v%3],depth:[25,27,24][v%3]};
    case 'civic':return {width:19,height:9,depth:14};
    case 'school':return {width:31,height:9,depth:15};
    case 'arch':return {width:9,height:6.4,depth:2.6};
    case 'dryer':return {width:13,height:18,depth:20};
    case 'mill':return {width:22,height:12,depth:33};
    case 'silo':return {width:11,height:14,depth:7};
    case 'bts':return {width:7,height:31.2,depth:7};
    case 'bridge':{const {length,width}=bridgeSize(options);return {width:length,height:2.9,depth:width+.5,deckY:1.4};}
    case 'streetlight':return {width:1.8,height:6.4,depth:3.2,lampY:6.1};
    case 'car':return {width:2,height:1.7,depth:4.5};
    case 'truck':return {width:2.6,height:3.7,depth:8};
    case 'container_truck':return {width:2.7,height:4.2,depth:16};
    case 'bus':return {width:2.7,height:3.5,depth:11};
    case 'tricycle':return {width:2.2,height:2.1,depth:4.5};
    case 'sluice_frame':return {width:9,height:6.4,depth:3,gateWidth:6,gateHeight:2.8};
    case 'sluice_gate':return {width:6,height:2.8,depth:.4};
    case 'pump_outlet':return {width:1.5,height:2.4,depth:3.8,outlet:[0,2,2]};
    default:throw new RangeError('Unknown infrastructure kind: '+kind);
  }
}

class Builder{
  constructor(){this.parts=[];}
  add(g,color,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    g.deleteAttribute('uv');
    if(rx)g.rotateX(rx);if(ry)g.rotateY(ry);if(rz)g.rotateZ(rz);g.translate(x,y,z);
    if(!g.index)g.setIndex(Array.from({length:g.getAttribute('position').count},(_,i)=>i));
    const c=new THREE.Color(color),data=new Float32Array(g.getAttribute('position').count*3);
    for(let i=0;i<data.length;i+=3){data[i]=c.r;data[i+1]=c.g;data[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(data,3));this.parts.push(g);return this;
  }
  box(w,h,d,x,y,z,color=C.wall,rx=0,ry=0,rz=0){return this.add(new THREE.BoxGeometry(w,h,d),color,x,y+h/2,z,rx,ry,rz);}
  cyl(radius,height,x,y,z,color=C.steel,sides=8,rx=0,rz=0){return this.add(new THREE.CylinderGeometry(radius,radius,height,sides,1),color,x,y+height/2,z,rx,0,rz);}
  beam(a,b,r=.06,color=C.steel){
    const A=new THREE.Vector3(...a),D=new THREE.Vector3(...b).sub(A),length=D.length();
    if(length<1e-6)return this;
    const g=new THREE.CylinderGeometry(r,r,length,5,1).translate(0,length/2,0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),D.normalize()));
    return this.add(g,color,...A.toArray());
  }
  hip(w,d,h,x,y,z,color=C.roof){
    const p=[-w/2,0,-d/2,w/2,0,-d/2,w/2,0,d/2,-w/2,0,d/2,0,h,-d*.25,0,h,d*.25];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setIndex([0,4,1,3,2,5,0,3,5,0,5,4,1,4,5,1,5,2]);
    const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();
    this.box(w,.12,d,x,y-.12,z,color);return this.add(flat,color,x,y,z);
  }
  finish(kind,variant,dimensions){
    const geometry=mergeGeometries(this.parts,false);
    for(const part of this.parts)part.dispose();
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    if(geometry.boundingBox.min.y<0){geometry.translate(0,-geometry.boundingBox.min.y,0);geometry.computeBoundingBox();geometry.computeBoundingSphere();}
    geometry.userData={kind,variant,units:'m',front:'+Z',illustrative:true,dimensions};
    return geometry;
  }
}

function window(b,x,y,z,w=1.1,h=1.5){
  b.box(w+.16,h+.16,.13,x,y-.08,z,C.white).box(w,h,.15,x,y,z+.025,C.glass);
  b.box(.055,h,.18,x,y,z+.055,C.white);
}
function fence(b,w,d,y=0){
  for(const side of [-1,1]){
    b.box(.14,1.25,d,side*w/2,y,0,C.white);
    b.box((w-3)/2,1.1,.14,side*(w+3)/4,y,d/2,C.steel);
  }
  b.box(w,1.1,.14,0,y,-d/2,C.steel);
  for(const x of [-1.65,1.65])b.box(.35,1.6,.4,x,y,d/2,C.concrete);
  for(let x=-w/2;x<=w/2;x+=.65)if(Math.abs(x)>1.6)b.box(.055,1.15,.07,x,y,d/2+.06,C.white);
}
function shophouse(b,v){
  const floors=2+v%3,h=floors*3.25,w=5.2,d=9.4,paint=paints[v%paints.length];
  b.box(w+.4,.22,d+.4,0,0,0,C.concrete).box(w,h,d,0,.22,0,paint);
  b.box(3.8,2.45,.16,0,.25,d/2+.035,C.dark).box(4.5,.55,.2,0,2.65,d/2+.1,C.blue);
  for(const x of [-2.2,2.2])b.box(.24,3.1,.3,x,.25,d/2+.12,C.white);
  for(let f=1;f<floors;f++){
    const y=.22+3.25*f;
    for(const x of [-1.25,1.25])window(b,x,y+.4,d/2+.1,1.55,1.9);
    b.box(w+.4,.17,1.25,0,y-.1,d/2+.35,C.concrete);
    b.box(w+.35,.075,.075,0,y+.95,d/2+.95,C.steel);
    for(let x=-w/2;x<=w/2;x+=.43)b.box(.045,.95,.045,x,y,d/2+.95,C.steel);
    for(const x of [-w/2,w/2])b.box(.07,.95,1.15,x,y,d/2+.4,C.steel);
  }
  for(let y=.8;y<h;y+=.65)b.box(w,.025,.055,0,y,d/2+.03,C.concrete);
  if(v%3===1)b.hip(w+.6,d+.6,1.8,0,h+.22,0,C.roof);
  else{
    b.box(w+.3,.2,d+.3,0,h+.22,0,C.concrete);
    b.cyl(.6,1.15,-1.4,h+.42,-2,C.concrete,10);
    b.box(1.7,.08,2.2,1,h+.65,-1,C.glass,-.28);
  }
}
function house(b,v){
  b.box(8.5,.35,10,0,0,-.5,C.concrete).box(8,3.3,8.8,0,.35,-1,paints[v%paints.length]);
  b.hip(9.2,9.8,2,0,3.65,-1,v%2?C.blue:C.roof);
  b.box(2,2.5,.18,0,.35,3.45,C.wood);
  for(const x of [-2.7,2.7])window(b,x,1.05,3.46,1.5,1.5);
  b.box(5.8,.18,2.2,0,2.9,4,C.white);
  for(const x of [-2.6,2.6])b.box(.23,2.8,.23,x,.35,4.8,C.white);
  fence(b,11.5,14);
}
function church(b,v){
  const style=v%3,w=[10,12,11][style],d=[21,23,20][style];
  b.box(w+2,.45,d+2,0,0,0,C.concrete).box(w,8,d,0,.45,0,style===2?0xcbb8a2:C.wall);
  b.hip(w+1,d+1,3,0,8.45,0,style===1?C.blue:C.roof);
  const towers=style===1?[-6.4,6.4]:[0],towerFront=d/2-1;
  for(const x of towers){
    const h=style===1?15:style===0?20:19;
    b.box(3, h,3.7,x,.45,towerFront,C.white);
    b.box(3.4,.35,4.1,x,h-4,towerFront,C.concrete);
    b.box(1.5,2.1,.13,x,h-3.5,towerFront+1.9,C.dark);
    b.add(new THREE.ConeGeometry(2,3,4).rotateY(Math.PI/4),C.roof,x,h+1.95,towerFront);
    b.box(.15,1.5,.15,x,h+3.3,towerFront,C.steel).box(1,.15,.15,x,h+4.1,towerFront,C.steel);
  }
  const front=d/2+.08;
  for(const x of [-3.4,3.4]){
    b.box(2,3.7,.16,x,.45,front,C.wood);
    b.add(new THREE.CircleGeometry(1,12,0,Math.PI),C.glass,x,4.3,front+.12);
  }
  for(let z=-d/2+3;z<d/2-2;z+=4){
    for(const side of [-1,1])b.box(.12,2.8,1.1,side*(w/2+.04),3,z,C.glass);
  }
  b.box(4,.2,2,0,.45,d/2+1.3,C.concrete);
}
function civic(b,school,v){
  const w=school?28:16,d=11,paint=school?0xd8cd9e:paints[v%paints.length];
  b.box(w+2,.35,d+2,0,0,0,C.concrete).box(w,6.8,d,0,.35,0,paint);
  b.hip(w+1,d+1,1.5,0,7.15,0,C.roof);
  for(const y of [1,4.2])for(let x=-w/2+1.7;x<w/2;x+=3.2)window(b,x,y,d/2+.05,1.7,1.8);
  b.box(3.2,2.8,.2,0,.35,d/2+.1,C.dark).box(5,.65,.15,0,3.1,d/2+.2,C.blue);
  for(const x of [-2.5,2.5])b.box(.3,3,.3,x,.35,d/2+1,C.white);
  b.box(6,.2,2,0,3.35,d/2+.5,C.concrete);
}
function arch(b,v){
  for(const x of [-3.7,3.7])b.box(.9,5,.9,x,0,0,v%2?C.wall:C.white);
  b.box(8.6,1,.9,0,4.7,0,C.white).box(6.6,.7,.08,0,4.85,.5,C.blue);
  b.hip(9,2.2,.6,0,5.7,0,C.roof);
}
function warehouse(b,kind,v){
  const mill=kind==='mill',w=mill?20:10,d=mill?25:14,h=mill?8:6.5;
  b.box(w+1,.4,d+1,0,0,0,C.concrete).box(w,h,d,0,.4,0,v%2?0xb4bbb5:0xc5c1b5);
  b.hip(w+1,d+1,2.2,0,h+.4,0,C.steel);
  for(const x of [-w*.28,w*.28])b.box(w*.25,4,.1,x,.4,d/2+.06,C.dark);
  for(let x=-w/2;x<=w/2;x+=2)b.box(.06,h,.08,x,.4,d/2+.08,C.white);
  if(!mill){
    b.cyl(.48,17,-w/2-1.2,0,-d/3,C.steel,8);
    b.box(1.8,3,2,-w/2-1.2,0,-d/3,C.concrete);
    b.cyl(.18,6,0,4,-d/2-1,C.steel,6,Math.PI/2);
  }else{
    b.box(4,10,4,-w/2+2,.4,-d/2+2,C.concrete);
    b.box(4,1,9,-w/2+2,5,-d/2-2,C.steel,.24);
  }
}
function silo(b,v){
  for(const x of [-2.8,2.8]){
    for(const dx of [-1.3,1.3])for(const z of [-1.3,1.3])b.box(.18,2,.18,x+dx,0,z,C.steel);
    b.cyl(2.1,8.5,x,2,0,v%2?C.white:C.concrete,12);
    b.add(new THREE.ConeGeometry(2.15,2,12),C.steel,x,11.5,0);
    for(let y=3;y<10;y+=1.2)b.add(new THREE.TorusGeometry(2.12,.035,3,12),C.steel,x,y,0,Math.PI/2);
  }
  for(const x of [-.3,.3])b.box(.05,10,.05,x,0,2.3,C.steel);
  for(let y=.4;y<10;y+=.4)b.box(.6,.045,.045,0,y,2.3,C.steel);
  b.box(10,.15,.8,0,10.1,2.1,C.steel);
}
function bts(b){
  const levels=7,h=28;
  for(let level=0;level<levels;level++){
    const y=level*h/levels,y1=(level+1)*h/levels,r=2.3-level*.26,r1=2.3-(level+1)*.26;
    for(let side=0;side<3;side++){
      const a=side*Math.PI*2/3,c=(side+1)*Math.PI*2/3;
      const A=[Math.sin(a)*r,y,Math.cos(a)*r],B=[Math.sin(a)*r1,y1,Math.cos(a)*r1];
      const D=[Math.sin(c)*r,y,Math.cos(c)*r],E=[Math.sin(c)*r1,y1,Math.cos(c)*r1];
      b.beam(A,B,.07).beam(A,E,.035).beam(D,B,.035).beam(B,E,.045);
    }
  }
  for(const a of [0,Math.PI*2/3,Math.PI*4/3])b.box(.45,2.3,.24,Math.sin(a)*.9,25,Math.cos(a)*.9,C.white,0,a);
  b.cyl(.045,3,0,28,0,C.steel,5).box(2.5,2.4,2.5,0,0,0,C.concrete);
  b.add(new THREE.SphereGeometry(.65,8,5,0,Math.PI),C.white,1.4,19,0,0,Math.PI/2);
}
function bridge(b,options){
  const {length:l,width:w}=bridgeSize(options),deck=1.4;
  b.box(l,.26,w,0,deck-.26,0,C.concrete);
  for(const z of [-w*.32,0,w*.32])b.box(l-.6,.45,.25,0,deck-.71,z,C.steel);
  for(const x of [-l/2+.55,l/2-.55])b.box(.85,deck-.26,w+.3,x,0,0,C.concrete);
  for(const side of [-1,1]){
    const z=side*(w/2+.07);
    for(const y of [deck+.45,deck+1.05])b.box(l,.1,.12,0,y,z,C.white);
    const n=Math.ceil(l/2);
    for(let i=0;i<=n;i++)b.box(.14,1.2,.16,-l/2+.07+i*(l-.14)/n,deck,z,i%2?C.white:C.concrete);
  }
}
function streetlight(b,v){
  b.box(.6,.16,.6,0,0,0,C.concrete).cyl(.1,5.7,0,.16,0,C.steel,7);
  b.beam([0,5.5,0],[0,6.2,1.7],.075).box(.45,.15,.8,0,6.1,1.7,C.white);
  if(v%2)b.box(1.6,.07,1.2,0,5.75,-.3,C.glass,-.4);
}
function wheel(b,x,z,r=.36,y=r){
  b.add(new THREE.CylinderGeometry(r,r,.2,12,1),C.dark,x,y,z,0,0,Math.PI/2);
  b.add(new THREE.CylinderGeometry(r*.48,r*.48,.215,8,1),C.concrete,x,y,z,0,0,Math.PI/2);
}
function vehicle(b,kind,v){
  const color=paints[(v+2)%paints.length];
  if(kind==='car'){
    b.box(1.75,.65,4.3,0,.35,0,color).box(1.5,.65,2.1,0,.95,-.15,color);
    b.box(1.35,.4,.08,0,1.07,.93,C.glass).box(1.35,.4,.08,0,1.07,-1.23,C.glass);
    for(const x of [-.86,.86]){for(const z of [-1.4,1.3])wheel(b,x,z,.34);b.box(.04,.4,1.75,x,1.07,-.12,C.glass);}
    for(const x of [-.55,.55])b.box(.4,.18,.08,x,.65,2.18,C.white);
  }else if(kind==='tricycle'){
    b.box(1.9,.18,2.6,0,.52,-.65,C.steel).box(1.9,.65,.12,0,.7,-1.95,C.wood);
    for(const x of [-.9,.9])b.box(.1,.65,2.6,x,.7,-.65,C.wood);
    wheel(b,0,1.65,.34);for(const x of [-.96,.96])wheel(b,x,-1.15,.34);
    b.box(1.15,.14,1.3,0,1.8,1,C.blue).beam([-.5,.6,.6],[-.5,1.8,.6],.04).beam([.5,.6,.6],[.5,1.8,.6],.04);
    b.beam([0,.65,.55],[0,1.1,1.45],.07).beam([0,1.1,1.45],[0,.34,1.65],.06);
    b.beam([-.4,1.1,1.45],[.4,1.1,1.45],.04);
  }else if(kind==='bus'){
    b.box(2.4,2.45,10.6,0,.5,0,color).box(2.3,.22,10.3,0,2.95,0,C.white);
    for(const x of [-1.21,1.21]){
      b.box(.05,.2,10.1,x,1,0,C.blue);
      for(let z=-4.4;z<4.6;z+=1.25)b.box(.055,.95,.95,x,1.75,z,C.glass);
      for(const z of [-3.4,3.3])wheel(b,x,z,.46);
    }
    b.box(2.05,1.2,.08,0,1.6,5.34,C.glass);
  }else{
    const container=kind==='container_truck',length=container?15.6:7.8,front=length/2;
    b.box(2.35,.35,length-.2,0,.65,0,C.steel).box(2.35,2.5,2.4,0,.95,front-1.25,color);
    b.box(2.05,.85,.07,0,2.1,front-.01,C.glass);
    for(const x of [-1.15,1.15])for(const z of container?[front-1.3,-3.9,-5.4,-6.9]:[front-1.3,-2.3])wheel(b,x,z,.46);
    const cargoLength=length-3.2,center=-1.4;
    b.box(2.4,container?2.9:1.1,cargoLength,0,1.1,center,container?C.blue:C.wood);
    if(container){
      for(let z=center-cargoLength/2+.2;z<center+cargoLength/2;z+=.65)for(const x of [-1.23,1.23])b.box(.055,2.8,.06,x,1.15,z,C.concrete);
    }else for(const x of [-.65,.65])for(const z of [-2.7,-1.5,-.3])b.box(.9,.55,.9,x,2.2,z,C.grain);
  }
}
function sluice(b,gate){
  if(gate){
    b.box(6,2.8,.22,0,0,0,C.steel);
    for(const x of [-2.5,-1.25,0,1.25,2.5])b.box(.13,2.8,.37,x,0,0,C.dark);
    for(const y of [.15,1.35,2.6])b.box(6,.12,.4,0,y,0,C.concrete);
  }else{
    for(const x of [-3.8,3.8])b.box(.8,5.8,2,x,0,0,C.concrete);
    b.box(8.5,.6,2,0,5.2,0,C.concrete).box(8.5,.22,2.8,0,3.5,0,C.concrete);
    for(const z of [-1.3,1.3])b.box(8,.08,.08,0,4.5,z,C.steel);
    for(const x of [-2,2])b.cyl(.055,5.5,x,.3,0,C.steel,5);
    b.box(2.3,.55,.9,0,5.8,0,C.steel);
  }
}
function pumpOutlet(b){
  b.cyl(.32,1.35,0,0,-.65,C.steel,10);
  b.add(new THREE.TorusGeometry(.65,.32,6,8,Math.PI/2),C.steel,0,1.35,0,0,Math.PI/2);
  b.add(new THREE.CylinderGeometry(.32,.32,2,10,1),C.steel,0,2,1,Math.PI/2);
  b.add(new THREE.CircleGeometry(.26,10),C.dark,0,2,2.01);
  for(const x of [-.55,.55])b.box(.12,1.8,.12,x,0,1.2,C.concrete);
}

/** Returns owned merged indexed position/normal/color geometry. variant is a
 * stable integer seed; streetlight odd variants have solar panels. Bridge accepts
 * {length,width}; defaults14×5 m, local+X span and userData.dimensions.deckY=1.4. */
export function buildInfrastructureGeometry(kind,variant=0,options={}){
  const requestedKind=kind;
  if(kind==='solar_light')variant=variantNumber(variant)*2+1;
  kind=aliases[kind]||kind;
  const v=variantNumber(variant),dimensions=infrastructureDimensions(kind,v,options),b=new Builder();
  switch(kind){
    case 'shophouse':shophouse(b,v);break;
    case 'house':house(b,v);break;
    case 'field_hut':
      for(const x of [-1.7,1.7])for(const z of [-2,2])b.box(.15,2.5,.15,x,0,z,C.wood);
      b.box(3.8,.16,4.5,0,.6,0,C.wood).hip(4.5,5.4,1.2,0,2.5,0,v%2?C.steel:C.roof);break;
    case 'church':church(b,v);break;
    case 'civic':civic(b,false,v);break;
    case 'school':civic(b,true,v);break;
    case 'arch':arch(b,v);break;
    case 'dryer':case 'mill':warehouse(b,kind,v);break;
    case 'silo':silo(b,v);break;
    case 'bts':bts(b);break;
    case 'bridge':bridge(b,options);break;
    case 'streetlight':streetlight(b,v);break;
    case 'car':case 'truck':case 'container_truck':case 'bus':case 'tricycle':vehicle(b,kind,v);break;
    case 'sluice_frame':sluice(b,false);break;
    case 'sluice_gate':sluice(b,true);break;
    case 'pump_outlet':pumpOutlet(b);break;
  }
  return b.finish(requestedKind,v,dimensions);
}
