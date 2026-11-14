// Shared uniforms + GLSL injected into every lit material: cloud shadows, wind sway, radar-vision output.
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uScan: { value: new THREE.Vector4(0, 1, 0, 0) }, // direction x/z, front (m), illustration opacity
  uScanWidth: { value: 420 },
  uScanCells: { value: null }, uScanN: { value: new THREE.Vector2(1, 1) },
  uWind: { value: new THREE.Vector2() }, // cloud-shadow drift offset (m)
  uCloudAmt: { value: 0.35 },
  uRadarMode: { value: 0 }, // 1 while rendering the NISAR lens pass
  uCalendarMode: { value: 0 },
  uAgeHaze: { value: 0 },
  uCalendarTex: { value: null }, uParcelAtlas: { value: null },
  uCalendarN: { value: new THREE.Vector2(1,1) }, uHasCalendar: { value: 0 },
  uNight: { value: 0 }, // 0 day .. 1 night (windows, fireflies)
  uRadarTex: { value: null },
  uHasRadar: { value: 0 },
  uRain: { value: new THREE.Vector4(0, 0, 1, 0) }, // rain cell: centre x, z, radius (m), intensity 0..1
  uWet: { value: 0 }, // lingering wetness everywhere after rain 0..1
  uFrame: { value: new THREE.Vector4(-1000, -1000, 2000, 2000) }, // commune frame in (east, north) scene metres: x0, n0, width, height
};

export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.3); a*=.5; } return s; }
`;

export const COMMON = /* glsl */ `
uniform float uTime; uniform vec2 uWind; uniform float uCloudAmt; uniform float uRadarMode; uniform float uNight;
uniform sampler2D uRadarTex; uniform float uHasRadar; uniform vec4 uRain; uniform float uWet; uniform vec4 uFrame;
uniform float uCalendarMode; uniform float uAgeHaze; uniform sampler2D uCalendarTex; uniform sampler2D uParcelAtlas; uniform vec2 uCalendarN; uniform float uHasCalendar;
${NOISE}
float rainAt(vec2 xz){ return uRain.w * (1. - smoothstep(uRain.z * .55, uRain.z, distance(xz, uRain.xy) + (vnoise(xz / 90.) - .5) * uRain.z * .3)); }
float cloudShadow(vec2 xz){ float n = fbm((xz + uWind) / 560.); return 1. - uCloudAmt * smoothstep(.5, .72, n); }
// Fully developed speckle: mean of 3 exponential looks, anchored to the ground (it moves with the scene, like SAR).
float speckle(vec2 xz){ vec2 c = floor(xz * 1.3);
  float a = hash12(c), b = hash12(c + 31.7), d = hash12(c + 71.3);
  return (-log(max(a,1e-3)) - log(max(b,1e-3)) - log(max(d,1e-3))) / 3.; }
vec2 uvWin(vec2 xz){ return vec2((xz.x + 1000.) / 2000., 1. - (xz.y + 1000.) / 2000.); }
// whole-frame textures (north-up): u east, v north
vec2 uvFrame(vec2 xz){ return vec2((xz.x - uFrame.x) / uFrame.z, (-xz.y - uFrame.y) / uFrame.w); }
float radarAt(vec2 xz){ vec2 uv = uvFrame(xz);
  if (uHasRadar < .5 || any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return .32 + .25 * fbm(xz / 40.);
  float v = texture2D(uRadarTex, uv).r; return v * v * .6; } // stored as display grey: square ~ to linear
vec4 calendarAt(vec2 xz){
  vec2 uv=uvFrame(xz); if(uHasCalendar<.5 || any(lessThan(uv,vec2(0))) || any(greaterThan(uv,vec2(1))))return vec4(0.);
  vec4 parcel=texture2D(uParcelAtlas,uv);if(parcel.b<.5)return vec4(0.);
  vec2 cell=floor(parcel.rg*255.+.5)-1.;return texelFetch(uCalendarTex,ivec2(cell),0);
}
`;

/**
 * Patches a built-in lit material.
 * opts.radar: GLSL float expression for the radar-vision brightness (vWorldP available).
 * opts.sway: wind sway amplitude per metre of height^2 (trees, grass); 0 = none.
 * opts.vertexPre / fragPre / fragMap / fragNormal / fragRough / vertexMain: extra chunks for land.
 */
export function patch(material, opts = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    Object.assign(sh.uniforms, U, opts.uniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vWorldP;\n${opts.vertexPre || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${opts.sway ? swayChunk(opts.sway) : ''}\n${opts.vertexMain || ''}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWorldP = (modelMatrix * wp4).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vWorldP;\n${opts.fragPre || ''}`)
      .replace('#include <map_fragment>', opts.fragMap ?? '#include <map_fragment>')
      .replace('#include <roughnessmap_fragment>', opts.fragRough ?? '#include <roughnessmap_fragment>')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${opts.fragNormal || ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${opts.fragEmissive || ''}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { float cs = cloudShadow(vWorldP.xz); reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs;
          float wet = max(uWet, rainAt(vWorldP.xz)); // wet surfaces darken
          reflectedLight.directDiffuse *= 1. - .38 * wet; reflectedLight.indirectDiffuse *= 1. - .3 * wet; }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        if(uRadarMode>.001) { float rv = ${opts.radar || '0.3'}; gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(rv * mix(1., speckle(vWorldP.xz), .55)), uRadarMode); }
        if(uHasCalendar>.5 && (uCalendarMode>.001 || uAgeHaze>.001)) {
          vec4 cal=calendarAt(vWorldP.xz);if(cal.a>.1){
            gl_FragColor.rgb=mix(gl_FragColor.rgb,cal.rgb,uCalendarMode*(1.-uRadarMode));
            gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.38,.41,.40)*(1.-.97*uNight),max(uAgeHaze*.38,step(.75,cal.a)*.45)*(1.-uRadarMode));
          }
        }`);
    if (prev) prev(sh, r);
  };
  material.customProgramCacheKey = () => (opts.key || '') + (opts.sway || 0) + (opts.radar || '');
  return material;
}

function swayChunk(amp) {
  return /* glsl */ `{
    vec3 ip = vec3(0.);
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
    #endif
    float h = max(transformed.y, 0.);
    float gust = .55 + .45 * sin(uTime * .31 + ip.x * .004) * sin(uTime * .17 + ip.z * .005);
    float ph = uTime * 1.6 + dot(ip.xz, vec2(.11, .07));
    vec2 s = vec2(sin(ph) + .4 * sin(ph * 2.3 + 1.), cos(ph * .8) * .6) * gust * ${amp.toFixed(5)} * h * h;
    transformed.xz += s;
    transformed.y -= dot(s, s) * .5 / max(h, .5);
  }`;
}
