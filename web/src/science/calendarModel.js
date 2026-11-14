// Exact observations only. Never carry an earlier image into a calendar column.
import {STEPS} from '../map/contract.js';
export function waterCalendar(cells,series,acquisitions,places={features:[]}){
  if(!Array.isArray(acquisitions)||!acquisitions.length||!series?.cells)throw Error('Observation data is unavailable.');
  const groups=new Map(),seen=new Set();
  const ensure=name=>{if(!groups.has(name))groups.set(name,{name,total:0,first:Infinity,values:acquisitions.map(()=>({wet:0,valid:0}))});return groups.get(name);};
  for(const f of places?.features||[])if(f.properties?.name)ensure(f.properties.name);
  for(const f of cells?.features||[]){
    const p=f.properties,id=p.cell_id;if(seen.has(id))throw Error('Duplicate block in calendar.');seen.add(id);
    const s=series.cells[id]?.s;if(typeof s!=='string'||s.length!==acquisitions.length||/[^WN-]/.test(s))throw Error('The observation record is incomplete.');
    const g=ensure(p.nearest_hamlet||'Unassigned');g.total++;
    for(let i=0;i<s.length;i++){if(s[i]!=='-')g.values[i].valid++;if(s[i]==='W'){g.values[i].wet++;g.first=Math.min(g.first,i);}}
  }
  return [...groups.values()].sort((a,b)=>a.first-b.first||a.name.localeCompare(b.name,'vi')).map(g=>({...g,values:g.values.map(v=>{
    const coverage=g.total?v.valid/g.total:0,ratio=v.valid?v.wet/v.valid:null;
    return {...v,total:g.total,coverage,ratio,display:coverage>=.5&&ratio!==null};
  })}));
}
export function calendarColor(value){return value.display?STEPS[Math.min(4,Math.floor(value.ratio*5))]:null;}
export function calendarMapQuery(site,pass,hamlet){return new URLSearchParams({site,scope:'image',layer:'status',pass:String(pass),hamlet}).toString();}
export function methodRows(meta){
  const m=meta.method||{};
  const value=(a,key)=>Object.hasOwn(a,key)?a[key]:m[key]??null;
  return (meta.acquisitions||[]).map(a=>({date:a.date_local,track:a.track,rule:value(a,'rule'),hh:value(a,'hh_db_max'),hv:value(a,'hv_db_max')}));
}
