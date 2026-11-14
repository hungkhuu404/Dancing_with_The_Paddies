import * as THREE from 'three';

const camera=new THREE.OrthographicCamera();
// N8AO 2.0.1 renders these internal fullscreen triangles; its public scene is
// the world, so compiling that scene alone misses every AO shader.
const names=['depthCopyPass','depthDownsampleQuad','effectShaderQuad','poissonBlurQuad','accumulationQuad','effectCompositerQuad','copyQuad'];
export function warmAoPrograms(renderer,ao,target){
  ao.detectTransparency(); // fixes the compositor variant before compilation
  const oldTarget=renderer.getRenderTarget(),pending=[];
  try{
    renderer.setRenderTarget(target);
    for(const name of names){
      const mesh=ao[name]?._mesh;
      if(mesh)pending.push(renderer.compileAsync(mesh,camera));
    }
  }finally{renderer.setRenderTarget(oldTarget);}
  return Promise.all(pending);
}
