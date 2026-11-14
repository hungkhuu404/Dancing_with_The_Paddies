// Traffic: motorbikes on the roads (wheels spin, headlights after dusk), longtail and cargo boats along the canals
// (propeller spin + wakes), moored boats bobbing at the banks.
import * as THREE from 'three';
import * as P from './placeholders.js';
import { createCrowd } from './crowd.js';
import { InstSet, litMaterial, gltfParts, patchScene, cloneSkinned } from './common.js';
import { makeRoute, sampleRoute, pingPong, rng } from './paths.js';
import { wakeMaterial } from '../scene/life.js';
import { H } from '../scene/land.js';

const ROAD_Y = H.bank + 0.06;

export function createTraffic(ctx) {
  const low = ctx.quality.tier === 'low';
  const group = new THREE.Group(); group.name = 'traffic';
  const R = rng(911);
  const o = {};

  // deck height over bridges (matches the placeholder bridge profiles), else the road surface
  const decks = ctx.props.bridges.map((b) => ({ ...b, ax: Math.cos(b.rot), az: -Math.sin(b.rot), y0: Math.max(0.6, ctx.terrainAt(b.x, b.z) > 0.5 ? ctx.terrainAt(b.x, b.z) : 1) }));
  function roadY(x, z) {
    let y = ROAD_Y;
    for (const b of decks) {
      const dx = x - b.x, dz = z - b.z, u = (dx * b.ax + dz * b.az) / (b.len / 2), w = Math.abs(dx * -b.az + dz * b.ax);
      if (Math.abs(u) < 1 && w < 2.2) y = Math.max(y, b.y0 + (b.kind === 'monkey' ? 0.2 + 1.6 : 0.4 + 0.9) * (1 - u * u));
    }
    return y;
  }

  // ---------------------------------------------------------------- motorbikes
  const bikes = [];
  for (const r of ctx.props.motorbike_routes) {
    if (!r.points || r.points.length < 2) continue;
    const route = makeRoute(r.points);
    // heights along the route every 3 m (bridges included), looked up by arc length
    const hs = []; for (let s = 0; s <= route.L + 3; s += 3) { sampleRoute(route, s, o, false); hs.push(roadY(o.x, o.z)); }
    const n = Math.max(1, Math.round((route.L / (low ? 450 : 220))));
    for (let i = 0; i < n; i++) bikes.push({ route, hs, speed: (r.speed_mps || 8) * (0.8 + R() * 0.4), d: R() * route.L * 2, x: 0, y: ROAD_Y, z: 0, yaw: 0, clip: 'ride', ph: R() * 6.28, loop: r.mode !== 'pingpong' && route.closed });
  }
  const tickBike = (obj, a, dt) => {
    const w = (obj.userData.wheels ??= ['wheel_f', 'wheel_r'].map((k) => obj.getObjectByName(k)).filter(Boolean));
    for (const wh of w) wh.rotation.x += (a.speed / 0.29) * dt; // wheel radius 0.29 m
  };
  const crowd = bikes.length ? createCrowd(ctx, group, { name: 'motorbike', agents: bikes, geo: P.motorbike(), near: low ? 80 : 160, far: 1600, pool: low ? 3 : 14, pivot: 0.5, tick: tickBike }) : null;
  // headlights: emissive lamp + soft additive cone on the road, instanced over all bikes
  const lampGeo = new THREE.SphereGeometry(0.09, 6, 4).translate(0, 1.0, 0.85);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const coneGeo = new THREE.PlaneGeometry(3.4, 7).rotateX(-Math.PI / 2).translate(0, 0.035, 4.35);
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }',
    // After rotateX(-PI/2), UV.y=1 is nearest the lamp (+Z is forward).
    // Width must grow toward the far end; all smoothstep edges are ascending.
    fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float along = 1. - vUv.y; float w = abs(vUv.x - .5) * 2.; float width = mix(.06, 1., along); float a = smoothstep(0., .08, along) * (1. - smoothstep(.62, 1., along)) * (1. - smoothstep(width * .55, width, w)); gl_FragColor = vec4(vec3(1., .88, .68) * a * uA, 1.); }',
  });
  const lights = new InstSet(group, 'bike_lights', Math.max(1, bikes.length), { cast: false, dynamic: true });
  lights.setParts([{ geometry: lampGeo, material: 'lamp' }, { geometry: coneGeo, material: 'cone' }], (m) => (m === 'lamp' ? lampMat : coneMat));
  const d = new THREE.Object3D();

  // ---------------------------------------------------------------- moving boats
  const boatGeo = { longtail: P.longtail(), cargo: P.cargoBoat() };
  const boatMat = litMaterial(null, 'traffic_boat', { radar: '.85' });
  const movers = [];
  const addMovers = (routes, kind, per, len, wakeScale) => {
    for (const r of routes) {
      if (!r.points || r.points.length < 2) continue;
      const route = makeRoute(r.points);
      for (let i = 0; i < per; i++) {
        const mesh = new THREE.Mesh(boatGeo[kind], boatMat); mesh.castShadow = mesh.receiveShadow = true;
        const wk = wakeMaterial();
        const wake = new THREE.Mesh(new THREE.PlaneGeometry(5 * wakeScale, 18 * wakeScale).rotateX(-Math.PI / 2).translate(0, 0.03, -len / 2 - 9 * wakeScale), wk);
        wake.renderOrder = 2; mesh.add(wake); group.add(mesh);
        movers.push({ kind, route, mesh, wake: wk, speed: r.speed_mps || 4, d: R() * route.L * 2, heading: null, last: new THREE.Vector3(1e9, 0, 0), ph: R() * 6.28, lane: 2 + R() * 2, prop: null });
      }
    }
  };
  addMovers(ctx.props.longtail_routes, 'longtail', low ? 1 : 2, 8, 1.15);
  addMovers(ctx.props.cargo_routes, 'cargo', 1, 22, 2.4);

  // ---------------------------------------------------------------- moored boats
  const mooredByKind = {};
  for (const b of ctx.props.moored_boats) { const k = b.kind === 'longtail' ? 'longtail' : b.kind === 'cargo' ? 'cargo' : 'xuong'; (mooredByKind[k] ||= []).push({ ...b, ph: R() * 6.28 }); }
  const moored = Object.entries(mooredByKind).map(([k, items]) => {
    const set = new InstSet(group, 'moored_' + k, items.length, { dynamic: true });
    set.setParts([{ geometry: k === 'xuong' ? P.xuong() : boatGeo[k], material: null }], (m) => litMaterial(m, 'moored' + k, { radar: '.85' }));
    set.count = items.length;
    return { k, set, items };
  });

  const tmp = new THREE.Vector3();
  let frame = 0;
  function update(dt, t, cam, cheap = false) {
    frame++;
    for (const b of bikes) {
      b.d += b.speed * dt;
      const L = b.route.L, pp = b.loop ? { s: b.d % L, dir: 1 } : pingPong(L, b.d);
      sampleRoute(b.route, pp.s, o, false);
      let yaw = o.yaw + (pp.dir < 0 ? Math.PI : 0);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw); // right-hand traffic: keep ~1 m right of the centre line
      b.x = o.x + rx * 1.0; b.z = o.z + rz * 1.0;
      const k = pp.s / 3, i = Math.min(b.hs.length - 2, Math.floor(k));
      b.y = b.hs[i] + (b.hs[i + 1] - b.hs[i]) * (k - i);
      let dy = yaw - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, dt * 5);
    }
    crowd?.update(dt, t, cam, cheap);
    const night = ctx.U.uNight.value, on = THREE.MathUtils.smoothstep(night, 0.3, 0.7);
    lights.visible = on > 0.01;
    if (on > 0.01) {
      let n = 0;
      for (const b of bikes) { d.position.set(b.x, b.y, b.z); d.rotation.set(0, b.yaw, 0); d.updateMatrix(); lights.set(n++, d.matrix); }
      lights.count = n; lights.commit();
      lampMat.color.setRGB(1, 0.94, 0.82).multiplyScalar(.9 + on * .6);
      coneMat.uniforms.uA.value = on * 0.09;
    }
    for (const m of movers) {
      m.d += m.speed * dt;
      const pp = pingPong(m.route.L, m.d);
      sampleRoute(m.route, pp.s, o, false);
      const dir = pp.dir;
      const yaw0 = o.yaw + (dir < 0 ? Math.PI : 0), rx = Math.cos(yaw0), rz = -Math.sin(yaw0);
      tmp.set(o.x + rx * m.lane, 0, o.z + rz * m.lane);
      const v = tmp.distanceTo(m.last) / Math.max(dt, 1e-3);
      if (m.heading === null) m.heading = yaw0;
      let dh = yaw0 - m.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      m.heading += dh * Math.min(1, dt * 0.8);
      m.last.copy(tmp);
      const big = m.kind === 'cargo';
      m.mesh.position.set(tmp.x, (big ? -0.35 : 0) + Math.sin(t * 1.5 + m.ph) * (big ? 0.02 : 0.04), tmp.z);
      m.mesh.rotation.set(-0.03 + Math.sin(t * 1.1 + m.ph) * 0.01, m.heading, Math.sin(t * 1.3 + m.ph) * (big ? 0.008 : 0.025), 'YXZ');
      m.wake.uniforms.uSpeed.value += (Math.min(1, v / (big ? 2.5 : 4)) - m.wake.uniforms.uSpeed.value) * Math.min(1, dt * 2);
      m.wake.uniforms.uCol.value.copy(ctx.sky.state.ambient);
      if (m.prop) m.prop.rotation.z += dt * 60;
    }
    // moored boats bob: near ones every frame, far ones rarely
    for (const g of moored) {
      g.items.forEach((b, i) => {
        if (frame > 2 && (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2 > 300 * 300 && (i + frame) % 30) return;
        d.position.set(b.x, (g.k === 'cargo' ? -0.35 : 0) + Math.sin(t * 1.4 + b.ph) * 0.03, b.z);
        d.rotation.set(Math.sin(t * 0.9 + b.ph) * 0.012, b.rot || 0, Math.sin(t * 1.2 + b.ph * 2) * 0.03, 'YXZ'); d.scale.setScalar(1); d.updateMatrix();
        g.set.set(i, d.matrix);
      });
      g.set.commit();
    }
  }

  function upgrade(name, gltf) {
    if (!gltf) return false;
    if (name === 'motorbike') return crowd ? crowd.setModel(gltf) : false;
    const kind = name === 'cargo_boat' ? 'cargo' : name === 'longtail' ? 'longtail' : null;
    if (!kind) return false;
    let ok = false;
    for (const m of movers) if (m.kind === kind) {
      const obj = patchScene(cloneSkinned(gltf.scene), 'boatglb' + kind, { radar: '.85' });
      m.mesh.geometry = new THREE.BufferGeometry(); m.mesh.add(obj);
      m.prop = obj.getObjectByName('prop') || null;
      ok = true;
    }
    const parts = gltfParts(gltf);
    for (const g of moored) if (g.k === kind && parts.length) { g.set.setParts(parts, (m) => litMaterial(m, 'mooredglb' + kind, { radar: '.85' })); ok = true; }
    return ok;
  }

  return {
    group, update, upgrade, bikes, movers,
    /** distance (m) from p to the nearest moving boat engine (for the soundscape) */
    nearestEngine(p) { let best = Infinity; for (const m of movers) best = Math.min(best, m.mesh.position.distanceTo(p)); return best; },
    get mixers() { return crowd ? crowd.mixers : 0; },
  };
}
