// Parcel card: when water came, how long it stayed, whether it is still there, 20-cell state strip.
import { firstWater, duration, stillThere, fmtDate } from '../data/parcels.js';
import { cellSentences } from '../map/contract.js';
import {blockCore} from './blockCore.js';
import {icon} from './icons.js';
import {reveal,dismiss} from './motion.js';

export function createCard(root, passes, onClose, fixture=false) {
  root.setAttribute('role', 'region');
  root.setAttribute('aria-labelledby', 'card-title');
  root.hidden = true;
  let openIdx = -1;

  function open(parcel, idx, pass) {
    openIdx = idx;
    if (parcel.cell) return openCell(parcel, idx, pass);
    const s = parcel.s;
    const f = firstWater(s);
    const d = duration(s, passes);
    const st = stillThere(s);
    const came = f < 0 ? 'No water seen this season' : fmtDate(passes[f].date);
    const stayed = !d ? '—' : d.ongoing ? `${d.days}+ days so far` : `~${d.days} days`;
    const between = d ? (d.ongoing ? `water on every pass since ${fmtDate(passes[d.from].date).slice(0, -5)}` : `between ${d.minDays} and ${d.maxDays} days`) : '';
    const still = st === null ? 'Unknown (no data on the last pass)' : st ? 'Yes' : 'No';
    root.innerHTML = `
      <button class="card-x" type="button" aria-label="Close">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
      </button>
      <p class="card-kicker">Field block</p>
      <h2 id="card-title" class="card-title">${escape(parcel.id || 'Parcel ' + (idx + 1))}</h2>
      <dl class="card-facts">
        <div><dt>Water came in</dt><dd>${came}</dd></div>
        <div><dt>Stayed</dt><dd>${stayed}${between ? `<span class="card-sub">${between}</span>` : ''}</dd></div>
        <div><dt>Still there</dt><dd>${still}<span class="card-sub">last pass, ${fmtDate(passes[passes.length - 1].date)}</span></dd></div>
      </dl>
      <div class="card-strip" role="img" aria-label="${stripLabel(s, passes)}">
        ${[...s].map((c, i) => `<i class="c-${c === 'W' ? 'w' : c === 'N' ? 'n' : 'x'}${i === pass ? ' is-cur' : ''}" title="${fmtDate(passes[i].date)}: ${c === 'W' ? 'water' : c === 'N' ? 'dry' : 'no data'}"></i>`).join('')}
      </div>
      <p class="card-legend"><i class="c-w"></i>water <i class="c-n"></i>dry <i class="c-x"></i>no data</p>`;
    root.classList.add('is-in');root.scrollTop=0;reveal(root);
    root.querySelector('.card-x').addEventListener('click', close);
    root.querySelector('.card-x').focus({ preventScroll: true });
  }
  // Contract data: the same answers as the map's block panel (spec_uiux §6.4), for the 250 m block under the field.
  function openCell(parcel, idx, pass) {
    const p = parcel.cell, s = parcel.s;
    const notes=cellSentences(p).slice(['flooded','water_gone'].includes(p.status)?3:1);
    root.innerHTML = `
      <button class="card-x" type="button" aria-label="Close">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
      </button>
      ${fixture?'<p class="fixture-record">Fixture record. Water data pending.</p>':''}${blockCore(p,'card-title')}
      <details class="observation-details"><summary>Observation record <span>${p.n_obs??0} images</span></summary>
      <div class="card-strip" role="img" aria-label="${stripLabel(s, passes)}">
        ${[...s].map((c, i) => `<i class="c-${c === 'W' ? 'w' : c === 'N' ? 'n' : 'x'}${i === pass ? ' is-cur' : ''}" title="${fmtDate(passes[i].date)}: ${c === 'W' ? 'water' : c === 'N' ? 'dry' : 'no data'}"></i>`).join('')}
      </div>
      <p class="card-legend"><span><i class="c-w"></i>Water</span><span><i class="c-n"></i>Dry</span><span><i class="c-x"></i>No image</span></p>
      <p class="block-id">${escape(p.cell_id)}</p>${notes.map(t=>`<p class="card-answer">${escape(t)}</p>`).join('')}</details>
      <a class="card-link" href="${import.meta.env.BASE_URL}map/?cell=${encodeURIComponent(p.cell_id)}">${icon('map')}Inspect on map</a>`;
    root.classList.add('is-in');root.scrollTop=0;reveal(root);
    root.querySelector('.card-x').addEventListener('click', close);
    root.querySelector('.card-x').focus({ preventScroll: true });
  }
  function close() {
    if (root.hidden||root.dataset.phase==='closing') return;
    dismiss(root);
    const i = openIdx; openIdx = -1;
    onClose(i);
    document.querySelector('#gl')?.focus({preventScroll:true});
  }
  function markPass(pass) {
    root.querySelectorAll('.card-strip i').forEach((el, i) => el.classList.toggle('is-cur', i === pass));
  }
  return { open, close, markPass, get openIndex() { return openIdx; } };
}

function stripLabel(s, passes) {
  const w = [...s].filter((c) => c === 'W').length;
  return `Water on ${w} of ${passes.length} passes`;
}
function escape(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
