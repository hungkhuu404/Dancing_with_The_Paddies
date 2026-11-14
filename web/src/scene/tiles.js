// Tile streaming: the commune is cut into 2 km tiles (scene/commune/index.json). The tiles around the view target are
// loaded (fetch JSON, then built in idle-time slices so the frame rate doesn't hitch), shown with land + trees/houses +
// the living layer, and disposed again when the target moves away (with hysteresis). The far field draws everywhere else.
import * as THREE from 'three';
import { json, normalizeLayout, applyCells } from '../data/load.js';
import { buildGrid, pickParcel, centroid } from '../data/parcels.js';
import { shiftXZ, selectTiles, tileDist, tileAt } from '../data/commune.js';
import { createLand, H, terrainHeight } from './land.js';
import { createLife } from './life.js';
import { createRuralLife } from './rural.js';
import { createEcosystem } from './ecosystem.js';
import { warmShadowPrograms } from './shadowWarmup.js';
import { maskResolution } from './raster.js';
import { createTileWorld, sanitizeProps } from '../world/index.js';
import { sweepDelay } from '../world/paths.js';
import {createInfrastructure} from '../world/infrastructure.js';
import {enrichRoads,placeHouse} from '../world/infrastructurePlacement.js';

/** Budgets per quality tier. */
export function tileBudget(tier) {
  return tier === 'low'
    ? { max: 4, radius: 1500, worldDist: 500, showDist: 6000, mirrorDist: 300, crownDist: 600 }
    : { max: 9, radius: 2400, worldDist: 700, showDist: 9000, mirrorDist: 700, crownDist: 1200 };
}

/**
 * A step() for async builders: once `budget` ms of work have run, yields a macrotask (MessageChannel: no 4 ms clamp) so
 * the browser can render a frame in between. step.stats: {work, slices, worst} in ms.
 */
const chan = typeof MessageChannel === 'function' ? new MessageChannel() : null, waiting = [];
if (chan) chan.port1.onmessage = () => waiting.shift()?.();
const yieldTask = () => new Promise((r) => { if (chan) { waiting.push(r); chan.port2.postMessage(0); } else setTimeout(r, 0); });
export function makeStep(budget = 8) {
  let t0 = performance.now();
  const stats = { work: 0, slices: 0, worst: 0 };
  const step = async (label = '') => {
    const used = performance.now() - t0;
    if (used < budget) return;
    if (used > stats.worst) stats.at = label;
    if (used > 150) console.info('tile build slice', label, Math.round(used), 'ms');
    stats.work += used; stats.slices++; stats.worst = Math.max(stats.worst, used);
    await yieldTask();
    await new Promise((r) => requestAnimationFrame(() => r())); // one build slice per frame at most
    t0 = performance.now();
  };
  step.stats = stats;
  step.reset = () => { t0 = performance.now(); }; // after network waits: only count our own work
  return step;
}

/**
 * S: { index, base (URL of the index folder), root (Group), quality, groundTex, contract, nPasses, wctx (shared world ctx),
 *      models (Map name -> glTF), renderer, camera, pass() -> current pass, onChange() }
 */
