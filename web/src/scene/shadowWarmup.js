// compileAsync compiles visible materials, not WebGLShadowMap's depth variants.
// Those otherwise link synchronously the first time another tile casts a shadow.
// Keep this projection aligned with Three r186 WebGLShadowMap.getDepthMaterial.
import * as THREE from 'three';

export function shadowVariant(source) {
  const sides = { [THREE.FrontSide]:THREE.BackSide, [THREE.BackSide]:THREE.FrontSide, [THREE.DoubleSide]:THREE.DoubleSide };
  return {
    side:source.shadowSide!=null?source.shadowSide:sides[source.side],
    map:source.map||null, alphaMap:source.alphaMap||null,
    alphaTest:source.alphaToCoverage===true?.5:source.alphaTest||0,
    displacementMap:source.displacementMap||null,
    displacementScale:source.displacementScale??1, displacementBias:source.displacementBias??0,
    clippingPlanes:source.clippingPlanes||null, clipShadows:source.clipShadows||false,
    clipIntersection:source.clipIntersection||false, wireframe:source.wireframe||false,
  };
}

const depthMaterials=new Map(),identities=new WeakMap();
let identityCounter=0;
function identity(value){
  if(!value)return null;
  if(value.uuid)return value.uuid;
  if(!identities.has(value))identities.set(value,++identityCounter);
  return identities.get(value);
}
/** Equal shader inputs share one retained material even when a tile creates a
 * fresh source material. No source material or tile object is retained. */
export function shadowVariantKey(source){
  const v=shadowVariant(source);
  return JSON.stringify([v.side,identity(v.map),identity(v.alphaMap),v.alphaTest,
    identity(v.displacementMap),v.displacementScale,v.displacementBias,
    identity(v.clippingPlanes),v.clipShadows,v.clipIntersection,v.wireframe]);
}
function depthFor(source) {
  const key=shadowVariantKey(source);
  let depth=depthMaterials.get(key);
  if(!depth){depth=new THREE.MeshDepthMaterial(shadowVariant(source));depthMaterials.set(key,depth);}
  return depth;
}

export async function warmShadowPrograms(renderer,root,camera,scene,renderTarget) {
  if(!renderer.compileAsync||!renderer.shadowMap.enabled)return;
  const objects=[],saved=[];
  root.traverse(object=>{
    if(!object.isMesh||!(object.castShadow||object.userData.cast))return;
    objects.push(object);saved.push([object,object.material]);
  });
  if(!objects.length)return;
  const group=new THREE.Group();
  // References only: no reparenting, transforms, geometry, instancing or skinning
  // flags change. The real render can continue while linking happens in parallel.
  group.children=objects;
  const lighting=new THREE.Scene();
  scene.traverseVisible(o=>{if(o.isLight)lighting.children.push(o);});
  // ShadowMap.renderBufferDirect uses an empty scene (no fog/environment).
  // Preserve the real light counts, but not the main pass's fog program key.
  const oldTarget=renderer.getRenderTarget();
  let pending;
  try {
    for(const [object,source]of saved)object.material=object.customDepthMaterial||(Array.isArray(source)?source.map(depthFor):depthFor(source));
    renderer.setRenderTarget(renderTarget);
    pending=renderer.compileAsync(group,camera,lighting);
  } finally {
    // compileAsync gathers materials synchronously. Restore before its Promise
    // yields so no frame can accidentally draw with a temporary depth material.
    for(const [object,source]of saved)object.material=source;
    renderer.setRenderTarget(oldTarget);
  }
  try{await pending;}catch(error){console.warn('shadow warmup unavailable; render will compile',error);}
}
