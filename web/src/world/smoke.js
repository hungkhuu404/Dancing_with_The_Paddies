// Kitchen + straw-burning smoke for one tile (GPU billboards, no per-frame CPU). Strength by time of day and rain is
// set once per frame by the atmosphere through the shared SMOKE_U uniforms.
import * as THREE from 'three';
import { NOISE, U } from '../scene/shaderlib.js';
import { rng } from './paths.js';

const WIND = new THREE.Vector2(3.2, 1.4).normalize();
export const SMOKE_U = { uKitchen: { value: 0 }, uStraw: { value: 0 }, uAmb: { value: new THREE.Color() }, uSun: { value: new THREE.Color() } };

export function createSmoke(ctx) {
  const low = ctx.quality.tier === 'low';
  const group = new THREE.Group(); group.name = 'smoke';
  const R = rng(31337);
  // ---------------------------------------------------------------- smoke
  const kitchen = ctx.props.smoke.filter((s) => s.kind !== 'straw').slice(0, low ? 40 : 400);
  const straw = ctx.props.smoke.filter((s) => s.kind === 'straw');
  const PK = low ? 5 : 8, PS = low ? 6 : 12;
  const nInst = kitchen.length * PK + straw.length * (PS + 1);
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const aS = new Float32Array(nInst * 4), aP = new Float32Array(nInst * 2);
  let k = 0;
  const strawSlots = [];
  for (const s of kitchen) for (let i = 0; i < PK; i++, k++) { aS.set([s.x, Math.max(ctx.terrainAt(s.x, s.z), 0.3) + 3.2, s.z, R()], k * 4); aP.set([i / PK, 0], k * 2); }
  for (const s of straw) {
    const y = ctx.groundAt(s.x, s.z) + 0.3, slot = [];
    for (let i = 0; i <= PS; i++, k++) { aS.set([s.x, y, s.z, R()], k * 4); aP.set([i / PS, i === PS ? 2 : 1], k * 2); slot.push(k); }
    strawSlots.push({ s, slot });
  }
  quad.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  const aPAttr = new THREE.InstancedBufferAttribute(aP, 2);
  quad.setAttribute('aP', aPAttr);
  quad.instanceCount = nInst;
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...SMOKE_U, uWindDir: { value: WIND } },
    vertexShader: /* glsl */ `
      attribute vec4 aS; attribute vec2 aP; uniform float uTime; uniform vec2 uWindDir; uniform float uKitchen; uniform float uStraw;
      varying vec2 vUv; varying float vA; varying float vKind; varying float vSeed;
      #include <fog_pars_vertex>
      void main(){
        float kind = aP.y; vKind = kind; vSeed = aS.w;
        float straw = step(.5, kind), glow = step(1.5, kind);
        float life = mix(16., 30., straw);
        float age = fract(uTime / life + aP.x + aS.w);
        float h = mix(16., 85., straw) * pow(age, .8);
        vec3 c = aS.xyz + vec3(0., h, 0.) + vec3(uWindDir.x, 0., uWindDir.y) * age * life * mix(.45, 1.1, straw) * (.4 + age)
               + vec3(sin(uTime * .3 + aS.w * 40.), 0., cos(uTime * .27 + aS.w * 30.)) * age * mix(1.5, 6., straw);
        float size = mix(mix(.9, 7., age), mix(5., 40., age), straw);
        if (glow > .5) { c = aS.xyz + vec3(0., .6, 0.); size = 3.5 + sin(uTime * 13. + aS.w * 50.) * .4; age = .5; }
        float strength = mix(uKitchen, uStraw, straw);
        vA = (glow > .5 ? 1. : smoothstep(0., .08, age) * pow(1. - age, 1.6)) * strength;
        if (aP.y < 0.) vA = 0.;
        vec4 mvPosition = viewMatrix * vec4(c, 1.);
        mvPosition.xy += position.xy * size;
        vUv = position.xy + .5;
        gl_Position = vA < .002 ? vec4(2., 2., 2., 1.) : projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmb; uniform vec3 uSun; uniform float uTime; uniform float uNight; varying vec2 vUv; varying float vA; varying float vKind; varying float vSeed;
      ${NOISE}
      #include <fog_pars_fragment>
      void main(){
        vec2 p = vUv - .5; float r = length(p);
        if (vKind > 1.5) { float g = exp(-r * r * 30.) * vA * (.6 + uNight * 1.6); gl_FragColor = vec4(vec3(1., .45, .12) * g * 3., g); return; }
        float n = fbm(p * 3. + vSeed * 17. + uTime * .05);
        float a = smoothstep(.5, .05, r) * (.45 + .75 * n) * vA * mix(.38, .5, step(.5, vKind));
        if (a < .003) discard;
        vec3 base = mix(vec3(.78, .8, .84), vec3(.55, .52, .48), step(.5, vKind));
        vec3 col = base * (uAmb * 1.25 + uSun * .45);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
  smokeMat.uniforms.uTime = U.uTime; smokeMat.uniforms.uNight = U.uNight;
  const smoke = new THREE.Mesh(quad, smokeMat);
  smoke.frustumCulled = false; smoke.renderOrder = 4; smoke.name = 'smoke';
  group.add(smoke);
  function onPass() { // straw is burnt only on fields that are dry now
    for (const { s, slot } of strawSlots) {
      const pi = ctx.parcelAt(s.x, s.z), wet = pi >= 0 && ctx.land.level[pi] > 0.5;
      slot.forEach((j, i) => (aP[j * 2 + 1] = wet ? -1 : i === slot.length - 1 ? 2 : 1));
    }
    aPAttr.needsUpdate = true;
  }
  onPass();
  group.layers.set(1); smoke.layers.set(1); // not in the water mirror
  return { group, onPass };
}
