// Cloud billboards (soft, sun-lit, drifting) and dawn ground mist layers.
import * as THREE from 'three';
import { NOISE, U } from './shaderlib.js';

function cloudAtlas() {
  // 2x2 atlas of soft cumulus puffs: R density, G density shifted toward the light (for self-shadow)
  const S = 256, A = S * 2, c = document.createElement('canvas');
  c.width = c.height = A;
  const g = c.getContext('2d'), img = g.createImageData(A, A);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const perm = Array.from({ length: 512 }, () => rnd());
  const h = (x, y) => perm[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 512];
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  };
  const fbm = (x, y) => { let s = 0, a = 0.5; for (let o = 0; o < 5; o++) { s += a * vn(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; };
  const dens = (k, x, y) => {
    // several blobs (base flat, top round) eroded by noise
    const blobs = [[0, 0.1, 0.42], [-0.32, 0.18, 0.3], [0.3, 0.16, 0.32], [0.08, -0.15, 0.3], [-0.15, -0.05, 0.28]];
    let d = 0;
    for (const [bx, by, r] of blobs) d = Math.max(d, 1 - Math.hypot((x - bx) / r, (y - by) / (r * 0.8)));
    d *= y > 0.32 ? Math.max(0, 1 - (y - 0.32) * 6) : 1; // flat base
    return Math.max(0, Math.min(1, d * 1.5 - (1 - fbm(x * 4 + k * 10, y * 4) ) * 0.9));
  };
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * S, oy = Math.floor(k / 2) * S;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const fx = x / S - 0.5, fy = y / S - 0.5;
        const d = dens(k, fx, fy), dl = dens(k, fx + 0.05, fy - 0.07);
        const o = ((oy + y) * A + ox + x) * 4;
        img.data[o] = d * 255; img.data[o + 1] = dl * 255; img.data[o + 3] = 255;
      }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createClouds(scene) {
  const N = 150;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const c = new Float32Array(N * 4), v = new Float32Array(N * 2);
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const r = i < 20 ? 150 + rnd() * 1300 : 600 + Math.sqrt(rnd()) * 11000, a = rnd() * 6.283; // first 20 near the centre: the intro descends through them
    c.set([Math.cos(a) * r, 650 + rnd() * 380, Math.sin(a) * r, 380 + rnd() * 520], i * 4);
    v.set([Math.floor(rnd() * 4), rnd() < 0.5 ? 1 : -1], i * 2);
  }
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(c, 4));
  geo.setAttribute('aV', new THREE.InstancedBufferAttribute(v, 2));
  geo.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTex: { value: cloudAtlas() }, uSun: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uOpacity: { value: 1 },
    }]),
    vertexShader: /* glsl */ `
      attribute vec4 aC; attribute vec2 aV; uniform float uTime; varying vec2 vUv; varying float vFade;
      #include <fog_pars_vertex>
      void main(){
        vec3 c = aC.xyz; c.x = mod(c.x + uTime * 3. + 12000., 24000.) - 12000.; // drifts across the whole commune
        vec4 mv = viewMatrix * vec4(c, 1.);
        float d = -mv.z;
        vFade = smoothstep(60., 320., d) * (1. - smoothstep(7000., 9000., d));
        mv.xy += position.xy * vec2(aC.w * aV.y, aC.w * .55);
        vUv = (position.xy + .5) * .5 + vec2(mod(aV.x, 2.), floor(aV.x / 2.)) * .5;
        vec4 mvPosition = mv;
        gl_Position = projectionMatrix * mv;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform vec3 uSun; uniform vec3 uAmb; uniform float uOpacity; varying vec2 vUv; varying float vFade;
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(uTex, vUv);
        float a = t.r * vFade * uOpacity;
        if (a < .004) discard;
        float shade = smoothstep(0., .8, t.g);
        vec3 col = mix(uSun * 1.25 + uAmb * .5, uAmb * .75, shade * .8);
        gl_FragColor = vec4(col, a * .92);
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uTime = U.uTime;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.name = 'clouds';
  scene.add(mesh);

  // An independent mesh shares only the immutable geometry and live cloud
  // uniforms. It never reparents or changes visibility/layers of the scene mesh.
  const occlusionMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{uTime:mat.uniforms.uTime,uTex:mat.uniforms.uTex,uOpacity:mat.uniforms.uOpacity},
    vertexShader:mat.vertexShader,
    fragmentShader:`uniform sampler2D uTex;uniform float uOpacity;varying vec2 vUv;varying float vFade;
      void main(){float alpha=texture2D(uTex,vUv).r*vFade*uOpacity*.92;if(alpha<.004)discard;gl_FragColor=vec4(0.,0.,0.,alpha);}`,
  });
  const occlusionScene=new THREE.Scene();occlusionScene.background=new THREE.Color(0xffffff);
  const occlusionMesh=new THREE.Mesh(geo,occlusionMaterial);occlusionMesh.frustumCulled=false;
  occlusionScene.add(occlusionMesh);

  // ground mist: three stacked translucent sheets following the view target
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMist: { value: 0 }, uCol: { value: new THREE.Color() }, uLayer: { value: 0 } }]),
    vertexShader: /* glsl */ `varying vec3 vW; varying float vD;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; vD = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `uniform float uMist; uniform vec3 uCol; uniform float uTime; varying vec3 vW; varying float vD;
      ${NOISE}
      #include <fog_pars_fragment>
      void main(){
        float n = fbm(vW.xz / 90. + vec2(uTime * .01, uTime * .004) + vW.y);
        float a = smoothstep(.4, .85, n) * uMist * .17 * exp(-max(0.,vW.y)*.18) * smoothstep(8., 60., vD);
        if (a < .003) discard;
        gl_FragColor = vec4(uCol, a);
        #include <fog_fragment>
      }`,
  });
  mistMat.uniforms.uTime = U.uTime;
  const mist = new THREE.Group();
  for (const y of [1.2, 3.2, 6.5]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), mistMat);
    m.position.y = y; m.renderOrder = 2; m.frustumCulled = false;
    mist.add(m);
  }
  mist.name = 'mist';
  scene.add(mist);

  return {
    mesh, mist, occlusionScene,
    update(skyState, target) {
      mat.uniforms.uSun.value.copy(skyState.sunColor);
      mat.uniforms.uAmb.value.copy(skyState.fogColor).multiplyScalar(1.1);
      mistMat.uniforms.uMist.value = skyState.mist;
      mistMat.uniforms.uCol.value.copy(skyState.fogColor).multiplyScalar(1.15);
      mist.visible = skyState.mist > 0.02;
      mist.position.x = target.x; mist.position.z = target.z;
    },
  };
}
