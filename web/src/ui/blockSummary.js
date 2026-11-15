import {fmtDate} from '../map/contract.js';

export function dateRange(a,b) {
  if(!a||!b)return a?fmtDate(a):b?fmtDate(b):'Not observed';
  if(a===b)return fmtDate(a);
  if(a.slice(0,7)===b.slice(0,7))return `${+a.slice(8)} to ${fmtDate(b)}`;
  if(a.slice(0,4)===b.slice(0,4))return `${fmtDate(a).replace(/ \d{4}$/,'')} to ${fmtDate(b)}`;
  return `${fmtDate(a)} to ${fmtDate(b)}`;
}

/** Presentation only: retain bounds, ongoing status and uncertainty from the data contract. */
export function blockSummary(p) {
  const names={flooded:'Water present',water_gone:'Water receded',never_water:'No water observed',always_water:'Water throughout',no_data:'Insufficient observations'};
  const rows=[];
  if(['flooded','water_gone'].includes(p.status)){
    rows.push({label:'Water arrival',value:p.onset_after_local===null?'Present in first image':dateRange(p.onset_after_local,p.onset_by_local)});
    const lo=Number.isFinite(p.flood_days_min)?Math.floor(p.flood_days_min):null,hi=Number.isFinite(p.flood_days_max)?Math.ceil(p.flood_days_max):null;
    rows.push({label:'Flood duration',value:lo===null?'Not bounded':hi===null?`At least ${lo} days`:`${lo} to ${hi} days`,detail:p.ongoing?'Ongoing at last observation':''});
    rows.push({label:p.ongoing?'Last observed':'Water recession',value:p.ongoing?fmtDate(p.last_obs_local):dateRange(p.end_after_local,p.end_by_local)});
  }else rows.push({label:'Coverage',value:`${p.n_obs??0} images`,detail:p.last_obs_local?`Last image on ${fmtDate(p.last_obs_local)}`:''});
  return {status:names[p.status]||names.no_data,rows,unconfirmed:p.status_confirmed===false&&['flooded','water_gone'].includes(p.status)};
}
