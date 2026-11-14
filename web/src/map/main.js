// Map tool (QUOC-1): frame, base map, radar backdrop, cell grid, three questions, pass strip, block panel.
// Reads only CONTRACT-001 files under /data/ (spec_uiux §6.3–6.8).
import { Map as MLMap, Marker, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/vietnamese-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/vietnamese-600.css';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/vietnamese-400.css';
import './map.css';
import {
  CELL_HA, COLORS, STEPS, DURATION_EDGES, ONSET_NOTE, cellSentences, durationColor, fmtDate, onsetBins, onsetColor, stateAsOf,
} from './contract.js';
import { renderChart, renderStrip } from './panel.js';

setWorkerUrl(workerUrl);
const SHOW_GT30 = true; // first layer to cut if late (spec_uiux §6.3)
const BASE = import.meta.env.BASE_URL + 'data/';
const $ = (id) => document.getElementById(id);
const errors = [];
const fail = (file) => { errors.push(file); $('errors').textContent = `Could not load: ${errors.join(', ')}`; $('errors').hidden = false; };
const getJSON = (file) => fetch(BASE + file).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(() => { fail(file); return null; });

async function start() {
const sites = await getJSON('sites.json');
const site = sites?.sites.find((s) => s.id === new URLSearchParams(location.search).get('site')) || sites?.sites.find((s) => s.default) || sites?.sites[0];
if (!site) throw new Error('no site');
$('site-name').textContent = `${site.name}${site.region ? ', ' + site.region.split(',')[0] : ''}`;
const dir = `${site.id}/`;
const [meta, cells, aoi, places, summary] = await Promise.all(['meta.json', 'cells.geojson', 'aoi.geojson', 'places.geojson', 'summary.json'].map((f) => getJSON(dir + f)));
if (!meta || !cells) throw new Error('core data missing');
if (meta.fixture) throw new Error('Synthetic contract data is not allowed');
$('fixture').hidden = !meta.fixture;
$('credit').textContent = `Sources: ${meta.sources.join('; ')}`;

const acq = meta.acquisitions;
const last = acq.length - 1;
const props = cells.features.map((f) => f.properties); // index = feature id
const byCellId = new globalThis.Map(cells.features.map((f) => [f.properties.cell_id, f.id]));
const bins = onsetBins(props);
let series = null, seriesPromise = null;
const loadSeries = () => (seriesPromise ||= getJSON(dir + 'series.json').then((s) => (series = s)));

// ---------------------------------------------------------------- map
const map = new MLMap({
  container: 'map',
  style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': COLORS.radar } }] },
  bounds: site.bounds, fitBoundsOptions: { padding: 24 }, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
});
map.touchZoomRotate.disableRotation();
if (new URLSearchParams(location.search).has('debug')) window.__map = map; // alignment checks (QUOC-1 done-criterion)

const hatch = () => {
  const s = 8, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'); g.strokeStyle = 'rgba(231,236,232,0.75)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, s); g.lineTo(s, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(s - 2, s + 2); g.lineTo(s + 2, s - 2); g.stroke();
  return { width: s, height: s, data: new Uint8Array(g.getImageData(0, 0, s, s).data.buffer) };
};

map.on('load', () => {
  map.addImage('hatch', hatch());
  // 1. vector base (external; the map must work without it)
  map.addSource('base', { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap contributors' });
  map.addLayer({ id: 'base-water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#22302C' } });
  map.addLayer({ id: 'base-waterway', type: 'line', source: 'base', 'source-layer': 'waterway', paint: { 'line-color': '#2C4A45', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 2] } });
  // 2. radar backdrop of the selected pass
  map.addSource('backdrop', { type: 'image', url: BASE + dir + acq[last].backdrop, coordinates: meta.backdrop.corners });
  map.addLayer({ id: 'backdrop', type: 'raster', source: 'backdrop', paint: { 'raster-opacity': 0.6, 'raster-fade-duration': 0 } });
  // 3. cells (colour via feature state, by integer id)
  map.addSource('cells', { type: 'geojson', data: cells });
  const fs = (k, d) => ['coalesce', ['feature-state', k], d];
  map.addLayer({ id: 'cells-fill', type: 'fill', source: 'cells', paint: { 'fill-color': ['to-color', fs('fill', 'rgba(0,0,0,0)')], 'fill-opacity': fs('op', 0.95), 'fill-opacity-transition': { duration: 150 } } });
  map.addLayer({ id: 'cells-hatch', type: 'fill', source: 'cells', minzoom: 11.7, paint: { 'fill-pattern': 'hatch', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hatch'], false], 1, 0] } });
  map.addLayer({ id: 'cells-grid', type: 'line', source: 'cells', minzoom: 11.7, paint: { 'line-color': COLORS.radar, 'line-width': 1 } });
  map.addLayer({ id: 'cells-edge', type: 'line', source: 'cells', minzoom: 12.3, paint: { 'line-color': COLORS.water, 'line-width': 1.2, 'line-opacity': ['case', ['boolean', ['feature-state', 'edge'], false], 1, 0] } });
  map.addLayer({ id: 'gt30-yes', type: 'line', source: 'cells', minzoom: 12.3, filter: ['==', ['get', 'flag_gt30'], 'yes'], layout: { visibility: 'none' }, paint: { 'line-color': COLORS.ink, 'line-width': 2 } });
  map.addLayer({ id: 'gt30-possible', type: 'line', source: 'cells', minzoom: 12.3, filter: ['==', ['get', 'flag_gt30'], 'possible'], layout: { visibility: 'none' }, paint: { 'line-color': COLORS.ink, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'cells-hover', type: 'line', source: 'cells', paint: { 'line-color': COLORS.ink, 'line-width': 1, 'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0] } });
  map.addLayer({ id: 'sel-outer', type: 'line', source: 'cells', paint: { 'line-color': COLORS.radar, 'line-width': 6, 'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 1, 0] } });
  map.addLayer({ id: 'sel-inner', type: 'line', source: 'cells', paint: { 'line-color': COLORS.ink, 'line-width': 2, 'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 1, 0] } });
  // 4. commune boundary + hamlet labels as HTML (no glyph server, Vietnamese diacritics stay intact)
  if (aoi) {
    map.addSource('aoi', { type: 'geojson', data: aoi });
    map.addLayer({ id: 'aoi', type: 'line', source: 'aoi', paint: { 'line-color': COLORS.ink, 'line-width': 1.5, 'line-opacity': 0.85 } });
  }
  for (const f of places?.features || []) {
    const el = document.createElement('span'); el.className = 'hamlet'; el.textContent = f.properties.name;
    new Marker({ element: el }).setLngLat(f.geometry.coordinates).addTo(map);
  }
  ready();
});
map.on('error', (e) => { if (e.sourceId === 'base') console.warn('base map unavailable; continuing without it'); });

// ---------------------------------------------------------------- state + painting
const state = { mode: 'status', pass: last, gt30: false, radarOnly: false, sel: -1, hover: -1 };

function cellLook(p, id) {
  const none = { fill: null, op: 0.95, hatch: false, edge: false };
  if (state.pass !== last) { // as-of-pass view (spec_uiux §6.3)
    const s = series?.cells[p.cell_id]?.s;
    if (!s) return none;
    const st = stateAsOf(s, state.pass);
    if (st === '-') return { ...none, fill: COLORS.missing, hatch: true };
    return st === 'W' ? { ...none, fill: COLORS.water } : none;
  }
  if (p.status === 'no_data') return { ...none, fill: COLORS.missing, hatch: true };
  if (p.status === 'never_water') return none;
  if (p.status === 'always_water') return { ...none, fill: map.getZoom() < 12.3 ? COLORS.water : null, op: 0.4, edge: true };
  let fill;
  if (state.mode === 'status') fill = p.status === 'flooded' ? COLORS.water : COLORS.silt;
  else if (state.mode === 'onset') fill = onsetColor(bins, p.onset_by_local);
  else fill = durationColor(p.flood_days_min);
  const halfTone = state.mode === 'status' && p.status_confirmed === false;
  return { ...none, fill, op: halfTone ? 0.5 : 0.95 };
}

function paint() {
  if (!map.getSource('cells')) return;
  for (let id = 0; id < props.length; id++) {
    const l = cellLook(props[id], id);
    let op = l.op;
    if (state.gt30 && !['yes', 'possible'].includes(props[id].flag_gt30)) op = 0.35;
    map.setFeatureState({ source: 'cells', id }, { fill: l.fill || 'rgba(0,0,0,0)', op, hatch: l.hatch, edge: l.edge });
  }
  legend();
}
map.on('zoomend', () => { if (state.pass === last) paint(); });

// ---------------------------------------------------------------- legend
const ha = (n) => `${Math.round(n).toLocaleString('en-US')} ha`;
function legend() {
  const rows = [];
  const sw = (c, extra = '') => `<span class="sw ${extra}" style="background:${c}"></span>`;
  const tot = summary?.totals?.status_ha;
  const countHa = (pred) => props.filter(pred).length * CELL_HA;
  if (state.pass !== last) {
    const p = summary?.passes?.[state.pass];
    rows.push(`<li>${sw(COLORS.water)}Water seen as of this pass${p ? ` <b>${ha(p.asof_water_ha)}</b>` : ''}</li>`);
    rows.push(`<li>${sw(COLORS.missing, 'hatched')}No image yet</li>`);
  } else if (state.mode === 'status') {
    rows.push(`<li>${sw(COLORS.water)}Still under water <b>${ha(tot?.flooded ?? countHa((p) => p.status === 'flooded'))}</b></li>`);
    rows.push(`<li>${sw(COLORS.silt)}Water gone <b>${ha(tot?.water_gone ?? countHa((p) => p.status === 'water_gone'))}</b></li>`);
    rows.push(`<li>${sw('transparent', 'empty')}No water seen <b>${ha(tot?.never_water ?? 0)}</b></li>`);
    rows.push(`<li>${sw('transparent', 'edge')}Water in every image <b>${ha(tot?.always_water ?? 0)}</b></li>`);
    rows.push(`<li>${sw(COLORS.missing, 'hatched')}Not enough images <b>${ha(tot?.no_data ?? 0)}</b></li>`);
    rows.push(`<li class="note">Pale: seen in one image only.</li>`);
  } else if (state.mode === 'onset') {
    rows.push('<li class="note">Water first seen between… ' + ONSET_NOTE + '</li>');
    for (const b of bins) rows.push(`<li>${sw(b.color)}${b.from === b.to ? fmtDate(b.from) : `${fmtDate(b.from)} – ${fmtDate(b.to)}`} <b>${ha(countHa((p) => p.onset_by_local >= b.from && p.onset_by_local <= b.to))}</b></li>`);
  } else {
    rows.push('<li class="note">Days under water (at least)</li>');
    for (let b = 4; b >= 0; b--) {
      const lo = DURATION_EDGES[b], hi = DURATION_EDGES[b + 1];
      const lbl = hi === Infinity ? `${lo}+ days` : `${lo}–${hi} days`;
      rows.push(`<li>${sw(STEPS[b])}${lbl} <b>${ha(countHa((p) => p.flood_days_min !== null && p.flood_days_min >= lo && p.flood_days_min < hi))}</b></li>`);
    }
  }
  $('legend').innerHTML = `<ul>${rows.join('')}</ul><p class="note">Each block is 250 m (6.25 ha).</p>`;
}

// ---------------------------------------------------------------- questions + toggles
for (const b of document.querySelectorAll('#questions button')) {
  b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    for (const o of document.querySelectorAll('#questions button')) o.setAttribute('aria-pressed', String(o === b));
    if (state.pass !== last) setPass(last); else paint();
  });
}
$('radar-only').addEventListener('change', (e) => {
  state.radarOnly = e.target.checked;
  for (const id of ['cells-fill', 'cells-hatch', 'cells-edge']) map.setLayoutProperty(id, 'visibility', state.radarOnly ? 'none' : 'visible');
});
$('gt30-wrap').hidden = !SHOW_GT30;
$('gt30').addEventListener('change', (e) => {
  state.gt30 = e.target.checked;
  for (const id of ['gt30-yes', 'gt30-possible']) map.setLayoutProperty(id, 'visibility', state.gt30 ? 'visible' : 'none');
  paint();
});
$('whole').addEventListener('click', () => map.fitBounds(site.bounds, { padding: 24, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 }));

// ---------------------------------------------------------------- pass strip (one row per track, ticks from meta)
const tracks = [...new Set(acq.map((a) => a.track))].sort();
const t0 = Date.parse(acq[0].date_local), t1 = Date.parse(acq[last].date_local);
const xPct = (d) => (t1 === t0 ? 50 : ((Date.parse(d) - t0) / (t1 - t0)) * 100);
$('tl-rows').innerHTML = tracks.map((t) => `<div class="tl-row"><span class="tl-track">${t}</span><div class="tl-line">${
  acq.filter((a) => a.track === t).map((a) => `<button type="button" class="tick" role="option" tabindex="-1" data-i="${a.i}" style="left:${xPct(a.date_local)}%" aria-label="${fmtDate(a.date_local)}, track ${a.track}"></button>`).join('')
}</div></div>`).join('');
const ticks = [...document.querySelectorAll('.tick')];
for (const t of ticks) t.addEventListener('click', () => setPass(+t.dataset.i));
$('prev').addEventListener('click', () => setPass(Math.max(0, state.pass - 1)));
$('next').addEventListener('click', () => setPass(Math.min(last, state.pass + 1)));
$('tl-rows').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setPass(Math.max(0, Math.min(last, state.pass + (e.key === 'ArrowLeft' ? -1 : 1)))); }
});

let backdropAt = 0, backdropTimer = 0;
function swapBackdrop() { // never faster than 3 images per second (spec_uiux §6.3)
  clearTimeout(backdropTimer);
  const wait = Math.max(0, backdropAt + 334 - performance.now());
  backdropTimer = setTimeout(() => {
    backdropAt = performance.now();
    map.getSource('backdrop')?.updateImage({ url: BASE + dir + acq[state.pass].backdrop, coordinates: meta.backdrop.corners });
  }, wait);
}

async function setPass(i) {
  state.pass = i;
  const a = acq[i];
  for (const t of ticks) { const on = +t.dataset.i === i; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); }
  const flash = ticks.find((t) => +t.dataset.i === i); flash?.classList.add('flash'); setTimeout(() => flash?.classList.remove('flash'), 120);
  $('tl-label').textContent = `${fmtDate(a.date_local)}, track ${a.track}${i === last ? ', latest image' : ''}`;
  swapBackdrop();
  const asOf = i !== last;
  document.body.classList.toggle('as-of', asOf);
  $('pass-banner').hidden = !asOf;
  if (asOf) {
    const outside = a.valid_share < 0.999 ? ' Part of the commune is outside this pass.' : '';
    $('pass-banner').innerHTML = `Showing the pass of ${fmtDate(a.date_local)}, track ${a.track}.${outside} <button type="button" id="latest">Back to latest</button>`;
    $('latest').onclick = () => setPass(last);
    if (!series) { $('tl-label').textContent += ', loading'; await loadSeries(); if (state.pass !== i) return; $('tl-label').textContent = `${fmtDate(a.date_local)} · track ${a.track}`; }
  }
  paint();
  if (state.sel >= 0) openPanel(state.sel);
}

// ---------------------------------------------------------------- hover, select, panel
const coarse = matchMedia('(pointer: coarse)').matches;
map.on('mousemove', 'cells-fill', (e) => {
  const id = e.features[0]?.id;
  if (id === state.hover) return;
  if (state.hover >= 0) map.setFeatureState({ source: 'cells', id: state.hover }, { hover: false });
  state.hover = id; map.setFeatureState({ source: 'cells', id }, { hover: true });
  map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'cells-fill', () => {
  if (state.hover >= 0) map.setFeatureState({ source: 'cells', id: state.hover }, { hover: false });
  state.hover = -1; map.getCanvas().style.cursor = '';
});
map.on('click', 'cells-fill', (e) => {
  const id = e.features[0]?.id;
  if (id === undefined) return;
  // on a phone a whole-commune cell is ~6 px: first tap selects and zooms to 13 so neighbours are tappable
  if (coarse && map.getZoom() < 12.5) map.easeTo({ center: e.lngLat, zoom: 13, duration: 600 });
  select(id);
});

function select(id) {
  if (state.sel >= 0) map.setFeatureState({ source: 'cells', id: state.sel }, { sel: false });
  state.sel = id;
  if (id < 0) { $('panel').hidden = true; document.body.classList.remove('panel-open'); history.replaceState(null, '', location.pathname + location.search.replace(/[?&]cell=[^&]*/, '')); return; }
  map.setFeatureState({ source: 'cells', id }, { sel: true });
  const url = new URL(location.href); url.searchParams.set('cell', props[id].cell_id); history.replaceState(null, '', url);
  openPanel(id);
}
$('panel-close').addEventListener('click', () => select(-1));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sel >= 0) select(-1); });

async function openPanel(id) {
  const p = props[id];
  $('panel').hidden = false; document.body.classList.add('panel-open');
  const gap = p.max_gap_days === null ? '' : `, longest gap ${Math.round(p.max_gap_days)} days`;
  $('panel-body').innerHTML = `
    <p class="kicker">Block ${p.cell_id}</p>
    <h2>Near ${p.nearest_hamlet}</h2>
    ${cellSentences(p).map((s) => `<p class="answer">${s}</p>`).join('')}
    <div id="strip" class="strip-wrap"><p class="note">Loading the pass record…</p></div>
    <div id="chart"></div>
    <p class="limits">${p.n_obs} images, ${p.n_tracks} track${p.n_tracks === 1 ? '' : 's'}${gap}.</p>
    <div class="panel-actions">
      <button type="button" disabled title="Sound comes with QUOC-6">Listen to this block</button>
      <button type="button" id="copy-link">Copy link to this block</button>
    </div>`;
  $('copy-link').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); $('copy-link').textContent = 'Link copied'; } catch { $('copy-link').textContent = location.href; }
  };
  await loadSeries();
  if (state.sel !== id) return;
  const rec = series?.cells[p.cell_id];
  $('strip').innerHTML = rec ? renderStrip(rec.s, acq, state.pass, p) : '<p class="note">No pass record for this block.</p>';
  $('chart').innerHTML = rec ? renderChart(rec, acq, state.pass, p) : '';
  $('chart').querySelector('.show-table')?.addEventListener('click', (e) => {
    const t = $('chart').querySelector('table'); t.hidden = !t.hidden; e.target.textContent = t.hidden ? 'Show as table' : 'Hide table';
  });
}

// ---------------------------------------------------------------- start
function ready() {
  map.resize();
  map.fitBounds(site.bounds, { padding: 16, duration: 0 }); // the grid layout settles after construction
  setPass(last);
  const cid = new URLSearchParams(location.search).get('cell');
  if (cid && byCellId.has(cid)) {
    const id = byCellId.get(cid);
    const c = cells.features[id].geometry.coordinates[0][0];
    map.jumpTo({ center: c, zoom: 13 });
    select(id);
  }
}
}
start().catch(error => {
  $('errors').textContent = `Required public data is unavailable: ${error.message}. No substitute data has been generated.`;
  $('errors').hidden = false;
});
