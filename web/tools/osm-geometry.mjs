/** Offline OSM adapter. Retains source geometry/IDs; unclosed relation rings are omitted. */
export function joinedRings(parts){
 const remaining=parts.filter(p=>p.length>=2).map(p=>p.map(q=>[...q])),rings=[];
 const equal=(a,b)=>a[0]===b[0]&&a[1]===b[1];
 while(remaining.length){let line=remaining.shift();while(!equal(line[0],line.at(-1))){const i=remaining.findIndex(p=>equal(p[0],line.at(-1))||equal(p.at(-1),line.at(-1)));if(i<0)break;const p=remaining.splice(i,1)[0];if(!equal(p[0],line.at(-1)))p.reverse();line.push(...p.slice(1));}if(line.length>=4&&equal(line[0],line.at(-1)))rings.push(line);}
 return rings;
}
export function osmFeatures(snapshot){
 const groups={waterways:[],roads:[],water:[],buildings:[],landuse:[],places:[]},seen=new Set();
 for(const e of snapshot.elements){const id=e.type+'/'+e.id;if(seen.has(id)||!e.tags)continue;seen.add(id);const t=e.tags,p={...t,osm_id:id},points=e.geometry?.filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)).map(p=>[p.lon,p.lat]);
  const feature=geometry=>({type:'Feature',properties:p,geometry});
  if(e.type==='node'&&t.place&&Number.isFinite(e.lon))groups.places.push(feature({type:'Point',coordinates:[e.lon,e.lat]}));
  if(points?.length>1){if(t.highway)groups.roads.push(feature({type:'LineString',coordinates:points}));if(t.waterway)groups.waterways.push(feature({type:'LineString',coordinates:points}));}
  let rings=[];
  if(points?.length>=4&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])rings=[points];
  if(e.type==='relation'&&t.type==='multipolygon')rings=joinedRings((e.members||[]).filter(m=>!m.role||m.role==='outer').map(m=>(m.geometry||[]).filter(p=>Number.isFinite(p.lon)).map(p=>[p.lon,p.lat])));
  if(!rings.length)continue;
  const polygonsWithHoles=rings.map(r=>[r]);
  const inside=(point,ring)=>{let odd=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])odd=!odd;}return odd;};
  if(e.type==='relation')for(const hole of joinedRings((e.members||[]).filter(m=>m.role==='inner').map(m=>(m.geometry||[]).filter(p=>Number.isFinite(p.lon)).map(p=>[p.lon,p.lat])))){const outer=polygonsWithHoles.find(p=>inside(hole[0],p[0]));if(outer)outer.push(hole);}
  const polygons=feature(polygonsWithHoles.length===1?{type:'Polygon',coordinates:polygonsWithHoles[0]}:{type:'MultiPolygon',coordinates:polygonsWithHoles});
  if(t.natural==='water'||t.water||t.landuse==='reservoir')groups.water.push(polygons);
  if(t.building)groups.buildings.push(polygons);
  if(t.landuse||t.natural==='wood')groups.landuse.push(polygons);
 }
 return Object.fromEntries(Object.entries(groups).map(([k,features])=>[k,{type:'FeatureCollection',features}]));
}
