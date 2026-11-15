import {siteProfile} from '../data/siteRules.js';
// Source-backed infrastructure plus explicitly illustrative buildings, traffic and irrigation.
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {patch,U} from '../scene/shaderlib.js';
import {H} from '../scene/land.js';
import {centroid} from '../data/parcels.js';
import {buildInfrastructureGeometry} from './infrastructureShapes.js';
import {tileInfrastructure} from './infrastructurePlacement.js';
import {roadClass,spacedAlong,nearestOnLine,ownedByTile,gateEvent,gateOpening,irrigationDelay,infrastructureVariant} from './infrastructureRules.js';
const geometryCache=new Map();
function geometry(kind,v=0){const key=kind+v;if(!geometryCache.has(key))geometryCache.set(key,buildInfrastructureGeometry(kind,v));return geometryCache.get(key).clone();}
function material(){return patch(new THREE.MeshStandardMaterial({vertexColors:true,color:0xa2aaa0,roughness:.86}),{key:'infrastructure',radar:'.9'});}
function pool(parent,name,geo,items,mat,dynamic=false){
  const mesh=new THREE.InstancedMesh(geo,mat,Math.max(1,items.length)),d=new THREE.Object3D();mesh.name=name;mesh.count=items.length;mesh.castShadow=!dynamic&&!mat.transparent;mesh.receiveShadow=true;if(dynamic)mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  items.forEach((p,i)=>{d.position.set(p.x,p.y??1.1,p.z);d.rotation.set(0,p.rot||0,0);d.scale.set(p.sx||1,p.sy||1,p.sz||1);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();if(dynamic)mesh.frustumCulled=false;parent.add(mesh);return mesh;
}
function sign(parent,text,x,y,z,rot,width=8,posts=false){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#EEF0EC';c.fillRect(0,0,512,128);c.fillStyle='#1B211F';c.font='600 36px "IBM Plex Sans"';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,64,490);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(textSignGeometry(width,width/4),new THREE.MeshStandardMaterial({map:tex,color:0xb5bab0,roughness:.9}));mesh.position.set(x,y,z);mesh.rotation.y=rot;mesh.name='name:'+text;parent.add(mesh);
  if(posts){const height=Math.max(.3,y-width/8-1.06),geo=new THREE.BoxGeometry(.08,height,.08),mat=new THREE.MeshStandardMaterial({color:0x59615e,roughness:.8});for(const side of [-1,1]){const pole=new THREE.Mesh(geo.clone(),mat);pole.position.set(x+side*width*.4*Math.cos(rot),1.06+height/2,z-side*width*.4*Math.sin(rot));parent.add(pole);}geo.dispose();}
  return mesh;
}
export function createInfrastructure(ctx,source){
  const profile=ctx.profile||siteProfile(),classify=tags=>roadClass(tags,profile.roads);
  const low=ctx.quality.tier==='low',group=new THREE.Group();group.name='infrastructure';
  const [cx,cz]=ctx.centre,data=tileInfrastructure(ctx.layout,ctx.props,source,cx,cz,low,profile),mat=material(),dummy=new THREE.Object3D();
  const add=(kind,items,v=0)=>items.length?pool(group,kind,geometry(kind,v),items,mat):null;
  const bridgeItems=data.bridges.map(p=>({...p,y:-.34,sx:Math.max(10,p.len)/14,sz:Math.min(2,(classify(p.tags).width||4)/5)}));
  const bridgeMesh=add('bridge',bridgeItems);
  for(const p of bridgeItems)if(p.name)sign(group,p.name,p.x+Math.sin(p.rot)*3.3,3.2,p.z+Math.cos(p.rot)*3.3,p.rot,Math.min(6.5,Math.max(4.5,p.name.length*.18)),true);
  const markings=[];for(const r of ctx.layout.roads)if(classify(r).surface==='asphalt')for(const p of spacedAlong(r.points,12,0,100))if(ownedByTile(p.x,p.z,cx,cz))markings.push({...p,y:1.08,sx:.12,sz:4});
  if(markings.length)pool(group,'road_markings',new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),markings,new THREE.MeshStandardMaterial({color:0xeef0ec,roughness:1}));
  const arches=[];for(const p of profile.architecture.arch_prefix?source.places||[]:[]){if(!ownedByTile(p.x,p.z,cx,cz))continue;let best=null;for(const r of ctx.layout.roads){if(classify(r).surface==='earth')continue;const q=nearestOnLine(p.x,p.z,r.points);if(q.d<250&&(!best||q.d<best.d))best=q;}if(best){arches.push({x:best.x,z:best.z,rot:best.rot,y:1.06});sign(group,profile.architecture.arch_prefix+p.name,best.x,6.2,best.z,best.rot,8);}}
  add('arch',arches);
  const buildingMeshes=[];
  for(const kind of ['church','school','civic','clinic','community','market','worship','silo','mill','pump','bts','transformer']){
    const items=data.buildings.filter(p=>p.kind===kind).map(p=>({...p,y:ctx.groundAt(p.x,p.z)+.02}));
    if(!items.length)continue;
    for(let v=0;v<3;v++){const batch=items.filter(p=>infrastructureVariant(p.osm_id)===v),shape=kind==='church'?'church':kind==='school'?'school':['silo','mill','pump','bts'].includes(kind)?kind:'civic';const mesh=kind==='worship'&&profile.identity?null:add(shape,batch,v);if(mesh)buildingMeshes.push(mesh);}
    for(const p of items)if(p.name){const front=kind==='church'?[21,23,20][infrastructureVariant(p.osm_id)]/2+1.4:6.5;sign(group,p.name,p.x+Math.sin(p.rot)*front,p.y+(kind==='church'?6:3),p.z+Math.cos(p.rot)*front,p.rot,8);}
  }
  for(let v=0;v<3;v++)for(const kind of ['shophouse','modern_house'])add(kind,data.houses.filter(p=>p.kind===kind&&p.variant===v).map(p=>({...p,y:ctx.terrainAt(p.x,p.z)+.05})),v);
  const shopNames=['GROCERY','REPAIR SHOP','COFFEE','PHARMACY','GOLD SHOP'];
  data.houses.filter(h=>h.kind==='shophouse').slice(0,low?2:5).forEach((h,i)=>{const a=h.rot||0,s=h.sx||1;sign(group,shopNames[i%5],h.x+Math.sin(a)*4.96*s,ctx.terrainAt(h.x,h.z)+2.98*s,h.z+Math.cos(a)*4.96*s,a,4.3*s);});
  const solarItems=data.solar.map(p=>({...p,y:ctx.groundAt(p.x,p.z)+.02}));add('solar_light',solarItems);
  const watchHuts=ctx.layout.parcels.filter((p,i)=>i%80===0).slice(0,low?1:3).map(p=>{const q=p.poly[0];return {x:q[0],z:q[1],y:H.dry,rot:0,sx:.7,sy:.7,sz:.7};});add('fieldhut',watchHuts);
  if(data.houses.length>35){const h=data.houses[0];add('bts',[{x:h.x+12,z:h.z+12,y:ctx.groundAt(h.x+12,h.z+12),sx:.6,sy:.7,sz:.6}]);}
  const lights=solarItems.map(p=>({...p,y:p.y+6.1}));
  const glowMat=new THREE.MeshBasicMaterial({color:0xffdfad,transparent:true,opacity:0});
  const windows=[];
  for(const h of data.houses){const a=h.rot||0,s=h.sx||1,front=h.kind==='shophouse'?4.81:3.48;windows.push({x:h.x+Math.sin(a)*front*s,z:h.z+Math.cos(a)*front*s,y:ctx.terrainAt(h.x,h.z)+1.8*s,rot:a,sx:1.2*s,sy:1.1*s});}
  for(const p of data.buildings){const a=p.rot||0,base=ctx.groundAt(p.x,p.z)+.02;if(p.kind==='church'){const front=[21,23,20][infrastructureVariant(p.osm_id)]/2+.24;for(const side of [-1,1])windows.push({x:p.x+Math.sin(a)*front+Math.cos(a)*3.4*side,z:p.z+Math.cos(a)*front-Math.sin(a)*3.4*side,y:base+4.7,rot:a,sx:1.2,sy:.8});}else windows.push({x:p.x+Math.sin(a)*(profile.identity&&p.kind==='worship'?6.12:5.7),z:p.z+Math.cos(a)*(profile.identity&&p.kind==='worship'?6.12:5.7),y:base+(profile.identity&&p.kind==='worship'?2.9:2),rot:a,sx:2,sy:1.3});}
  for(const p of ctx.props.moored_boats.slice(0,low?2:5))lights.push({x:p.x,z:p.z,y:.8,sx:.65,sy:.65,sz:.65});
  const windowMesh=pool(group,'night_windows',new THREE.PlaneGeometry(1,1),windows,glowMat);
  const bulbs=pool(group,'solar_bulbs',new THREE.SphereGeometry(.24,5,3),lights,glowMat);
  add('dryer',data.production.filter(p=>p.kind==='dryer').map(p=>({...p,y:ctx.groundAt(p.x,p.z)})));
  add('silo',data.production.filter(p=>p.kind==='silo').map(p=>({...p,y:ctx.groundAt(p.x,p.z)})));
  const gates=data.gates.map(g=>({...g,y:-1.2,event:null,start:-100,index:-1,parcel:-1}));
  const frames=add('sluice_frame',gates),gatesMesh=gates.length?pool(group,'sluice_gate',geometry('sluice_gate'),gates,mat,true):null;
  for(const g of gates){let best=Infinity;ctx.layout.parcels.forEach((p,i)=>{const q=centroid(p.poly),d=Math.hypot(g.x-q[0],g.z-q[1]);if(d<best){best=d;g.parcel=i;}});}
  for(const g of gates)g.parcels=[];
  ctx.layout.parcels.forEach((p,i)=>{const q=centroid(p.poly);let best=null,d=Infinity;for(const g of gates){const n=Math.hypot(g.x-q[0],g.z-q[1]);if(n<d){best=g;d=n;}}if(best)best.parcels.push(i);});
  const foamMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:ctx.reduced?{value:0}:U.uTime},vertexShader:'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'uniform float uTime; varying vec2 vUv; void main(){float edge=1.-smoothstep(.3,.5,abs(vUv.x-.5));float bands=pow(.5+.5*sin(vUv.y*36.-uTime*8.+sin(vUv.x*32.)*2.),7.);float fade=(1.-smoothstep(.4,1.,vUv.y))*smoothstep(0.,.12,vUv.y);gl_FragColor=vec4(mix(vec3(.09,.27,.29),vec3(.86,.88,.82),bands),edge*fade*.5);}'});
  const flow=pool(group,'illustrative_gate_flow',new THREE.PlaneGeometry(5,5).rotateX(-Math.PI/2),gates.map(g=>({...g,y:.04})),foamMat,true);flow.count=0;
  flow.layers.set(1);windowMesh.layers.set(1);bulbs.layers.set(1);
  const pumps=ctx.props.pumps.slice(0,low?2:5).map(g=>({...g,y:ctx.groundAt(g.x,g.z)+.02}));add('pump',pumps);
  const cargo=(ctx.tileWorld?.systems.traffic.movers||[]).filter(a=>a.kind==='cargo').slice(0,low?1:3);
  const straw=pool(group,'straw_cargo',new THREE.BoxGeometry(2.4,1.2,3.2),cargo.map(a=>({x:a.mesh.position.x,z:a.mesh.position.z,y:1.4})),new THREE.MeshStandardMaterial({color:0xc4a166,roughness:1}),true);
  straw.count=0; // Traffic controllers have no pose until their first near-tile update.
  const tarps=[];if(data.houses.length>30)for(const r of ctx.layout.roads){if(r.kind!=='residential'||(r.width_m||4)<4)continue;const p=spacedAlong(r.points,250,(r.width_m||4)/2-.75,1)[0];if(p&&ownedByTile(p.x,p.z,cx,cz)){tarps.push({...p,y:1.085,sx:1.3,sz:5});break;}}
  const tarpMesh=pool(group,'illustrative_grain_drying',new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),tarps,new THREE.MeshStandardMaterial({color:0xedb65a,roughness:1}));
  // Small equipment/roof changes are illustrative, not factual property inventories.
  const extras=data.houses.filter((p,i)=>i%7===0).map(p=>({x:p.x+2,z:p.z,y:ctx.terrainAt(p.x,p.z)+5,sx:.5,sy:.3,sz:.5}));
  if(extras.length)pool(group,'water_tanks',new THREE.CylinderGeometry(.65,.65,1.4,8),extras,new THREE.MeshStandardMaterial({color:0xa5aaa7,metalness:.8,roughness:.3}));
  const actors=[];
  const roads=ctx.layout.roads.filter(r=>classify(r).surface==='asphalt');
  for(const r of roads.slice(0,low?2:5)){const points=r.points,L=points.reduce((s,p,i)=>i?s+Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]):s,0);if(L<25)continue;for(let i=0;i<(low?1:4);i++)actors.push({points,L,d:L*(i+.3)/4,speed:i===3?4:7+i*2,kind:['car','truck','bus','tricycle'][i%4]});}
  const traffic=new Map();for(const kind of ['car','truck','bus','tricycle']){const list=actors.filter(a=>a.kind===kind);if(list.length)traffic.set(kind,{list,mesh:pool(group,kind,geometry(kind),list.map(()=>({x:cx,y:1.08,z:cz})),mat,true)});}
  let lastPass=-1;
  function setPass(index,instant=false,now=0){if(index===lastPass)return;lastPass=index;for(const g of gates){g.index=index;g.event=null;if(!instant)for(const i of g.parcels){const event=gateEvent(ctx.layout.parcels[i].s,index);if(event==='inflow'){g.event=event;break;}if(event)g.event=event;}g.start=now;}}
  function update(dt,t,cam){
    const night=U.uNight.value;glowMat.opacity=night*.85;windowMesh.visible=bulbs.visible=night>.01&&U.uRadarMode.value<.5;
    const near=Math.hypot(cam.x-cx,cam.z-cz)<1600;flow.count=0;
    tarpMesh.visible=U.uWet.value<.1&&U.uRain.value.w<.1;
    updateCargoLoad(straw,cargo,dummy,ctx.tileWorld.group.visible);
    for(let i=0;i<gates.length;i++){const g=gates[i],open=gateOpening(g.event,t-g.start,ctx.reduced);dummy.position.set(g.x,g.y+open*2.6,g.z);dummy.rotation.set(0,g.rot||0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();gatesMesh?.setMatrixAt(i,dummy.matrix);if(open>.02&&near){dummy.position.y=.035;dummy.scale.set(1,1,open*(ctx.reduced?1:.85+.15*Math.sin(t*6)));dummy.updateMatrix();flow.setMatrixAt(flow.count++,dummy.matrix);}}
    if(gatesMesh){gatesMesh.instanceMatrix.needsUpdate=true;flow.instanceMatrix.needsUpdate=true;}
    for(const {list,mesh} of traffic.values()){mesh.visible=near;for(let i=0;i<list.length;i++){const a=list[i];if(!ctx.reduced)a.d=(a.d+dt*a.speed)%(a.L*2);let d=a.d<a.L?a.d:a.L*2-a.d,turn=a.d>=a.L;for(let j=1;j<a.points.length;j++){const p=a.points[j-1],q=a.points[j],L=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d>L){d-=L;continue;}const u=L?d/L:0,rot=Math.atan2(q[0]-p[0],q[1]-p[1])+(turn?Math.PI:0);dummy.position.set(p[0]+(q[0]-p[0])*u+Math.cos(rot)*1.5,1.08,p[1]+(q[1]-p[1])*u-Math.sin(rot)*1.5);dummy.rotation.set(0,rot,0);dummy.scale.setScalar(1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);break;}}mesh.instanceMatrix.needsUpdate=true;}
  }
  return {group,data,gates,setPass,update,
    delays(){return Float32Array.from(ctx.layout.parcels,p=>{const c=centroid(p.poly);return irrigationDelay(c[0],c[1],gates);});},
    pick(ray){if(!bridgeMesh||!group.visible)return null;const hit=ray.intersectObject(bridgeMesh,false)[0];return hit?bridgeItems[hit.instanceId]:null;},
    get stats(){return {bridges:data.bridges.length,churches:data.buildings.filter(b=>b.kind==='church').length,houses:data.houses.length,gates:gates.map(g=>({x:g.x,z:g.z,event:g.event,illustrative:g.illustrative,open:gateOpening(g.event,ctx.clock()-g.start,ctx.reduced)})),traffic:actors.length};},
    dispose(){disposeInfrastructure(group);},
  };
}
export function disposeInfrastructure(group){const mats=new Set(),textures=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.isInstancedMesh)o.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){mats.add(m);if(m.map)textures.add(m.map);}});for(const t of textures)t.dispose();for(const m of mats)m.dispose();group.removeFromParent();}
export function updateCargoLoad(straw,cargo,dummy,visible=true){straw.count=0;if(visible)for(let i=0;i<cargo.length;i++){if(cargo[i].heading===null)continue;dummy.position.copy(cargo[i].mesh.position);dummy.position.y+=1.4;dummy.rotation.copy(cargo[i].mesh.rotation);dummy.scale.setScalar(1);dummy.updateMatrix();straw.setMatrixAt(straw.count++,dummy.matrix);}straw.instanceMatrix.needsUpdate=true;}
/** Both sides carry readable text; a DoubleSide plane would mirror the back. */
export function textSignGeometry(width,height){const front=new THREE.PlaneGeometry(width,height),back=front.clone().rotateY(Math.PI),geo=mergeGeometries([front,back]);front.dispose();back.dispose();return geo;}

