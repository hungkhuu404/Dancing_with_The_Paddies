// Exact near-field crop geometry, including color attributes before shader warmup.
import * as THREE from 'three';
import * as P from './props.js';
import {patch} from './shaderlib.js';
import {H} from './land.js';

export function createTuftMesh(cap,tuftU){
  const tuftGeo = P.tuft();
  const aTP = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
  tuftGeo.setAttribute('aTP', aTP);
  const tuftMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), {
    key: 'tuft', sway: 1.4, radar: 'radarAt(vWorldP.xz)',
    uniforms: tuftU,
    vertexPre: 'attribute vec2 aTP; uniform sampler2D uState; uniform sampler2D uEcology; uniform vec3 uCenter; uniform float uRad; varying vec3 vEcology;',
    fragPre:'varying vec3 vEcology;',
    fragMap:'diffuseColor.rgb = mix(vec3(.43,.32,.14), vec3(.16,.30,.045), vEcology.r); diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.15,.27,.04),vEcology.g);',
    vertexMain: /* glsl */ `{
      vec4 st = aTP.x < 0. ? vec4(0.) : texelFetch(uState, ivec2(int(mod(aTP.x, 256.)), int(aTP.x / 256.)), 0);
      vEcology = aTP.x < 0. ? vec3(0.) : texelFetch(uEcology, ivec2(int(mod(aTP.x,256.)),int(aTP.x/256.)),0).rgb;
      float k = smoothstep(0., 1., st.r);
      vec3 ip = instanceMatrix[3].xyz;
      float fade = 1. - smoothstep(uRad * .55, uRad, distance(ip.xz, uCenter.xz));
      transformed *= fade * mix(1., .9, k);
      transformed.y *= mix(1.,2.8,vEcology.r) * mix(1.,.42,vEcology.g);
      transformed.y += (aTP.x < 0. ? ${H.base.toFixed(2)} : mix(${H.dry.toFixed(2)}, ${H.wet.toFixed(2)}, k)) - ip.y;
    }`,
  });
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, cap);
  tufts.count = 0;
  tufts.receiveShadow = true;
  tufts.frustumCulled = false;
  tufts.name = 'stubble';
  tufts.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(cap*3),3);
  return tufts;
}
