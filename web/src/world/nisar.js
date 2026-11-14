// NISAR pass moment: the satellite crosses the sky in the real direction of the track (…D descending north->south,
// …A ascending south->north), optionally adopts the acquisition's local time, and a radar swath sweeps the
// ground; each parcel's water changes when the swath front reaches it (land.setPass with per-parcel delays).
import * as THREE from 'three';
import { trackDir, localHour, hourToTod } from './paths.js';
import { patchScene } from './common.js';
import { sideLookingPosition } from './signatureRules.js';

const SPEED = 420; // minimum swath front speed (m/s): ~6 s across a close view, a readable "moment", not real orbital speed
const COL = new THREE.Color(0.55, 0.92, 0.95);

export function createNisar(ctx) {
  const group = new THREE.Group(); group.name = 'nisar';
  let warm = 3; // render a few frames invisibly at load so the shaders are compiled before the moment
  // placeholder satellite: bus, solar wing, boom and the big mesh reflector
  const sat = new THREE.Group();
  const m = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.6, emissive: c, emissiveIntensity: e, fog: false });
  const bus = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 9), m(0xc9a54a, 0.15));
  const wing = new THREE.Mesh(new THREE.BoxGeometry(32, 0.3, 7).translate(-19, 0, 0), m(0x1f3150, 0.2));
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 18, 6).rotateZ(Math.PI / 2).translate(12, 0, 0), m(0x999999));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 8, 0, Math.PI * 2, 0, 0.6).rotateZ(Math.PI / 2).translate(30, 0, 0), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide, emissive: 0x222222, fog: false }));
  sat.add(bus, wing, boom, dish);
  group.add(sat);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 3.5), fog: false }));
  sat.add(glint);
  sat.position.y = -5000; // out of sight during the warm-up frames

  // ground swath: a wide band whose front glows; behind it a fading tint
  const W = 40000, L = 80000; // NISAR's swath is ~240 km: the band covers the whole commune
  const swathMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, fog: false,
    uniforms: { uFront: { value: -1e4 }, uA: { value: 0 }, uCol: { value: COL }, uW: { value: 1 } },
    vertexShader: 'varying vec2 vL; void main(){ vL = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uFront; uniform float uA; uniform vec3 uCol; uniform float uTime; uniform float uW; varying vec2 vL;
      void main(){
        float d = (uFront - vL.y) / uW; // >0 behind the front; uW widens the line when seen from high up
        float line = exp(-abs(d) * .12) * .30;
        float edge = 1. - smoothstep(${(W / 2 - 200).toFixed(1)}, ${(W / 2).toFixed(1)}, abs(vL.x));
        float a = line * edge * uA;
        gl_FragColor = vec4(uCol, a);
      }`,
  });
  const swath = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), swathMat);
  swath.renderOrder = 6; swath.frustumCulled = false;
  group.add(swath);
  // beam: sheet from the satellite down to the swath front
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  beamGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 1, 1]), 1));
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uA: { value: 0 }, uCol: { value: COL } },
    vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uA; uniform vec3 uCol; varying float vT; void main(){ gl_FragColor = vec4(uCol, uA * .012 * vT * vT); }',
  });
  swathMat.uniforms.uTime = ctx.U.uTime;
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false; beam.renderOrder = 6;
  group.add(beam);

  const st = { on: false, t: 0, dir: [0, 1], s0: 0, end: 0, centre: new THREE.Vector3(), side: 1, pass: -1, track: '', speed: SPEED, back: 700, hw: 765 };
  const tmp = new THREE.Vector3(), right = new THREE.Vector3(), fwdH = new THREE.Vector3();

  /** Play the moment for pass i. opts.from: pass to start from (instant), opts.keepTime: don't change the time of day. */
  function play(i, opts = {}) {
    const pass = ctx.passes[i];
    if (!pass) return;
    const acq = ctx.acq?.[i];
    if (acq && !opts.keepTime) { const h = localHour(acq.acq_utc); if (h !== null) ctx.setTod(hourToTod(h)); }
    if (opts.from != null) ctx.setPassAll(opts.from, true);
    if (ctx.reduced) { ctx.setPassAll(i, true); return; }
    const dir = trackDir(pass.track);
    const c = ctx.target();
    // the sweep scales with the view: a close view sees a slow front, the whole-commune view a fast one
    const view = Math.max(0, ctx.camera.position.distanceTo(c));
    st.speed = Math.max(SPEED, view * 0.5); st.back = Math.max(700, view); st.hw = Math.max(765, view * 1.5);
    st.centre.set(c.x, 0, c.z); st.dir = dir; st.track = pass.track; st.pass = i;
    st.s0 = c.x * dir[0] + c.z * dir[1] - st.back;
    st.end = (st.back + Math.max(1500, view * 1.6)) / st.speed + 1.5;
    // Off-screen fields are capped at the end, including the satellite's lead-in.
    ctx.sweepPass(i, { dir, s0: st.s0, speed: st.speed, leadIn: 1.5, maxDelay: st.end + 1.5 });
    swathMat.uniforms.uW.value = st.speed / SPEED;
    // put the satellite on the side the camera looks toward, so it crosses the visible sky
    const cam = ctx.camera.position;
    right.set(-dir[1], 0, dir[0]);
    st.side = (c.x - cam.x) * right.x + (c.z - cam.z) * right.z >= 0 ? 1 : -1;
    st.t = -1.5; st.on = true;
    group.visible = true;
    swath.position.set(c.x, 1.35, c.z);
    swath.rotation.y = Math.atan2(dir[0], dir[1]);
    ctx.onPassMoment?.(i);
  }

  function update(dt) {
    if (!st.on) { if (warm > 0 && --warm === 0) group.visible = false; return; }
    st.t += dt;
    const fade = Math.min(1, (st.t + 1.5) / 0.8) * (1 - THREE.MathUtils.smoothstep(st.t, st.end, st.end + 1.5));
    const front = -st.back + Math.max(0, st.t) * st.speed; // relative to the centre, along the track
    ctx.farSweep.set(st.dir[0], st.dir[1], st.s0 + Math.max(0, st.t) * st.speed, 1);
    ctx.U.uScan.value.set(st.dir[0], st.dir[1], ctx.farSweep.z, fade * (st.t > 0 ? 1 : 0));
    ctx.U.uScanWidth.value = st.speed;
    const nightK = 1 - 0.6 * ctx.U.uNight.value; // additive light reads much stronger on a dark scene
    swathMat.uniforms.uFront.value = front; swathMat.uniforms.uA.value = fade * (st.t > 0 ? 1 : 0.0) * nightK;
    // 40 degree incidence at swath centre. Altitude, spacecraft and time are
    // scaled for explanation; this is not a reconstructed orbital ephemeris.
    const d = st.dir;
    sideLookingPosition(st.centre.x+d[0]*front,st.centre.z+d[1]*front,d,1800,st.side,40,tmp);
    sat.position.copy(tmp);
    sat.rotation.set(0, Math.atan2(d[0], d[1]) + Math.PI / 2 * (st.side > 0 ? 1 : -1), 0.35 * st.side);
    sat.visible = fade > 0.01;
    // beam: satellite -> both ends of the front line
    const p = beamGeo.attributes.position.array, fx = st.centre.x + d[0] * front, fz = st.centre.z + d[1] * front, hw = st.hw;
    p.set([tmp.x, tmp.y, tmp.z, fx - d[1] * hw, 1.4, fz + d[0] * hw, fx + d[1] * hw, 1.4, fz - d[0] * hw]);
    beamGeo.attributes.position.needsUpdate = true;
    beamMat.uniforms.uA.value = fade * (st.t > 0 ? 1 : 0);
    if (st.t > st.end + 1.6) { st.on = false; group.visible = false; ctx.farSweep.w = 0; ctx.U.uScan.value.w = 0; ctx.onPassMomentEnd?.(st.pass); }
  }

  return {
    group, play, update,
    stop() { if(!st.on)return;ctx.setPassAll(st.pass,true);st.on=false;group.visible=false;ctx.farSweep.w=0;ctx.U.uScan.value.w=0;ctx.onPassMomentEnd?.(st.pass); },
    get active() { return st.on; }, get state() { return { on: st.on, t: +st.t.toFixed(2), track: st.track, pass: st.pass, sat: sat.position.toArray().map(Math.round), front: Math.round(swathMat.uniforms.uFront.value), vis: sat.visible }; },
    upgrade(name, gltf) {
      if (name !== 'nisar' || !gltf) return false;
      const obj = patchScene(gltf.scene.clone(true), 'nisarglb', { radar: '.9', cast: false });
      obj.traverse((o) => { if (o.isMesh) o.material.fog = false; });
      const box = new THREE.Box3().setFromObject(obj), size = box.getSize(tmp).length();
      obj.scale.setScalar(110 / Math.max(size, 1e-3)); // ~110 m across: a few dozen pixels at 2 km (not to scale)
      for (const c of [bus, wing, boom, dish]) c.visible = false;
      sat.add(obj);
      return true;
    },
  };
}
