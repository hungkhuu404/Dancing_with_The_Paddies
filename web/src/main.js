import {frameBudget} from './fx/frameBudget.js';
import {createSeasonSound} from './audio/seasonSound.js';
import {createQuickGuide} from './ui/quickGuide.js';
import {siteProfile,requestedSite,checkSiteIndex} from './data/siteRules.js';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import './style.css';
import './ui/liquid.css';
import './ui/surfaces.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/vietnamese-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/vietnamese-600.css';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/vietnamese-400.css';
import { loadingFacts } from './ui/loadingFacts.js';
import { glareExposure } from './fx/cameraLightRules.js';
import { json, loadTexture, loadModel, loadContract, normalizeLayout } from './data/load.js';
import { centroid, floodFractions, fmtDate } from './data/parcels.js';
import { frameRect, utmToScene, sceneToUtm, cellIdAt, cellGrid, cellFractions } from './data/commune.js';
import { U } from './scene/shaderlib.js';
import { H, createBed } from './scene/land.js';
import { createSky } from './scene/sky.js';
import { createWater } from './scene/water.js';
import { createClouds } from './scene/clouds.js';
import { createFarField } from './scene/farfield.js';
import { loadImpostors,impostorTextures } from './scene/impostors.js';
import { warmShadowPrograms } from './scene/shadowWarmup.js';
import { createTiles, tileBudget } from './scene/tiles.js';
import { createPost, detectQuality, tierSettings } from './fx/post.js';
import { createRadarLens } from './fx/radarLens.js';
import { createTimeline } from './ui/timeline.js';
import { createTimeOfDay } from './ui/timeOfDay.js';
import { createCard } from './ui/card.js';
import { createWorld, MODELS } from './world/index.js';
import {patchScene} from './world/common.js';
import {createCrowdPrototypes} from './world/crowdModels.js';
import {createArterialLights} from './world/infrastructure.js';
import {primeFirstView} from './fx/firstView.js';
import {uploadMaterialTextures} from './fx/textureWarmup.js';
import {createSignature} from './world/signature.js';
import {createChrome} from './ui/chrome.js';
import {createMapWorkspace} from './ui/mapWorkspace.js';
import {createReferenceWorkspace} from './ui/referenceWorkspace.js';
import {entryState} from './ui/entryState.js';
import {entrancePose,bypassAtlas} from './ui/entryRules.js';
import {sceneCellCentre} from './map/presentation.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
let activeProfile=null;
const BASE = import.meta.env.BASE_URL;
const LIFE_MODELS = ['palm_a', 'palm_b', 'banana', 'bush', 'house_0', 'house_1', 'house_2', 'boat', 'egret'];


boot().catch((e) => { console.error(e); fallback(e); });

async function fallback(err) {
  entryState.error=err;entryState.onError?.(err);
  $('#loading').hidden=true;
  document.body.classList.add('is-fallback');
  const el = $('#fallback');
  el.hidden = false;
  $('#title').hidden=true;
  el.replaceChildren();
  if(activeProfile?.scene.fallback_image){
    try {const r=await fetch(BASE+activeProfile.scene.fallback_image,{method:'HEAD'});if(r.ok&&(r.headers.get('content-type')||'').includes('image')){const image=document.createElement('img');image.src=BASE+activeProfile.scene.fallback_image;image.alt='Illustrative field landscape';el.append(image);}}catch{/* text fallback */}
  }
  const message=document.createElement('p');message.textContent=err?.message||'The landscape is unavailable.';
  const choose=document.createElement('a');choose.href=BASE;choose.textContent='Choose a location';el.append(message,choose);
}

/** scene/commune/index.json, else a one-tile index around the 2 km window (scene/layout.json). */
async function loadIndex(profile) {
  try {
    const index = await json(BASE + profile.scene.base + 'index.json');
    checkSiteIndex(profile,index);
    return { index, base: BASE + profile.scene.base, tex: (k) => (index.textures?.[k] ? profile.scene.base + index.textures[k] : null) };
  } catch (e) {
    if(e.name==='SiteMismatchError')throw e;
    if(!profile.scene.legacy_base)throw Error(profile.name+' landscape is not available yet. Data pending.');
    console.warn('commune tiles unavailable, single window', e.message);
    const l = await json(BASE + profile.scene.legacy_base + 'layout.json');
    const o = { utm_e: l.origin.utm_e, utm_n: l.origin.utm_n };
    const index = { origin: o, tile_m: 2000, frame: { e0: o.utm_e - 1000, e1: o.utm_e + 1000, n0: o.utm_n - 1000, n1: o.utm_n + 1000 },
      tiles: [{ id: 'window', x: 0, z: 0, utm_e: o.utm_e, utm_n: o.utm_n, layout: 'layout.json', props: 'props.json' }] };
    return { index, base: BASE + 'scene/', tex: (k) => ({ ground: 'scene/ground.webp', radar: 'scene/radar.webp' })[k] || null };
  }
}

