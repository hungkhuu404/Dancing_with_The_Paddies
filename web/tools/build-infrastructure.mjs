import {dirname} from 'node:path';
import {siteOptions} from './site-options.mjs';
import {framePolygon} from '../src/data/siteRules.js';
const {profile,args}=siteOptions();
// Normalize a bounded Overpass snapshot into static scene metadata; never edits /data/.
import fs from 'node:fs';
import {toScene as projectScene,inside,roadClass as classifyRoad} from '../src/world/infrastructureRules.js';
const [input,output='web/public/'+profile.scene.infrastructure]=args;
const toScene=(lon,lat)=>projectScene(lon,lat,profile),roadClass=tags=>classifyRoad(tags,profile.roads);
if(!input)throw new Error('Usage: node web/tools/build-infrastructure.mjs <cached-overpass.json> [output]');
const raw=JSON.parse(fs.readFileSync(input,'utf8'));
for(const supplemental of args.slice(2)){const extra=JSON.parse(fs.readFileSync(supplemental,'utf8'));raw.elements.push(...extra.elements);raw.query+='\n'+extra.query;raw.fetched_at=extra.fetched_at;}
const aoi=profile.boundary.mode==='polygon'?JSON.parse(fs.readFileSync(new URL('../'+profile.boundary.file,import.meta.url),'utf8')):null;
const polygon=aoi?(aoi.features?.[0]?.geometry||aoi.geometry||aoi).coordinates[0].map(p=>toScene(...p)):framePolygon(profile).map(([e,n])=>[e-profile.origin.utm_e,profile.origin.utm_n-n]);
const roads=[],bridges=[],buildings=[],gates=[],seen=new Set();
const clean=t=>Object.fromEntries(Object.entries(t).filter(([k])=>['name','name:en','bridge:name:en','ref','highway','surface','lanes','amenity','building','religion','denomination','man_made','waterway','power','bridge','bridge:name'].includes(k)));
for(const e of raw.elements){
  const id=`${e.type}/${e.id}`;if(seen.has(id))continue;seen.add(id);
  const tags=clean(e.tags||{}),geo=e.geometry||e.members?.flatMap(m=>m.geometry||[])||[];
  const points=geo.filter(p=>p&&Number.isFinite(p.lon)).map(p=>toScene(p.lon,p.lat));
  if(!points.length&&Number.isFinite(e.lon))points.push(toScene(e.lon,e.lat));if(!points.length)continue;
  let x=0,z=0;for(const p of points){x+=p[0];z+=p[1];}x=+(x/points.length).toFixed(1);z=+(z/points.length).toFixed(1);
  const inCommune=inside([x,z],polygon),common={osm_id:id,name:tags['name:en']||(profile.architecture.display_source_names===false?null:tags.name)||null,source_name:tags.name||null,x,z,in_commune:inCommune,tags};
  if(tags.highway&&points.length>=2){
    const cls=roadClass(tags);if(inCommune||cls.arterial||['motorway','trunk'].includes(tags.highway))roads.push({...common,kind:tags.highway,ref:tags.ref||null,width_m:cls.width,points});
    const bridgeName=tags['bridge:name:en']||tags['name:en']||(profile.architecture.display_source_names===false?null:tags['bridge:name']||tags.name)||null;
    if(tags.bridge&&tags.bridge!=='no'&&inCommune){let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);bridges.push({...common,name:bridgeName,points,len:+length.toFixed(1),rot:Math.atan2(points.at(-1)[1]-points[0][1],points.at(-1)[0]-points[0][0])*-1});}
  }
  if(tags.waterway&&(profile.architecture.gate_types||['sluice_gate','dam','weir']).includes(tags.waterway)&&inCommune)gates.push({...common,kind:'sluice',illustrative_geometry:true});
  if(tags.amenity||tags.building||tags.man_made||tags.power){
    let kind=(profile.architecture.civic_name_pattern&&new RegExp(profile.architecture.civic_name_pattern).test(tags.name||''))?'civic':(profile.architecture.market_name_pattern&&new RegExp(profile.architecture.market_name_pattern).test(tags.name||''))?'market':['church','chapel','cathedral'].includes(tags.building)?'church':tags.amenity==='place_of_worship'?(tags.religion==='christian'?'church':'worship'):tags.amenity==='school'||tags.building==='school'?'school':tags.amenity==='townhall'?'civic':['hospital','clinic'].includes(tags.amenity)?'clinic':tags.amenity==='community_centre'?'community':tags.amenity==='marketplace'?'market':tags.man_made==='pumping_station'?'pump':tags.man_made==='communications_tower'?'bts':tags.man_made==='silo'?'silo':tags.man_made==='works'||['industrial','warehouse'].includes(tags.building)?'mill':tags.power==='substation'?'transformer':null;
    if(kind&&(inCommune||(profile.architecture.nearby_pattern&&new RegExp(profile.architecture.nearby_pattern).test(tags.name||''))))buildings.push({...common,kind,rot:0,illustrative_geometry:true,...(profile.identity&&points.length>=3?{footprint:points}:{})});
  }
}
// A worship-site polygon and its nested building must not create two churches.
for(let i=buildings.length-1;i>=0;i--)if(buildings[i].kind==='church')for(let j=0;j<i;j++)if(buildings[j].kind==='church'&&Math.hypot(buildings[i].x-buildings[j].x,buildings[i].z-buildings[j].z)<30){buildings[j].source_ids=[...(buildings[j].source_ids||[buildings[j].osm_id]),buildings[i].osm_id];buildings[j].alternate_names=[...(buildings[j].alternate_names||[]),buildings[i].name].filter(Boolean);buildings.splice(i,1);break;}
const placesFile=new URL('../fixtures/'+profile.id+'/places.geojson',import.meta.url);
const places=(fs.existsSync(placesFile)?JSON.parse(fs.readFileSync(placesFile,'utf8')).features:[]).map(p=>{const [x,z]=toScene(...p.geometry.coordinates);return {x,z,name:p.properties.name,osm_id:p.properties.osm_id,illustrative_gate_position:true};});
const out={version:1,origin:profile.origin,provenance:{source:'OpenStreetMap contributors',license:'ODbL-1.0',url:'https://www.openstreetmap.org/copyright',fetched_at:raw.fetched_at,osm_timestamp:raw.osm3s?.timestamp_osm_base,endpoint:raw.endpoint,query:raw.query,places:'Site places; source names retained; entrance positions are illustrative',geometry:'Source positions and names; model shapes, heights, traffic and irrigation animations are illustrative, not surveyed or radar-derived.'},roads,bridges,buildings,gates,places};
fs.mkdirSync(dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(out));
console.log(JSON.stringify({output,bytes:fs.statSync(output).size,roads:roads.length,bridges:bridges.map(b=>b.name),buildings:buildings.map(b=>[b.kind,b.name,b.in_commune]),gates:gates.length},null,2));
