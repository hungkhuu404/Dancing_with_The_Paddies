// NISAR lens: the scene re-rendered in "radar vision" (shared uRadarMode switch in every material)
// into a scissored render target, composited inside a circle that follows the pointer.
import * as THREE from 'three';
import { Effect } from 'postprocessing';
import { U } from '../scene/shaderlib.js';

const FRAG = /* glsl */ `
uniform sampler2D tRadar; uniform vec2 uCenter; uniform float uRadius; uniform float uAmt; uniform float uDpr;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 p = uv * resolution;
  float d = distance(p, uCenter);
  float r = uRadius * uAmt;
  float inside = 1. - smoothstep(r - 1.5 * uDpr, r, d);
  vec3 rad = texture2D(tRadar, uv).rgb;
  vec3 col = mix(inputColor.rgb, rad, inside * step(.001, uAmt));
  float shade = (1. - smoothstep(r, r + 26. * uDpr, d)) * (1. - inside) * .32 * uAmt;
  col *= 1. - shade;
  float ring = 1. - smoothstep(.3 * uDpr, 1.3 * uDpr, abs(d - r));
  col = mix(col, vec3(.86, .88, .84), ring * .9 * step(.01, uAmt));
  outputColor = vec4(col, inputColor.a);
}`;

class LensEffect extends Effect {
  constructor() {
    super('RadarLens', FRAG, {
      uniforms: new Map([
        ['tRadar', new THREE.Uniform(null)], ['uCenter', new THREE.Uniform(new THREE.Vector2())],
        ['uRadius', new THREE.Uniform(130)], ['uAmt', new THREE.Uniform(0)], ['uDpr', new THREE.Uniform(1)],
      ]),
    });
  }
}

export function createRadarLens(renderer, scene, camera, hidden) {
  const effect = new LensEffect();
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  effect.uniforms.get('tRadar').value = rt.texture;
  const state = { on: false, hold: false, x: innerWidth / 2, y: innerHeight / 2, amt: 0, radiusCss: 130 };
  const clear = new THREE.Color(0x050605), prevClear = new THREE.Color();

  function setSize(w, h, dpr) {
    rt.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    effect.uniforms.get('uDpr').value = dpr;
    state.radiusCss = Math.min(130, Math.min(w, h) * 0.3);
  }

  function update(dt, reduced) {
    const want = state.on || state.hold ? 1 : 0;
    const k = reduced ? 1 : Math.min(1, dt * 9);
    state.amt += (want - state.amt) * k;
    if (Math.abs(want - state.amt) < 0.002) state.amt = want;
    const dpr = renderer.getPixelRatio();
    effect.uniforms.get('uAmt').value = state.amt;
    effect.uniforms.get('uRadius').value = state.radiusCss * dpr;
    effect.uniforms.get('uCenter').value.set(state.x * dpr, (innerHeight - state.y) * dpr);
  }

  function render() {
    if (state.amt < 0.002) return;
    const dpr = renderer.getPixelRatio();
    const r = state.radiusCss * state.amt + 4;
    const vis = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.getClearColor(prevClear);
    const prevAlpha = renderer.getClearAlpha();
    const bg = scene.background;
    scene.background = clear;
    const priorRadar=U.uRadarMode.value;
    U.uRadarMode.value = 1;
    renderer.setRenderTarget(rt);
    // scissor in render-target pixels (origin bottom-left); setScissor takes CSS-ish units * pixelRatio of rt => use raw via state
    renderer.setScissorTest(true);
    const x = (state.x - r), y = innerHeight - state.y - r;
    rt.scissor.set(x * dpr, y * dpr, 2 * r * dpr, 2 * r * dpr);
    rt.scissorTest = true;
    renderer.clear();
    renderer.render(scene, camera);
    rt.scissorTest = false;
    renderer.setScissorTest(false);
    renderer.setRenderTarget(null);
    U.uRadarMode.value = priorRadar;
    scene.background = bg;
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.autoUpdate = auto;
    hidden.forEach((o, i) => (o.visible = vis[i]));
  }

  return { effect, state, hidden, setSize, update, render, dispose() { rt.dispose(); } };
}
