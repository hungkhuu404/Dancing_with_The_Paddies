import {reviewSiteProps,polygonCentre,sourceHouseLayout} from './site-props.mjs';
﻿// Derive source-backed mapped water masks; nothing here infers water depth or observed flood state.
import fs from 'node:fs';
import {join} from 'node:path';
import {siteOptions} from './site-options.mjs';
import {osmFeatures} from './osm-geometry.mjs';
import {utm} from '../src/data/projection.js';
const {profile,args,sceneURL}=siteOptions();if(!args[0])throw Error('OSM snapshot path required');
const snapshot=JSON.parse(fs.readFileSync(args[0],'utf8')),groups=osmFeatures(snapshot),file=new URL('index.json',sceneURL),index=JSON.parse(fs.readFileSync(file,'utf8'));
const frame=profile.frame,origin=profile.origin;
index.water_areas=groups.water.features.flatMap(feature=>{
 const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
 return polygons.map(rings=>{const transformed=rings.map(r=>r.map(p=>{const[e,n]=utm(...p,profile.zone);return [Math.round((e-origin.utm_e)*10)/10,Math.round((origin.utm_n-n)*10)/10];})),pts=transformed.flat(),xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]);return {osm_id:feature.properties.osm_id,rings:transformed,bounds:[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)]};});
}).filter(w=>w.bounds[2]>=frame.e0-origin.utm_e&&w.bounds[0]<=frame.e1-origin.utm_e&&w.bounds[3]>=origin.utm_n-frame.n1&&w.bounds[1]<=origin.utm_n-frame.n0);
index.provenance={osm:'© OpenStreetMap contributors (ODbL)',osm_url:'https://www.openstreetmap.org/copyright',source_snapshot_sha256:(await import('node:crypto')).createHash('sha256').update(fs.readFileSync(args[0])).digest('hex'),imagery:'EOxCloudless 2016 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), CC BY 4.0',imagery_url:'https://tiles.maps.eox.at/wms?service=WMS&request=GetCapabilities',illustration:'Parcels, supplemental houses, vegetation, architecture and activity are illustrative. Mapped water outlines are OSM geometry, not current radar observations. No water depth is represented.'};
const schools=snapshot.elements.filter(e=>e.tags?.amenity==='school').map(e=>{
 const points=(e.geometry||[]).map(p=>{const[e,n]=utm(p.lon,p.lat,profile.zone);return [e-origin.utm_e,origin.utm_n-n];});
 if(points.length>=4)return {ring:points};if(Number.isFinite(e.lon)){const[e0,n]=utm(e.lon,e.lat,profile.zone);return {x:e0-origin.utm_e,z:origin.utm_n-n};}return null;
}).filter(Boolean);
const sourceHouses=groups.buildings.features.filter(f=>!f.properties.amenity&&!['church','chapel','cathedral','temple','industrial','warehouse','school','civic','garage','roof','shed','greenhouse'].includes(f.properties.building)).flatMap(f=>{
 const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 return polygons.map(rings=>{const ring=rings[0].map(p=>{const[e,n]=utm(...p,profile.zone);return [e-origin.utm_e,origin.utm_n-n];}),[x,z]=polygonCentre(ring);let edge=[0,1],length=0;for(let i=1;i<ring.length;i++){const dx=ring[i][0]-ring[i-1][0],dz=ring[i][1]-ring[i-1][1],d=Math.hypot(dx,dz);if(d>length){length=d;edge=[dx,dz];}}return {x,z,rot:Math.atan2(...edge),osm_id:f.properties.osm_id};});
}).filter(h=>h.x>=frame.e0-origin.utm_e&&h.x<frame.e1-origin.utm_e&&h.z>=origin.utm_n-frame.n1&&h.z<origin.utm_n-frame.n0);
index.provenance.house_placement='Source building centroids where available; supplemental houses follow seeded road/canal belts. Architecture is illustrative.';
for(const tile of index.tiles){const path=new URL(tile.props,sceneURL),raw=JSON.parse(fs.readFileSync(path,'utf8')),props=reviewSiteProps(raw,[tile.x,tile.z],schools,profile.architecture);for(const [key,value]of Object.entries(props))if(Array.isArray(value)&&key!=='attribution')tile.counts[key]=value.length;fs.writeFileSync(path,JSON.stringify(props));const layoutPath=new URL(tile.layout,sceneURL),layout=sourceHouseLayout(JSON.parse(fs.readFileSync(layoutPath,'utf8')),tile,sourceHouses,schools);while(Buffer.byteLength(JSON.stringify(layout))>450000&&layout.trees.length)layout.trees.length=Math.floor(layout.trees.length*.98);if(Buffer.byteLength(JSON.stringify(layout))>450000)throw Error('Source houses exceed tile budget');tile.counts.houses=layout.houses.length;tile.counts.trees=layout.trees.length;fs.writeFileSync(layoutPath,JSON.stringify(layout));}
fs.writeFileSync(file,JSON.stringify(index));console.log(JSON.stringify({site:profile.id,mapped_water_areas:index.water_areas.length,index_bytes:fs.statSync(file).size,schools:schools.length,source_houses:sourceHouses.length}));
