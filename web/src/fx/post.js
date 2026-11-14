// Post stack (pmndrs postprocessing): N8AO -> [DOF intro] -> Bloom + AgX + vignette -> SMAA + radar lens.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, SMAAEffect, SMAAPreset, BloomEffect, VignetteEffect,
  ToneMappingEffect, ToneMappingMode, DepthOfFieldEffect, HueSaturationEffect, BrightnessContrastEffect, NoiseEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { createSunShafts } from './sunShafts.js';
import { glareBloom } from './cameraLightRules.js';
import {warmAoPrograms} from './aoWarmup.js';

export function detectQuality(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const weak = /SwiftShader|llvmpipe|Software|Mali-[GT]?[0-7]|Adreno \(TM\) [0-5]|Intel\(R\) (HD|UHD|Iris)/i.test(gpu);
  const q = new URLSearchParams(location.search).get('q');
  const tier = q || (mobile || weak ? 'low' : 'high');
  return tierSettings(tier, gpu);
}

export function tierSettings(tier, gpu = '') {
  const high = tier === 'high';
  return { tier, gpu, ao: high, dof: high, shadow: high ? 4096 : 1536, reflection: high ? 1024 : 384, dpr: Math.min(devicePixelRatio || 1, high ? 2 : 1) };
}

export function createPost(renderer, scene, camera, quality, lensEffect, clouds, options={}) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const ao = new N8AOPostPass(scene, camera, size.x, size.y);
  ao.configuration.aoRadius = 3;
  ao.configuration.distanceFalloff = 1.2;
  ao.configuration.intensity = 2.4;
  ao.configuration.halfRes = true;
  ao.configuration.gammaCorrection = false;
  ao.setQualityMode('Medium');
  ao.enabled = quality.ao;
  composer.addPass(ao);

  const dof = new DepthOfFieldEffect(camera, { focusDistance: 100, focusRange: 400, bokehScale: 2, resolutionScale: 0.5 });
  const dofPass = new EffectPass(camera, dof);
  dofPass.enabled = false;
  composer.addPass(dofPass);

  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.1, luminanceSmoothing: 0.3, intensity: 0.6, radius: 0.7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.5 });
  const film=new NoiseEffect({premultiply:true});
  const rays=createSunShafts(renderer,camera,clouds,quality,options);
  let cameraEnabled=true,lastGlare=0;
  film.blendMode.opacity.value=quality.tier==='high'?.018:0;
  // AgX is flat by design: a little contrast and saturation back, applied in display space
  const grade = [new HueSaturationEffect({ saturation: 0.16 }), new BrightnessContrastEffect({ contrast: 0.1 })];
  composer.addPass(new EffectPass(camera, rays.effect, bloom, tone, ...grade, vignette, film));
  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
  composer.addPass(new EffectPass(camera, smaa, lensEffect));

  return {
    composer, ao, dof, dofPass, bloom, rays,
    setCameraEffects(on){cameraEnabled=on;film.blendMode.opacity.value=on&&quality.tier==='high'?.018:0;vignette.blendMode.opacity.value=on?1:0;bloom.intensity=glareBloom(lastGlare,on);},
    updateGlare(glare){lastGlare=glare;bloom.intensity=glareBloom(glare,cameraEnabled);},
    setSize(w, h) { composer.setSize(w, h);rays.setSize(w,h); },
    warm(){
      const previous=renderer.getRenderTarget(),pending=[];
      try{
        pending.push(rays.warm());
        if(quality.ao)pending.push(warmAoPrograms(renderer,ao,composer.inputBuffer));
        for(const pass of composer.passes)if(pass.scene&&pass.camera&&renderer.compileAsync){
          renderer.setRenderTarget(pass.renderToScreen?null:composer.inputBuffer);
          pending.push(renderer.compileAsync(pass.scene,pass.camera));
        }
      }finally{renderer.setRenderTarget(previous);}
      return Promise.all(pending);
    },
    setQuality(q) { ao.enabled = q.ao; if (!q.dof) dofPass.enabled = false; },
    render(dt) { composer.render(dt); },
  };
}
