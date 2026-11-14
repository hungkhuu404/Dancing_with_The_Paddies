// Crowd renderer: agents are plain objects {x, y, z, yaw, clip, vis, ph}. The nearest few get a skinned glTF clone with
// its own AnimationMixer (random clip offset, staggered updates); everyone else within `far` is one instanced draw
// of a procedural stand-in, posed by a cheap per-clip lean/bob. Beyond `far`: hidden.
import * as THREE from 'three';
import { InstSet, litMaterial, patchScene, gltfParts } from './common.js';
import {createCrowdClone} from './crowdModels.js';

const POSE = {
  // clip -> (t, ph) => [dy, pitch]
  walk: (t, p) => [Math.abs(Math.sin(t * 6 + p)) * 0.04, 0.05],
  work: (t, p) => [0, 0.55 + Math.sin(t * 1.4 + p) * 0.18],
  wash: (t, p) => [-0.35, 0.8 + Math.sin(t * 3 + p) * 0.12],
  cast: (t, p) => [0, Math.sin(t * 1.1 + p) * 0.35],
  pull: (t, p) => [0, -0.2 + Math.sin(t * 0.7 + p) * 0.12],
  swim: (t, p) => [Math.sin(t * 2 + p) * 0.02, 0],
  jump: () => [0, -0.2],
  idle: (t, p) => [0, Math.sin(t * 0.5 + p) * 0.03],
  sit: () => [-0.12, -0.25],
  dabble: (t, p) => [0, Math.max(0, Math.sin(t * 0.9 + p)) > 0.6 ? 1.6 : 0.05],
  ride: () => [0, 0],
};

