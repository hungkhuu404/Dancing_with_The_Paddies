/** Decode completes before this call; explicitly upload every model/atlas texture
 * while loading instead of waiting for the first species/material encounter. */
export async function uploadMaterialTextures(renderer,roots,extraTextures=[],yieldFrame=()=>new Promise(requestAnimationFrame)){
  const textures=new Set(extraTextures);
  function materialTextures(material){
    for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    for(const uniform of Object.values(material.uniforms||{}))if(uniform.value?.isTexture)textures.add(uniform.value);
  }
  for(const root of roots)root?.traverse(object=>{
    if(Array.isArray(object.material))for(const material of object.material)materialTextures(material);
    else if(object.material)materialTextures(object.material);
  });
  let count=0,slice=performance.now();
  for(const texture of textures){
    if(!texture?.isTexture||texture.isRenderTargetTexture)continue;
    renderer.initTexture(texture);count++;
    if(performance.now()-slice>8){await yieldFrame();slice=performance.now();}
  }
  return count;
}
