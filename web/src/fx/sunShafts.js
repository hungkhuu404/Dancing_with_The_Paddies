// Screen-space, illustrative light scattering. The transmittance mask is
// rendered from the SAME cloud billboards/atlas as the scene; real scene depth
// occludes the integration. No weather measurements or GPU readback are used.
import * as THREE from 'three';
import {Effect,EffectAttribute} from 'postprocessing';
import {shaftStrength,shaftMaskSize} from './sunShaftRules.js';
import {U} from '../scene/shaderlib.js';

const FRAGMENT=/* glsl */`
uniform sampler2D cloudTransmission;
uniform vec2 shaftSunUV;
uniform vec3 shaftColor;
uniform float shaftAmount;
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
  outputColor=inputColor;
  if(shaftAmount<=.0001)return;
  // Most horizon views contain ground/roofs/vegetation. Reject those pixels
  // before any radial samples instead of doing 32 fetches then multiplying by 0.
  if(readDepth(uv)<.9999999)return;
  vec2 delta=(shaftSunUV-uv)/16.;
  vec2 p=uv;
  float sum=0.; float weight=1.;
  for(int i=0;i<16;i++){
    p+=delta;
    float bounds=step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);
    float transmission=texture2D(cloudTransmission,clamp(p,0.,1.)).r;
    float sky=step(.9999999,readDepth(clamp(p,0.,1.)));
    sum+=transmission*sky*weight*bounds;
    weight*=.94;
  }
  // Normalize and limit energy: warm, diffuse haze rather than bright stripes.
  vec3 scattering=shaftColor*(sum/10.7)*shaftAmount;
  outputColor.rgb=inputColor.rgb+scattering;
}`;
export function createSunShafts(renderer,camera,clouds,quality,{reduced=false}={}){
  const target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false});
  target.texture.name='cloud-transmittance';target.texture.generateMipmaps=false;
  const effect=new Effect('CloudSunShafts',FRAGMENT,{attributes:EffectAttribute.DEPTH,uniforms:new Map([
    ['cloudTransmission',new THREE.Uniform(target.texture)],['shaftSunUV',new THREE.Uniform(new THREE.Vector2())],
    ['shaftColor',new THREE.Uniform(new THREE.Color())],['shaftAmount',new THREE.Uniform(0)],
  ])});
  const sun=new THREE.Vector3(),forward=new THREE.Vector3(),clear=new THREE.Color();
  let renders=0,enabled=false;
  const rules={tier:quality.tier,enabled:false,reduced,forward:0,x:0,y:0,elevation:0,cloud:0,night:0,rain:0};
  function update(state,allow,rain=0){
    enabled=allow;
    camera.getWorldDirection(forward);
    const facing=forward.dot(state.sunDir);
    sun.copy(camera.position).addScaledVector(state.sunDir,10000).project(camera);
    rules.tier=quality.tier;rules.enabled=allow;rules.forward=facing;rules.x=sun.x;rules.y=sun.y;
    rules.elevation=state.elev;rules.cloud=Math.max(state.cloud,U.uCloudAmt.value);rules.night=state.night;rules.rain=rain;
    const amount=shaftStrength(rules);
    effect.uniforms.get('shaftAmount').value=amount;
    effect.uniforms.get('shaftSunUV').value.set(sun.x*.5+.5,sun.y*.5+.5);
    effect.uniforms.get('shaftColor').value.copy(state.sunColor);
    if(amount<=.0001)return;
    // Reproject on every moving frame. Only 384x216 at a 16:9 viewport.
    const oldTarget=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();
    const auto=renderer.autoClear,shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
    const scissor=renderer.getScissorTest();renderer.getClearColor(clear);
    try{
      renderer.autoClear=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
      renderer.setScissorTest(false);renderer.setRenderTarget(target);renderer.setClearColor(0xffffff,1);
      renderer.render(clouds.occlusionScene,camera);renders++;
    }finally{
      renderer.setRenderTarget(oldTarget);renderer.setClearColor(clear,alpha);renderer.autoClear=auto;
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;renderer.setScissorTest(scissor);
    }
  }
  return {
    effect,update,
    setSize(w,h){const size=shaftMaskSize(w,h);target.setSize(size.width,size.height);},
    warm(){
      if(!renderer.compileAsync)return Promise.resolve();
      const previous=renderer.getRenderTarget();let pending;
      try{renderer.initRenderTarget?.(target);renderer.setRenderTarget(target);pending=renderer.compileAsync(clouds.occlusionScene,camera);}
      finally{renderer.setRenderTarget(previous);}
      return pending;
    },
    get info(){return {enabled,amount:effect.uniforms.get('shaftAmount').value,sunUV:effect.uniforms.get('shaftSunUV').value.toArray(),mask:[target.width,target.height],renders,tier:quality.tier,reduced};},
    dispose(){target.dispose();effect.dispose();},
  };
}
