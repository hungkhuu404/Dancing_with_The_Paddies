import {siteOptions} from './site-options.mjs';
const {profile,args,bounds}=siteOptions();const bbox=[bounds[1],bounds[0],bounds[3],bounds[2]].join(',');
// Offline acquisition: no requests are made by the shipped application.
import {writeFile,mkdir} from 'node:fs/promises';
const query=`[out:json][timeout:120];(way[\"highway\"](${bbox});nwr[\"bridge\"](${bbox});nwr[\"amenity\"~\"place_of_worship|school|townhall|hospital|clinic|community_centre|marketplace\"](${bbox});nwr[\"waterway\"~\"sluice_gate|dam|weir\"](${bbox});nwr[\"man_made\"~\"works|silo|storage_tank|pumping_station|communications_tower\"](${bbox});nwr[\"power\"=\"substation\"](${bbox}););out geom;`;
const output=args[0];
const requestQuery=args.includes('--facilities-only')?`[out:json][timeout:60];(nwr["amenity"~"place_of_worship|school|townhall|hospital|clinic|community_centre|marketplace"](${bbox}););out geom;`:args.includes('--buildings-only')?`[out:json][timeout:60];(way["building"](${bbox}););out geom;`:query;
if(!output)throw new Error('Usage: node web/tools/fetch-infrastructure.mjs <local-cache-output.json>');
const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
let result;
for(const endpoint of endpoints){
  try{
    const r=await fetch(endpoint,{method:'POST',headers:{'User-Agent':'FloodCalendar/1.0 (public geographic data research)','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:requestQuery}),signal:AbortSignal.timeout(90000)});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const data=await r.json();if(!Array.isArray(data.elements)||data.remark)throw new Error(data.remark||'Missing elements');
    result={source:'OpenStreetMap contributors',license:'ODbL-1.0',endpoint,query:requestQuery,fetched_at:new Date().toISOString(),...data};break;
  }catch(error){console.error(endpoint,error.message);}
}
if(!result)throw new Error('No Overpass response; do not fabricate positions');
await mkdir((await import('node:path')).dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(result));
console.log(JSON.stringify({output,elements:result.elements.length,timestamp:result.osm3s?.timestamp_osm_base}));