export function createCrowd(ctx, group, { name, agents, geo, model = name, near = 120, far = 400, pool = 16, pivot = 0.85, scale = 1, swimDrop = 0, attach = null, tick = null, detail = false, farModel = false }) {
  const inst = new InstSet(group, name, agents.length, { dynamic: true, cast: false, detail }); // far stand-ins: shadows not visible at that range
  inst.setParts([{ geometry: geo, material: null }], (m) => litMaterial(m, 'crowd' + name, { radar: '.5' }));
  let gltf = null, clips = null;
  const slots = [];
  const d = new THREE.Object3D(), M = new THREE.Matrix4(), Mp = new THREE.Matrix4(), Mr = new THREE.Matrix4(), Mb = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), V = new THREE.Vector3(), S = new THREE.Vector3(scale, scale, scale);
  for (const a of agents) { a.ph ??= Math.random() * 6.28; a.vis ??= true; a.clip ??= 'idle'; a.slot = null; a.d2 = 1e12; }

  function clipFor(c) {
    if (!clips) return null;
    const alias = { jump: 'swim', pull: 'cast', sit: 'idle', dabble: 'swim', wash: 'work', cast: 'work' }[c];
    return clips.get(c) || clips.get(alias) || clips.get('idle') || (c === 'idle' ? clips.values().next().value : clips.get('work')) || clips.values().next().value;
  }
  function setClip(s, c) {
    if (s.cur === c) return;
    const clip = clipFor(c);
    if (!clip) return;
    const act = s.mixer.clipAction(clip);
    if (s.act && s.act !== act) { act.reset().play(); act.crossFadeFrom(s.act, 0.35, false); }
    else act.play();
    // no idle clip in the model: hold the first frame of the main clip (its default pose) instead of looping it
    const hold = c === 'idle' && !clips.has('idle');
    act.paused = hold;
    if (hold) act.time = 0;
    else if (!s.act) act.time = Math.random() * clip.duration; // out of sync with the neighbours
    s.act = act; s.cur = c;
  }
  function slotFor() {
    let s = slots.find((x) => !x.agent);
    if (s || slots.length >= pool) return s || null;
    const obj = createCrowdClone(gltf,name,patchScene,scale,attach);
    group.add(obj);
    s = { obj, mixer: new THREE.AnimationMixer(obj), agent: null, cur: null, act: null, acc: 0 };
    slots.push(s);
    return s;
  }
  // an idle clone leaves the scene graph: hidden skinned clones still cost a matrix update of every bone each frame
  function release(s) { s.agent.slot = null; s.agent = null; s.obj.visible = false; group.remove(s.obj); }
  function reassign() {
    const want = agents.filter((a) => a.vis && a.d2 < near * near).sort((a, b) => a.d2 - b.d2).slice(0, pool);
    const keep = new Set(want);
    for (const s of slots) if (s.agent && !keep.has(s.agent)) release(s);
    for (const a of want) if (!a.slot) { const s = slotFor(); if (!s) break; s.agent = a; a.slot = s; s.obj.visible = true; s.cur = null; if (!s.obj.parent) group.add(s.obj); }
  }

  let frame = 0;
  // cheap: not the tile under the camera -> no skinned clones / mixers, stand-ins only
  function update(dt, t, cam, cheap = false) {
    frame++;
    const f2 = far * far;
    for (const a of agents) a.d2 = (a.x - cam.x) ** 2 + (a.y - cam.y) ** 2 + (a.z - cam.z) ** 2;
    if (cheap) { for (const s of slots) if (s.agent) release(s); }
    else if (gltf && frame % 12 === 1) reassign();
    let n = 0;
    for (const a of agents) {
      if (!a.vis) { if (a.slot) a.slot.obj.visible = false; continue; }
      if (a.slot) {
        const o = a.slot.obj;
        o.visible = true;
        o.position.set(a.x, a.y, a.z); o.rotation.set(a.pitch || 0, a.yaw, 0, 'YXZ');
        setClip(a.slot, a.clip);
        if (tick) tick(o, a, dt);
        continue;
      }
      if (a.d2 > f2) continue;
      const [dy, pitch] = (POSE[a.clip] || POSE.idle)(t, a.ph);
      // stand-in: rotate about a hip pivot so leaning doesn't swing the feet
      e.set(0, a.yaw, 0); q.setFromEuler(e);
      M.compose(V.set(a.x, a.y + dy + (a.clip === 'swim' ? swimDrop : 0), a.z), q, S);
      Mr.makeRotationX(pitch + (a.pitch || 0));
      M.multiply(Mp.makeTranslation(0, pivot, 0)).multiply(Mr).multiply(Mb.makeTranslation(0, -pivot, 0));
      inst.set(n++, M);
    }
    inst.count = n; inst.commit();
    // mixers: near every frame, mid every 2nd, far every 3rd (accumulated dt keeps the speed right)
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.agent) continue;
      s.acc += dt;
      const k = s.agent.d2 < 60 * 60 ? 1 : s.agent.d2 < 150 * 150 ? 2 : 3;
      if ((frame + i) % k === 0) { s.mixer.update(s.acc); s.acc = 0; }
    }
  }
  return {
    agents, model, update,
    get mixers() { return slots.filter((s) => s.agent).length; },
    setModel(g) {
      if (!g || !g.animations?.length) return false;
      gltf = g; clips = new Map();
      // animals: the far LOD can be the model's rest pose (people keep the stand-in: a rest pose reads as a T-pose)
      if (farModel) { const parts = gltfParts(g); if (parts.length) inst.setParts(parts, (m) => litMaterial(m, 'crowdglb' + name, { radar: '.5' })); }
      for (const c of g.animations) { const k = c.name.toLowerCase(); clips.set(k, c); for (const w of ['walk', 'work', 'wash', 'cast', 'pull', 'swim', 'jump', 'idle', 'sit', 'dabble', 'ride']) if (k.includes(w) && !clips.has(w)) clips.set(w, c); }
      return true;
    },
    setVisibleAll(v) { for (const s of slots) if (!v) s.obj.visible = false; inst.visible = v; },
  };
}
