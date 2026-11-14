// Atmosphere: passing rain cells (curtain, near
// streaks, dark cloud deck, ripples/wet ground via the shared uRain uniform), rainbow, distant lightning. Weather toggle.
import * as THREE from 'three';
import { COMMON, NOISE, U } from '../scene/shaderlib.js';
import { rng } from './paths.js';
import { smooth } from './common.js';
import { SMOKE_U } from './smoke.js';

const WIND = new THREE.Vector2(3.2, 1.4).normalize(); // same drift as the cloud shadows

export function createAtmosphere(ctx) {
  const low = ctx.quality.tier === 'low';
  const group = new THREE.Group(); group.name = 'atmosphere';
  const R = rng(31337);


  // ---------------------------------------------------------------- rain cell
  const cell = { x: 0, z: 0, r: 380, amt: 0, target: 0, speed: 9, active: false, gap: 0 };
  const weather = { kind: 'clear', storm: false };
  let historical=null;
  const curtainMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, // it is itself the haze; fog would wash it out at range
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAmt: { value: 0 }, uCol: { value: new THREE.Color() } }]),
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uAmt; uniform vec3 uCol; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      #include <fog_pars_fragment>
      void main(){
        float streak = fbm(vec2(vUv.x * 90., vUv.y * 6. + uTime * 1.8));
        float body = fbm(vec2(vUv.x * 9., vUv.y * 2. + uTime * .05));
        float face = smoothstep(.05, .7, abs(dot(vN, vV))); // soft silhouette instead of a hard edge
        float top = 1. - smoothstep(.35 + body * .35, .95, vUv.y);
        float a = uAmt * (.22 + .3 * streak) * (.6 + .6 * body) * face * top * smoothstep(0., .04, vUv.y);
        gl_FragColor = vec4(uCol, a);
        #include <fog_fragment>
      }`,
  });
  curtainMat.uniforms.uTime = U.uTime;
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0), curtainMat);
  curtain.renderOrder = 3; curtain.frustumCulled = false; curtain.visible = false;
  group.add(curtain);
  const deckMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    uniforms: { uAmt: { value: 0 }, uCol: { value: new THREE.Color() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uAmt; uniform vec3 uCol; uniform float uTime; varying vec2 vUv; ${NOISE}
      void main(){ vec2 p = vUv - .5; float n = fbm(p * 7. + uTime * .01); float a = smoothstep(.5, .2, length(p) + (n - .5) * .25) * uAmt * (.75 + .25 * n);
        gl_FragColor = vec4(uCol * (.7 + .5 * n), a); }`,
  });
  deckMat.uniforms.uTime = U.uTime;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2), deckMat);
  deck.renderOrder = 3; deck.frustumCulled = false; deck.visible = false;
  group.add(deck);
  // near streaks: a box of falling segments that follows the camera; faded by rainAt() (none on low)
  const NR = low ? 0 : 5000;
  let streaks = null;
  if (NR) {
    const pos = new Float32Array(NR * 6), seed = new Float32Array(NR * 4);
    for (let i = 0; i < NR; i++) {
      const x = R() * 90 - 45, y = R() * 50, z = R() * 90 - 45, s = R();
      pos.set([x, y, z, x, y, z], i * 6); seed.set([s, 0, s, 1], i * 4); // second float: segment end
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { ...U, uCam: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color() } },
      vertexShader: `${COMMON} attribute vec2 aSeed; uniform vec3 uCam; varying float vA;
        void main(){
          vec3 p = position; p.y = mod(p.y - uTime * (11. + aSeed.x * 4.), 50.);
          vec3 w = vec3(uCam.x + mod(p.x - uCam.x + 45., 90.) - 45., uCam.y - 18. + p.y, uCam.z + mod(p.z - uCam.z + 45., 90.) - 45.);
          w += aSeed.y * vec3(.15, 1.4, .06);
          vA = rainAt(w.xz) * step(-.4, w.y) * (1. - smoothstep(25., 45., distance(w, uCam)));
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
        }`,
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ if (vA < .01) discard; gl_FragColor = vec4(uCol, vA * .6); }',
    });
    streaks = new THREE.LineSegments(g, m);
    streaks.frustumCulled = false; streaks.renderOrder = 4; streaks.visible = false;
    group.add(streaks);
  }

  // overcast dome: darkens the sky (the Sky shader knows nothing about weather); in layer 0 so the water mirror sees it too
  const domeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uA; uniform vec3 uCol; varying vec3 vD; void main(){ float a = uA * (.6 + .4 * smoothstep(-.02, .35, vD.y)); gl_FragColor = vec4(uCol * (.85 + .3 * smoothstep(.0, .6, vD.y)), a); }',
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8000, 24, 12), domeMat);
  dome.frustumCulled = false; dome.renderOrder = -1; dome.visible = false; dome.name = 'overcast';
  ctx.scene.add(dome);

  // ---------------------------------------------------------------- rainbow (primary 42°, faint secondary 51°) around the antisolar point
  const bowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec3 vL; varying vec3 vW; void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uA; varying vec3 vL; varying vec3 vW;
      vec3 spec(float t){ return clamp(vec3(abs(t * 6. - 3.) - 1., 2. - abs(t * 6. - 2.), 2. - abs(t * 6. - 4.)), 0., 1.); }
      void main(){
        float ang = degrees(atan(length(vL.xy), 1.)); // angle from the antisolar axis (mesh sits at unit distance scale)
        float p = (ang - 40.6) / 1.8, s = (52.4 - ang) / 2.2;
        vec3 c = vec3(0.);
        if (p > 0. && p < 1.) c += spec(1. - p) * sin(p * 3.1416) * .9; // red outside
        if (s > 0. && s < 1.) c += spec(s) * sin(s * 3.1416) * .25;     // secondary: reversed, fainter
        c += vec3(.06) * smoothstep(40.6, 30., ang) * step(ang, 40.6);    // brighter sky inside the bow
        float ground = smoothstep(-2., 30., vW.y);
        gl_FragColor = vec4(c * uA * ground, 1.);
      }`,
  });
  const BOW_D = 1400;
  const bow = new THREE.Mesh(new THREE.CircleGeometry(Math.tan(THREE.MathUtils.degToRad(55)), 96).scale(BOW_D, BOW_D, 1), bowMat);
  bowMat.vertexShader = bowMat.vertexShader.replace('vL = position;', `vL = position / ${BOW_D.toFixed(1)};`);
  bow.frustumCulled = false; bow.renderOrder = 2; bow.visible = false;
  group.add(bow);

  // ---------------------------------------------------------------- lightning: a jagged emissive ribbon far away + a sky flash
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 8), transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat);
  bolt.frustumCulled = false; bolt.visible = false; bolt.renderOrder = 3;
  group.add(bolt);
  const flash = { t: -1, next: 6, seq: [], v: 0 };
  function makeBolt(cam) {
    const a = R() * 6.28, dist = 1200 + R() * 1600;
    const base = new THREE.Vector3(cam.x + Math.cos(a) * dist, 0, cam.z + Math.sin(a) * dist);
    const view = new THREE.Vector3().subVectors(base, cam).setY(0).normalize(), side = new THREE.Vector3(-view.z, 0, view.x);
    const pts = [], n = 14;
    let off = 0;
    for (let i = 0; i <= n; i++) { off += (R() - 0.5) * 70; pts.push(new THREE.Vector3(base.x + side.x * off, 480 * (1 - i / n), base.z + side.z * off)); }
    const pos = [];
    const w = 2.2;
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], B = pts[i];
      pos.push(A.x - side.x * w, A.y, A.z - side.z * w, A.x + side.x * w, A.y, A.z + side.z * w, B.x + side.x * w, B.y, B.z + side.z * w,
        A.x - side.x * w, A.y, A.z - side.z * w, B.x + side.x * w, B.y, B.z + side.z * w, B.x - side.x * w, B.y, B.z - side.z * w);
    }
    bolt.geometry.dispose();
    bolt.geometry = new THREE.BufferGeometry();
    bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return dist;
  }

  // ---------------------------------------------------------------- weather control
  function spawnCell(target, here) {
    const R0 = weather.storm ? 750 : 380;
    cell.r = R0; cell.speed = weather.storm ? 5 : 9;
    const back = here ? 0 : 900 + R0;
    const lat = here ? 0 : (R() - 0.5) * 500;
    cell.x = target.x - WIND.x * back - WIND.y * lat; cell.z = target.y - WIND.y * back + WIND.x * lat;
    cell.active = true; cell.target = 1;
  }
  const tgt2 = new THREE.Vector2();
  function setWeather(kind, opts = {}) {
    historical=null;
    weather.kind = kind; weather.storm = kind === 'storm';
    if (kind === 'clear') { cell.target = 0; return; }
    tgt2.set(ctx.target().x, ctx.target().z);
    spawnCell(tgt2, opts.here ?? true);
    if (opts.here === false) cell.amt = 0;
    if (kind === 'storm') flash.next = 3;
  }
  function cellRainAt(x, z) { // CPU twin of the shader rainAt() (without the noise edge)
    const d = Math.hypot(x - cell.x, z - cell.z);
    return cell.amt * (1 - smooth(cell.r * 0.55, cell.r, d));
  }

  const v3 = new THREE.Vector3(), anti = new THREE.Vector3(), grey = new THREE.Color();
  let rainbow = 0;
  function update(dt, t, cam, target, sky) {
    const S = sky.state;
    if(historical){
      const angle=historical.wind_direction_10m*Math.PI/180;
      WIND.set(-Math.sin(angle),Math.cos(angle));
      cell.speed=historical.wind_speed_10m;cell.x=target.x;cell.z=target.z;cell.r=18000;
      cell.active=historical.rain>0;cell.target=Math.min(1,historical.rain/4);cell.amt=cell.target;
      weather.kind=cell.active?'rain':'clear';weather.storm=false;
    }
    // smoke strength by time of day: cooking at dawn and dusk; straw burning in the afternoon, not in the rain
    const tod = S.tod;
    SMOKE_U.uKitchen.value = Math.max(1 - smooth(0.05, 0.2, tod), smooth(0.55, 0.68, tod) * (1 - smooth(0.9, 1, tod))) * 0.9 + 0.1;
    SMOKE_U.uStraw.value = smooth(0.2, 0.35, tod) * (1 - smooth(0.75, 0.85, tod)) * (1 - cell.amt * 0.8);
    SMOKE_U.uAmb.value.copy(S.ambient); SMOKE_U.uSun.value.copy(S.sunColor);

    // cell drift; respawn upwind while it is showery
    cell.amt += (cell.target - cell.amt) * Math.min(1, dt * 0.35);
    if (cell.active) {
      cell.x += WIND.x * cell.speed * dt; cell.z += WIND.y * cell.speed * dt;
      const along = (cell.x - target.x) * WIND.x + (cell.z - target.z) * WIND.y;
      if (along > 1400 + cell.r) {
        if (weather.kind === 'clear') cell.active = false;
        else { tgt2.set(target.x, target.z); spawnCell(tgt2, false); cell.amt = 0; }
      }
      if (weather.kind === 'clear' && cell.amt < 0.01) cell.active = false;
    }
    const amt = cell.active ? cell.amt : 0;
    U.uRain.value.set(cell.x, cell.z, cell.r, amt);
    const here = cellRainAt(cam.x, cam.z), atTarget = cellRainAt(target.x, target.z);
    U.uWet.value = Math.max(U.uWet.value - dt / 150, Math.max(here, atTarget) * 0.9);
    // light: dim under the cell (and everywhere a little while a storm is around)
    const dim = 1 - 0.72 * Math.max(atTarget, here) - (weather.storm ? 0.35 : 0.12) * amt;
    sky.sun.intensity = (S.sunI ?? sky.sun.intensity) * Math.max(0.2, dim);
    sky.hemi.intensity = (S.hemiI ?? sky.hemi.intensity) * (1 - 0.25 * amt) + flash.v * 2.5;
    U.uCloudAmt.value = Math.min(0.95, U.uCloudAmt.value + amt * (weather.storm ? 0.55 : 0.3));
    ctx.scene.fog.density *= 1 + 7 * Math.max(here, atTarget * 0.7);
    ctx.scene.fog.color.copy(S.fogColor).lerp(grey.setRGB(0.42, 0.44, 0.46).multiplyScalar(1 - S.night * 0.85), Math.min(1, amt * 0.4 + Math.max(here, atTarget) * 0.6));

    const over = Math.min(1, Math.max(atTarget, here, amt * 0.45)) * (weather.storm ? 0.9 : 0.55);
    dome.visible = over > 0.01;
    if (dome.visible) { dome.position.copy(cam); domeMat.uniforms.uA.value = over; domeMat.uniforms.uCol.value.copy(S.fogColor).lerp(grey.setRGB(0.3, 0.32, 0.35), 0.7).multiplyScalar((weather.storm ? 0.45 : 0.75) * (1 - S.night * 0.8) + flash.v * 0.8); }
    ctx.scene.environmentIntensity = (S.env ?? 0.35) * (1 - 0.6 * over);
    if (weather.storm) ctx.scene.fog.color.multiplyScalar(1 - 0.5 * over);
    curtain.visible = deck.visible = amt > 0.01;
    if (curtain.visible) {
      curtain.position.set(cell.x, -2, cell.z); curtain.scale.set(cell.r * 0.72, 400, cell.r * 0.72);
      curtainMat.uniforms.uAmt.value = amt * (weather.storm ? 1.3 : 1);
      curtainMat.uniforms.uCol.value.copy(S.fogColor).lerp(grey.setRGB(0.3, 0.32, 0.34), 0.7).multiplyScalar(0.62 - S.night * 0.5);
      deck.position.set(cell.x, 400, cell.z); deck.scale.set(cell.r * 2.6, 1, cell.r * 2.6);
      deckMat.uniforms.uAmt.value = amt * 0.85;
      deckMat.uniforms.uCol.value.copy(S.fogColor).multiplyScalar(weather.storm ? 0.32 : 0.5);
    }
    if (streaks) {
      streaks.visible = here > 0.02 || cellRainAt(target.x, target.z) > 0.02;
      streaks.material.uniforms.uCam.value.copy(cam);
      streaks.material.uniforms.uCol.value.copy(S.ambient).multiplyScalar(1.6);
    }

    // rainbow: sun low and up, behind the viewer, with rain out in front (antisolar side), not raining on the viewer
    anti.copy(S.sunDir).negate();
    const toCell = v3.set(cell.x - cam.x, 0, cell.z - cam.z), dc = toCell.length();
    const facing = dc > 1 ? (toCell.x * anti.x + toCell.z * anti.z) / (dc * Math.hypot(anti.x, anti.z) || 1) : 0;
    const want = S.elev > 0.5 && S.elev < 38 ? smooth(0.2, 0.7, facing) * smooth(0.05, 0.4, amt) * (1 - smooth(0.05, 0.4, here)) * smooth(200, 700, dc) : 0;
    rainbow += ((weather.forceBow && S.elev > 0.5 && S.elev < 38 ? 1 : want) - rainbow) * Math.min(1, dt * 0.5);
    bow.visible = rainbow > 0.01;
    if (bow.visible) {
      bow.position.copy(cam).addScaledVector(anti, BOW_D);
      bow.lookAt(cam);
      bowMat.uniforms.uA.value = rainbow * 0.55;
    }

    // lightning (storm only)
    flash.v = 0;
    if (weather.storm && amt > 0.3) {
      flash.next -= dt;
      if (flash.next < 0 && flash.t < 0) {
        const dist = makeBolt(cam);
        flash.t = 0; flash.next = 5 + R() * 12;
        flash.seq = [[0, 0.06, 1], [0.12, 0.2, 0.6], [0.28, 0.36, 0.9]].slice(0, 1 + Math.floor(R() * 3));
        ctx.onThunder?.(dist);
      }
    }
    if (flash.t >= 0) {
      flash.t += dt;
      for (const [a, b, s] of flash.seq) if (flash.t >= a && flash.t < b) flash.v = s;
      bolt.visible = flash.v > 0; boltMat.opacity = flash.v;
      if (flash.t > 0.5) { flash.t = -1; bolt.visible = false; }
    }
  }

  return {
    group, dome, update, setWeather, setHistorical(value){historical=value;}, rainAt: (x, z) => cellRainAt(x, z),
    get weather() { return weather.kind; }, get rain() { return cell.active ? cell.amt : 0; }, get flash() { return flash.v; },
    forceRainbow(on) { weather.forceBow = on; },
    cell,
  };
}
