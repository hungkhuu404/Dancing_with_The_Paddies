// Multi-view baked silhouettes of our existing models. Two triangles per tree,
// shared textures/materials per species; no runtime render-to-texture stalls.
import * as THREE from 'three';
import { U } from './shaderlib.js';
import { impostorLayout } from './impostorView.js';
const entries = new Map();
export async function loadImpostors(base,extra) {
  try {
    const response = await fetch(base + 'impostors/index.json');
    if (!response.ok) return;
    const info = await response.json(), loader = new THREE.TextureLoader();
    const paths=Object.fromEntries(Object.keys(info).map(k=>[k,'impostors/']));
    if(extra){const r=await fetch(base+extra+'index.json');if(r.ok){const more=await r.json();Object.assign(info,more);for(const key of Object.keys(more))paths[key]=extra;}}
    await Promise.all(Object.entries(info).map(async ([name, meta]) => {
      const layout=impostorLayout(meta);
      const texture = await loader.loadAsync(base + `${paths[name]}${name}.png`);
      texture.colorSpace = THREE.SRGBColorSpace;
      const geometry = new THREE.PlaneGeometry(meta.span, meta.span);
      const material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAtlas:{value:texture}, uCenterY:{value:meta.center},uElevationSplit:{value:layout.splitRadians} }]),
        fog:true, side:THREE.DoubleSide,
        vertexShader:`uniform float uCenterY; uniform float uElevationSplit; varying vec2 vUv; varying vec2 vCell;
          #include <fog_pars_vertex>
          void main(){
            vec4 center = modelMatrix * instanceMatrix * vec4(0., uCenterY, 0., 1.);
            vec3 delta = cameraPosition-center.xyz;
            float yaw = atan(instanceMatrix[2].x, instanceMatrix[2].z);
            float az = atan(delta.x,delta.z)-yaw;
            float col = mod(floor(az/6.2831853*8.+.5)+16.,8.);
            float elev = atan(delta.y,length(delta.xz));
            vCell=vec2(col,step(uElevationSplit,elev)); vUv=uv;
            float scale=length(instanceMatrix[0].xyz);
            vec4 mvPosition=viewMatrix*center;
            mvPosition.xy+=position.xy*scale;
            gl_Position=projectionMatrix*mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader:`uniform sampler2D uAtlas; uniform float uNight; uniform float uRadarMode; varying vec2 vUv; varying vec2 vCell;
          #include <fog_pars_fragment>
          void main(){
            vec4 texel=texture2D(uAtlas,(clamp(vUv,.006,.994)+vCell)/vec2(8.,2.));
            if(texel.a<.45)discard;
            vec3 color=texel.rgb*mix(1.,.07,uNight);
            color=mix(color,vec3(.36),uRadarMode);
            gl_FragColor=vec4(color,1.);
            #include <fog_fragment>
          }`,
      });
      material.uniforms.uNight = U.uNight; material.uniforms.uRadarMode = U.uRadarMode;
      entries.set(name,{geometry,material});
    }));
  } catch (err) { console.warn('tree impostors unavailable; using procedural LOD',err); }
}
export function treeImpostor(name) { return entries.get(name); }
export function impostorTextures(){return [...entries.values()].map(entry=>entry.material.uniforms.uAtlas.value);}