/** Arterial lamps remain visible when detail tiles unload, with no point lights. */
export function createArterialLights(source,profile=siteProfile()){
  const classify=tags=>roadClass(tags,profile.roads),f=profile.frame,o=profile.origin;
  const group=new THREE.Group();group.name='arterial_lights';const pts=[];
  for(const road of source?.roads||[])if(classify(road.tags).arterial)for(const p of spacedAlong(road.points,40,4.2,250))if(p.x>f.e0-o.utm_e&&p.x<f.e1-o.utm_e&&p.z>o.utm_n-f.n1&&p.z<o.utm_n-f.n0)pts.push({...p,y:1.09,rot:p.rot+Math.PI/2});
  const m=new THREE.MeshBasicMaterial({color:0xedd6ab,transparent:true,opacity:0,depthWrite:false});
  pool(group,'arterial_light_pools',new THREE.CircleGeometry(4.8,9).rotateX(-Math.PI/2),pts.map(p=>({...p,x:p.x+Math.sin(p.rot)*2,z:p.z+Math.cos(p.rot)*2})),m);
  const lampMat=new THREE.MeshBasicMaterial({color:0xeef0ec,transparent:true,opacity:0});pool(group,'arterial_bulbs',new THREE.SphereGeometry(.5,5,3),pts.map(p=>({...p,x:p.x+Math.sin(p.rot)*2.7,z:p.z+Math.cos(p.rot)*2.7,y:7.16})),lampMat);
  const mat=material();pool(group,'arterial_poles',geometry('streetlight'),pts.map(p=>({...p,y:1.06})),mat);
  const neighbours=(source?.buildings||[]).filter(p=>!p.in_commune&&Math.abs(p.x)<14000&&Math.abs(p.z)<14000);
  for(const kind of ['church','school','civic','worship','market','mill','clinic']){const items=neighbours.filter(p=>p.kind===kind).map(p=>({...p,y:.3,sx:kind==='market'?1.5:1,sz:kind==='market'?1.5:1}));if(items.length)pool(group,'neighbour_'+kind,geometry(['church','school','mill'].includes(kind)?kind:'civic'),items,mat);}
  const verts=[],colors=[],banks=[],piers=[];const routes=[];
  for(const r of source?.roads||[]){const cls=classify(r.tags);if(!cls.arterial&&!['trunk','motorway'].includes(r.kind))continue;const height=r.kind==='motorway'?3:1;
    for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i];if(Math.max(Math.abs(a[0]),Math.abs(b[0]))>14000||Math.max(Math.abs(a[1]),Math.abs(b[1]))>14000)continue;const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(!L)continue;const ox=-dz/L*cls.width/2,oz=dx/L*cls.width/2;
      for(const p of [[a[0]+ox,a[1]+oz],[b[0]+ox,b[1]+oz],[a[0]-ox,a[1]-oz],[b[0]+ox,b[1]+oz],[b[0]-ox,b[1]-oz],[a[0]-ox,a[1]-oz]]){verts.push(p[0],height,p[1]);colors.push(.09,.105,.10);}if(r.kind==='motorway'&&L>100&&routes.length<12)routes.push({a,b,L,phase:routes.length*.12,height});
      if(!cls.arterial){
        if(r.tags?.bridge){if(L>12)piers.push({x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,y:.25,sy:height-.25});}
        else{const f=1+(height-.25)*2/(cls.width/2),al=[a[0]+ox,height,a[1]+oz],bl=[b[0]+ox,height,b[1]+oz],alo=[a[0]+ox*f,.25,a[1]+oz*f],blo=[b[0]+ox*f,.25,b[1]+oz*f],ar=[a[0]-ox,height,a[1]-oz],br=[b[0]-ox,height,b[1]-oz],aro=[a[0]-ox*f,.25,a[1]-oz*f],bro=[b[0]-ox*f,.25,b[1]-oz*f];for(const p of [al,alo,bl,bl,alo,blo,ar,br,aro,br,bro,aro])banks.push(...p);}
      }
    }
  }
  if(verts.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const roads=new THREE.Mesh(geo,mat);roads.name='source_major_roads';roads.receiveShadow=true;group.add(roads);}
  if(banks.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(banks,3));const colors=new Float32Array(banks.length);for(let i=0;i<colors.length;i+=3){colors[i]=.13;colors[i+1]=.17;colors[i+2]=.10;}geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.computeVertexNormals();const earth=new THREE.Mesh(geo,mat);earth.name='illustrative_road_embankments';earth.receiveShadow=true;group.add(earth);}
  if(piers.length){const geo=new THREE.BoxGeometry(.9,1,.9).translate(0,.5,0),colors=new Float32Array(geo.attributes.position.count*3).fill(.25);geo.setAttribute('color',new THREE.BufferAttribute(colors,3));pool(group,'illustrative_highway_piers',geo,piers,mat);}
  const trucks=pool(group,'horizon_containers',geometry('container'),routes.map(r=>({x:r.a[0],z:r.a[1],y:r.height+.03})),mat,true),d=new THREE.Object3D();
  return {group,update(t=0,reduced=false){m.opacity=U.uNight.value*.7;lampMat.opacity=U.uNight.value*.95;for(let i=0;i<routes.length;i++){const r=routes[i],u=(r.phase+(reduced?0:t*15/r.L))%1;d.position.set(r.a[0]+(r.b[0]-r.a[0])*u,r.height+.03,r.a[1]+(r.b[1]-r.a[1])*u);d.rotation.set(0,Math.atan2(r.b[0]-r.a[0],r.b[1]-r.a[1]),0);d.updateMatrix();trucks.setMatrixAt(i,d.matrix);}trucks.instanceMatrix.needsUpdate=true;},count:pts.length};
}
