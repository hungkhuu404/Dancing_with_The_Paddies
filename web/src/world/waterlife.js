// Water life: drifting water-hyacinth mats along hyacinth_lanes, and fish jumping (arc + splash ring + droplets)
// at random in fish_jump_zones near the camera.
import * as THREE from 'three';
import * as P from './placeholders.js';
import { InstSet, litMaterial, gltfParts } from './common.js';
import { makeRoute, sampleRoute, closestOnSeg, rng } from './paths.js';

export function createWaterLife(ctx) {
  const low = ctx.quality.tier === 'low';
  const group = new THREE.Group(); group.name = 'waterlife';
  const R = rng(77);

  // ---------------------------------------------------------------- hyacinth
  const CAP = low ? 700 : 2400;
  const lanes = ctx.props.hyacinth_lanes.filter((l) => l.points?.length >= 2).map((l) => {
    const route = makeRoute(l.points), c = {};
    let hw = 4;
    for (const cn of ctx.layout.canals) for (let k = 1; k < cn.points.length; k++) { closestOnSeg(l.points[0][0], l.points[0][1], cn.points[k - 1], cn.points[k], c); if (c.d < 3) hw = cn.width_m / 2; }
    return { route, speed: l.speed_mps || 0.15, n: Math.round(route.L * (l.density || 0.1)), hw };
  });
  const total = lanes.reduce((s, l) => s + l.n, 0), keep = Math.min(1, CAP / Math.max(1, total));
  const mats = [];
  lanes.forEach((l, li) => {
    const n = Math.round(l.n * keep);
    for (let i = 0; i < n; i++) mats.push({ lane: l, s: R() * l.route.L, lat: (R() * 2 - 1) * Math.max(0.5, l.hw * 0.75), yaw: R() * 6.28, spin: (R() - 0.5) * 0.06, sc: 0.6 + R() * 0.9, x: 0, z: 0, ph: R() * 6.28, li });
  });
  // LOD: detailed mats near the camera, a few flattened blobs beyond (they are rendered again in the mirror pass)
  const NEAR = low ? 70 : 120, NCAP = low ? 50 : 150;
  const hy = new InstSet(group, 'hyacinth', Math.min(NCAP, mats.length), { cast: false, dynamic: true, detail: true });
  hy.setParts([{ geometry: P.hyacinth(), material: null }], (m) => litMaterial(m, 'hyacinth', { radar: '.08' }));
  const hyFar = new InstSet(group, 'hyacinth_far', mats.length, { cast: false, dynamic: true, detail: true });
  hyFar.setParts([{ geometry: P.farHyacinth(), material: null }], () => litMaterial(null, 'hyacinthfar', { radar: '.08' }));
  for (const h of mats) h.m = new THREE.Matrix4();
  const o = {}, d = new THREE.Object3D();
  function place(h, t) {
    sampleRoute(h.lane.route, h.s, o, true);
    const nx = Math.cos(o.yaw), nz = -Math.sin(o.yaw); // right of travel
    h.x = o.x + nx * h.lat; h.z = o.z + nz * h.lat;
    d.position.set(h.x, 0.015 + Math.sin(t * 0.9 + h.ph) * 0.02, h.z);
    d.rotation.set(Math.sin(t * 0.7 + h.ph) * 0.03, h.yaw, Math.cos(t * 0.6 + h.ph) * 0.03);
    d.scale.set(h.sc, 1, h.sc);
    d.updateMatrix();
    h.m.copy(d.matrix);
  }
  let frame = 0;
  const cand = [];

  // ---------------------------------------------------------------- fish jumps
  const zones = ctx.props.fish_jump_zones;
  const NJ = 4, DROPS = 14;
  const fishGeo = new THREE.SphereGeometry(0.06, 6, 4).scale(0.7, 1, 3.2);
  const fishMat = new THREE.MeshStandardMaterial({ color: 0x9aa39c, roughness: 0.3, metalness: 0.6 });
  const ringGeo = new THREE.RingGeometry(0.85, 1, 28).rotateX(-Math.PI / 2);
  const dropPos = new Float32Array(NJ * DROPS * 3), dropVel = new Float32Array(NJ * DROPS * 3);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3).setUsage(THREE.DynamicDrawUsage));
  const dropMat = new THREE.PointsMaterial({ color: 0xdfe8e4, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false });
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.frustumCulled = false; group.add(drops);
  const jumps = Array.from({ length: NJ }, () => {
    const fish = new THREE.Mesh(fishGeo, fishMat); fish.visible = false; group.add(fish);
    const rings = [0, 1].map(() => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe8efe9, transparent: true, opacity: 0, depthWrite: false, fog: true })); m.renderOrder = 2; m.visible = false; group.add(m); return m; });
    return { t: -1, x: 0, z: 0, yaw: 0, fish, rings, splash2: false };
  });
  let nextJump = 2;
  // splash for others (kids jumping in): borrow an idle jump slot's ring + droplets
  ctx.splash = (x, z) => { const j = jumps.findIndex((q) => q.t < 0 && !q.rings[0].visible); if (j >= 0) splash(j, 0, x, z); };
  const splash = (j, k, x, z) => {
    for (let i = 0; i < DROPS; i++) {
      const q = (j * DROPS + i) * 3, a = R() * 6.28, sp = 0.6 + R() * 1.4;
      dropPos[q] = x; dropPos[q + 1] = 0.02; dropPos[q + 2] = z;
      dropVel[q] = Math.cos(a) * sp * 0.5; dropVel[q + 1] = 1.2 + R() * 1.8; dropVel[q + 2] = Math.sin(a) * sp * 0.5;
    }
    const r = jumps[j].rings[k]; r.position.set(x, 0.02, z); r.visible = true; r.userData.t = 0;
  };
  function updateJumps(dt, cam) {
    nextJump -= dt;
    if (nextJump < 0 && zones.length) {
      nextJump = (low ? 6 : 3) + R() * 7;
      const near = zones.filter((zn) => Math.hypot(zn.x - cam.x, zn.z - cam.z) < 260);
      const j = jumps.find((q) => q.t < 0);
      if (near.length && j) {
        const zn = near[Math.floor(R() * near.length)], a = R() * 6.28, r = Math.sqrt(R()) * (zn.r || 10);
        j.x = zn.x + Math.cos(a) * r; j.z = zn.z + Math.sin(a) * r;
        const pi = ctx.parcelAt(j.x, j.z);
        if (pi < 0 || ctx.land.level[pi] > 0.6) { j.t = 0; j.yaw = R() * 6.28; j.splash2 = false; splash(jumps.indexOf(j), 0, j.x, j.z); }
      }
    }
    jumps.forEach((j, ji) => {
      for (const r of j.rings) if (r.visible) {
        r.userData.t += dt;
        const u = r.userData.t / 1.6;
        r.scale.setScalar(0.15 + u * 1.3);
        r.material.opacity = 0.55 * (1 - u) * (1 - u);
        if (u >= 1) r.visible = false;
      }
      if (j.t < 0) return;
      j.t += dt;
      const u = j.t / 0.7, fx = Math.sin(j.yaw), fz = Math.cos(j.yaw);
      j.fish.visible = u < 1;
      if (u < 1) {
        j.fish.position.set(j.x + fx * u * 0.9, Math.sin(u * Math.PI) * 0.55, j.z + fz * u * 0.9);
        j.fish.rotation.set(-Math.cos(u * Math.PI) * 1.1, j.yaw, 0, 'YXZ');
      } else if (!j.splash2) { j.splash2 = true; splash(ji, 1, j.x + fx * 0.9, j.z + fz * 0.9); }
      if (j.t > 2.4) j.t = -1;
    });
    let any = false;
    for (let i = 0; i < NJ * DROPS; i++) {
      const q = i * 3;
      if (dropPos[q + 1] <= 0) { dropPos[q + 1] = -10; continue; }
      any = true;
      dropVel[q + 1] -= 9.8 * dt;
      dropPos[q] += dropVel[q] * dt; dropPos[q + 1] += dropVel[q + 1] * dt; dropPos[q + 2] += dropVel[q + 2] * dt;
    }
    drops.visible = any;
    if (any) dropGeo.attributes.position.needsUpdate = true;
  }

  function update(dt, t, cam) {
    frame++;
    const n2 = 350 * 350, d2 = NEAR * NEAR;
    let nf = 0;
    cand.length = 0;
    for (let i = 0; i < mats.length; i++) {
      const h = mats[i];
      h.s += h.lane.speed * dt; h.yaw += h.spin * dt;
      const q = (h.x - cam.x) ** 2 + (h.z - cam.z) ** 2;
      if (q < n2 || (i + frame) % 10 === 0 || frame <= 2) place(h, t);
      if (q < d2) { h.q = q; cand.push(h); } else hyFar.set(nf++, h.m);
    }
    if (cand.length > hy.cap) cand.sort((a, b) => a.q - b.q); // the closest mats get the detailed model
    let nn = 0;
    for (const h of cand) { if (nn < hy.cap) hy.set(nn++, h.m); else hyFar.set(nf++, h.m); }
    hy.count = nn; hyFar.count = nf; hy.commit(); hyFar.commit();
    updateJumps(dt, cam);
    const night = ctx.U.uNight.value;
    for (const j of jumps) for (const r of j.rings) r.material.color.setScalar(0.9 - night * 0.7);
    dropMat.color.setScalar(0.9 - night * 0.7);
  }

  return {
    group, update,
    upgrade(name, gltf) {
      if (name !== 'hyacinth' || !gltf) return false;
      const parts = gltfParts(gltf);
      if (!parts.length) return false;
      hy.setParts(parts, (m) => litMaterial(m, 'hyacinthglb', { radar: '.08' }));
      return true;
    },
  };
}
