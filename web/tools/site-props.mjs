import {inside} from '../src/world/infrastructureRules.js';
/** Keep generic adult actors out of mapped school grounds; no demographic inference. */
export function reviewSiteProps(props,centre,schools,architecture){
 const people=(props.people||[]).filter(p=>{const point=[p.x+centre[0],p.z+centre[1]];return !schools.some(s=>s.ring?inside(point,s.ring):Math.hypot(point[0]-s.x,point[1]-s.z)<30);});
 return {...props,people,graves:architecture.illustrative_graves===false?[]:props.graves};
}
/** Area-weighted centroid; repeated closing points do not bias source building positions. */
export function polygonCentre(ring){let area=0,x=0,z=0;for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1],k=a[0]*b[1]-b[0]*a[1];area+=k;x+=(a[0]+b[0])*k;z+=(a[1]+b[1])*k;}return Math.abs(area)>1e-9?[x/(3*area),z/(3*area)]:ring[0];}
export function sourceHouseLayout(layout,tile,sources,schoolRings){
 const insideSchool=h=>schoolRings.some(s=>s.ring&&inside([h.x+tile.x,h.z+tile.z],s.ring));
 const owned=sources.filter(h=>!schoolRings.some(s=>s.ring&&inside([h.x,h.z],s.ring))&&h.x>=tile.x-1000&&h.x<tile.x+1000&&h.z>=tile.z-1000&&h.z<tile.z+1000);
 const houses=layout.houses.filter(h=>!h.osm_id&&!insideSchool(h)&&!owned.some(s=>Math.hypot(h.x+tile.x-s.x,h.z+tile.z-s.z)<12));
 for(const h of owned)houses.push({x:Math.round((h.x-tile.x)*10)/10,z:Math.round((h.z-tile.z)*10)/10,rot:h.rot,variant:0,osm_id:h.osm_id});
 return {...layout,houses};
}
