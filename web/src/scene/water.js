// One water surface at y=0 over the whole world: planar reflection (three Water), silty tint,
// shallow fields more see-through than canals, sun glint, cloud shadow, hover/no-data overlay, radar-dark.
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { COMMON, U } from './shaderlib.js';

function makeNormalMap(size = 256) {
  // tileable height field from integer-frequency waves; analytic normals
  const data = new Uint8Array(size * size * 4);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves = Array.from({ length: 24 }, () => {
    const fx = Math.round((rnd() - 0.5) * 18), fy = Math.round((rnd() - 0.5) * 18);
    const f = Math.hypot(fx, fy) || 1;
    return { fx, fy, a: 1 / Math.pow(f, 1.1), p: rnd() * 6.283 };
  });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      const u = (x / size) * 6.283, v = (y / size) * 6.283;
      for (const w of waves) {
        const c = Math.cos(w.fx * u + w.fy * v + w.p) * w.a;
        dx += c * w.fx; dy += c * w.fy;
      }
      const s = 0.09, nx = -dx * s, ny = -dy * s, l = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 4;
      data[o] = ((nx / l) * 0.5 + 0.5) * 255; data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255; data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255; data[o + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const FRAG = /* glsl */ `
uniform sampler2D mirrorSampler; uniform float alpha; uniform float time; uniform float size; uniform float distortionScale;
uniform sampler2D normalSampler; uniform vec3 sunColor; uniform vec3 sunDirection; uniform vec3 eye; uniform vec3 waterColor;
uniform vec3 uAmbient; uniform float uMirror; uniform sampler2D uMask; uniform sampler2D uIds; uniform sampler2D uState; uniform float uFloodFrac; uniform vec2 uWinC;
uniform vec4 uScan; uniform float uScanWidth; uniform sampler2D uScanCells; uniform vec2 uScanN;
varying vec4 mirrorCoord; varying vec4 worldPosition;
#include <common>
${COMMON}
#include <packing>
#include <bsdfs>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
vec4 getNoise(vec2 uv){
  vec2 uv0 = uv / 23. + vec2(time / 37., time / 59.);
  vec2 uv1 = uv / 31. - vec2(time / -43., time / 71.);
  vec2 uv2 = uv / 7.3 + vec2(time / 19., -time / 23.);
  vec2 uv3 = uv / 97. - vec2(time / 211., time / -173.);
  vec4 n = texture2D(normalSampler, uv0) + texture2D(normalSampler, uv1) + texture2D(normalSampler, uv2) * .8 + texture2D(normalSampler, uv3) * 1.2;
  return n * .5 - 1.;
}
vec4 stateAt(vec2 xz){
  vec2 uv = (xz - uWinC + 1000.) / 2000.;
  if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(.9999)))) return vec4(-1.);
  vec4 c = texelFetch(uIds, ivec2(uv * 1024.), 0);
  float id = floor(c.r * 255. + .5) + floor(c.g * 255. + .5) * 256. - 1.;
  if (id < 0.) return vec4(-1.);
  return texelFetch(uState, ivec2(int(mod(id, 256.)), int(id / 256.)), 0);
}
// raindrop rings: two jittered grids of expanding rings, as a normal perturbation
vec2 rainRipples(vec2 xz){
  vec2 n = vec2(0.);
  for (int k = 0; k < 2; k++) {
    vec2 p = xz / 1.1 + float(k) * .37; vec2 c = floor(p); vec2 f = fract(p) - .5;
    vec2 o = vec2(hash12(c + 3.1 + float(k)), hash12(c + 5.7 - float(k))) - .5;
    float t = fract(uTime * 1.3 + hash12(c + float(k) * 7.)); vec2 d = f - o * .6; float r = length(d), rr = r - t * .5;
    n += d / max(r, 1e-3) * sin(rr * 55.) * exp(-abs(rr) * 30.) * (1. - t);
  }
  return n;
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 xz = worldPosition.xz;
  vec3 toEye = cameraPosition - worldPosition.xyz; // not eye: that is only refreshed when the mirror renders
  float dist = length(toEye);
  vec3 V = toEye / dist;
  vec2 wuv = uvWin(xz - uWinC);
  float inWin = step(0., wuv.x) * step(wuv.x, 1.) * step(0., wuv.y) * step(wuv.y, 1.);
  float canal = inWin > .5 ? texture2D(uMask, wuv).r : .0;
  // calm in shallow fields, livelier on canals; flatten with distance (no sparkle aliasing)
  float rough = mix(.45, .75, canal) * mix(1., .25, smoothstep(150., 1500., dist));
  vec4 nz = getNoise(xz * size);
  vec3 N = normalize(vec3(nz.x * rough * 1.3, 1., nz.y * rough * 1.3));
  float rainHere = rainAt(xz) * (1. - smoothstep(60., 260., dist));
  if (rainHere > .01) { vec2 rp = rainRipples(xz) * rainHere * .9; N = normalize(N + vec3(rp.x, 0., rp.y)); }
  float shadow = getShadowMask() * cloudShadow(xz);
  // reflection
  vec2 distortion = N.xz * (.001 + 1. / dist) * distortionScale;
  vec3 refl = texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion).rgb;
  refl = mix(uAmbient * 1.5, refl, uMirror); // mirror off (high up): a plain sky tint
  float cosT = max(dot(V, N), 0.);
  float F = .02 + .98 * pow(1. - cosT, 5.);
  // silty body colour lit by sky + sun (water is turbid: little light from below)
  float sunUp = max(sunDirection.y, 0.);
  // turbid Mekong water: neutral sky light, so the silt colour reads instead of a blue tint
  vec3 body = waterColor * (vec3(dot(uAmbient, vec3(.33))) * 1.4 + sunColor * sunUp * .5 * mix(1., shadow, .4));
  body *= mix(1.1, .8, canal);
  // sun glint
  vec3 H = normalize(sunDirection + V);
  float spec = pow(max(dot(N, H), 0.), mix(1600., 500., rough)) * mix(22., 9., rough);
  vec3 col = mix(body, refl, F) + sunColor * spec * shadow * step(0., sunDirection.y);
  // from kilometres up (whole-commune view) the mirror has nothing useful to show: read as deep, sky-tinted water like the map
  float farK = smoothstep(2500., 12000., dist);
  col = mix(col, mix(vec3(.035, .07, .085), uAmbient * .25, .35) * (.6 + .5 * sunUp), farK * .85);
  float a = mix(.80, .96, canal);
  a = mix(mix(a, 1., F), 1., farK); // far away: opaque (the bed below adds nothing but haze from up high)
  // field overlays: hover/selected tint, no-data hatch
  vec4 st = stateAt(xz);
  if (st.a > .3) { col = mix(col, st.a > .7 ? vec3(.84, .47, .1) * .5 : vec3(.86, .88, .84) * .4, .25); }
  if (st.g > .3 && st.g < .7) {
    float t = (xz.x + xz.y) / 6.; float w = fwidth(t);
    float hatch = mix(smoothstep(.0, .09, fract(t)) * (1. - smoothstep(.18, .27, fract(t))), .15, smoothstep(.15, .45, w));
    col = mix(vec3(dot(col, vec3(.3, .59, .11))), vec3(.16, .17, .16), .3 + .4 * hatch); a = max(a, .9);
  }
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
  if(uRadarMode>.001)gl_FragColor.rgb = mix(gl_FragColor.rgb,vec3(.035 * speckle(xz) + .02 * F),uRadarMode);
  if(uHasCalendar>.5){vec4 cal=calendarAt(xz);if(cal.a>.1){gl_FragColor.rgb=mix(gl_FragColor.rgb,cal.rgb,uCalendarMode*(1.-uRadarMode));gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.38,.41,.40)*(1.-.97*uNight),max(uAgeHaze*.38,step(.75,cal.a)*.45)*(1.-uRadarMode));}}
  // Illustrative emphasis, not radar intensity: ONLY parcel-covered cells with a
  // W observation at the selected pass. Canals, missing images and dry land stay unchanged.
  if(uScan.w > .001 && uHasCalendar > .5){
    vec2 uv = uvFrame(xz);
    vec4 parcel = texture2D(uParcelAtlas, clamp(uv, 0., 1.));
    vec2 cell = floor(parcel.rg * 255. + .5) - 1.;
    bool inFrame = all(greaterThanEqual(uv, vec2(0.))) && all(lessThanEqual(uv, vec2(1.)));
    bool valid = inFrame && parcel.b > .5 && all(greaterThanEqual(cell, vec2(0.))) && all(lessThan(cell, uScanN));
    if(valid){
      vec4 observation = texelFetch(uScanCells, ivec2(cell), 0);
      float behind = (uScan.z - dot(xz, uScan.xy)) / uScanWidth;
      float pulse = smoothstep(0., .25, behind) * (1. - smoothstep(.6, 1.8, behind));
      float wet = step(.9, observation.g) * (1. - step(.5, observation.b)) * step(.5, observation.a);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(.10, .43, .47), pulse * wet * uScan.w * .68 * (1. - uRadarMode) * (1. - uCalendarMode));
    }
  }
}`;

/** One water plane over the whole commune. The canal mask / field overlay follow the active tile (setTile). */
export function createWater(quality, size = 16000, centre = [0, 0],recipe={}) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  const water = new Water(geo, {
    textureWidth: quality.reflection, textureHeight: quality.reflection,
    waterNormals: makeNormalMap(),
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: 0xffffff,
    waterColor: new THREE.Color(...(recipe.water_color||[0.11, 0.105, 0.065])),
    distortionScale: 2.2,
    fog: true,
    alpha: 1,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(centre[0], 0, centre[1]);
  water.receiveShadow = true;
  const m = water.material;
  m.fragmentShader = FRAG;
  m.transparent = true;
  Object.assign(m.uniforms, U, {
    uAmbient: { value: new THREE.Color(0.4, 0.45, 0.5) },
    uMirror: { value: 1 }, uMask: { value: null }, uIds: { value: null }, uState: { value: null }, uFloodFrac: { value: 0.3 }, uWinC: { value: new THREE.Vector2(1e6, 1e6) },
  });
  /** land: the active tile's land (or null: no canal mask / overlay anywhere) */
  water.setTile = (land) => {
    const u = m.uniforms;
    if (!land) { u.uWinC.value.set(1e6, 1e6); return; }
    u.uMask.value = land.uniforms.uMask.value; u.uIds.value = land.uniforms.uIds.value; u.uState.value = land.uniforms.uState.value;
    u.uWinC.value.copy(land.uniforms.uWinC.value);
  };
  m.uniforms.size.value = 1;
  m.extensions = {};
  water.renderOrder = 1;
  // skip the mirror render during the radar pass and when reflections are off
  const mirror = water.onBeforeRender;
  water.userData.reflect = true;
  // low tier: refresh the mirror every 2nd frame (camera moves little per frame, the stale frame is not visible)
  let mirrorTick = 0;
  const every = quality.tier === 'low' ? 2 : 1;
  // The mirror is rendered from the frame loop (water.updateMirror) BEFORE the main render, not from onBeforeRender:
  // a render nested inside another gets its own light state, and three then re-resolves the program of every material
  // drawn in both passes, every frame (hundreds per frame with the commune's tiles).
  water.onBeforeRender = () => {};
  /** n: refresh every n-th frame (the camera moves little per frame) */
  water.updateMirror = (r, s, c, n = every) => { if (U.uRadarMode.value < 0.5 && water.userData.reflect && (mirrorTick++ % n === 0)) mirror.call(water, r, s, c); };
  return water;
}
