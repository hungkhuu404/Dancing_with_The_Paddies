// Rebuild the small regional overview from pinned public-domain Natural Earth data.
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const revision='ca96624a56bd078437bca8184e78163e5039ad19';
const bounds=[95,5,112,24],out=resolve(import.meta.dirname,'../public/atlas');
function clip(ring){
  let points=ring.slice(0,-1);
  for(const [axis,value,greater]of [[0,bounds[0],true],[0,bounds[2],false],[1,bounds[1],true],[1,bounds[3],false]]){
    const next=[];
    for(let j=0;j<points.length;j++){
      const a=points[j],b=points[(j+1)%points.length];
      const ia=greater?a[axis]>=value:a[axis]<=value,ib=greater?b[axis]>=value:b[axis]<=value;
      if(ia)next.push(a);
      if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
    }
    points=next;if(points.length<3)return null;
  }
  return [...points,points[0]].map(p=>p.map(n=>+n.toFixed(4)));
}
const files=['ne_50m_land.geojson','ne_50m_rivers_lake_centerlines.geojson'];
const urls=files.map(f=>`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/${f}`);
const source=await Promise.all(urls.map(async url=>{const r=await fetch(url);if(!r.ok)throw Error(`${r.status}: ${url}`);return r.json();}));
const land=[],rivers=[];
for(const f of source[0].features){
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const polygon of polygons){const outer=clip(polygon[0]);if(outer)land.push([outer,...polygon.slice(1).map(clip).filter(Boolean)]);}
}
for(const f of source[1].features){
  const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const line of lines){
    let run=[];
    for(const p of line){
      if(p[0]>=bounds[0]&&p[0]<=bounds[2]&&p[1]>=bounds[1]&&p[1]<=bounds[3])run.push(p.map(n=>+n.toFixed(4)));
      else{if(run.length>1)rivers.push(run);run=[];}
    }
    if(run.length>1)rivers.push(run);
  }
}
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'region.json'),JSON.stringify({bounds,land,rivers}));
await writeFile(resolve(out,'manifest.json'),JSON.stringify({source:'Natural Earth 1:50m land and river centre lines',license:'Public domain',terms:'https://www.naturalearthdata.com/about/terms-of-use/',revision,urls,
  processing:'Clipped to 95-112 E, 5-24 N; rounded to 4 decimal places. Uniform extrusion is graphical, not terrain or water elevation.',
  planned_locations:{bang_rakam:{center:[100.12,16.75],source:'Research_log.md DEC-PLAN-015 proposed study centre; approximate, no boundary or observations supplied.'}}},null,2));
console.log({landPolygons:land.length,rivers:rivers.length,bytes:(await stat(resolve(out,'region.json'))).size});
