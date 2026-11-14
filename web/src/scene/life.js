// Trees, houses, boats, egrets, fireflies and near-field rice stubble. Instanced, animated in shaders where possible.
import * as THREE from 'three';
import { patch, U } from './shaderlib.js';
import * as P from './props.js';
import { H, terrainHeight } from './land.js';
import { pickParcel } from '../data/parcels.js';
import { shared } from '../world/common.js';
import { treeImpostor } from './impostors.js';
import {createTuftMesh} from './tufts.js';

let NEAR_M = 190, NEAR_CAP = 600; // detailed-tree radius (m) and per-kind cap; reduced on the low tier
const SWAY = { palm: 0.0035, banana: 0.012, bush: 0.02, tuft: 1.4 };
const RADAR = { tree: '.36', house: '.95', boat: '.85', bird: '.5', tuft: 'radarAt(vWorldP.xz)' };

function treeMaterial(kind, src) { return shared(`tree|${kind}|${src?.uuid || '-'}`, () => makeTree(kind, src)); }
function makeTree(kind, src) {
  const m = src ? src.clone() : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  m.side = THREE.DoubleSide;
  if (m.transparent && m.map) { m.transparent = false; m.alphaTest = 0.5; }
  return patch(m, { key: 'tree' + kind, sway: SWAY[kind], radar: RADAR.tree });
}

function windowMaterial(src) { return shared(`window|${src?.uuid || '-'}`, () => makeWindow(src)); }
function makeWindow(src) {
  const m = src ? src.clone() : new THREE.MeshStandardMaterial({ color: 0x1a2024, roughness: 0.18, metalness: 0 });
  m.emissive = new THREE.Color(1.0, 0.6, 0.28); // ~2700 K
  m.emissiveIntensity = 1;
  m.emissiveMap = null;
  return patch(m, {
    key: 'window', radar: RADAR.house,
    vertexPre: 'varying float vWin;', vertexMain: 'vWin = float(gl_InstanceID);', fragPre: 'varying float vWin;',
    fragEmissive: /* glsl */ `{
      float hid = hash12(vec2(vWin, 3.1));
      float slot = floor((uTime + hid * 97.) / (24. + 50. * hid));
      float on = step(.3, hash12(vec2(vWin, slot)));
      if (hid > .9) on *= .72 + .28 * sin(uTime * 9. + vWin) * sin(uTime * 23. + vWin * 3.);
      totalEmissiveRadiance *= smoothstep(.35, 1., uNight) * on * 7.;
    }`,
  });
}

// KHR_mesh_quantization stores normalized ints; applyMatrix4 would write floats back into them.
function dequantize(g) {
  for (const [k, a] of Object.entries(g.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
  }
  return g;
}

/** Flattens a glTF scene into [{geometry, material}] in model space (one per material). */
export function gltfParts(gltf) {
  const parts = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = dequantize(o.geometry.clone()).applyMatrix4(o.matrixWorld);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.length > 1 && g.groups.length) {
      for (const gr of g.groups) {
        const sub = g.clone(); sub.setIndex(g.index ? Array.from(g.index.array.slice(gr.start, gr.start + gr.count)) : null);
        parts.push({ geometry: sub, material: mats[gr.materialIndex] });
      }
    } else parts.push({ geometry: g, material: mats[0] });
  });
  return parts;
}

/** Boat wake (V arms + churned core) on a plane behind the hull; drive uniforms.uSpeed 0..1 and uCol. */
export function wakeMaterial() {
  const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSpeed: { value: 0 }, uCol: { value: new THREE.Color() } }]),
      vertexShader: `varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uSpeed; uniform vec3 uCol; uniform float uTime; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){
          float along = 1. - vUv.y; float x = (vUv.x - .5) * 5.;
          float edge = abs(abs(x) - (.55 + along * 2.3));
          float arms = exp(-edge * edge * 22.) * (.6 + .4 * sin(along * 60. - uTime * 6.));
          float core = exp(-x * x * 5.) * (1. - along) * .6;
          float a = (arms + core) * (1. - along) * uSpeed;
          gl_FragColor = vec4(uCol, a * .55);
          #include <fog_fragment>
        }`,
    });
  m.uniforms.uTime = U.uTime;
  return m;
}

