export const DATA_SOUND_GAIN=.42;
// Area ratios are per acquisition, among observed blocks. Missing coverage stays explicit.
export function seasonCue(pass,totalHa){
 if(!pass||!Number.isFinite(totalHa)||totalHa<=0)return null;
 const valid=pass.valid_ha,water=pass.water_ha;
 if(!Number.isFinite(valid)||!Number.isFinite(water)||valid<0||water<0||water>valid||valid>totalHa)return null;
 return {water:valid?water/valid:null,coverage:valid/totalHa,arrival:valid?Math.max(0,Math.min(1,(pass.new_water_ha||0)/valid)):0,recession:valid?Math.max(0,Math.min(1,(pass.water_gone_ha||0)/valid)):0};
}
export function cueNotes(cue){
 if(!cue)return [];
 if(cue.water===null)return [{frequency:110,offset:0,length:.07,gain:.12},{frequency:110,offset:.22,length:.07,gain:.12}];
 const scale=[220,277.18,329.63,440],n=1+Math.round(cue.water*3),notes=scale.slice(0,n).map((frequency,i)=>({frequency,offset:i*.13,length:.38,gain:.18}));
 if(cue.arrival>0)notes.push({frequency:523.25,offset:.55,length:.22,gain:.08+.12*cue.arrival});
 if(cue.recession>0)notes.push({frequency:164.81,offset:.55,length:.22,gain:.08+.12*cue.recession});
 if(cue.coverage<.5)notes.push({frequency:110,offset:.85,length:.07,gain:.12});
 return notes;
}
