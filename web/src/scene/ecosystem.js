// Illustrative plants/animals, bounded instancing per tile. These are rendering
// recipes, not a remotely sensed species or land-management survey.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patch, U } from './shaderlib.js';
import { terrainHeight } from './land.js';
import { bankPlantings, gardenPlantings, roadsidePlantings, seeded } from './ecologyRules.js';
import { pickParcel, centroid, distToCanals } from '../data/parcels.js';
import { createFauna } from './fauna.js';
function paint(g,color){const c=new THREE.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g.index?g.toNonIndexed():g;}
function sphere(x,y,z,rx,ry,rz,c){return paint(new THREE.SphereGeometry(1,6,4).scale(rx,ry,rz).translate(x,y,z),c);}
function box(x,y,z,sx,sy,sz,c){return paint(new THREE.BoxGeometry(sx,sy,sz).translate(x,y,z),c);}
function plant(kind){
  const parts=[];
  if(kind==='coop'){
    parts.push(box(0,.55,0,1.5,.1,1,0x8c7858),box(0,1.25,0,1.8,.08,1.3,0x6c6556));
    for(const x of [-.7,.7])for(const z of [-.45,.45])parts.push(box(x,.65,z,.05,1.3,.05,0x887454));
    for(let i=0;i<8;i++)parts.push(box(-.7+i*.2,.9,.5,.025,.6,.025,0x817457));
  }else if(kind==='trellis'){
    for(const x of [-1,1])for(const z of [-.7,.7])parts.push(box(x,1,z,.045,2,.045,0x9e8865));
    for(let i=0;i<5;i++){parts.push(box(i*.5-1,2,0,.03,.03,1.6,0x9c8a68));parts.push(sphere(i*.4-.8,2.04,0,.3,.07,.55,0x4e6f35));}
  }else if(kind==='hibiscus'||kind==='bougainvillea'){
    for(let i=0;i<5;i++){parts.push(sphere(i*.4-.8,.65,0,.33,.6,.3,0x49632f));parts.push(sphere(i*.4-.8,.8,i%2?.25:-.25,.09,.07,.08,kind==='hibiscus'?0xba6252:0xb76988));}
  }else if(kind==='morning_glory'||kind==='water_spinach'){
    for(let i=0;i<7;i++){parts.push(sphere(i*.24-.7,.06,Math.sin(i)*.2,.2,.025,.13,0x4b773a));if(kind==='morning_glory'&&i%2===0)parts.push(sphere(i*.24-.7,.12,.2,.06,.035,.06,0x8e84ac));}
  }else if(kind==='vegetables')for(let i=0;i<5;i++)parts.push(sphere(i*.35-.7,.15,0,.2,.12,.36,0x45702d));
  else if(kind==='sedge')for(let i=0;i<4;i++)parts.push(paint(new THREE.PlaneGeometry(.05,.9).translate(i*.1-.15,.45,0).rotateY(i),0x687537));
  else if(kind==='duckweed'){for(let i=0;i<12;i++){const a=i*2.399,r=.3+i*.1;parts.push(sphere(Math.cos(a)*r,0,Math.sin(a)*r,.16,.006,.12,0x789742));}}
  else if(kind==='hyacinth'){
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;parts.push(sphere(Math.cos(a)*.7,.025,Math.sin(a)*.7,.42,.035,.28,0x52792b));}parts.push(sphere(0,.22,0,.1,.18,.1,0x9475a4));
  }else if(kind==='eggs')for(let i=0;i<7;i++)parts.push(sphere((i%3)*.025,.23+Math.floor(i/3)*.025,0,.018,.022,.016,0xd8778b));
  else{
    const tall=['acacia','eucalyptus','dau','tram_bau'].includes(kind),h=tall?7:kind==='papaya'?3.6:kind==='sesbania'?2.3:kind==='jackfruit'?3.8:2.8;
    parts.push(paint(new THREE.CylinderGeometry(.055,.12,h,5).translate(0,h/2,0),0x76634a));
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,r=tall?.7:.5;parts.push(sphere(Math.cos(a)*r,h-(i%2)*.7,Math.sin(a)*r,tall?.7:.65,tall?1.7:.35,tall?.55:.5,kind==='eucalyptus'?0x6b8063:0x48703a));if(kind==='sesbania'||kind==='so_dua')parts.push(sphere(Math.cos(a)*.7,h-.4,Math.sin(a)*.7,.12,.2,.1,kind==='sesbania'?0xe4b73b:0xdedac4));if(kind==='papaya'||kind==='jackfruit')parts.push(sphere(Math.cos(a)*.13,h-.65,Math.sin(a)*.13,kind==='jackfruit'?.16:.1,.23,.13,0x718f39));}
  }const merged=mergeGeometries(parts);for(const g of parts)g.dispose();return merged;
}
const geometries=new Map(),materials=new Map();
export function createEcosystem(layout,land,pickIndex,quality,reduced=false,props={},recipe){
  const group=new THREE.Group();group.name='ecosystem_illustration';
  const low=quality.tier==='low',d=new THREE.Object3D(),random=seeded(710),sets=new Map();
  const localMaterials=[];
  const fauna=createFauna(layout,quality,reduced,props);group.add(fauna);
  fauna.traverse(o=>{if(o.material)localMaterials.push(o.material);});
  const placements=[...bankPlantings(layout.canals,26,low?55:150,recipe),...gardenPlantings(layout.houses,81,low?24:72,recipe),...roadsidePlantings(layout.roads,low?8:24,recipe)];
  const valid=placements.filter(p=>pickParcel(pickIndex,layout.parcels,p.x,p.z)<0&&terrainHeight(layout,p.x,p.z)>=.2);
  for(const p of valid){if(!sets.has(p.kind))sets.set(p.kind,[]);sets.get(p.kind).push(p);}
  for(const [kind,items]of sets){
    if(!geometries.has(kind))geometries.set(kind,plant(kind));
    const key=kind+(reduced?'Still':'');
    if(!materials.has(key))materials.set(key,patch(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,side:THREE.DoubleSide}),{key:'ecosystemPlant',sway:reduced?0:.012,radar:'.36'}));
    const im=new THREE.InstancedMesh(geometries.get(kind).clone(),materials.get(key),items.length);im.name='illustrative_'+kind;im.receiveShadow=true;
    items.forEach((p,i)=>{d.position.set(p.x,terrainHeight(layout,p.x,p.z),p.z);d.rotation.set(0,random()*6.28,0);d.scale.setScalar(p.scale);d.updateMatrix();im.setMatrixAt(i,d.matrix);});im.computeBoundingSphere();group.add(im);
  }
  const candidates=layout.parcels.map((p,i)=>({p,i})).filter(({p})=>p.poly.length>=3).slice(0,low?40:100);
  for(const kind of ['hyacinth','duckweed','eggs']){
    const geo=plant(kind),ids=new Float32Array(candidates.length);geo.setAttribute('aField',new THREE.InstancedBufferAttribute(ids,1));
    const mat=patch(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7}),{key:'ecosystemWet',radar:'.3',uniforms:{uEcology:land.uniforms.uEcology,uState:land.uniforms.uState},vertexPre:'attribute float aField; uniform sampler2D uEcology; uniform sampler2D uState;',vertexMain:'vec3 eco=texelFetch(uEcology,ivec2(int(mod(aField,256.)),int(aField/256.)),0).rgb; float wet=texelFetch(uState,ivec2(int(mod(aField,256.)),int(aField/256.)),0).r; transformed*=eco.b*smoothstep(.5,.9,wet);'});
    const im=new THREE.InstancedMesh(geo,mat,candidates.length);im.name='illustrative_'+kind;
    localMaterials.push(mat);
    candidates.forEach(({p,i},j)=>{ids[j]=i;const c=centroid(p.poly),v=p.poly[0];d.position.set(v[0]*.85+c[0]*.15,.035,v[1]*.85+c[1]*.15);d.rotation.set(0,random()*6.28,0);d.scale.setScalar(kind==='eggs'?1.8:1.5);d.updateMatrix();im.setMatrixAt(j,d.matrix);});im.computeBoundingSphere();group.add(im);
  }
  const insects=valid.slice(0,low?12:36),pos=new Float32Array(insects.length*3);insects.forEach((p,i)=>pos.set([p.x,terrainHeight(layout,p.x,p.z)+1.3,p.z],i*3));
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:reduced?{value:0}:U.uTime,uNight:U.uNight},vertexShader:'uniform float uTime; uniform float uNight; varying float vDay; void main(){vec3 p=position;p.x+=sin(uTime*1.7+position.z)*1.2;p.z+=cos(uTime*1.3+position.x)*1.1;p.y+=sin(uTime*3.+position.x)*.25;vDay=1.-smoothstep(.1,.5,uNight);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(250./-mv.z,1.,4.);}',fragmentShader:'varying float vDay; void main(){vec2 p=abs(gl_PointCoord-.5);float a=max(step(p.x,.08),step(p.y,.09))*(1.-step(.45,max(p.x,p.y)));if(a*vDay<.1)discard;gl_FragColor=vec4(.36,.42,.27,a*vDay);}'});
  localMaterials.push(mat);const flies=new THREE.Points(geo,mat);flies.name='illustrative_dragonflies';group.add(flies);
  return {group,counts:Object.fromEntries([...sets].map(([k,v])=>[k,v.length])),dispose(){group.removeFromParent();for(const mat of localMaterials)mat.dispose();group.traverse(o=>{o.geometry?.dispose();if(o.isInstancedMesh)o.dispose();});}};
}
