// Built things: bridges, power poles + sagging wires, lift nets (animated), fish stakes, pumps (vibrating), shrines,
// churches/pagodas, graves, straw piles, and household clutter (jars, clotheslines, hammocks, stilt toilets).
import * as THREE from 'three';
import * as P from './placeholders.js';
import { staticKind, InstSet, litMaterial, gltfParts, cloneSkinned, patchScene, hashf } from './common.js';
import { catenary, sagFor, closestOnSeg } from './paths.js';

export function createStructures(ctx) {
  const { props, layout } = ctx;
  const low = ctx.quality.tier === 'low';
  const group = new THREE.Group(); group.name = 'structures';
  const kinds = {};
  const add = (name, items, geo, opts) => { if (items.length) kinds[name] = staticKind(group, name, items, geo, opts); };
  const ground = (x, z) => Math.max(ctx.groundAt(x, z), 0);

  // ---- bridges: span = len along local +X, deck ends at the bank height
  for (const kind of ['monkey', 'concrete']) {
    const base = kind === 'monkey' ? 12 : 14;
    add('bridge_' + kind, props.bridges.filter((b) => b.kind === kind).map((b) => {
      const ax = Math.cos(b.rot), az = -Math.sin(b.rot), h = (b.len || base) / 2;
      const y = Math.max(0.6, (ctx.terrainAt(b.x + ax * h, b.z + az * h) + ctx.terrainAt(b.x - ax * h, b.z - az * h)) / 2);
      return { x: b.x, y: y - 0.05, z: b.z, rot: b.rot, sx: (b.len || base) / base, sy: 1, sz: 1 };
    }), kind === 'monkey' ? P.bridgeMonkey() : P.bridgeConcrete(), { radar: '.9' });
  }

  // ---- power poles: local +Z along the line so the cross-arm (X) is across it; keep yaw continuous
  const poles = { pole: [], pole_tx: [] }, lines = [];
  for (const pl of props.power_lines) {
    const pts = pl.points, tx = new Set(pl.tx || []), line = [];
    let prev = null;
    pts.forEach(([x, z], i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      if (prev !== null && Math.cos(yaw - prev) < 0) yaw += Math.PI;
      prev = yaw;
      const it = { x, y: ground(x, z) - 0.1, z, rot: yaw };
      (tx.has(i) ? poles.pole_tx : poles.pole).push(it);
      line.push(it);
    });
    lines.push(line);
  }
  add('pole', poles.pole, P.pole(false), { radar: '.95' });
  add('pole_tx', poles.pole_tx, P.pole(true), { radar: '.95' });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x15140f, fog: true, transparent: true, opacity: 0.85 });
  const wires = new THREE.LineSegments(new THREE.BufferGeometry(), wireMat);
  wires.name = 'wires'; wires.frustumCulled = false;
  group.add(wires);
  function buildWires(offsets) {
    const pos = [], seg = low ? 3 : 8, v = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    const attach = (p, o) => { m.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(Y, p.rot), one); return new THREE.Vector3(...o).applyMatrix4(m).toArray(); };
    for (const line of lines)
      for (let i = 1; i < line.length; i++) {
        const A = line[i - 1], B = line[i], span = Math.hypot(B.x - A.x, B.z - A.z);
        if (span > 120) continue; // a gap in the line, not a span
        for (const o of offsets) {
          const c = catenary(attach(A, o), attach(B, o), sagFor(span), seg);
          for (let k = 1; k < c.length; k++) pos.push(...c[k - 1], ...c[k]);
        }
      }
    wires.geometry.dispose();
    wires.geometry = new THREE.BufferGeometry();
    wires.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }
  buildWires(P.WIRE);

  // ---- lift nets: static base + an arm pitched in a slow lowering/lifting cycle
  const nets = props.lift_nets.map((n, i) => ({ x: n.x, y: ground(n.x, n.z), z: n.z, rot: n.rot, ph: hashf(i, 3.3) * 22 }));
  const ln = P.liftNet();
  add('lift_net', nets, ln.base, { radar: '.6' });
  const arm = new InstSet(group, 'lift_arm', nets.length, { dynamic: true });
  arm.setParts([{ geometry: ln.arm, material: null }], () => litMaterial(null, 'liftarm', { radar: '.6' }));
  arm.count = nets.length;
  let netClones = null; // glTF version: a small pool of animated clones for the nearest nets, instanced static ones elsewhere
  let netClip = null, netTick = 0;
  const armPitch = (t) => { // seconds into a 22 s cycle -> pitch (rad, + = lowered)
    const c = t % 22;
    if (c < 12) return 0.23; if (c < 15) return 0.23 - (c - 12) / 3 * 0.58; if (c < 19) return -0.35; return -0.35 + (c - 19) / 3 * 0.58;
  };
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mR = new THREE.Matrix4(), dd = new THREE.Object3D();

  // ---- simple static kinds
  add('fish_stakes', props.fish_stakes.map((f) => ({ x: f.x, y: 0, z: f.z, rot: f.rot, sx: (f.len || 10) / 10, sy: 1, sz: 1 })), P.fishStakes(), { radar: '.7' });
  const pumpItems = props.pumps.map((p) => ({ x: p.x, y: ground(p.x, p.z), z: p.z, rot: p.rot }));
  add('pump', pumpItems, P.pump(), { radar: '.9' });
  add('shrine', props.shrines.map((s) => ({ x: s.x, y: ground(s.x, s.z), z: s.z, rot: s.rot })), P.shrine(), { radar: '.9' });
  let rel = props.religious;
  // no church/pagoda inside the window: show the nearest real churches (OSM) as horizon landmarks
  if (!rel.length && props.notes?.nearest_real_religious) rel = props.notes.nearest_real_religious.filter((r) => r.kind === 'church' && r.dist_m < 3000).slice(0, 2).map((r) => ({ ...r, rot: Math.atan2(-r.x, -r.z) }));
  for (const kind of ['church', 'pagoda'])
    add(kind, rel.filter((r) => r.kind === kind).map((r) => ({ x: r.x, y: Math.abs(r.x) > 1000 || Math.abs(r.z) > 1000 ? 0.2 : ground(r.x, r.z), z: r.z, rot: r.rot || 0 })), kind === 'church' ? P.church() : P.pagoda(), { radar: '.95' });
  const graves = [];
  for (const g of props.graves) {
    const ax = Math.cos(g.rot || 0), az = -Math.sin(g.rot || 0), n = g.count || 1;
    for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * 1.6, x = g.x + ax * o, z = g.z + az * o; graves.push({ x, y: ground(x, z), z, rot: g.rot || 0 }); }
  }
  add('grave', graves, P.grave(), { radar: '.9', detail: true });

  // ---- household clutter on a deterministic subset of houses (front yard), stilt toilets at canal edges
  const extra = { jars: [], clothesline: [], hammock: [], stilt_toilet: [] }, c = {};
  layout.houses.forEach((h, i) => {
    const r = h.rot || 0, fx = Math.sin(r), fz = Math.cos(r), rx = fz, rz = -fx, u = hashf(i * 1.7, 9.1);
    const put = (kind, f, s, rot = r) => { const x = h.x + fx * f + rx * s, z = h.z + fz * f + rz * s; extra[kind].push({ x, y: ctx.terrainAt(x, z) - 0.02, z, rot }); };
    if (u < 0.22) put('jars', 3.5, 4.5);
    else if (u < 0.36) put('clothesline', 6, -1, r + Math.PI / 2 * 0);
    else if (u < 0.44) put('hammock', 5, 3.5, r + Math.PI / 2);
    if (hashf(i, 2.2) < 0.2) {
      let best = { d: Infinity };
      for (const cn of layout.canals) for (let k = 1; k < cn.points.length; k++) { closestOnSeg(h.x, h.z, cn.points[k - 1], cn.points[k], c); if (c.d - cn.width_m / 2 < best.d) best = { d: c.d - cn.width_m / 2, x: c.x, z: c.z, hw: cn.width_m / 2, raw: c.d }; }
      if (best.d > 0 && best.d < 22) {
        const nx = (best.x - h.x) / best.raw, nz = (best.z - h.z) / best.raw, e = best.hw - 1.2; // inside the water by 1.2 m
        extra.stilt_toilet.push({ x: best.x - nx * e, y: 0, z: best.z - nz * e, rot: Math.atan2(nx, nz) + Math.PI });
      }
    }
  });
  add('jars', extra.jars, P.jars(), { radar: '.6', detail: true });
  add('clothesline', extra.clothesline, P.clothesline(), { radar: '.5', sway: 0.01, detail: true });
  add('hammock', extra.hammock, P.hammock(), { radar: '.5', detail: true });
  add('stilt_toilet', extra.stilt_toilet, P.stiltToilet(), { radar: '.8' });

  // ---- straw piles: only on fields that are dry at the current pass
  const straw = new InstSet(group, 'straw_pile', props.straw_piles.length, { detail: true });
  straw.setParts([{ geometry: P.strawPile(), material: null }], (m) => litMaterial(m, 'straw', { radar: '.45' }));
  function onPass() {
    let n = 0;
    for (const s of props.straw_piles) {
      const pi = ctx.parcelAt(s.x, s.z);
      if (pi >= 0 && ctx.land.level[pi] > 0.5) continue; // flooded: not here
      dd.position.set(s.x, ctx.groundAt(s.x, s.z) - 0.05, s.z); dd.rotation.set(0, hashf(s.x, s.z) * 6.28, 0); dd.scale.setScalar(s.scale || 1); dd.updateMatrix();
      straw.set(n++, dd.matrix);
    }
    straw.count = n; straw.commit();
  }
  onPass();

  const v = new THREE.Vector3();
  let netsDirty = 0;
  function update(dt, t, cam) {
    // lift nets
    if (netClones) {
      if (netTick++ % 20 === 0) { // re-pick the nearest nets for the animated pool
        const want = nets.map((n, i) => [(n.x - cam.x) ** 2 + (n.z - cam.z) ** 2, i]).filter((q) => q[0] < 220 * 220).sort((a, b) => a[0] - b[0]).slice(0, netClones.length).map((q) => q[1]);
        netClones.forEach((c, k) => {
          const i = want[k];
          if (c.i === i) return;
          if (c.i != null) { kinds.lift_net.set.set(c.i, nets[c.i].m); }
          c.i = i; c.obj.visible = i != null;
          if (i == null) return;
          const n = nets[i];
          c.obj.position.set(n.x, n.y, n.z); c.obj.rotation.y = n.rot;
          kinds.lift_net.set.set(i, mB.makeScale(0, 0, 0)); // hide its static twin
          if (netClip) c.mixer.clipAction(netClip).time = n.ph % netClip.duration;
        });
        kinds.lift_net.set.commit();
      }
      for (const c of netClones) if (c.i != null) c.mixer.update(dt);
    } else if ((netsDirty++ & 1) === 0 || !low) {
      nets.forEach((n, i) => {
        dd.position.set(n.x, n.y, n.z); dd.rotation.set(0, n.rot, 0); dd.scale.setScalar(1); dd.updateMatrix();
        mA.copy(dd.matrix).multiply(mB.makeTranslation(...P.ARM_PIVOT)).multiply(mR.makeRotationX(armPitch(t + n.ph)));
        arm.set(i, mA);
      });
      arm.commit();
    }
    // pumps hum: a sub-centimetre shake, only near the camera
    const pk = kinds.pump;
    if (pk) {
      pumpItems.forEach((p, i) => {
        if (v.set(p.x, p.y, p.z).distanceToSquared(cam) > 120 * 120) return;
        dd.position.set(p.x + Math.sin(t * 97 + i) * 0.006, p.y + Math.sin(t * 131 + i * 2) * 0.008, p.z); dd.rotation.set(0, p.rot, Math.sin(t * 89) * 0.004); dd.scale.setScalar(1); dd.updateMatrix();
        pk.set.set(i, dd.matrix);
      });
      pk.set.commit();
    }
  }

  function upgrade(name, gltf) {
    if (!gltf) return false;
    if (name === 'lift_net') {
      const clip = gltf.animations.find((a) => /lift/i.test(a.name)) || gltf.animations[0];
      if (!kinds.lift_net?.upgrade(gltf)) return false;
      arm.dispose();
      for (let i = 0; i < nets.length; i++) nets[i].m = kinds.lift_net.set.get(i, new THREE.Matrix4());
      netClip = clip;
      netClones = Array.from({ length: Math.min(nets.length, low ? 2 : 4) }, () => {
        const obj = patchScene(cloneSkinned(gltf.scene), 'liftnetglb', { radar: '.6' });
        obj.visible = false; group.add(obj);
        const mixer = new THREE.AnimationMixer(obj);
        if (clip) mixer.clipAction(clip).play();
        return { obj, mixer, i: null };
      });
      return true;
    }
    if (name === 'pole' || name === 'pole_tx') {
      const ok = kinds[name]?.upgrade(gltf);
      if (ok && name === 'pole') {
        const offs = ['wire_a', 'wire_b', 'wire_c'].map((k) => gltf.scene.getObjectByName(k)).filter(Boolean);
        if (offs.length === 3) { gltf.scene.updateMatrixWorld(true); buildWires(offs.map((o) => o.getWorldPosition(new THREE.Vector3()).toArray())); }
      }
      return !!ok;
    }
    if (name === 'bridge_monkey' || name === 'bridge_concrete') return !!kinds[name]?.upgrade(gltf);
    if (name === 'straw_pile') { const parts = gltfParts(gltf); if (!parts.length) return false; straw.setParts(parts, (m) => litMaterial(m, 'strawglb', { radar: '.45' })); return true; }
    return !!kinds[name]?.upgrade(gltf);
  }

  return { group, update, upgrade, onPass, names: [...Object.keys(kinds), 'straw_pile'] };
}

