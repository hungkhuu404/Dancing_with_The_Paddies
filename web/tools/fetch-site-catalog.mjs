import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {siteOptions} from './site-options.mjs';
import {catalogueAcquisitions} from './catalogue.mjs';
const {profile,args,bounds}=siteOptions(),selection=profile.observation_selection;
if(!selection||!args[0])throw Error('Configured observation selection and output file required');
const url=new URL('https://api.daac.asf.alaska.edu/services/search/param');Object.entries({dataset:'NISAR',processingLevel:'GCOV',bbox:bounds.join(','),start:selection.start,end:selection.end,output:'geojson',maxResults:1000}).forEach(([k,v])=>url.searchParams.set(k,v));
const r=await fetch(url,{headers:{'User-Agent':'FloodCalendar/1.0 (public geographic research)'},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('ASF catalogue HTTP '+r.status);const data=await r.json();if(!Array.isArray(data.features)||data.features.length===1000)throw Error('Missing or truncated catalogue');
const result={url:String(url),retrieved_utc:new Date().toISOString(),...catalogueAcquisitions(data.features,selection)};mkdirSync(dirname(args[0]),{recursive:true});writeFileSync(args[0],JSON.stringify(result));console.log(JSON.stringify({counts:result.acquisitions.reduce((o,a)=>(o[a.track]=(o[a.track]||0)+1,o),{}),excluded:result.skipped.length}));