async function boot() {
  const profile=siteProfile(requestedSite(location.search));activeProfile=profile;
  document.title='Flood Calendar in '+profile.name;
  if(profile.boundary.mode==='frame'){$('#loading h1').textContent='Preparing the landscape';$('#whole-btn').setAttribute('aria-label','Show the study area');}
  $('#title h1').textContent=profile.name;$('#title .lede').textContent=profile.region;
  $('#loading .kicker').textContent='Flood Calendar · '+profile.name;
  $('#gl').setAttribute('aria-label','Rice fields in '+profile.name+'. Choose an observation date or select a field for its water record.');
  document.querySelector('.brand-sub').textContent='Illustrated '+profile.name;
  const canvas = $('#gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL 2 unavailable');
  } catch (e) { return fallback(e); }
  const quality = detectQuality(renderer);
  document.body.dataset.quality=quality.tier;
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r18x; PCF filters softly now
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // AgX in post
  renderer.info.autoReset = false; // count every pass of a frame (main, mirror, shadow, lens)
  // the error check reads the link status synchronously, which serialises every shader compile (seconds on ANGLE/D3D)
  renderer.debug.checkShaderErrors = !import.meta.env.PROD || params.has('glcheck');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 20000);

  // ---------------------------------------------------------------- data: commune index, contract water states, frame textures
  const { index, base, tex } = await loadIndex(profile);
  const origin = index.origin, frame = index.frame, rect = frameRect(origin, frame);
  const infrastructure=await json(BASE+profile.scene.infrastructure).catch(e=>{console.warn('Infrastructure metadata unavailable',e);return null;});

  await document.fonts.ready;
  const [contract, groundTex, radarTex, maskTex, parcelTex] = await Promise.all([
    loadContract(profile), tex('ground') ? loadTexture(tex('ground')) : null, tex('radar') ? loadTexture(tex('radar'), false) : null, tex('mask') ? loadTexture(tex('mask'), false) : null,
    index.tiles.length > 1 ? loadTexture(profile.scene.base+'parcel-cells.png', false) : null,
  ]);
  if(index.provenance){const content=$('#sources-dialog .dialog-content');content.replaceChildren();const title=document.createElement('h3');title.textContent=profile.name+' landscape sources';const details=document.createElement('p');details.textContent=index.provenance.illustration;const imagery=document.createElement('p');imagery.textContent=index.provenance.imagery;const osm=document.createElement('p');osm.textContent=index.provenance.osm;const observations=document.createElement('p');observations.textContent=contract?.meta.fixture?'Data pending. The water record is a fixture; no fixed radar reference image or reference comparison is supplied. Acquisition times come from the ASF DAAC NISAR catalogue.':'Water observations use the selected site export. Scene objects remain illustrative.';content.append(title,observations,details,imagery,osm);if(index.provenance.architecture){const credit=document.createElement('p');credit.textContent=index.provenance.architecture;content.append(credit);}const weather=document.createElement('p');weather.id='weather-source-note';content.append(weather);}
  if (parcelTex) { parcelTex.magFilter = parcelTex.minFilter = THREE.NearestFilter; parcelTex.generateMipmaps = false; }
  let passes = contract?.passes;
  if (!passes) passes = normalizeLayout(await json(base + index.tiles[0].layout)).passes;
  if (!passes?.length) throw new Error('no passes');
  const nPasses = passes.length;
  $('#loading-facts').textContent=loadingFacts(contract);
  if(contract?.meta.fixture){document.body.classList.add('is-fixture');const note=document.createElement('p');note.className='fixture-notice';note.setAttribute('role','status');note.textContent='Data pending. Water states are illustrative.';document.body.append(note);}
  $('#loading-stage').textContent='Preparing vegetation and field geometry';
  await loadImpostors(BASE,profile.identity?.impostors);
  U.uFrame.value.set(rect.x0, frame.n0 - origin.utm_n, frame.e1 - frame.e0, frame.n1 - frame.n0);
  U.uRadarTex.value = radarTex; U.uHasRadar.value = radarTex ? 1 : 0;
  const step = contract?.step || 250;
  const grid = contract ? cellGrid(contract.series, frame, step) : null;
  const centre = [(rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2];

  // ---------------------------------------------------------------- shared scene: sky, water, far field, clouds, post
  const sky = createSky(renderer, scene);
  sky.sun.shadow.mapSize.setScalar(quality.shadow);
  const far = createFarField({ rect, grid, groundTex, maskTex, parcelTex });
  scene.add(far.mesh);
  const water = createWater(quality, far.size, centre,profile.ecology);
  scene.add(water);
  scene.add(createBed(far.size));
  const clouds = createClouds(scene);
  const tilesRoot = new THREE.Group(); tilesRoot.name = 'tiles';
  scene.add(tilesRoot);
  const lens = createRadarLens(renderer, scene, camera, [sky.sky, clouds.mesh, clouds.mist]);
  const post = createPost(renderer, scene, camera, quality, lens.effect,clouds,{reduced});
  let cameraEffects=!reduced;
  let adaptedExposure=1;
  let signature=null;
  post.setCameraEffects(cameraEffects);

  // ---------------------------------------------------------------- pass state (shared by tiles + far field)
  let pass0 = nPasses - 1;
  for (let i = nPasses - 1; i >= 0; i--) if (passes[i].source === 'radar') { pass0 = i; break; }
  if (params.has('pass')) pass0 = Math.max(0, Math.min(nPasses - 1, +params.get('pass')));
  let curPass = pass0, shownPass = pass0;
  far.setPass(pass0);
  const fractions = contract ? cellFractions(contract.series, nPasses) : new Array(nPasses).fill(0);

  // ---------------------------------------------------------------- living world (global half) + tiles
  const models = new Map();
  const clock = { elapsed: 0, fps: 60 };
  const wctx = {
    scene, camera, canvas, renderer, quality, sky, U, reduced, profile, passes, acq: contract?.acq || null,
    target: () => (world?.ride.on ? world.ride.boat.position : controls.target),
    setTod: (v, instant = false) => tod.set(v, instant),
    clock: () => clock.elapsed,
    passIndex: () => curPass,
    gotoPass: (i, instant, opts) => { momentOpts = instant ? null : opts || {}; timeline.set(i); momentOpts = null; },
    saveView: () => ({ pos: camera.position.clone(), target: controls.target.clone() }),
    restoreView: (v) => { if (v) { camera.position.copy(v.pos); controls.target.copy(v.target); camera.lookAt(v.target); } controls.enabled = true; },
    onPassMoment: () => { $('#timeline').classList.add('is-scanning'); },
    onPassMomentEnd: () => { $('#timeline').classList.remove('is-scanning'); },
    onTimelapseEnd: () => timeline.stop(),
    setPassAll: (i, instant) => { tiles.setPass(i, instant, clock.elapsed); far.setPass(i); far.sweep.w = 0; shownPass = i; },
    sweepPass: (i, sw) => { tiles.sweep(i, sw, clock.elapsed); far.setPass(shownPass, i); far.sweep.set(sw.dir[0], sw.dir[1], sw.s0, 1); shownPass = i; },
    farSweep: far.sweep,
    canals: () => tiles.canals(),
    mooredBoats: () => tiles.mooredBoats(),
    activeTile: () => tiles.active,
    floodFrac: () => fractions[curPass] || tiles.active?.land.uniforms.uFloodFrac.value || 0,
  };
  let world = null, momentOpts = null, momentTimer = 0;
  const tilt = { on: false };
  world = await createWorld(wctx);
  lens.hidden?.push(world.atmo.group, world.atmo.dome, world.nisar.group);
  const tiles = createTiles({
    profile, index, base, root: tilesRoot, quality, groundTex, contract, nPasses, wctx,infrastructure, models, renderer, camera, pass: () => shownPass,
    onActive: (t) => water.setTile(t?.land || null),
    scene, compileTarget: () => post.composer.inputBuffer,
    reduced, lensHidden: lens.hidden, rural: params.get('life') !== 'off',
  });

  const arterial=infrastructure?createArterialLights(infrastructure,profile):null;
  if(arterial){scene.add(arterial.group);arterial.group.traverse(o=>o.layers.set(1));lens.hidden.push(arterial.group);}

  // ---------------------------------------------------------------- start point and the first tile
  let start = utmToScene(origin, ...profile.start_utm);
  if (params.has('at')) { const [x, z] = params.get('at').split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(z)) start = [x, z]; }
  else if (start[0] < rect.x0 || start[0] > rect.x1 || start[1] < rect.z0 || start[1] > rect.z1) start = [index.tiles[0].x, index.tiles[0].z];
  const first = await tiles.ensure(start[0], start[1]);
  if (!contract && first) fractions.splice(0, nPasses, ...floodFractions(first.layout.parcels, nPasses));

  // ---------------------------------------------------------------- highlight ribbons (hover / selected)
  const ribbonMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, fog: false });
  const hoverLine = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat(0xeef0ec, 0.8));
  const selLine = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat(0xedb65a, 0.95));
  hoverLine.renderOrder = selLine.renderOrder = 5;
  hoverLine.frustumCulled = selLine.frustumCulled = false;
  scene.add(hoverLine, selLine);
  function outline(mesh, poly, width) {
    mesh.geometry.dispose();
    if (!poly) { mesh.visible = false; mesh.geometry = new THREE.BufferGeometry(); return; }
    const pos = [], idx = [];
    const y = H.bund + 0.12;
    for (let k = 0; k < poly.length; k++) {
      const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length];
      let tx = bx - ax, tz = bz - az; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const nx = -tz * width / 2, nz = tx * width / 2, b = pos.length / 3, e = width / 2;
      pos.push(ax - tx * e + nx, y, az - tz * e + nz, ax - tx * e - nx, y, az - tz * e - nz, bx + tx * e + nx, y, bz + tz * e + nz, bx + tx * e - nx, y, bz + tz * e - nz);
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2, b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    mesh.geometry = new THREE.BufferGeometry();
    mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mesh.geometry.setIndex(idx);
    mesh.visible = true;
  }

  // ---------------------------------------------------------------- camera + controls
  // MapControls: left-drag pans across the map (Google-Maps style), right-drag rotates, wheel zooms.
  const controls = new MapControls(camera, renderer.domElement);
  Object.assign(controls, {
    enableDamping: !reduced, dampingFactor: 0.08, rotateSpeed: 0.55, zoomSpeed: 1.2, panSpeed: 2.6,
    minPolarAngle: THREE.MathUtils.degToRad(15), maxPolarAngle: THREE.MathUtils.degToRad(84),
    minDistance: 15, maxDistance: 30000, screenSpacePanning: false, zoomToCursor: true,
  });
  const clampShift = new THREE.Vector3();
  const clampX = (x) => THREE.MathUtils.clamp(x, rect.x0 - 200, rect.x1 + 200), clampZ = (z) => THREE.MathUtils.clamp(z, rect.z0 - 200, rect.z1 + 200);
  controls.addEventListener('change', () => {
    // keep the target over the commune frame; move the camera by the same amount so the view doesn't twist
    clampShift.set(clampX(controls.target.x) - controls.target.x, -controls.target.y, clampZ(controls.target.z) - controls.target.z);
    if (clampShift.lengthSq() > 0) { controls.target.add(clampShift); camera.position.add(clampShift); }
  });

  // intro end pose: near a canal junction of the start tile, over a field that is flooded on the opening pass
  let T;
  if (params.has('at') || !first) T = new THREE.Vector3(start[0], 0, start[1]);
  else {
    const L = first.layout;
    const junction = canalJunction(L.canals, first.x, first.z) || [first.x, first.z];
    let best = null, bd = Infinity;
    L.parcels.forEach((p) => {
      if (p.s[pass0] !== 'W') return;
      const c = centroid(p.poly), d = Math.hypot(c[0] - junction[0], c[1] - junction[1]);
      if (d < bd) { bd = d; best = c; }
    });
    T = new THREE.Vector3(...(best ? [junction[0] * 0.25 + best[0] * 0.75, 0, junction[1] * 0.25 + best[1] * 0.75] : [junction[0], 0, junction[1]]));
  }
  const tod0 = params.has('tod') ? +params.get('tod') : 0.66;
  sky.set(tod0);
  const sunAz = Math.atan2(sky.state.sunDir.x, sky.state.sunDir.z);
  const END = { target: T.clone(), r: 135, polar: THREE.MathUtils.degToRad(73), az: sunAz + Math.PI + 0.45 };
  const START = { target: T.clone().add(new THREE.Vector3(-700, 0, 900)), r: 4200, polar: THREE.MathUtils.degToRad(10), az: END.az + 1.05 };
  const sph = new THREE.Spherical();
  function pose(p) {
    sph.set(p.r, p.polar, p.az);
    camera.position.setFromSpherical(sph).add(p.target);
    controls.target.copy(p.target);
    camera.lookAt(p.target);
  }

  // ---------------------------------------------------------------- UI
  const card = createCard($('#card'), passes, () => { setHi(selected, same(selected, hover) ? 128 : 0); outline(selLine, null); selected = null; },!!contract?.meta.fixture);
  const waterSummary=await json(BASE+'data/'+profile.id+'/summary.json');
  const dataSound=createSeasonSound({passes:waterSummary.passes,totalHa:waterSummary.totals.area_ha,fixture:!!contract.meta.fixture});
  let soundReady=false;
  const timeline = createTimeline($('#timeline'), passes, fractions, (i, user) => {
    curPass = i;
    if(soundReady&&!document.body.classList.contains('is-touring'))dataSound.play(i);
    clearTimeout(momentTimer);
    world.nisar.stop();
    if (momentOpts) world.nisar.play(i, momentOpts);
    else if (user && !reduced) momentTimer = setTimeout(() => world.nisar.play(i, {keepTime:true}), 280); // compare dates without changing scene lighting or the camera
    else wctx.setPassAll(i, reduced);
    card.markPass(i);
  }, { start: () => world.timelapse.start(), stop: () => {world.timelapse.stop();dataSound.stop();} });
  $('#lens-label').textContent = radarTex?`NISAR HH · ${fmtDate(index.radar_date || profile.scene.reference_radar_date)}`:'Radar image unavailable';
  const tod = createTimeOfDay($('#tod'), tod0, reduced);
  wctx.setPassAll(pass0, true);
  timeline.set(pass0);
  soundReady=true;dataSound.mount($('#timeline'));
  $('#data-src').textContent = (!contract ? 'Water states: scene layout (contract data not loaded).' : contract.meta.fixture ? 'Fixture data, not results.' : '') + (index.fixture ? ' Commune tiles: development stand-in.' : '');

  // world controls: weather, NISAR pass, boat ride, sound, whole commune
  $('#sound-btn').addEventListener('click', (e) => e.currentTarget.setAttribute('aria-pressed', String(world.sound.toggle())));
  $('#whole-btn')?.addEventListener('click', () => whole());

  // lens controls
  const setLens = (on) => { lens.state.on = on; document.body.classList.toggle('lens-on', on || lens.state.hold); };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const handle = $('#lens-handle');
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    const ox = lens.state.x - e.clientX, oy = lens.state.y - e.clientY;
    const mv = (ev) => { lens.state.x = ev.clientX + ox; lens.state.y = ev.clientY + oy; };
    const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up);
    e.stopPropagation();
  });

  // ---------------------------------------------------------------- intro
  const intro = { t: reduced || bypassAtlas(location.search) ? 1 : 0, speed: 1, done: false, dur: 4.8 };
  const title = $('#title');
  function finishIntro() {
    intro.done = true;camera.fov=40;camera.updateProjectionMatrix();entryState.onFinish?.();
    post.dofPass.enabled = false;
    controls.enabled = true;
    document.body.classList.add('ready');
    title.classList.remove('is-in');
    title.classList.add('is-out');
  }
  function skipIntro() { if (!intro.done) intro.speed = 7; }
  controls.enabled = false;
  if (intro.t >= 1) { pose(END); finishIntro(); }
  else {
    pose(START);
    post.dofPass.enabled = quality.dof;
    post.dof.target = END.target;
    if(!entryState.active)setTimeout(() => title.classList.add('is-in'), 350);
    addEventListener('keydown',e=>{if(e.key==='Escape'&&!entryState.active&&!intro.done){intro.t=1;pose(END);finishIntro();}});
  }
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const cur = { target: new THREE.Vector3(), r: 0, polar: 0, az: 0 };
  const entranceState={};
  function updateIntro(dt) {
    intro.t=Math.min(1,intro.t+dt/intro.dur*intro.speed);
    entrancePose(intro.t,START,END,entranceState);
    cur.target.set(entranceState.x,0,entranceState.z);cur.r=entranceState.r;cur.polar=entranceState.polar;cur.az=entranceState.az;
    pose(cur);camera.rotateZ(entranceState.roll);camera.fov=entranceState.fov;camera.updateProjectionMatrix();
    post.dof.bokehScale=1.4*(1-intro.t);
    if(intro.t>.6)title.classList.add('is-out');
    if(intro.t>=1){pose(END);finishIntro();}
  }
  entryState.enter=instant=>{
    signature?.stopTour();signature?.setMode(0);timeline.stop();world.timelapse.stop();world.ride.exit();select(null);setLens(false);held.clear();fly.on=false;tilt.on=false;
    if(instant){intro.t=1;pose(END);finishIntro();return;}
    intro.t=0;intro.speed=1;intro.done=false;controls.enabled=false;pose(START);camera.fov=50;camera.updateProjectionMatrix();
    post.dofPass.enabled=quality.dof;post.dof.target=END.target;
    document.body.classList.remove('ready');title.classList.remove('is-out');title.classList.add('is-in');
  };
  entryState.pauseSound=paused=>{if(paused){signature?.stopTour();timeline.stop();world.timelapse.stop();world.nisar.stop();world.ride.exit();held.clear();clearTimeout(momentTimer);fly.on=false;tilt.on=false;}world.sound.setPaused(paused);dataSound.setPaused(paused);};

  // ---------------------------------------------------------------- fly-to (double click, whole commune), interruptible
  const fly = { on: false, t: 0, dur: 1.2, from: new THREE.Vector3(), to: new THREE.Vector3(), r0: 0, r1: 0, p0: 0, p1: 0, az: 0 };
  controls.addEventListener('start', () => { fly.on = false; tilt.on = false; });
  function flyTo(p, r1, polar1, dur = 1.2) {
    sph.setFromVector3(offs.subVectors(camera.position, controls.target));
    fly.from.copy(controls.target); fly.to.set(clampX(p.x), 0, clampZ(p.z));
    fly.r0 = sph.radius; fly.r1 = r1 ?? Math.max(60, fly.r0 * 0.55);
    fly.p0 = sph.phi; fly.p1 = polar1 ?? sph.phi; fly.az = sph.theta; fly.dur = dur;
    fly.t = reduced ? 1 : 0; fly.on = true;
    if (reduced) updateFly(0);
  }
  /** the whole commune in view, from high up */
  function whole() {
    if (world.ride.on) world.ride.exit();
    const halfV = Math.max((rect.z1 - rect.z0) / 2, (rect.x1 - rect.x0) / 2 / camera.aspect) * 1.08;
    const r = Math.min(controls.maxDistance, halfV / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    flyTo({ x: centre[0], z: centre[1] }, r, THREE.MathUtils.degToRad(16), 2.4);
  }
  const offs = new THREE.Vector3();
  function updateFly(dt) {
    fly.t = Math.min(1, fly.t + dt / fly.dur);
    const e = ease(fly.t);
    controls.target.lerpVectors(fly.from, fly.to, e);
    sph.set(Math.exp(THREE.MathUtils.lerp(Math.log(fly.r0), Math.log(fly.r1), e)), THREE.MathUtils.lerp(fly.p0, fly.p1, e), fly.az);
    camera.position.setFromSpherical(sph).add(controls.target);
    camera.lookAt(controls.target);
    if (fly.t >= 1) fly.on = false;
  }

  // gentle tilt toward the horizon for the NISAR pass, so the satellite is in the sky above the view
  function updateTilt(dt) {
    offs.subVectors(camera.position, controls.target);
    sph.setFromVector3(offs);
    const want = THREE.MathUtils.degToRad(79);
    if (sph.phi >= want - 0.01 || sph.radius > 3000) { tilt.on = false; return; }
    sph.phi += (want - sph.phi) * Math.min(1, dt * 1.6);
    camera.position.copy(controls.target).add(offs.setFromSpherical(sph));
    camera.lookAt(controls.target);
  }

  // ---------------------------------------------------------------- picking: parcels in loaded tiles, else the 250 m block
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let hover = null, selected = null, downAt = null;
  const same = (a, b) => a === b || (!!a && !!b && a.t === b.t && a.i === b.i && a.cell === b.cell);
  const setHi = (s, v) => { if (s?.t) s.t.land.setHighlight(s.i, v); };
  const polyOf = (s) => (s?.t ? s.t.layout.parcels[s.i].poly : s?.poly || null);
  function groundHit(x, y) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit);
  }
  const pickAt = (x, y) => (groundHit(x, y) ? tiles.pick(hit.x, hit.z) : null);
  function cellAt(x, z) {
    if (!contract) return null;
    const [e, n] = sceneToUtm(origin, x, z), id = cellIdAt(e, n, step), props = contract.props.get(id);
    if (!props) return null;
    const m = /^E(\d+)N(\d+)$/.exec(id), [x0, z1] = utmToScene(origin, +m[1], +m[2]), x1 = x0 + step, z0 = z1 - step;
    return { cell: id, props, s: contract.series.cells[id]?.s || '-'.repeat(nPasses), poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] };
  }
  function setHover(h) {
    if (same(h, hover)) return;
    if (hover && !same(hover, selected)) setHi(hover, 0);
    hover = h;
    if (h && !same(h, selected)) setHi(h, 128);
    outline(hoverLine, same(h, selected) ? null : polyOf(h), lineWidth());
    canvas.style.cursor = h ? 'pointer' : '';
  }
  const lineWidth = () => THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.006, 0.7, 40);
  function select(s) {
    if (selected) setHi(selected, same(selected, hover) ? 128 : 0);
    selected = s;
    if (!s) { card.close(); outline(selLine, null); return; }
    setHi(s, 255);
    outline(selLine, polyOf(s), lineWidth() * 1.3);
    outline(hoverLine, null);
    if (s.t) card.open(s.t.layout.parcels[s.i], s.i, curPass);
    else card.open({ cell: s.props, s: s.s, id: s.cell }, -1, curPass);
  }
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { lens.state.x = e.clientX; lens.state.y = e.clientY; }
    if (!intro.done || e.buttons || world.ride.on) return;
    setHover(pickAt(e.clientX, e.clientY));
  });
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { lens.state.x = e.clientX; lens.state.y = e.clientY; } });
  canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY, performance.now()]));
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || !intro.done || world.ride.on) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    if (moved < 6 && performance.now() - downAt[2] < 400) {
      groundHit(e.clientX,e.clientY);
      const s = pickAt(e.clientX, e.clientY) || (groundHit(e.clientX, e.clientY) ? cellAt(hit.x, hit.z) : null);
      if (!same(s, selected)) select(s);
    }
    downAt = null;
  });
  canvas.addEventListener('dblclick', (e) => { if (intro.done && !world.ride.on && groundHit(e.clientX, e.clientY)) flyTo(hit); });

  // ---------------------------------------------------------------- keyboard
  const held = new Set();
  addEventListener('keydown', (e) => {
    if(entryState.active||document.querySelector('dialog[open]')||e.target.closest?.('#tools-panel'))return;
    const tag = e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') { if (selected) select(null); else if (lens.state.on) setLens(false); return; }
    if (typing) return;
    if (e.code === 'Space' && tag !== 'BUTTON' && !e.target.closest?.('[role=slider]')) {
      lens.state.hold = true; document.body.classList.add('lens-on'); e.preventDefault(); return;
    }
    if (e.target.closest?.('[role=slider]')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { timeline.step(e.key === 'ArrowLeft' ? -1 : 1); e.preventDefault(); return; }
    if ((e.key === 'h' || e.key === 'H') && intro.done && !e.ctrlKey && !e.metaKey) { whole(); return; }
    if ('wasdqe+-='.includes(e.key.toLowerCase()) && e.key.length === 1) held.add(e.key.toLowerCase());
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'Space') { lens.state.hold = false; document.body.classList.toggle('lens-on', lens.state.on); }
    held.delete(e.key.toLowerCase());
  });
  addEventListener('blur', () => { held.clear(); lens.state.hold = false; });
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  function keyMove(dt) {
    if (!held.size || !controls.enabled) return;
    const d = camera.position.distanceTo(controls.target);
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    const s = d * 0.9 * dt;
    offs.set(0, 0, 0);
    if (held.has('w')) offs.addScaledVector(fwd, s);
    if (held.has('s')) offs.addScaledVector(fwd, -s);
    if (held.has('d')) offs.addScaledVector(right, s);
    if (held.has('a')) offs.addScaledVector(right, -s);
    controls.target.add(offs); camera.position.add(offs);
    if (held.has('q') || held.has('e')) {
      offs.subVectors(camera.position, controls.target).applyAxisAngle(camera.up, (held.has('q') ? 1 : -1) * dt * 0.8);
      camera.position.copy(controls.target).add(offs);
    }
    if (held.has('+') || held.has('=') || held.has('-')) {
      offs.subVectors(camera.position, controls.target).multiplyScalar(held.has('-') ? 1 + dt : 1 - dt);
      offs.clampLength(controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offs);
    }
    controls.dispatchEvent({ type: 'change' });
  }

  // ---------------------------------------------------------------- resize
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.setSize(w, h);
    lens.setSize(w, h, quality.dpr);
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- loop
  const watch = { n: 0, acc: 0, armed: !params.has('q') };
  const frameLog = { worst: 0, n: 0, long: [] }; // longest frame (ms) since the last read, for the fps report
  let last = performance.now(), frames = 0, modelsRequested = false, modelsDone = false;
  let mapWorkspace=null,referenceWorkspace=null;
  const windDir = new THREE.Vector2(3.2, 1.4);
  const lensLabel = $('#lens-label');
  function tick(now) {
    // Keep the world in memory while the map is open, without rendering two GPUs' worth of work.
    if(entryState.active||mapWorkspace?.active||referenceWorkspace?.active){last=now;requestAnimationFrame(tick);return;}
    const raw = now - last;
    if (raw > frameLog.worst) frameLog.worst = raw;
    if (raw > 100 && frameLog.long.length < 50) frameLog.long.push([Math.round(raw), renderer.info.programs?.length, tiles.ready.length, tiles.loading]); // what the previous frame did
    frameLog.n++;
    const dt = Math.min(0.1, raw / 1000);
    last = now;
    const simdt=dt*(signature?.slow||1);
    clock.elapsed += simdt;
    renderer.info.reset();
    clock.fps += ((1 / Math.max(dt, 1e-3)) - clock.fps) * 0.05;
    U.uTime.value += simdt;
    U.uWind.value.addScaledVector(windDir, dt);
    water.material.uniforms.time.value += simdt;
    sky.sky.material.uniforms.time.value = U.uTime.value;

    const riding = world.ride.on;
    if (!intro.done) updateIntro(dt);
    else if (fly.on) updateFly(dt);
    if (tilt.on && !riding) updateTilt(dt);
    if (!riding) keyMove(dt);
    if (intro.done && !riding && !fly.on) controls.update(dt);
    controls.enabled = intro.done && !riding;
    if (riding) world.update(simdt, U.uTime.value, camera, world.ride.boat.position, sky); // positions the camera first

    const view = riding ? world.ride.boat.position : controls.target;
    const camDist = riding ? 25 : camera.position.distanceTo(controls.target);
    // high up, push the near plane out (nothing is between the camera and the clouds/ground): the land layers,
    // water and far field are centimetres to metres apart and would z-fight from kilometres away
    camera.near = riding ? 0.1 : Math.max(THREE.MathUtils.clamp(camDist * 0.02, 0.5, 8), Math.min(camera.position.y * 0.5, camera.position.y - 1100));
    camera.far = Math.max(20000, camDist * 2.5 + 15000);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    sky.sky.position.copy(camera.position); // the sky box (±7 km) travels with the camera

    tod.update(dt);
    if (sky.state.tod !== tod.value) sky.set(tod.value, now);
    signature?.update(dt);
    const S = sky.state;
    // Camera-like adaptation from the existing lighting model, not historical
    // irradiance. No synchronous GPU readback in the animation loop.
    camera.getWorldDirection(fwd);
    const glare=Math.pow(Math.max(0,fwd.dot(S.sunDir)),8);
    const desiredExposure=glareExposure(S.exposure,glare);
    post.updateGlare(glare);
    adaptedExposure+=(desiredExposure-adaptedExposure)*Math.min(1,dt*1.4);
    renderer.toneMappingExposure=cameraEffects?adaptedExposure:S.exposure;
    U.uNight.value = S.night;
    arterial?.update(clock.elapsed,reduced);
    U.uCloudAmt.value = S.cloud;
    const wu = water.material.uniforms;
    wu.sunDirection.value.copy(S.sunDir);
    wu.sunColor.value.copy(S.sunColor).multiplyScalar(S.elev > -2 ? 1 : 0);
    wu.uAmbient.value.copy(S.ambient);
    wu.waterColor.value.setRGB(0.2, 0.155, 0.085);
    // looking down from altitude crosses less haze than looking along the ground
    const y = camera.position.y;
    scene.fog.density = S.fogD * THREE.MathUtils.lerp(1, 0.3, THREE.MathUtils.smoothstep(y, 150, 1200)) * THREE.MathUtils.lerp(1, 0.22, THREE.MathUtils.smoothstep(y, 2000, 14000));
    // shadows: every frame up close, every 2nd frame from further out (the shadow camera only moves on those frames,
    // so map and matrix always match)
    renderer.shadowMap.autoUpdate = false;
    const frameCost=frameBudget(quality.tier,camDist,camera.position.y,riding);
    if (frames % frameCost.shadowEvery === 0) { sky.fitShadow(view, camDist, quality.shadow); renderer.shadowMap.needsUpdate = true; }
    // ambient occlusion only shows up close
    post.ao.enabled = quality.ao && camDist < 300; // (N8AO also walks the whole scene graph every frame)
    clouds.update(S, view);
    tiles.setWakeColor(S.ambient);
    tiles.update(simdt, U.uTime.value, view, camera.position, camDist, clock.elapsed);
    far.setNear(tiles.shown, tiles.half);
    if (!riding) world.update(simdt, U.uTime.value, camera, controls.target, sky);
    lens.update(dt, reduced);
    post.rays.update(S,cameraEffects && lens.state.amt<.001 && !world.atmo.dome.visible,world.atmo.rainAt(camera.position.x,camera.position.z));
    const lensVisible = lens.state.amt > 0.01;
    lensLabel.style.transform = `translate(${lens.state.x}px, ${lens.state.y - lens.state.radiusCss * lens.state.amt - 26}px) translateX(-50%)`;
    lensLabel.style.opacity = lensVisible ? Math.min(1, lens.state.amt * 1.5) : 0;
    handle.style.transform = `translate(${lens.state.x - lens.state.radiusCss}px, ${lens.state.y - lens.state.radiusCss}px)`;
    handle.style.width = handle.style.height = `${lens.state.radiusCss * 2}px`;

    // the mirror: off from high up (reflections are sub-pixel there; the water tints with the sky instead), every 2nd frame
    // unless close up
    const mirrorOn = frameCost.mirror;
    water.userData.reflect = mirrorOn;
    wu.uMirror.value += ((mirrorOn ? 1 : 0) - wu.uMirror.value) * Math.min(1, dt * 4);
    // world matrices once per frame, not once per render call (mirror, shadows, main, AO each called it)
    signature?.renderState();
    scene.matrixWorldAutoUpdate = true; scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false;
    water.updateMirror(renderer, scene, camera, frameCost.mirrorEvery);
    lens.render();
    post.render(dt);
    signature?.recorder.capture();

    // fps watchdog: one step down if the GPU can't hold ~45 fps after the intro
    // (judged only once the models are in and nothing is streaming: compiles and tile builds are not the steady state)
    if (intro.done && watch.armed && quality.tier === 'high' && modelsDone && !tiles.loading) {
      watch.n++; watch.acc += dt;
      if (watch.n === 180) {
        if (watch.n / watch.acc < 42) {
          Object.assign(quality, tierSettings('low', quality.gpu)); // in place: tiles built from now on use it too
          document.body.dataset.quality='low';
          Object.assign(tiles.budget, tileBudget('low'));
          post.setQuality(quality);
          sky.sun.shadow.mapSize.setScalar(quality.shadow);
          sky.sun.shadow.map?.dispose(); sky.sun.shadow.map = null;
          resize();
          console.info('quality -> low');
        }
        watch.armed = false;
      }
    }
    frames++;
    requestAnimationFrame(tick);
  }
  // Upgrade models in CPU-yielding batches while the loading screen is visible.
  // Link final lit/depth variants together once, rather than serially waiting
  // for placeholder shaders and then re-linking the scene after every batch.
  async function loadModels() {
    const names = [...new Set([...LIFE_MODELS.filter(n=>!profile.identity||!['palm_a','palm_b','bush','house_0','house_1','house_2'].includes(n)), ...MODELS.filter(n=>!profile.identity||n!=='longtail'), ...(profile.identity?.models||[])])];
    const loads = names.map((n) => loadModel(n).then((g) => [n, g]));
    const next = () => new Promise((r) => requestAnimationFrame(r));
    const used = [];
    for (let i = 0; i < loads.length; i += 6) {
      const batch = await Promise.all(loads.slice(i, i + 6));
      for (const [n, g] of batch) {
        if (!g) continue;
        models.set(n, g);
        tiles.upgrade(n, g);
        world.upgrade(n, g);
        used.push(n);
      }
      await next();
    }
    modelsDone = true;
    console.info('models used:', used.sort().join(', ') || 'none (procedural placeholders)');
    window.__debug.models = used;
  }

  // ---------------------------------------------------------------- debug hooks for deterministic screenshots
  const tileStats = () => tiles.ready.reduce((a, t) => ({ parcels: a.parcels + t.layout.parcels.length }), { parcels: 0 });
  window.__debug = {
    setPass: (i) => timeline.set(i),
    setTime: (t) => tod.set(t, true),
    lens: (on, x, y) => { lens.state.on = !!on; if (x != null) { lens.state.x = x; lens.state.y = y; } lens.state.amt = on ? 1 : 0; },
    skipIntro: () => { if (!intro.done) { intro.t = 1; pose(END); finishIntro(); } },
    select: (i) => select(i == null || i < 0 || !tiles.active ? null : { t: tiles.active, i }),
    selectCell: (x, z) => select(cellAt(x, z)),
    view: (x, z, r, polarDeg, azDeg) => { fly.on = false; pose({ target: new THREE.Vector3(x, 0, z), r, polar: THREE.MathUtils.degToRad(polarDeg), az: THREE.MathUtils.degToRad(azDeg) }); },
    /** instant move: target (x, z), distance r, keeping the current viewing angles unless given */
    goto: (x, z, r, polarDeg, azDeg) => {
      fly.on = false; sph.setFromVector3(offs.subVectors(camera.position, controls.target));
      pose({ target: new THREE.Vector3(x, 0, z), r: r ?? sph.radius, polar: polarDeg != null ? THREE.MathUtils.degToRad(polarDeg) : sph.phi, az: azDeg != null ? THREE.MathUtils.degToRad(azDeg) : sph.theta });
    },
    whole: () => { whole(); fly.t = 1; updateFly(0); },
    flyTo: (x, z, r, polarDeg, dur = 1.2) => flyTo({ x, z }, r, polarDeg != null ? THREE.MathUtils.degToRad(polarDeg) : undefined, dur),
    tiles: () => tiles.ids(),
    get tileInfo() { return { ready: tiles.ids(), loading: tiles.loading, queue: tiles.queue, active: tiles.active?.id || null, shown: tiles.shown.map((t) => t.id), ms: Object.fromEntries(tiles.ready.map((t) => [t.id, t.ms])), slices: Object.fromEntries(tiles.ready.map((t) => [t.id, t.slices])), trace: tiles._all?.() }; },
    get cam() { return { target: controls.target.toArray().map(Math.round), pos: camera.position.toArray().map(Math.round), enabled: controls.enabled, intro: intro.done }; },
    get info() { return { fps: Math.round(clock.fps), quality: quality.tier, gpu: quality.gpu, pass: curPass, parcels: tileStats().parcels, tiles: tiles.ids().length, programs: renderer.info.programs?.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
    /** longest frame (ms) and frame count since the last call */
    frames: () => { const r = { worst: Math.round(frameLog.worst), n: frameLog.n, long: frameLog.long.slice() }; frameLog.worst = 0; frameLog.n = 0; frameLog.long.length = 0; return r; },
    models: [],
    get infrastructure(){return {source:infrastructure?.provenance,bridges:infrastructure?.bridges,churches:infrastructure?.buildings.filter(p=>p.kind==='church'&&p.in_commune),arterialLights:arterial?.count,tiles:tiles.ready.map(t=>({id:t.id,...t.infrastructure?.stats}))};},
    get rural() { const r = tiles.active?.rural; return r && { ...r.info, positions: r.positions }; },
    weather: (k, here = true) => { world.atmo.setWeather(k, { here }); return k; },
    rainbow: (on) => world.atmo.forceRainbow(on),
    box: (n) => world.box(n),
    dataSound, _w: world, _tiles: tiles, _r: renderer, _water: water, _post: post, _sky: sky,
    measure: (sec = 3) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); }),
    heavy: () => { const a = []; scene.traverseVisible((o) => { if (!o.isMesh) return; const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3; a.push([o.name || o.parent?.name || o.type, Math.round(t * (o.isInstancedMesh ? o.count : 1)), o.isInstancedMesh ? o.count : 1, o.castShadow]); }); return a.sort((x, y) => y[1] - x[1]).slice(0, 15); },
    pass: (i, from) => world.nisar.play(i, { from: from ?? Math.max(0, i - 1) }),
    ride: (on) => (on ? (world.ride.enter(), true) : (world.ride.exit(), false)),
    rideKeys: (keys = '') => { world.ride.keys.clear(); for (const k of keys) world.ride.keys.add(k); },
    timelapse: (on) => (on ? world.timelapse.start() : world.timelapse.stop()),
    get world() { const a = tiles.active?.world.stats || {}; return { ...a, ...world.stats, models: [...models.keys()], fps: Math.round(clock.fps), calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
  };
  const tourTarget=new THREE.Vector3();
  signature=await createSignature({profile,scene,camera,canvas,tiles,contract,grid,parcelTex,sky,clouds,world,reduced,frame,passes,wind:windDir,
    pass:()=>curPass,tod:()=>tod.value,target:()=>controls.target,groundHit,
    saveView:wctx.saveView,restoreView:wctx.restoreView,
    openCalendarMap:query=>mapWorkspace.open(import.meta.env.BASE_URL+'map/?'+new URLSearchParams(query)),
    pose:p=>{tourTarget.set(p.x,0,p.z);pose({target:tourTarget,r:p.r,polar:p.polar,az:p.az});},
    selectAt:(x,z)=>{const field=tiles.pick(x,z);if(field)select(field);},
    stopActivities:()=>{dataSound.stop();clearTimeout(momentTimer);world.ride.exit();world.timelapse.stop();world.nisar.stop();timeline.stop();fly.on=false;tilt.on=false;},
  });
  window.__debug.signature=signature;
  createChrome({canvas,signature});
  const helpControl=document.querySelector('[data-dialog=help-dialog]');document.body.append(helpControl);helpControl.classList.add('quick-guide-toggle','landscape-guide-toggle');
  const guide=createQuickGuide({trigger:helpControl,fixture:!!contract.meta.fixture});
  mapWorkspace=createMapWorkspace({
    current:()=>({pass:curPass,site:contract?.meta.site?.id||contract?.meta.site||profile.id,cell:selected?.props?.cell_id||selected?.t?.layout.parcels[selected.i]?.cell?.cell_id}),
    beforeOpen:()=>{signature.stopTour();timeline.stop();world.timelapse.stop();world.nisar.stop();world.ride.exit();held.clear();clearTimeout(momentTimer);fly.on=false;tilt.on=false;world.sound.setPaused(true);dataSound.setPaused(true);guide.close();},
    onReturn:({cell,query})=>{
      last=performance.now();world.sound.setPaused(false);dataSound.setPaused(false);
      const q=new URLSearchParams(query);if(q.get('scope')==='image'){const i=Number(q.get('pass'));if(Number.isInteger(i)&&i>=0&&i<nPasses)timeline.set(i);}
      if(cell){const p=sceneCellCentre(cell,origin);if(p&&cellAt(p.x,p.z)){select(cellAt(p.x,p.z));flyTo(p,700,THREE.MathUtils.degToRad(28));}}
    },
  });
  referenceWorkspace=createReferenceWorkspace({site:profile.id,
    onOpen:()=>{signature.stopTour();timeline.stop();world.timelapse.stop();world.nisar.stop();world.ride.exit();held.clear();clearTimeout(momentTimer);fly.on=false;tilt.on=false;world.sound.setPaused(true);dataSound.setPaused(true);guide.close();},
    onClose:()=>{last=performance.now();world.sound.setPaused(!!mapWorkspace?.active);dataSound.setPaused(!!mapWorkspace?.active);},
    openMap:url=>mapWorkspace.open(url),
  });
  $('#loading-stage').textContent='Warming shaders and models';
  modelsRequested=true;
  await loadModels();
  // The real intro ends close to the fields: prepare its lazy crop shader
  // (including instance colors) before the loading overlay is dismissed.
  first?.life.prepareTufts(END.target);
  const crowdWarm=createCrowdPrototypes(models,patchScene);
  window.__debug.textureWarm=await uploadMaterialTextures(renderer,[scene,crowdWarm.group,...[...models.values()].map(model=>model?.scene)],impostorTextures());
  const compileStarted=performance.now();
  renderer.setRenderTarget(post.composer.inputBuffer);
  let litPrograms,crowdPrograms;
  try {
    litPrograms=renderer.compileAsync(scene,camera);
    crowdPrograms=renderer.compileAsync(crowdWarm.group,camera,scene);
  }
  finally { renderer.setRenderTarget(null); }
  const shadowPrograms=warmShadowPrograms(renderer,scene,camera,scene,post.composer.inputBuffer);
  const crowdShadowPrograms=warmShadowPrograms(renderer,crowdWarm.group,camera,scene,post.composer.inputBuffer);
  const effectPrograms=post.warm();
  await Promise.all([litPrograms.catch(()=>{}),crowdPrograms.catch(()=>{}),shadowPrograms,crowdShadowPrograms,effectPrograms]);
  window.__debug.crowdWarm=crowdWarm.names;
  // Nodes/skeletons are temporary. Geometry and shared material ownership stays
  // with the original model/cache; disposing them would break the live clones.
  crowdWarm.group.clear();
  $('#loading-stage').textContent='Preparing the first field view';
  await primeFirstView({renderer,camera,controls,scene,post,water,
    prepare(){
      pose(END);camera.near=Math.max(.5,END.r*.02);camera.far=20000;
      camera.updateProjectionMatrix();camera.updateMatrixWorld();
      first.group.visible=true;
      first.life.update(0,U.uTime.value,END.target,END.r,camera.position,true);
      first.world.update(0,U.uTime.value,camera.position,true,quality.tier==='low');
      first.rural.update(0,END.target,END.r);
      post.ao.enabled=quality.ao;
      water.setTile(first.land);
      water.userData.reflect=true;
      sky.fitShadow(END.target,END.r,quality.shadow);
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
      scene.updateMatrixWorld(true);
    },
    render(){water.updateMirror(renderer,scene,camera,1);post.render(0);}
  });
  sky.fitShadow(controls.target,camera.position.distanceTo(controls.target),quality.shadow);
  console.info('final lit/shadow shaders ready in',Math.round(performance.now()-compileStarted),'ms');
  last=performance.now();
  $('#loading').hidden=true;guide.showOnce();
  entryState.ready=true;entryState.onReady?.();
  requestAnimationFrame(tick);
  mapWorkspace.openDeepLink();
  // Optional review deep link; normal entry keeps the existing cinematic intro.
  const village = params.get('village');
  if (village) {
    const r = tiles.active?.rural, bikes = tiles.active?.world.traffic?.bikes;
    const point = village === 'moto' ? bikes?.[0] : r && (r.positions.find(p => p.kind === village) || r.info.placements.find(p => p.kind === village));
    if (point) { window.__debug.skipIntro(); window.__debug.view(point.x, point.z, 32, 62, -40); }
  }
}

function canalJunction(canals, cx = 0, cz = 0) {
  // nearest crossing of two canal centre-lines to the tile centre
  let best = null, bd = Infinity;
  const big = canals.filter((c) => (c.width_m || 0) >= 8);
  const list = big.length >= 2 ? big : canals;
  for (let a = 0; a < list.length; a++)
    for (let b = a + 1; b < list.length; b++) {
      const A = list[a].points, B = list[b].points;
      for (let i = 1; i < A.length; i++)
        for (let j = 1; j < B.length; j++) {
          const p = segX(A[i - 1], A[i], B[j - 1], B[j]);
          if (p) { const d = Math.hypot(p[0] - cx, p[1] - cz); if (d < bd) { bd = d; best = p; } }
        }
    }
  return best;
}
function segX(p, p2, q, q2) {
  const r = [p2[0] - p[0], p2[1] - p[1]], s = [q2[0] - q[0], q2[1] - q[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [p[0] + t * r[0], p[1] + t * r[1]] : null;
}
