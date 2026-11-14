// Physical sky + sun/moon light + hemisphere + fog + PMREM environment, all driven by a time-of-day value.
// tod: 0 dawn · 0.33 noon · 0.66 golden hour · 0.83 dusk · 1 night
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const K = [
  // t, elev, az, turb, rayl, mie, sunI, sunCol, hemiI, fog, fogD, exposure, env, night, mist, cloud
  [0.0, 3, 98, 7, 2.6, 0.009, 1.6, [1, 0.62, 0.42], 0.22, [0.55, 0.52, 0.55], 0.00045, 1.1, 0.32, 0, 0.7, 0.25],
  [0.33, 64, 150, 3.2, 1.3, 0.004, 3.4, [1, 0.96, 0.9], 0.3, [0.62, 0.70, 0.80], 0.00016, 0.5, 0.4, 0, 0, 0.4],
  [0.66, 6.5, 252, 5, 2.4, 0.011, 3.0, [1, 0.6, 0.32], 0.22, [0.80, 0.58, 0.40], 0.00022, 1.0, 0.35, 0, 0.1, 0.32],
  [0.83, -4, 262, 4, 2.6, 0.006, 0.0, [1, 0.45, 0.3], 0.16, [0.20, 0.20, 0.28], 0.00028, 1.7, 0.35, 0.75, 0.1, 0.2],
  [1.0, -18, 275, 2, 1, 0.003, 0.0, [1, 1, 1], 0.08, [0.025, 0.032, 0.05], 0.00028, 2.2, 0.3, 1, 0, 0.1],
];

const lerp = (a, b, t) => a + (b - a) * t;
function sample(t) {
  t = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], u = (t - a[0]) / (b[0] - a[0]);
  return a.map((v, k) => (Array.isArray(v) ? v.map((x, j) => lerp(x, b[k][j], u)) : lerp(v, b[k], u)));
}

export function createSky(renderer, scene) {
  const sky = new Sky();
  sky.scale.setScalar(14000);
  sky.name = 'sky';
  scene.add(sky);
  const su = sky.material.uniforms;
  su.uNightSky = { value: 0 };
  su.cloudCoverage.value = 0.32; su.cloudDensity.value = 0.5; su.cloudElevation.value = 0.55;
  // faint moonlit night sky instead of black
  sky.material.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('uniform float time;', 'uniform float time; uniform float uNightSky;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'float ny = normalize(vWorldPosition - cameraPosition).y; texColor += uNightSky * mix(vec3(.010,.013,.022), vec3(.0015,.002,.005), smoothstep(0., .5, ny)); gl_FragColor = vec4( texColor, 1.0 );');
  };

  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.material = sky.material;
  envSky.scale.setScalar(900);
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 4000;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd3ff, 0x4a3a22, 0.5);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xbbbbbb, 0.0003);

  const state = { tod: -1, sunDir: new THREE.Vector3(), lightDir: new THREE.Vector3(), sunColor: new THREE.Color(), night: 0, mist: 0, exposure: 1, fogColor: new THREE.Color(), ambient: new THREE.Color(), cloud: 0.3, elev: 0 };
  let lastEnv = -1, envAt = 0;
  let astronomy=null;

  function set(tod, now = performance.now()) {
    const s = sample(tod);
    const [, artElev, az, turb, rayl, mie, sunI, sc, hemiI, fog, fogD, exposure, env, artNight, mist, cloud] = s;
    const elev=astronomy?.elevation??artElev;
    const night=astronomy?1-THREE.MathUtils.smoothstep(elev,-9,0):artNight;
    const el = THREE.MathUtils.degToRad(elev), a = THREE.MathUtils.degToRad(az);
    state.sunDir.set(Math.cos(el) * Math.sin(a), Math.sin(el), -Math.cos(el) * Math.cos(a));
    if(astronomy)state.sunDir.fromArray(astronomy.sun);
    su.sunPosition.value.copy(state.sunDir);
    su.turbidity.value = turb; su.rayleigh.value = rayl; su.mieCoefficient.value = mie; su.mieDirectionalG.value = 0.82;
    state.elev = elev;
    // light: sun while up, then the moon (cool, high in the east)
    const sunW = THREE.MathUtils.smoothstep(elev, -3, 1.5);
    if (sunW > 0.01) {
      state.lightDir.copy(state.sunDir);
      if (state.lightDir.y < 0.035) state.lightDir.y = 0.035; // keep shadows finite near the horizon
      state.lightDir.normalize();
      sun.color.setRGB(sc[0], sc[1], sc[2]);
      sun.intensity = sunI * sunW;
    } else {
      state.lightDir.set(0.35, 0.8, 0.3).normalize();
      if(astronomy){state.lightDir.fromArray(astronomy.moon);state.lightDir.y=Math.max(.035,state.lightDir.y);state.lightDir.normalize();}
      sun.color.setRGB(0.55, 0.66, 1.0);
      sun.intensity = 0.32 * night * (astronomy?astronomy.fraction*Math.max(0,Math.sin(astronomy.moonElevation)):1);
    }
    state.sunColor.copy(sun.color).multiplyScalar(Math.max(sun.intensity, 0) / 2.5);
    state.sunI = sun.intensity; state.hemiI = hemiI; // undimmed, for weather
    hemi.intensity = hemiI;
    hemi.color.setRGB(0.55 + 0.25 * (1 - night), 0.65 + 0.15 * (1 - night), 1);
    hemi.groundColor.setRGB(0.3, 0.24, 0.15).multiplyScalar(1 - 0.7 * night);
    state.fogColor.setRGB(fog[0], fog[1], fog[2]);
    scene.fog.color.copy(state.fogColor);
    scene.fog.density = fogD;
    state.fogD = fogD;
    state.ambient.setRGB(0.35 + fog[0] * 0.6, 0.38 + fog[1] * 0.6, 0.42 + fog[2] * 0.6).multiplyScalar(hemiI * 1.1);
    su.uNightSky.value = night;
    state.night = night; state.mist = mist; state.exposure = exposure; state.cloud = cloud;
    scene.environmentIntensity = env; state.env = env;
    renderer.toneMappingExposure = exposure;
    state.tod = tod;
    // environment map, throttled
    if (Math.abs(tod - lastEnv) > 0.004 && now - envAt > 220) {
      lastEnv = tod; envAt = now;
      const old = envRT;
      envRT = pmrem.fromScene(envScene, 0, 1, 2000);
      scene.environment = envRT.texture;
      if (old) old.dispose();
    }
  }

  // shadow camera follows the view; extent grows with distance, snapped to texels to avoid shimmer
  const tmp = new THREE.Vector3(), lm = new THREE.Matrix4(), lmi = new THREE.Matrix4(), ZERO = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function fitShadow(target, camDist, mapSize) {
    const ext = THREE.MathUtils.clamp(camDist * 1.15, 45, 750);
    const c = sun.shadow.camera;
    c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext;
    c.updateProjectionMatrix();
    const texel = (2 * ext) / mapSize;
    lm.lookAt(state.lightDir, ZERO, UP);
    tmp.copy(target).applyMatrix4(lmi.copy(lm).invert());
    tmp.x = Math.round(tmp.x / texel) * texel; tmp.y = Math.round(tmp.y / texel) * texel;
    tmp.applyMatrix4(lm);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(state.lightDir, 1800);
    sun.target.updateMatrixWorld();
  }

  return { sky, sun, hemi, state, set, setAstronomy(value){astronomy=value;}, fitShadow, dispose() { pmrem.dispose(); envRT?.dispose(); } };
}