export function createTiles(S) {
  const half = S.index.tile_m / 2, origin = S.index.origin;
  const budget = tileBudget(S.quality.tier);
  const descs = S.index.tiles;
  const byId = new Map(descs.map((d) => [d.id, d]));
  const tiles = new Map(); // id -> tile (loading or ready)
  const queue = [];
  let loading = null, active = null, lastSel = new THREE.Vector3(1e9, 0, 0), selTick = 0;
  const ready = () => [...tiles.values()].filter((t) => t.ready);
  let readyList = [], shown = [], canals = [], moored = [];

  function refreshLists() {
    readyList = ready();
    canals = readyList.flatMap((t) => t.layout.canals);
    moored = readyList.flatMap((t) => t.props.moored_boats);
    S.onChange?.();
  }

  async function build(t) {
    const step = makeStep(t.boot ? 40 : 8);
    const d = t.desc, t0 = performance.now();
    const tr = (t.trace = []), mark = (k) => tr.push(k + ':' + Math.round(performance.now() - t0));
    const [layout, rawProps] = await Promise.all([json(S.base + d.layout), json(S.base + d.props).catch(() => ({}))]);
    mark('fetch'); step.reset();
    if (t.dead) return;
    normalizeLayout(layout, S.nPasses);
    shiftXZ(layout, d.x, d.z);
    const props = sanitizeProps(shiftXZ(rawProps, d.x, d.z));
    if (S.contract) applyCells(layout, S.contract, origin);
    if(S.infrastructure){
      // Source matching and footprint tests are CPU work too. Yield within this
      // stage rather than after an entire dense village has blocked a frame.
      for(const road of layout.roads){enrichRoads({roads:[road]},S.infrastructure);await step('road-metadata');if(t.dead)return;}
      for(const h of layout.houses){h.infrastructurePlacement=placeHouse(h,layout,S.infrastructure);h.infrastructureStyle=h.infrastructurePlacement.kind;await step('house-placement');if(t.dead)return;}
      props.bridges=props.bridges.filter(p=>!S.infrastructure.bridges.some(b=>Math.hypot(p.x-b.x,p.z-b.z)<Math.max(25,b.len*.6)));
      props.religious=props.religious.filter(p=>!S.infrastructure.buildings.some(b=>b.kind==='church'&&Math.hypot(p.x-b.x,p.z-b.z)<100));
    }
    mark('prep');
    await step('prepare');
    mark('y1');
    const centre = [d.x, d.z];
    const group = new THREE.Group(); group.name = 'tile_' + d.id; group.visible = false;
    const landStep = (k) => step('land:' + k);
    landStep.reset = step.reset;
    const land = await createLand(layout, S.groundTex, { centre, acquisitions:S.contract?.acq || layout.passes, maskSize:maskResolution(S.quality.tier) }, landStep);
    group.add(land.group); mark('land');
    land.setPass(S.pass(), true);
    const pickIndex = buildGrid(layout.parcels, 50);
    if (t.dead) { land.dispose(); return; }
    await step('grid');
    const ecosystem=createEcosystem(layout,land,pickIndex,S.quality,S.reduced,props);
    // Fine illustrative plants/fauna do not contribute useful mirror pixels.
    // Keep them on the main-camera-only layer from creation, so crossing the
    // mirror radius never introduces their reflected shader variants mid-flight.
    ecosystem.group.traverse(o=>o.layers.set(1));
    group.add(ecosystem.group); S.lensHidden?.push(ecosystem.group);
    await step('ecosystem');
    const life = await createLife(group, layout, land, pickIndex, S.quality, { centre, reduced:S.reduced, roost:props.veg.find(v=>v.kind==='tram') }, (k) => step('life:' + k));
    mark('life'); await step('life');
    // village walkers/carts/cattle (PR #5), per tile; kept out of the scientific radar-lens pass
    const rural = createRuralLife(group, layout, pickIndex, S.quality, { reduced: S.reduced, enabled: S.rural !== false, motorbikes: false });
    S.lensHidden?.push(rural.group);
    const ctx = Object.assign(Object.create(S.wctx), {
      layout, props, land, pickIndex, centre,
      groundAt: (x, z) => (pickParcel(pickIndex, layout.parcels, x, z) >= 0 ? H.dry : terrainHeight(layout, x, z)),
      terrainAt: (x, z) => terrainHeight(layout, x, z),
      parcelAt: (x, z) => pickParcel(pickIndex, layout.parcels, x, z),
    });
    const world = await createTileWorld(ctx, (k) => step('world:' + k));
    ctx.tileWorld=world;
    group.add(world.group); mark('world');
    const infrastructure=S.infrastructure?createInfrastructure(ctx,S.infrastructure):null;
    if(infrastructure){group.add(infrastructure.group);S.lensHidden?.push(infrastructure.group);await step('infrastructure');}
    for (const [n, g] of S.models) { life.upgrade(n, g); world.upgrade(n, g); await step('model:' + n); }
    mark('models'); S.renderer.initTexture(land.maskTex); await step('mask-upload');
    S.renderer.initTexture(land.idTex); await step('id-upload');
    Object.assign(t, { layout, props, land, life, rural, ecosystem, world, infrastructure,group, pickIndex, ctx, cents: layout.parcels.map((p) => centroid(p.poly)), ms: Math.round(performance.now() - t0), slices: { ...step.stats, work: Math.round(step.stats.work), worst: Math.round(step.stats.worst) } });
    if (t.dead) { dispose(t); return; }
    // static parts (identity transforms): skip their per-frame matrix recompose
    group.traverse((o) => { if (o.isInstancedMesh || o.name.startsWith('land_')) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
    land.setPass(S.pass(), true); // the pass may have changed while building
    world.onPass();
    infrastructure?.setPass(S.pass(),true,S.wctx.clock());
    // a tile can bring material variants no other tile used yet (e.g. a church): compile them off the render path
    // The boot tile is upgraded to final models and warmed by main.js once.
    // Avoid serially compiling procedural placeholders before those upgrades.
    if (S.renderer.compileAsync && S.compileTarget && !t.boot) {
      group.visible = true;
      S.renderer.setRenderTarget(S.compileTarget());
      const p = S.renderer.compileAsync(group, S.camera, S.scene); // gathers the programs synchronously
      S.renderer.setRenderTarget(null);
      group.visible = false;
      const depth=warmShadowPrograms(S.renderer,group,S.camera,S.scene,S.compileTarget());
      try { await Promise.all([p,depth]); } catch { /* compiled on first render */ }
      if (t.dead) { dispose(t); return; }
    }
    if(t.dead){dispose(t);return;}
    S.root.add(group);
    t.ready = true;
    refreshLists();
  }

  function dispose(t) {
    t.dead = true;
    if (!t.group) return;
    t.life?.dispose(); t.world?.dispose(); t.land?.dispose();
    if(t.infrastructure){const i=S.lensHidden?.indexOf(t.infrastructure.group);if(i>=0)S.lensHidden.splice(i,1);t.infrastructure.dispose();}
    if(t.ecosystem){const i=S.lensHidden?.indexOf(t.ecosystem.group);if(i>=0)S.lensHidden.splice(i,1);t.ecosystem.dispose();}
    if (t.rural) {
      const i = S.lensHidden?.indexOf(t.rural.group); if (i >= 0) S.lensHidden.splice(i, 1);
      t.rural.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); // rural.js makes one material per call
    }
    t.group.removeFromParent();
    t.group = null;
  }

  async function pump() {
    if (loading) return;
    while (queue.length) {
      const id = queue.shift();
      const t = tiles.get(id);
      if (!t || t.ready || t.dead) continue;
      loading = t;
      try { await build(t); } catch (e) { console.warn('tile', id, e); t.dead = true; tiles.delete(id); }
      loading = null;
    }
  }

  function load(id, boot = false) {
    if (tiles.has(id)) return tiles.get(id);
    const t = { id, desc: byId.get(id), ready: false, dead: false, boot };
    t.x = t.desc.x; t.z = t.desc.z;
    tiles.set(id, t);
    queue.push(id);
    pump();
    return t;
  }

  /** Loads the tile under (x,z) now (boot / ?at=): resolves when it is ready (or null outside every tile). */
  async function ensure(x, z) {
    const d = tileAt(descs, half, x, z) || descs.slice().sort((a, b) => tileDist(a, half, x, z) - tileDist(b, half, x, z))[0];
    if (!d) return null;
    const t = load(d.id, true);
    while (!t.ready && !t.dead) await new Promise((r) => setTimeout(r, 20));
    return t.ready ? t : null;
  }

  // Tiles away from the view target leave the water mirror (its camera draws layer 0 only: their objects move to
  // layer 1, which only the main camera draws) and the shadow map (it only covers <= 750 m around the target anyway).
  // The mirror + shadow passes were most of the frame with 4+ tiles of instanced houses/trees.
  function setMirror(tl, on) {
    tl.mirror = on;
    tl.group.traverse((o) => {
      if (o.userData.l0 === undefined) { o.userData.l0 = o.layers.mask; o.userData.cast = o.castShadow; }
      o.layers.mask = on || !(o.userData.l0 & 1) ? o.userData.l0 : 2;
      o.castShadow = on && o.userData.cast;
    });
  }

  const box = new THREE.Box3(), frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  let frame = 0;
  /** Per frame: streaming decisions, which tiles are shown, which one is active, and the tiles' own updates. */
  function update(dt, t, target, camPos, camDist, now) {
    frame++;
    // ---- what should be loaded (re-evaluated every 100 m of target travel, or twice a second)
    if (++selTick > 30 || target.distanceToSquared(lastSel) > 100 * 100) {
      selTick = 0; lastSel.copy(target);
      if (camDist < 8000) { // from very high up the far field alone carries the view: don't stream
        const want = selectTiles(descs, half, target.x, target.z, { ...budget, keep: new Set(tiles.keys()) });
        const keep = new Set(want);
        let changed = false;
        for (const [id, tl] of tiles) if (!keep.has(id)) { dispose(tl); tiles.delete(id); changed = true; }
        queue.length = 0;
        for (const id of want) { const tl = tiles.get(id); if (!tl) load(id); else if (!tl.ready && tl !== loading) queue.push(id); }
        pump();
        if (changed) refreshLists();
      }
    }
    // ---- visibility (distance + frustum), active tile
    pv.multiplyMatrices(S.camera.projectionMatrix, S.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    shown.length = 0;
    const act = tileAt(readyList, half, target.x, target.z);
    if (act !== active) { active = act; S.onActive?.(active); }
    for (const tl of readyList) {
      const d = Math.hypot(tileDist(tl, half, camPos.x, camPos.z), camPos.y);
      box.min.set(tl.x - half - 40, -3, tl.z - half - 40); box.max.set(tl.x + half + 40, 40, tl.z + half + 40);
      const inView = frustum.intersectsBox(box);
      tl.group.visible = d < budget.showDist && inView;
      if (d < budget.showDist) shown.push(tl); // far field stays cut out even when off-screen: the mirror may see it
      tl.land.update(now);
      if (!tl.group.visible) continue;
      const mir = tileDist(tl, half, target.x, target.z) < budget.mirrorDist;
      if (mir !== tl.mirror || (frame + (tl.x & 63)) % 60 === 0) setMirror(tl, mir); // re-applied now and then: models / clones added later
      tl.life.setDistant(d > budget.crownDist);
      tl.life.update(dt, t, target, camDist, camPos, tl === active);
      const near = d < budget.worldDist;
      tl.ecosystem.group.visible = near;
      tl.world.group.visible = near;
      if (near) tl.world.update(dt, t, camPos, tl === active, S.quality.tier === 'low');
      tl.infrastructure?.update(dt,now,camPos); // overlays follow the final traffic pose and visibility this frame
      tl.rural.group.visible = near;
      if (near) tl.rural.update(dt, target, camDist);
      if ((frame & 63) === (tl.x & 63)) tl.world.onPass(); // straw / smoke follow the animated field states
    }
  }

  return {
    update, ensure, half, budget,
    _all: () => Object.fromEntries([...tiles.values()].map((t) => [t.id, t.trace?.join(' ')])),
    get active() { return active; },
    get ready() { return readyList; },
    get shown() { return shown; },
    get loading() { return loading?.id || null; },
    get queue() { return [...queue, ...[...tiles.values()].filter((t) => !t.ready).map((t) => "pending:" + t.id + (t.dead ? ":dead" : ""))]; },
    ids: () => readyList.map((t) => t.id),
    canals: () => canals,
    mooredBoats: () => moored,
    /** parcel under (x,z): {t, i} or null */
    pick(x, z) {
      for (const tl of readyList) {
        if (Math.abs(x - tl.x) > half || Math.abs(z - tl.z) > half) continue;
        const i = pickParcel(tl.pickIndex, tl.layout.parcels, x, z);
        if (i >= 0) return { t: tl, i };
      }
      return null;
    },
    pickInfrastructure(ray){for(const tl of readyList){const p=tl.infrastructure?.pick(ray);if(p)return p;}return null;},
    setPass(i, instant, now) { for (const tl of readyList){tl.land.setPass(i, instant, now,instant?null:tl.infrastructure?.delays());tl.infrastructure?.setPass(i,instant,now);} },
    /** radar sweep: each parcel switches when the front reaches its centre (at most maxDelay s after now) */
    sweep(i, sw, now) {
      for (const tl of readyList) {
        const delays = new Float32Array(tl.cents.length);
        tl.cents.forEach(([x, z], k) => { delays[k] = Math.min(sw.maxDelay, sweepDelay(x, z, sw.dir, sw.s0, sw.speed, sw.leadIn)); });
        tl.land.setPass(i, false, now, delays);
        tl.infrastructure?.setPass(i,false,now);
      }
    },
    upgrade(name, g) { for (const tl of readyList) { tl.life.upgrade(name, g); tl.world.upgrade(name, g); } },
    setWakeColor(c) { for (const tl of readyList) tl.life.setWakeColor(c); },
  };
}
