import {siteProfile} from '../data/siteRules.js';
import {ownedByTile,nearestOnLine,houseStyle,spacedAlong,roadClass,inside} from './infrastructureRules.js';
export function tileInfrastructure(layout,props,source,cx,cz,low=false,profile=siteProfile()){
  const owns=p=>ownedByTile(p.x,p.z,cx,cz);
  const bridges=(source?.bridges||[]).filter(owns);
  const buildings=(source?.buildings||[]).filter(p=>p.in_commune&&owns(p));
  const houses=(layout.houses||[]).map((h,i)=>({...h,...(h.infrastructurePlacement||placeHouse(h,layout,source,profile)),variant:i%3})).filter(h=>!profile.identity&&h.kind!=='rural');
  const solar=[];for(const r of layout.roads)if(['residential','tertiary'].includes(r.kind))for(const p of spacedAlong(r.points,low?240:140,(r.width_m||4)/2+1.2,20))if(owns(p)&&solar.length<(low?12:32))solar.push(p);
  // Missing OSM sluices are never invented as surveyed features. These demonstration
  // structures use existing illustrative pump positions, which already avoid fields.
  const gates=(source?.gates||[]).filter(owns).map(p=>({...p,illustrative:false}));
  if(profile.architecture.allow_illustrative_gates&&!gates.length&&props.pumps?.length){const p=props.pumps[0];const c=layout.canals.find(c=>nearestOnLine(p.x,p.z,c.points).d<(c.width_m||20));if(c){const q=nearestOnLine(p.x,p.z,c.points);gates.push({x:q.x,z:q.z,rot:q.rot,illustrative:true,name:'Illustrative irrigation gate'});}}
  const production=[];const nearMain=h=>layout.roads.some(r=>roadClass(r,profile.roads).surface==='asphalt'&&nearestOnLine(h.x,h.z,r.points).d<70);
  for(const h of houses.filter(nearMain).slice(0,low?1:2)){const p={x:h.x+Math.cos(h.rot||0)*16,z:h.z-Math.sin(h.rot||0)*16,rot:h.rot||0};if(owns(p)&&!(layout.parcels||[]).some(f=>inside([p.x,p.z],f.poly))&&!layout.canals.some(c=>nearestOnLine(p.x,p.z,c.points).d<(c.width_m||20)/2+5))production.push({...p,kind:production.length?'silo':'dryer',illustrative:true});}
  return {bridges,buildings,houses,solar,gates,production};
}
/** Larger replacements must fit the existing dry verge and leave real bridges unobstructed. */
export function placeHouse(h,layout,source,profile=siteProfile()){
  const kind=houseStyle(h,layout.roads,profile.roads);if(kind==='rural')return {kind};
  for(const b of source?.bridges||[])if(nearestOnLine(h.x,h.z,b.points).d<18)return {kind:'rural'};
  const hx=kind==='shophouse'?2.9:6,hz=kind==='shophouse'?5.6:7.5;
  const roads=layout.roads.map(r=>({q:nearestOnLine(h.x,h.z,r.points),w:(r.width_m||4)/2+.3}));
  const canals=layout.canals.map(c=>({q:nearestOnLine(h.x,h.z,c.points),w:(c.width_m||20)/2+.4}));
  for(const scale of [1,.72]){
    const clear=[...roads,...canals].every(({q,w})=>q.d>=w+(Math.abs(Math.cos((h.rot||0)-q.rot))*hx+Math.abs(Math.sin((h.rot||0)-q.rot))*hz)*scale);
    if(clear)return {kind,sx:scale,sy:scale,sz:scale};
  }
  return {kind:'rural'};
}
/** Bind only close, correctly-classed source roads. Never guess a name from a remote feature. */
export function enrichRoads(layout,source){
  for(const r of layout.roads){if(!r.points?.length)continue;const p=r.points[Math.floor(r.points.length/2)];let best=null,d=18;for(const s of source?.roads||[]){if(s.kind!==r.kind)continue;const q=nearestOnLine(p[0],p[1],s.points);if(q.d<d){d=q.d;best=s;}}if(best){r.osm_id=best.osm_id;r.name=best.name;r.ref=best.ref;r.width_m=best.width_m;}}
}
