import {siteProfile} from './siteRules.js';
import {assertSceneMeta} from './contractPolicy.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { cleanPoly, centroid } from './parcels.js';
import { cellIdAt } from './commune.js';

const BASE = import.meta.env.BASE_URL;

export async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

/** Defaults + cleaning for a layout.json (the window layout or one commune tile). n: number of passes. */
export function normalizeLayout(layout, n = layout.passes?.length || 0) {
  layout.passes?.sort((a, b) => a.date.localeCompare(b.date));
  for (const k of ['canals', 'roads', 'parcels', 'houses', 'trees', 'boats', 'egret_zones']) layout[k] ||= [];
  layout.parcels = layout.parcels
    .map((p) => ({ ...p, poly: cleanPoly(p.poly), s: (p.s || '').padEnd(n, '-').slice(0, n) }))
    .filter((p) => p.poly.length >= 3);
  layout.canals = layout.canals.filter((c) => c.points?.length >= 2);
  layout.roads = layout.roads.filter((c) => c.points?.length >= 2);
  layout.boats = layout.boats.filter((b) => b.path?.length >= 2);
  return layout;
}

/** CONTRACT-001 data of the default site (the same files as the map page), or null when missing. */
export async function loadContract(profile=siteProfile()) {
  try {
    const sites = await json(BASE + 'data/sites.json');
    const site = sites.sites.find(s=>s.id===profile.id);
    if(!site)throw Error(profile.name+' observations are not available yet. Data pending.');
    const dir = `${BASE}data/${site.id}/`;
    const [meta, series, cells] = await Promise.all([json(dir + 'meta.json'), json(dir + 'series.json'), json(dir + 'cells.geojson')]);
    assertSceneMeta(profile,meta);
    const acq = meta.acquisitions;
    return {
      meta, series, acq, step: meta.grid.cell_m,
      props: new Map(cells.features.map((f) => [f.properties.cell_id, f.properties])),
      passes: acq.map((a) => ({ i: a.i, date: a.date_local, track: a.track, source: meta.fixture ? 'sim' : 'radar' })),
    };
  } catch (e) {
    throw e; // Incompatible real data must not silently use layout or fixture states.
  }
}

/** Each parcel takes the state string of the 250 m cell under its centre. origin: UTM of the layout's (0,0). */
export function applyCells(layout, contract, origin) {
  const n = contract.acq.length;
  for (const p of layout.parcels) {
    const [x, z] = centroid(p.poly);
    const id = cellIdAt(origin.utm_e + x, origin.utm_n - z, contract.step);
    p.cell = contract.props.get(id) || null;
    p.s = contract.series.cells[id]?.s || '-'.repeat(n);
  }
}

const texLoader = new THREE.TextureLoader();
/** Resolves to a texture or null when the file is missing. */
export function loadTexture(path, srgb = true) {
  return new Promise((res) => {
    texLoader.load(BASE + path, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      res(t);
    }, undefined, () => res(null));
  });
}

let gltf;
const modelLoads=new Map();
/** One GET and decode per model, shared by terrain and living-world consumers. */
export function loadModel(name) {
 if(!modelLoads.has(name))modelLoads.set(name,(async()=>{
  if(!gltf){gltf=new GLTFLoader();gltf.setMeshoptDecoder(MeshoptDecoder);}
  try{const response=await fetch(BASE+'models/'+name+'.glb',{priority:'low'});if(!response.ok||(response.headers.get('content-type')||'').includes('html'))return null;return await gltf.parseAsync(await response.arrayBuffer(),new URL(BASE+'models/',location.href).href);}
  catch(e){console.warn('model',name,e.message);return null;}
 })());
 return modelLoads.get(name);
}

export async function loadModelsManifest() {
  try { return await json(BASE + 'models/models.json'); } catch { return null; }
}
