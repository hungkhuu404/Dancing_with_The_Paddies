// The living world, in two halves:
// - createTileWorld: everything placed by one tile's props.json (veg, structures, water life, smoke, people/animals,
//   traffic). Built in slices while streaming, disposed when the tile leaves. Only the tile under the camera runs the
//   full simulation; neighbours tick every 4th frame with stand-ins only (no skinned clones / mixers).
// - createWorld: the global systems (weather, NISAR pass, boat ride, sound, season time-lapse).
import * as THREE from 'three';
import { createVeg } from './veg.js';
import { createStructures } from './structures.js';
import { createWaterLife } from './waterlife.js';
import { createCharacters } from './characters.js';
import { createTraffic } from './traffic.js';
import { createSmoke } from './smoke.js';
import { createAtmosphere } from './atmosphere.js';
import { createNisar } from './nisar.js';
import { createRide } from './ride.js';
import { createSound } from './sound.js';
import { getModel } from './common.js';
import { localHour, hourToTod, rng } from './paths.js';
import { disposeTree } from '../scene/life.js';

const LISTS = ['bridges', 'power_lines', 'lift_nets', 'fish_stakes', 'pumps', 'shrines', 'religious', 'graves', 'washing_steps', 'moored_boats',
  'cargo_routes', 'longtail_routes', 'motorbike_routes', 'duck_flocks', 'people', 'dogs', 'smoke', 'straw_piles', 'veg', 'hyacinth_lanes', 'fish_jump_zones'];
export const MODELS = ['bamboo', 'tram', 'areca', 'mango', 'nipa', 'reeds', 'hyacinth', 'straw_pile', 'bridge_monkey', 'bridge_concrete', 'pole', 'pole_tx', 'lift_net',
  'fish_stakes', 'pump', 'shrine', 'church', 'grave', 'jars', 'clothesline', 'hammock', 'stilt_toilet', 'wader', 'fisher', 'washer', 'dog', 'duck',
  'buffalo', 'motorbike', 'longtail', 'cargo_boat', 'nisar'];

/** Placement data is external input: keep only well-formed entries. */
export function sanitizeProps(raw) {
  const ok = (v) => Number.isFinite(+v);
  const pts = (a) => Array.isArray(a) && a.length >= 2 && a.every((p) => Array.isArray(p) && ok(p[0]) && ok(p[1]));
  const out = { ...raw };
  for (const k of LISTS) {
    const a = Array.isArray(raw?.[k]) ? raw[k] : [];
    out[k] = a.filter((e) => e && typeof e === 'object' && ('points' in e ? pts(e.points) : ok(e.x) && ok(e.z)));
  }
  // Space Apps rules: no likenesses of minors in the project, so no child figures in the scene
  out.people = out.people.filter((p) => p.kind !== 'kid');
  return out;
}

/** One tile's living layer. ctx: the tile context (layout/props in global coords, land, groundAt, parcelAt, ...). */
export async function createTileWorld(ctx, step = async () => {}) {
  const group = new THREE.Group(); group.name = 'world';
  const builders = { veg: createVeg, structures: createStructures, water: createWaterLife, smoke: createSmoke, characters: createCharacters, traffic: createTraffic };
  const s = {};
  for (const [k, make] of Object.entries(builders)) { s[k] = await make(ctx,step); group.add(s[k].group); await step(k); }
  const systems = Object.values(s);
  let frame = 0, acc = 0;
  return {
    group, systems: s,
    /** active: the tile under the camera. low: low tier (neighbours without people/animals). */
    update(dt, t, camPos, active, low) {
      frame++;
      s.veg.update(dt, camPos);
      s.structures.update(dt, t, camPos);
      s.characters.group.visible = active || !low;
      if (active) { s.water.update(dt, t, camPos); s.characters.update(dt, t, camPos); s.traffic.update(dt, t, camPos); acc = 0; return; }
      acc += dt;
      if ((frame & 3) !== 0) return;
      s.water.update(acc, t, camPos);
      if (!low) s.characters.update(acc, t, camPos, true);
      s.traffic.update(acc, t, camPos, true);
      acc = 0;
    },
    upgrade(name, gltf) { let ok = false; for (const sys of systems) if (sys.upgrade?.(name, gltf)) ok = true; return ok; },
    onPass() { s.structures.onPass(); s.smoke.onPass(); },
    nearestEngine: (p) => s.traffic.nearestEngine(p),
    get stats() { return { mixers: s.characters.mixers + s.traffic.mixers, people: s.characters.counts, bikes: s.traffic.bikes.length, boats: s.traffic.movers.length }; },
    dispose() { group.removeFromParent(); disposeTree(group); },
  };
}

