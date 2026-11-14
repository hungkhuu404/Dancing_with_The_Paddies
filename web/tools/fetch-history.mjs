import {siteOptions} from './site-options.mjs';
const {profile}=siteOptions();
// Offline acquisition. The browser only requests the resulting local JSON.
import {writeFile,mkdir} from 'node:fs/promises';
const url=new URL('https://archive-api.open-meteo.com/v1/archive');
Object.entries({latitude:String((profile.astronomy_center||profile.center)[1]),longitude:String((profile.astronomy_center||profile.center)[0]),start_date:'2026-08-01',end_date:'2026-10-31',hourly:'cloud_cover,rain,wind_speed_10m,wind_direction_10m',wind_speed_unit:'ms',timezone:'UTC',models:'era5'}).forEach(([k,v])=>url.searchParams.set(k,v));
const provenance={url:String(url),source:'Open-Meteo / ERA5 reanalysis',license:'CC BY 4.0',attribution:'https://open-meteo.com/en/docs/historical-weather-api',requested_at:new Date().toISOString()};
let hourly=null,error=null,optical=[];
try {const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`${r.status}: ${(await r.text()).slice(0,180)}`);const data=await r.json();if(!data.hourly?.time?.length)throw Error('No hourly data');hourly=data.hourly;provenance.units=data.hourly_units;provenance.grid={latitude:data.latitude,longitude:data.longitude};}catch(e){error=e.message;}
let opticalError=null;
try {const r=await fetch('https://earth-search.aws.element84.com/v1/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collections:['sentinel-2-l2a'],intersects:{type:'Point',coordinates:profile.astronomy_center||profile.center},datetime:'2026-08-01T00:00:00Z/2026-10-31T23:59:59Z',limit:100}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`STAC ${r.status}`);const d=await r.json();optical=(d.features||[]).filter(f=>Number.isFinite(f.properties['eo:cloud_cover'])).map(f=>({id:f.id,datetime:f.properties.datetime,cloud_cover:f.properties['eo:cloud_cover'],scope:'Sentinel-2 tile, not commune measurement'}));}catch(e){opticalError=e.message;}
const dest=new URL('../public/'+profile.scene.weather,import.meta.url);await mkdir(new URL('.',dest),{recursive:true});await writeFile(dest,JSON.stringify({provenance,hourly,error,optical,optical_source:'https://earth-search.aws.element84.com/v1',optical_error:opticalError}));
console.log(JSON.stringify({hours:hourly?.time.length||0,error,optical:optical.length,opticalError}));
