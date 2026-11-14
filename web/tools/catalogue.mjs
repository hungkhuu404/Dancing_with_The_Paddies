// Catalogue metadata only. This does not download GCOV or classify water.
export function catalogueAcquisitions(features,selection){
 const chosen=new Map(),skipped=[];
 for(const f of features){const p=f.properties||{},v=(p.sceneName||'').split('_'),track=v[5]+v[6];if(selection.tracks[track]!==v[7])continue;
  if(v[9]!==selection.mode){skipped.push({acq_utc:p.startTime,track,frame:v[7],crid:v[13],granule:p.sceneName+'.h5',reason:'other',detail:'excluded_'+v[9]+'_mode'});continue;}
  const key=track+'/'+p.startTime,record={acq_utc:p.startTime,track,frame:v[7],crid:v[13],scene_name:p.sceneName,footprint:f.geometry};
  if(!chosen.has(key)||record.scene_name.localeCompare(chosen.get(key).scene_name)>0)chosen.set(key,record);
 }
 return {acquisitions:[...chosen.values()].sort((a,b)=>a.acq_utc.localeCompare(b.acq_utc)||a.track.localeCompare(b.track)),skipped};
}