/** Global systems. ctx needs: scene, camera, quality, U, reduced, passes, acq, target(), setTod, clock, passIndex, gotoPass,
 *  setPassAll, sweepPass, farSweep, canals(), mooredBoats(), activeTile(), floodFrac(). */
export async function createWorld(ctx) {
  const group = new THREE.Group(); group.name = 'world_global';
  ctx.scene.add(group);
  const sound = createSound();
  ctx.onThunder = (d) => sound.thunder(d);
  const atmo = createAtmosphere(ctx);
  ctx.rainHere = atmo.rainAt;
  const nisar = createNisar(ctx);
  const ride = createRide(ctx);
  group.add(atmo.group, nisar.group, ride.boat);
  atmo.group.traverse((o) => o.layers.set(1)); // rain, bow: not in the water mirror
  ctx.camera.layers.enable(1);

  // ---------------------------------------------------------------- season time-lapse
  const DAY = 14; // seconds per simulated day
  const tl = { on: false, t: 0, day: 0, fired: false, R: rng(7) };
  const WEATHERS = ['clear', 'clear', 'showers', 'clear', 'showers', 'storm'];
  function tlStart() {
    if (ctx.reduced) return false;
    tl.on = true; tl.t = 0; tl.fired = false; tl.day = 0;
    if (ctx.passIndex() >= ctx.passes.length - 1) ctx.gotoPass(0, true);
    return true;
  }
  function tlStop() { tl.on = false; }
  function tlUpdate(dt) {
    if (!tl.on) return;
    tl.t += dt;
    const tod = (tl.t % DAY) / DAY;
    const day = Math.floor(tl.t / DAY);
    if (day !== tl.day) { tl.day = day; tl.fired = false; const w = WEATHERS[Math.floor(tl.R() * WEATHERS.length)]; atmo.setWeather(w, { here: w === 'clear' ? undefined : false }); }
    ctx.setTod(tod, true);
    const next = ctx.passIndex() + 1;
    if (next >= ctx.passes.length) { if (!nisar.active) { tl.on = false; ctx.onTimelapseEnd?.(); } return; }
    const h = ctx.acq?.[next] ? localHour(ctx.acq[next].acq_utc) : 18;
    const at = Math.min(0.97, hourToTod(h ?? 18));
    if (!tl.fired && tod >= at) { tl.fired = true; ctx.gotoPass(next, false, { keepTime: true }); }
  }

  let frame = 0;
  const camPos = new THREE.Vector3();
  function update(dt, t, camera, target, sky) {
    frame++;
    camPos.copy(camera.position);
    tlUpdate(dt);
    ride.update(dt, t, camera);
    atmo.update(dt, t, camPos, target, sky);
    nisar.update(dt);
    if (sound.on && frame % 6 === 0) {
      const S = sky.state, tile = ctx.activeTile();
      sound.update({ night: S.night, dawn: S.tod < 0.15 ? 1 - S.tod / 0.15 : 0, rain: atmo.rainAt(camPos.x, camPos.z), engineDist: tile ? tile.world.nearestEngine(camPos) : Infinity, flooded: ctx.floodFrac() });
    }
  }

  return {
    group, update, sound, nisar, ride, atmo,
    upgrade: (name, gltf) => nisar.upgrade(name, gltf),
    timelapse: { start: tlStart, stop: tlStop, get on() { return tl.on; } },
    async box(n) { const g = await getModel(n); if (!g) return null; g.scene.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g.scene); return [b.min.toArray().map((v) => +v.toFixed(2)), b.max.toArray().map((v) => +v.toFixed(2)), g.animations.map((a) => a.name)]; },
    get stats() { return { weather: atmo.weather, rain: +atmo.rain.toFixed(2), nisar: nisar.state, ride: ride.on }; },
  };
}
