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

/** Real scene layout only; missing inputs never select a fixture. */
export async function loadLayout() {
  let layout, source = 'layout.json';
  layout = await json(BASE + 'scene/layout.json');
  if (!layout.passes?.length) throw new Error('layout has no passes');
  normalizeLayout(layout);
  layout.source = source;
  return layout;
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

/** Required real CONTRACT-001 data of the default site, shared with the map page. */
export async function loadContract() {
  try {
    const sites = await json(BASE + 'data/sites.json');
    const site = sites.sites.find((s) => s.default) || sites.sites[0];
    const dir = `${BASE}data/${site.id}/`;
    const [meta, series, cells] = await Promise.all([json(dir + 'meta.json'), json(dir + 'series.json'), json(dir + 'cells.geojson')]);
    if (meta.fixture) throw new Error('Synthetic contract data is not allowed');
    const acq = meta.acquisitions;
    return {
      meta, series, acq, step: meta.grid.cell_m,
      props: new Map(cells.features.map((f) => [f.properties.cell_id, f.properties])),
      passes: acq.map((a) => ({ i: a.i, date: a.date_local, track: a.track, source: meta.fixture ? 'sim' : 'radar' })),
    };
  } catch (e) {
    throw new Error('Required public contract data is unavailable: ' + e.message);
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
/** Loads public/models/<name>.glb, or null if missing/broken. */
export async function loadModel(name) {
  if (!gltf) { gltf = new GLTFLoader(); gltf.setMeshoptDecoder(MeshoptDecoder); }
  try {
    const head = await fetch(BASE + 'models/' + name + '.glb', { method: 'HEAD' });
    if (!head.ok || (head.headers.get('content-type') || '').includes('html')) return null;
    return await gltf.loadAsync(BASE + 'models/' + name + '.glb');
  } catch (e) {
    console.warn('model', name, e.message);
    return null;
  }
}

export async function loadModelsManifest() {
  try { return await json(BASE + 'models/models.json'); } catch { return null; }
}
