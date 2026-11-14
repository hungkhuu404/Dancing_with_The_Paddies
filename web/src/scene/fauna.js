// Small illustrative fauna. Animation is in the vertex shader, so streaming
// neighbours do not add CPU simulations or allocate vectors every frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patch } from './shaderlib.js';
import { terrainHeight } from './land.js';
import { centroid } from '../data/parcels.js';
function ball(x,y,z,sx,sy,sz,color){const g=new THREE.SphereGeometry(1,5,3).scale(sx,sy,sz).translate(x,y,z).toNonIndexed(),c=new THREE.Color(color),data=new Float32Array(g.attributes.position.count*3);for(let i=0;i<data.length;i+=3){data[i]=c.r;data[i+1]=c.g;data[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(data,3));return g;}
function shape(kind){
  let parts;
  if(kind==='chicken')parts=[ball(0,.3,0,.18,.2,.28,0x8a6d43),ball(0,.52,.18,.1,.12,.1,0x9c7944),ball(0,.65,.2,.025,.05,.05,0xa33d2d),ball(-.08,.09,0,.025,.1,.025,0x9f8b4c),ball(.08,.09,0,.025,.1,.025,0x9f8b4c)];
  else if(kind==='snake'){parts=[];for(let i=0;i<9;i++)parts.push(ball(Math.sin(i*.8)*.09,0,i*.1,.045,.025,.075,0x555c36));}
  else parts=[ball(0,0,0,.065,.07,.16,kind==='myna'?0x343c30:0x76634e),ball(0,.05,.12,.055,.06,.06,0x605a46),ball(-.16,0,0,.17,.016,.055,0x5b5749),ball(.16,0,0,.17,.016,.055,0x5b5749)];
  const merged=mergeGeometries(parts);parts.forEach(p=>p.dispose());return merged;
}
export function createFauna(layout,quality,reduced,props={}){
  const group=new THREE.Group();group.name='illustrative_fauna';const d=new THREE.Object3D(),low=quality.tier==='low',roost=props.veg?.find(v=>v.kind==='tram');
  for(const kind of ['sparrow','myna','chicken','snake']){
    const bird=kind==='sparrow'||kind==='myna';
    const source=bird?layout.parcels:kind==='chicken'?layout.houses:layout.canals;
    const count=Math.min(source.length,low?(bird?5:4):(bird?16:12));if(!count)continue;
    const geo=shape(kind),attrs=new Float32Array(count);geo.setAttribute('aFauna',new THREE.InstancedBufferAttribute(attrs,1));
    const mat=patch(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}),{
      key:'smallFauna'+kind+(reduced?'still':''),radar:'.35',
      uniforms:{uRoost:{value:new THREE.Vector2(roost?.x||0,roost?.z||0)},uHasRoost:{value:roost?1:0}},
      vertexPre:'attribute float aFauna; uniform vec2 uRoost; uniform float uHasRoost;',
      vertexMain:bird?`float time=${reduced?'0.':'uTime'};
        float dusk=smoothstep(.05,.55,uNight)*uHasRoost;
        transformed.y+=sin(time*13.+aFauna)*abs(transformed.x)*.55;
        vec2 drift=vec2(sin(time*.45+aFauna),cos(time*.45+aFauna))*6.;
        transformed.xz+=mix(drift,uRoost-instanceMatrix[3].xz,dusk);
        transformed.y+=mix(sin(time*.6+aFauna)*1.1,1.,dusk);`
        :kind==='chicken'?`float time=${reduced?'0.':'uTime'};transformed.x+=sin(time*.3+aFauna)*.8;transformed.z+=cos(time*.3+aFauna)*.8;transformed.y+=abs(sin(time*4.+aFauna))*.025;`
        :`float time=${reduced?'0.':'uTime'};transformed.x+=sin(time*2.+transformed.z*10.+aFauna)*.06;`,
    });
    const mesh=new THREE.InstancedMesh(geo,mat,count);mesh.name=kind;mesh.frustumCulled=false;
    for(let i=0;i<count;i++){
      const p=source[i],c=bird?centroid(p.poly):kind==='snake'?p.points[Math.floor(p.points.length/2)]:[p.x+4,p.z+5];
      attrs[i]=i*2.399;d.position.set(c[0],bird?7:kind==='snake'?.035:terrainHeight(layout,c[0],c[1]),c[1]);d.rotation.set(0,bird?0:i*2.399,0);d.scale.setScalar(1);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);
    }group.add(mesh);
  }
  return group;
}
