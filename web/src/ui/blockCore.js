import {blockSummary} from './blockSummary.js';
import {escapeHTML as esc} from '../map/presentation.js';
import {icon} from './icons.js';

/** Shared facts for the landscape and map. Exported bounds are never reinterpreted. */
export function blockCore(p,titleId){
  const s=blockSummary(p);
  const labels={'Water arrival':['arrival','Arrived'],'Flood duration':['duration','Under water'],'Water recession':['recession','Receded'],'Last observed':['calendar','Last seen'],'Coverage':['radar','Coverage']};
  return `<p class="block-kicker">250 m block</p><h2 id="${titleId}" class="block-title">${p.nearest_hamlet?`<small>Near</small> ${esc(p.nearest_hamlet)}`:'Selected block'}</h2>
    <div class="block-state-row"><p class="block-status status-${esc(p.status)}">${esc(s.status)}</p>${s.unconfirmed?'<span class="unconfirmed-flag" title="Seen in one image only, not yet confirmed">Unconfirmed</span>':''}</div>
    <p class="record-scope">Season record</p><dl class="block-facts">${s.rows.map(r=>{const [name,label]=labels[r.label]||['info',r.label];return `<div><dt>${icon(name)}<span>${label}</span></dt><dd>${esc(r.value)}${r.detail?`<small>${esc(r.detail)}</small>`:''}</dd></div>`;}).join('')}</dl>`;
}
