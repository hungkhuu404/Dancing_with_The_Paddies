// Public geographic acquisition only; run during offline scene preparation.
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {siteOptions} from './site-options.mjs';
const {profile,args,bounds}=siteOptions();if(!args[0])throw Error('Explicit snapshot output path required');
const box=[bounds[1],bounds[0],bounds[3],bounds[2]].join(',');
const tags=['["waterway"]','["water"]','["highway"]','["bridge"]','["building"]','["place"]','["amenity"~"place_of_worship|school|marketplace|college"]','["man_made"~"pumping_station|monitoring_station|water_works|water_tower|dam|weir"]','["monitoring:water_level"]','["landuse"~"reservoir|farmland|forest|religious"]','["natural"~"water|wetland|wood"]'];
const query='[out:json][timeout:120][maxsize:134217728];('+tags.map(t=>'nwr'+t+'('+box+');').join('')+');out geom;';
if(args.includes('--query-only')){console.log(query);process.exit(0);}
let result,endpoint;for(const url of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'])try{
 const r=await fetch(url,{method:'POST',headers:{'User-Agent':'FloodCalendar/1.0 (public geographic research)','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(150000)});if(!r.ok)throw Error('Overpass HTTP '+r.status);const json=await r.json();if(!Array.isArray(json.elements)||json.remark)throw Error(json.remark||'Missing elements');result=JSON.stringify(json);endpoint=url;break;
}catch(e){console.error(e.message);}
if(!result)throw Error('No OSM source available; no geometry has been fabricated');mkdirSync(dirname(args[0]),{recursive:true});writeFileSync(args[0],result);writeFileSync(args[0]+'.provenance.json',JSON.stringify({site:profile.id,query,endpoint,retrieved_at:new Date().toISOString(),sha256:createHash('sha256').update(result).digest('hex'),copyright:'OpenStreetMap contributors',license:'ODbL-1.0'}));