/** One tile's trees/houses/boats/egrets/fireflies (+ stubble while it is the active tile). opts.centre = tile centre. */
export async function createLife(parent, layout, land, pickIndex, quality, opts = {}, step = async () => {}) {
  if (quality.tier === "low") { NEAR_M = 110; NEAR_CAP = 150; }
  const [cx, cz] = opts.centre || [0, 0];
  const group = new THREE.Group();
  group.name = 'life';
  parent.add(group);
  const dummy = new THREE.Object3D();
  const parcels = layout.parcels;
  const groundAt = (x, z) => {
    const pi = pickParcel(pickIndex, parcels, x, z);
    return pi >= 0 ? H.dry : terrainHeight(layout, x, z);
  };

  // ---------------------------------------------------------------- instanced sets
  const sets = new Map(); // key -> { matrices, meshes }
  function setParts(key, parts, makeMat) {
    const s = sets.get(key);
    if (!s || !s.matrices.length) return;
    for (const m of s.meshes) { group.remove(m); m.geometry.dispose(); m.dispose(); }
    const cap = s.far ? Math.min(s.matrices.length, NEAR_CAP) : s.matrices.length;
    s.meshes = parts.map(({ geometry, material }) => {
      const im = new THREE.InstancedMesh(geometry, makeMat(material), cap);
      if (s.far) { im.count = 0; im.frustumCulled = false; s.dirty = true; } // filled by refreshLOD
      else s.matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = key;
      group.add(im);
      return im;
    });
  }
  const addMatrix = (key, m) => { if (!sets.has(key)) sets.set(key, { matrices: [], meshes: [] }); sets.get(key).matrices.push(m); };

  // trees: palm alternates palm_a / palm_b
  layout.trees.forEach((t, i) => {
    const kind = t.kind === 'palm' ? (i % 2 ? 'palm_b' : 'palm_a') : t.kind === 'banana' ? 'banana' : 'bush';
    dummy.position.set(t.x, groundAt(t.x, t.z) - 0.05, t.z);
    dummy.rotation.set(0, t.rot || 0, 0);
    dummy.scale.setScalar(t.scale || 1);
    dummy.updateMatrix();
    addMatrix(kind, dummy.matrix.clone());
  });
  await step('L0');
  layout.houses.forEach((h) => {
    if(h.infrastructureStyle&&h.infrastructureStyle!=='rural')return;
    // house_2 is a stilt house: its deck sits 0.35 m below the model origin, piles go further down
    dummy.position.set(h.x, terrainHeight(layout, h.x, h.z) + ((h.variant | 0) % 3 === 2 ? 0.45 : 0.05), h.z);
    dummy.rotation.set(0, h.rot || 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    addMatrix('house_' + ((h.variant | 0) % 3), dummy.matrix.clone());
  });
  const treeKind = (key) => (key.startsWith('palm') ? 'palm' : key);
  // ~14k trees: detailed models only near the camera, a ~30-triangle stand-in beyond NEAR_M
  for (const key of ['palm_a', 'palm_b', 'banana', 'bush']) {
    const s = sets.get(key);
    if (!s) continue;
    const impostor = treeImpostor(key);
    s.impostor = !!impostor;
    s.far = new THREE.InstancedMesh(impostor ? impostor.geometry.clone() : P.farTree(treeKind(key)), impostor ? impostor.material : treeMaterial(treeKind(key)), s.matrices.length);
    s.farGeo = s.far.geometry;
    s.far.count = 0; s.far.castShadow = !impostor && quality.tier !== 'low'; s.far.receiveShadow = true; s.far.frustumCulled = false; s.far.name = key + '_far';
    group.add(s.far);
  }
  const lodAt = new THREE.Vector3(1e9, 0, 0);
  let allFar = false;
  function refreshLOD(cam, force) {
    if (!force && cam.distanceToSquared(lodAt) < 40 * 40) return; // re-upload ~14k matrices only every 40 m of travel
    // camera far from this tile: every tree is a stand-in, as last time -> nothing to redo
    const far = Math.hypot(Math.max(0, Math.abs(cam.x - cx) - 1000), Math.max(0, Math.abs(cam.z - cz) - 1000), cam.y) > NEAR_M + 20;
    if (far && allFar && !force) return;
    allFar = far;
    lodAt.copy(cam);
    const n2 = NEAR_M * NEAR_M;
    for (const s of sets.values()) {
      if (!s.far) continue;
      let near = 0, far = 0;
      for (const m of s.matrices) {
        const e = m.elements, dx = e[12] - cam.x, dy = e[13] - cam.y, dz = e[14] - cam.z;
        if (dx * dx + dy * dy + dz * dz < n2 && near < NEAR_CAP && s.meshes.length) { for (const im of s.meshes) im.setMatrixAt(near, m); near++; }
        else s.far.setMatrixAt(far++, m);
      }
      for (const im of s.meshes) { im.count = near; im.instanceMatrix.needsUpdate = true; }
      s.far.count = far; s.far.instanceMatrix.needsUpdate = true;
    }
  }
  await step('L1');
  const procTree = { palm_a: P.palm(), palm_b: P.palm(), banana: P.banana(), bush: P.bush() };
  for (const key of Object.keys(procTree)) setParts(key, [{ geometry: procTree[key], material: null }], () => treeMaterial(treeKind(key)));
  const houseBody = (src) => shared(`house|${src?.uuid || '-'}`, () => patch(src ? src.clone() : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }), { key: 'house', radar: RADAR.house }));
  for (let v = 0; v < 3; v++) {
    const h = P.house(v);
    setParts('house_' + v, [{ geometry: h.body, material: null }, { geometry: h.windows, material: 'Window' }], (m) => (m === 'Window' ? windowMaterial() : houseBody()));
  }

  await step('L2');
  // ---------------------------------------------------------------- boats
  const boatGeo = P.boat();
  const boatMat = shared('boat', () => patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), { key: 'boat', radar: RADAR.boat }));
  const wakeGeo = new THREE.PlaneGeometry(5, 18, 1, 1).rotateX(-Math.PI / 2).translate(0, 0.03, -3.6 - 9);
  const boats = layout.boats.map((b, bi) => {
    const pts = b.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const mesh = new THREE.Mesh(boatGeo, boatMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const wakeMat = wakeMaterial();
    const wake = new THREE.Mesh(wakeGeo, wakeMat);
    wake.renderOrder = 2;
    mesh.add(wake);
    group.add(mesh);
    return { mesh, wake: wakeMat, pts, cum, L: cum[cum.length - 1], speed: b.speed_mps || 1.5, off: bi * 37.7, heading: null, last: new THREE.Vector3() };
  });
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), mixers = [];
  function pathAt(b, s, out) {
    let i = 1;
    while (i < b.cum.length - 1 && b.cum[i] < s) i++;
    const u = (s - b.cum[i - 1]) / Math.max(1e-6, b.cum[i] - b.cum[i - 1]);
    return out.lerpVectors(b.pts[i - 1], b.pts[i], Math.min(1, Math.max(0, u)));
  }

  await step('L3');
  // ---------------------------------------------------------------- egrets (boids)
  const zones = layout.egret_zones.length ? layout.egret_zones : [[cx, cz, 200]];
  const roost = opts.roost;
  const roostHeight = roost ? groundAt(roost.x,roost.z)+5 : 0;
  const NB = quality.tier === 'low' ? 28 : 56;
  const egGeo = P.egret();
  const aF = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3);
  aF.setUsage(THREE.DynamicDrawUsage);
  egGeo.setAttribute('aF', aF);
  const egPivot = new THREE.Vector2(0, 0.76);
  let egMeshes = [];
  const egretMaterial = (src) => {
    const m = src ? src.clone() : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    m.side = THREE.DoubleSide;
    if (m.transparent) { m.transparent = false; m.alphaTest = 0.5; }
    return patch(m, egretOpts);
  };
  const egretOpts = {
    key: 'egret', radar: RADAR.bird, uniforms: { uPivot: { value: egPivot } },
    vertexPre: 'attribute float aWing; attribute vec3 aF; uniform vec2 uPivot;',
    vertexMain: /* glsl */ `{
      float span = abs(aWing);
      if (span > .01) {
        float side = sign(aWing);
        float ang = sin(aF.x) * aF.y * side;
        vec2 p = vec2(transformed.x * mix(1., .18, aF.z), transformed.y - uPivot.y);
        float c = cos(ang), s = sin(ang);
        p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
        transformed.x = p.x; transformed.y = p.y + uPivot.y + aF.z * .03;
      }
    }`,
  };
  const egrets = new THREE.InstancedMesh(egGeo, egretMaterial(), NB);
  egrets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  egrets.castShadow = true;
  egrets.frustumCulled = false;
  egrets.name = 'egrets';
  group.add(egrets);
  let rs = 99;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const birds = Array.from({ length: NB }, (_, i) => {
    const z = zones[i % zones.length];
    const a = rnd() * 6.28;
    return {
      zone: i % zones.length, state: 0, timer: 4 + rnd() * 25, alt: 14 + rnd() * 26, phase: rnd() * 6.28,
      pos: new THREE.Vector3(z[0] + Math.cos(a) * z[2] * 0.6, 20 + rnd() * 20, z[1] + Math.sin(a) * z[2] * 0.6),
      vel: new THREE.Vector3(-Math.sin(a) * 8, 0, Math.cos(a) * 8), target: new THREE.Vector3(), yaw: a, bank: 0, dir: rnd() < 0.5 ? 1 : -1,
    };
  });
  const des = new THREE.Vector3(), sep = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), one = new THREE.Vector3(1, 1, 1);
  function landingSpot(b) {
    const z = zones[b.zone];
    let best = null;
    for (let k = 0; k < 10; k++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * z[2];
      const x = z[0] + Math.cos(a) * r, zz = z[1] + Math.sin(a) * r;
      const pi = pickParcel(pickIndex, parcels, x, zz);
      if (pi < 0) continue;
      best = [x, zz, pi];
      if (land.level[pi] > 0.5) break; // prefer flooded fields: egrets wade
    }
    if (!best) return false;
    const pi = best[2];
    b.target.set(best[0], land.level[pi] > 0.5 ? -0.12 : land.heightOfParcel(pi), best[1]);
    b.parcel = pi;
    return true;
  }
  function updateBirds(dt, t) {
    if(opts.reduced)dt=0;
    for (let i = 0; i < NB; i++) {
      const b = birds[i];
      const z = zones[b.zone];
      b.timer -= dt;
      const dusk=roost && U.uNight.value>.12;
      if(dusk){b.state=3;b.target.set(roost.x+Math.sin(i*2.399)*1.4,roostHeight+(i%3)*.45,roost.z+Math.cos(i*2.399)*1.4);}
      else if(b.state===3){b.state=0;b.timer=12;b.roosted=false;}
      if(b.state===3){
        des.subVectors(b.target,b.pos);const distance=des.length();
        b.roosted=distance<.35;
        des.multiplyScalar(Math.min(9,distance*.8)/Math.max(distance,.001));
        if(b.roosted){b.pos.copy(b.target);des.set(0,0,0);}
      } else if (b.state === 0) {
        // orbit the zone at cruise altitude, with separation
        const dx = b.pos.x - z[0], dz = b.pos.z - z[1], r = Math.hypot(dx, dz) || 1;
        const R = z[2] * 0.75;
        des.set((-dz / r) * b.dir, 0, (dx / r) * b.dir).multiplyScalar(9);
        des.x += (-dx / r) * (r - R) * 0.06; des.z += (-dz / r) * (r - R) * 0.06;
        des.y = (b.alt + 4 * Math.sin(t * 0.3 + i) - b.pos.y) * 0.5;
        sep.set(0, 0, 0);
        for (let j = 0; j < NB; j++) {
          if (j === i || birds[j].state !== 0) continue;
          const d2 = b.pos.distanceToSquared(birds[j].pos);
          if (d2 < 16 && d2 > 1e-4) sep.addScaledVector(tmpA.subVectors(b.pos, birds[j].pos), 1 / d2);
        }
        des.addScaledVector(sep, 6);
        if (b.timer < 0) { if (landingSpot(b)) b.state = 1; else b.timer = 10; }
      } else if (b.state === 1) {
        des.subVectors(b.target, b.pos);
        const d = des.length();
        des.multiplyScalar(Math.min(9, d * 0.9 + 0.5) / Math.max(d, 1e-3));
        if (d < 0.5) { b.state = 2; b.timer = 8 + rnd() * 22; b.vel.set(0, 0, 0); b.pos.copy(b.target); }
      } else if (b.state === 2) {
        // wading: slow steps, track field level
        des.set(Math.sin(t * 0.2 + i) * 0.15, 0, Math.cos(t * 0.17 + i * 2) * 0.15);
        b.pos.y = land.level[b.parcel] > 0.5 ? -0.12 : land.heightOfParcel(b.parcel);
        if (b.timer < 0) { b.state = 0; b.timer = 15 + rnd() * 35; b.vel.set(Math.cos(b.yaw), 3, Math.sin(b.yaw)); }
      }
      const k = b.state === 2 ? 1 : Math.min(1, dt * (b.state === 1 ? 2.5 : 1.4));
      b.vel.lerp(des, k);
      b.pos.addScaledVector(b.vel, dt);
      if (b.state !== 2 && b.pos.y < 0.5 && b.state === 0) b.pos.y = 0.5;
      // orientation
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if (sp > 0.05) {
        const yaw = Math.atan2(b.vel.x, b.vel.z);
        let dy = yaw - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        b.yaw += dy * Math.min(1, dt * 4);
        b.bank += ((-dy / Math.max(dt, 1e-3)) * 0.04 - b.bank) * Math.min(1, dt * 3);
      }
      const flying = b.state !== 2 && !b.roosted;
      e.set(flying ? -Math.atan2(b.vel.y, Math.max(sp, 0.1)) * 0.6 : 0, b.yaw, flying ? THREE.MathUtils.clamp(b.bank, -0.6, 0.6) : 0);
      q.setFromEuler(e);
      dummy.matrix.compose(b.pos, q, one);
      egrets.setMatrixAt(i, dummy.matrix);
      // wing beat: slow regular strokes with glides; folded when standing
      const glide = b.state === 0 && Math.sin(t * 0.7 + i * 1.3) > 0.55;
      b.phase += dt * (b.state === 1 ? 10 : 7.5) * (flying ? 1 : 0);
      aF.setXYZ(i, b.phase, flying ? (glide ? 0.08 : b.state === 1 ? 0.95 : 0.8) : 0, flying ? 0 : 1);
    }
    egrets.instanceMatrix.needsUpdate = true;
    aF.needsUpdate = true;
  }

  // ---------------------------------------------------------------- fireflies
  const NF = 320, fpos = new Float32Array(NF * 3), fseed = new Float32Array(NF);
  for (let i = 0; i < NF; i++) {
    const t = layout.trees[Math.floor(rnd() * layout.trees.length)] || { x: 0, z: 0 };
    fpos.set([t.x + (rnd() - 0.5) * 10, 0.6 + rnd() * 3, t.z + (rnd() - 0.5) * 10], i * 3);
    fseed[i] = rnd() * 100;
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('aSeed', new THREE.BufferAttribute(fseed, 1));
  const fmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uNight: U.uNight, uScale: { value: 300 } },
    vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime; uniform float uNight; uniform float uScale; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime * .3 + aSeed) * 1.4, sin(uTime * .5 + aSeed * 1.7) * .5, cos(uTime * .27 + aSeed * 2.3) * 1.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        float blink = pow(max(0., sin(uTime * (1.1 + fract(aSeed) * 1.4) + aSeed)), 6.);
        vA = blink * smoothstep(.55, 1., uNight);
        gl_PointSize = clamp(uScale * .09 / -mv.z, 1.5, 9.);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d) * vA; if (a < .01) discard; gl_FragColor = vec4(vec3(.75, 1., .35) * 4. * a, a); }`,
  });
  const fireflies = new THREE.Points(fgeo, fmat);
  fireflies.frustumCulled = false;
  fireflies.name = 'fireflies';
  group.add(fireflies);

  // ---------------------------------------------------------------- near-field stubble (follows the view target)
  const NT = quality.tier === 'low' ? 7000 : 20000, RAD = quality.tier === 'low' ? 38 : 58;
  let tufts = null, aTP = null;
  const tuftU = { uState: land.uniforms.uState, uEcology:land.uniforms.uEcology, uCenter: { value: new THREE.Vector3() }, uRad: { value: RAD } };
  function makeTufts() {
    tufts=createTuftMesh(NT,tuftU);
    aTP=tufts.geometry.getAttribute('aTP');
    group.add(tufts);
  }
  const builtAt = new THREE.Vector3(1e9, 0, 0);
  const col = new THREE.Color();
  function buildTufts(c) {
    builtAt.copy(c);
    let n = 0;
    // Leave headroom for lattice boundary points: hitting NT while scanning
    // truncated the circular patch into a conspicuous rectangular crop edge.
    const step = Math.sqrt((Math.PI * RAD * RAD) / NT) * 1.05;
    for (let gx = -RAD; gx <= RAD && n < NT; gx += step)
      for (let gz = -RAD; gz <= RAD && n < NT; gz += step) {
        if (gx * gx + gz * gz > RAD * RAD) continue;
        // world-anchored grid so tufts do not swim when rebuilt
        const wx = Math.round((c.x + gx) / step) * step + (hashf(gx + c.x, gz + c.z) - 0.5) * step;
        const wz = Math.round((c.z + gz) / step) * step + (hashf(gz + c.z, gx - c.x) - 0.5) * step;
        const pi = pickParcel(pickIndex, parcels, wx, wz);
        if (pi < 0) continue;
        dummy.position.set(wx, 0, wz);
        dummy.rotation.set(0, hashf(wx, wz) * 6.28, 0);
        dummy.scale.setScalar(0.7 + hashf(wz, wx) * 0.7);
        dummy.updateMatrix();
        tufts.setMatrixAt(n, dummy.matrix);
        const crop = ((pi * 7.31 + 1.7) * 127.1);
        const h = Math.sin(crop) * 43758.5453; const cr = h - Math.floor(h);
        if (cr < 0.55) col.setRGB(0.42, 0.33, 0.17); else if (cr < 0.74) col.setRGB(0.2, 0.15, 0.09); else col.setRGB(0.12, 0.24, 0.05);
        col.multiplyScalar(0.8 + hashf(wx * 3, wz) * 0.4);
        tufts.setColorAt(n, col);
        aTP.setXY(n, pi, 0);
        n++;
      }
    tufts.count = n;
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    aTP.needsUpdate = true;
  }
  const hashf = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

  // ---------------------------------------------------------------- update
  let tick = 0;
  function update(dt, t, target, camDist, camPos, active = true) {
    tick++;
    let force = false;
    for (const s of sets.values()) if (s.dirty) { s.dirty = false; force = true; }
    refreshLOD(camPos, force);
    for (const b of boats) {
      const T = b.L / b.speed;
      const p = ((t + b.off) / T) % 2;
      const u = p < 1 ? p : 2 - p;
      const eased = u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);
      pathAt(b, eased * b.L, tmpB);
      const v = tmpB.distanceTo(b.last) / Math.max(dt, 1e-3);
      if (v > 0.05) {
        const yaw = Math.atan2(tmpB.x - b.last.x, tmpB.z - b.last.z);
        if (b.heading === null) b.heading = yaw;
        let d = yaw - b.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
        b.heading += d * Math.min(1, dt * 0.9);
      }
      b.last.copy(tmpB);
      b.mesh.position.set(tmpB.x, Math.sin(t * 1.7 + b.off) * 0.035, tmpB.z);
      b.mesh.rotation.set(Math.sin(t * 1.1 + b.off) * 0.015, b.heading || 0, Math.sin(t * 1.3 + b.off) * 0.03, 'YXZ');
      b.wake.uniforms.uSpeed.value += (Math.min(1, v / 2) - b.wake.uniforms.uSpeed.value) * Math.min(1, dt * 2);
    }
    updateBirds(Math.min(dt, 0.05), t);
    if (active) for (const m of mixers) m.update(dt);
    fireflies.visible = U.uNight.value > 0.5;
    const showTufts = active && camDist < 240;
    if (showTufts && !tufts) makeTufts();
    if (tufts) tufts.visible = showTufts;
    if (showTufts && Math.hypot(target.x - builtAt.x, target.z - builtAt.z) > RAD * 0.3) buildTufts(target);
    tuftU.uCenter.value.copy(builtAt);
  }

  function setWakeColor(c) { for (const b of boats) b.wake.uniforms.uCol.value.copy(c); }

  // ---------------------------------------------------------------- GLB upgrades
  function upgrade(name, gltf) {
    if (!gltf) return false;
    const parts = gltfParts(gltf);
    if (!parts.length) return false;
    if (name.startsWith('palm') || name === 'banana' || name === 'bush') {
      setParts(name, parts, (m) => treeMaterial(treeKind(name), m));
    } else if (name.startsWith('house_')) {
      setParts(name, parts, (m) => (/window/i.test(m?.name || '') ? windowMaterial(m) : houseBody(m)));
    } else if (name === 'boat') {
      // whole model per boat (hull + rower), node animation "row" if present
      const mats = new Map();
      const clip = gltf.animations.find((a) => a.name === 'row');
      for (const b of boats) {
        const m = gltf.scene.clone(true);
        m.traverse((o) => {
          if (!o.isMesh) return;
          if (!mats.has(o.material)) mats.set(o.material, shared('boatglb|' + o.material.uuid, () => patch(o.material.clone(), { key: 'boatglb', radar: RADAR.boat })));
          o.material = mats.get(o.material);
          o.castShadow = o.receiveShadow = true;
        });
        b.mesh.geometry = new THREE.BufferGeometry();
        b.mesh.add(m);
        if (clip) { const mx = new THREE.AnimationMixer(m); mx.clipAction(clip).setEffectiveTimeScale(0.8 + (b.off % 0.4)).play(); mixers.push(mx); }
      }
    } else if (name === 'egret') {
      // bind pose (wings spread) as static geometry; the flap/fold stays in the instanced shader.
      // Wing vertices get aWing = signed span distance from the shoulder; body 0.
      let shoulderY = 0, n = 0, x0 = Infinity;
      for (const p of parts) if (/wing/i.test(p.material?.name || '')) {
        const a = p.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) { x0 = Math.min(x0, Math.abs(a.getX(i))); if (Math.abs(a.getX(i)) < 0.25) { shoulderY += a.getY(i); n++; } }
      }
      if (!n) return false;
      egPivot.set(0, shoulderY / n);
      for (const m of egMeshes) { group.remove(m); }
      egMeshes = parts.map(({ geometry, material }) => {
        const g = geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) g.deleteAttribute(k);
        const wing = /wing/i.test(material?.name || '');
        const aw = new Float32Array(g.attributes.position.count);
        if (wing) for (let i = 0; i < aw.length; i++) aw[i] = g.attributes.position.getX(i) || 1e-3;
        g.setAttribute('aWing', new THREE.BufferAttribute(aw, 1));
        g.setAttribute('aF', aF);
        const im = new THREE.InstancedMesh(g, egretMaterial(material), NB);
        im.instanceMatrix = egrets.instanceMatrix;
        im.castShadow = true; im.frustumCulled = false; im.name = 'egret_glb';
        group.add(im);
        return im;
      });
      egrets.visible = false;
    } else return false;
    return true;
  }

  function dispose() {
    for (const m of mixers) m.stopAllAction();
    group.removeFromParent();
    disposeTree(group);
  }

  /** distant tile (> ~1.2 km): ~8-triangle crowns instead of the ~90-triangle stand-ins */
  let distant = false;
  function setDistant(on) {
    if (on === distant) return;
    distant = on;
    for (const [key, s] of sets) if (s.far && !s.impostor) s.far.geometry = on ? crownGeo(treeKind(key)) : s.farGeo;
  }

  return { group, update, upgrade, prepareTufts(target){if(!tufts)makeTufts();buildTufts(target);tuftU.uCenter.value.copy(builtAt);tufts.visible=false;return tufts;}, setWakeColor, setDistant, egrets, fireflies, get tufts() { return tufts; }, boats, dispose };
}

// shared by every tile (never disposed): a 4-sided crown on a stick-less pyramid, coloured like the far stand-ins
const CROWNS = {};
function crownGeo(kind) {
  if (CROWNS[kind]) return CROWNS[kind];
  const palm = kind === 'palm', H = palm ? 9.5 : kind === 'banana' ? 2.4 : 1.2, r = palm ? 3 : kind === 'banana' ? 1.4 : 1.2;
  const g = P.paint(new THREE.ConeGeometry(r, palm ? 2.2 : H, 4, 1).rotateY(Math.PI / 4).translate(0, palm ? H : H / 2, 0), 0.07, palm ? 0.15 : 0.2, 0.035, 0.2);
  g.computeBoundingSphere();
  return (CROWNS[kind] = g);
}

/**
 * Frees the GPU side of everything under root (geometries, instance buffers). Materials are NOT disposed: that would
 * release their shader programs, and the next tile would recompile them (seconds on D3D). Unreferenced materials are
 * garbage collected; the programs stay cached (a fixed set). Textures are shared: kept.
 */
export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
}
