// Offline source acquisition only. A failed request never replaces an existing archive.
import {siteOptions} from './site-options.mjs';
import {historyWindow,historyCoverage} from './history-rules.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const {profile,args}=siteOptions(),root=fileURLToPath(new URL('../..',import.meta.url));
if(args.some((v,i)=>v!=='--out'&&args[i-1]!=='--out'))throw Error('Usage: fetch-history.mjs --site <id> [--out <review-file>]');
const at=args.indexOf('--out');if(at>=0&&!args[at+1])throw Error('--out requires a file');
const meta=JSON.parse(await readFile(resolve(root,'data',profile.id,'meta.json'),'utf8'));
if(meta.fixture||meta.site!==profile.id)throw Error('Weather acquisition requires matching real observation metadata');
const range=historyWindow(meta.acquisitions),url=new URL('https://archive-api.open-meteo.com/v1/archive');
Object.entries({latitude:String((profile.astronomy_center||profile.center)[1]),longitude:String((profile.astronomy_center||profile.center)[0]),...range,hourly:'cloud_cover,rain,wind_speed_10m,wind_direction_10m',wind_speed_unit:'ms',timezone:'UTC',models:'era5'}).forEach(([k,v])=>url.searchParams.set(k,v));
const dest=at>=0?resolve(args[at+1]):resolve(root,'web/public',profile.scene.weather);
let previous=null;try{previous=JSON.parse(await readFile(resolve(root,'web/public',profile.scene.weather),'utf8'));}catch{/* no prior archive */}
const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`Open-Meteo HTTP ${r.status}; existing archive preserved`);
const data=await r.json();if(data.utc_offset_seconds!==0)throw Error('Expected UTC weather time axis');
const coverage=historyCoverage(data.hourly,meta.acquisitions);
if(!coverage.complete)throw Error(`Weather covers ${coverage.covered.length}/${coverage.total} acquisitions; existing archive preserved`);
if(data.hourly_units?.wind_speed_10m!=='m/s'||data.hourly_units?.rain!=='mm'||data.hourly_units?.cloud_cover!=='%')throw Error('Unexpected weather units');
const result={provenance:{url:String(url),source:'Open-Meteo / ERA5 reanalysis',license:'CC BY 4.0',attribution:'https://open-meteo.com/en/docs/historical-weather-api',requested_at:new Date().toISOString(),site:profile.id,units:data.hourly_units,grid:{latitude:data.latitude,longitude:data.longitude,resolution_degrees:.25},coverage},hourly:data.hourly,error:null,optical:previous?.optical||[],optical_source:previous?.optical_source||'https://earth-search.aws.element84.com/v1',optical_error:previous?.optical_error||null,optical_provenance:previous?.optical?.length?{preserved_from_previous_archive:true,previous_requested_at:previous.optical_provenance?.previous_requested_at||previous.provenance?.requested_at||null,current_request_includes_optical:false}:null};
await mkdir(dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify(result)+'\n');
console.log(JSON.stringify({site:profile.id,...range,hours:data.hourly.time.length,covered:coverage.covered.length,acquisitions:coverage.total,optical:result.optical.length}));
