export function shouldInvite({enabled,fixture=false,seen=false,search=''}){const q=new URLSearchParams(search);return !!enabled&&!fixture&&!seen&&!['view','cell','at','village'].some(k=>q.has(k));}
export function tourProgress(seconds){const s=Math.max(0,Math.min(60,Number.isFinite(seconds)?seconds:0));return {seconds:s,scene:Math.min(4,Math.floor(s/12)),label:Math.floor(s/60)+':'+String(Math.floor(s)%60).padStart(2,'0')+' / 1:00'};}

export function hasTourRecord(cell){return !!cell&&['flooded','water_gone'].includes(cell.status)&&typeof cell.onset_by_local==='string'&&Number.isFinite(cell.flood_days_min);}
export function tourEntryWeight(seconds){const u=Math.max(0,Math.min(1,seconds/1.2));return u*u*(3-2*u);}

export function tourRecordPriority(cell){return hasTourRecord(cell)?cell.status_confirmed===true?2:1:0;}
