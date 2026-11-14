import {ownedByTile,nearestOnLine,spacedAlong,inside} from './infrastructureRules.js';
import {centroid} from '../data/parcels.js';
const hash=(x,z)=>{const n=Math.sin(x*12.9898+z*78.233)*43758.5453;return n-Math.floor(n);};
/** Seeded illustration only. No inferred water depth, dwelling census or religious-site inventory. */
export function identityPlan(layout,source,centre,recipe,low=false){
 if(!recipe)return [];
 const [cx,cz]=centre,owns=p=>ownedByTile(p.x,p.z,cx,cz),out=[];
 const facilities=(source?.buildings||[]).filter(p=>p.in_commune),clear=(x,z,r=14)=>!facilities.some(p=>(p.kind==='school'&&p.footprint?.length>=3&&inside([x,z],p.footprint))||Math.hypot(p.x-x,p.z-z)<(p.kind==='school'?55:r));
 for(const h of layout.houses){if(!owns(h)||!clear(h.x,h.z))continue;const seed=hash(h.x,h.z),model=seed<recipe.raised_share?recipe.raised:recipe.stilts[Math.floor(seed*17)%recipe.stilts.length];out.push({...h,model,kind:'home',base:'terrain'});
  // A few isolated domestic shrines, never a shrine on every plot or an asserted OSM feature.
  if(seed>.96){const a=h.rot||0,x=h.x+Math.cos(a)*5.7+Math.sin(a)*4,z=h.z-Math.sin(a)*5.7+Math.cos(a)*4;if(owns({x,z})&&clear(x,z)&&layout.roads.every(r=>nearestOnLine(x,z,r.points).d>(r.width_m||4)/2+1.4)&&layout.canals.every(c=>nearestOnLine(x,z,c.points).d>(c.width_m||20)/2+1.4))out.push({x,z,rot:a,model:recipe.spirit,kind:'domestic-shrine',base:'terrain'});}
 }
 for(const p of facilities.filter(p=>p.kind==='worship'&&owns(p)))out.push({...p,model:recipe.temple,kind:'temple',base:'terrain'});
 let rafts=0;
 for(const c of layout.canals){if((c.width_m||4)<18)continue;for(const p of spacedAlong(c.points,450,(c.width_m||20)/2-4,4)){
  if(rafts>=(low?1:2)||!owns(p)||!clear(p.x,p.z,35)||layout.roads.some(r=>nearestOnLine(p.x,p.z,r.points).d<(r.width_m||4)/2+5))continue;
  out.push({...p,model:recipe.raft,kind:'raft',base:'water'});out.push({...p,x:p.x+Math.cos(p.rot)*3,z:p.z-Math.sin(p.rot)*3,model:recipe.trap,kind:'fish-trap',base:'water'});rafts++;
 }}
 let fishing=0,trees=0,huts=0;
 for(let i=0;i<layout.parcels.length;i++){
  const p=layout.parcels[i],[x,z]=centroid(p.poly),seed=hash(x,z);
  if(!owns({x,z})||!clear(x,z,40))continue;
  if(huts<1&&seed>.94&&inside([x+4,z+4],p.poly)&&inside([x-4,z-4],p.poly)&&layout.roads.every(r=>nearestOnLine(x,z,r.points).d>12)&&layout.canals.every(c=>nearestOnLine(x,z,c.points).d>(c.width_m||4)/2+5)){out.push({x,z,rot:seed*6.28,model:recipe.hut,kind:'field-hut',base:'terrain'});huts++;continue;}
  if(fishing<(low?1:3)&&seed>.55&&[[-7,-7],[7,-7],[-7,7],[7,7]].every(([a,b])=>inside([x+a,z+b],p.poly))&&layout.roads.every(r=>nearestOnLine(x,z,r.points).d>20)&&layout.canals.every(c=>nearestOnLine(x,z,c.points).d>(c.width_m||4)/2+5)){
   out.push({x,z,rot:seed*6.28,model:recipe.net,kind:'field-net',parcel:i,base:'flood'});
   out.push({x:x+3,z:z+2,rot:seed*6.28,model:recipe.boat,kind:'field-boat',parcel:i,base:'flood'});
   out.push({x:x+3,z:z+2,rot:seed*6.28,model:'fisher',kind:'adult-fisher',parcel:i,base:'flood'});fishing++;
  }
 }
 // Sparse trees near existing homes, not a species distribution reconstructed from radar.
 for(let i=0;i<layout.houses.length&&trees<(low?6:16);i+=19){const h=layout.houses[i],x=h.x+9,z=h.z+6;if(!owns({x,z})||!clear(x,z)||layout.roads.some(r=>nearestOnLine(x,z,r.points).d<(r.width_m||4)/2+2)||layout.canals.some(c=>nearestOnLine(x,z,c.points).d<(c.width_m||20)/2+2))continue;out.push({x,z,rot:hash(x,z)*6.28,model:recipe.trees[trees%recipe.trees.length],kind:'garden-tree',base:'terrain'});trees++;}
 return out;
}
/** Display interpolation only; height choices describe a model, never radar-derived depth. */
export function floodVisibility(level,observedWater=true){if(!observedWater||!Number.isFinite(level))return 0;return Math.max(0,Math.min(1,(level-.6)/.3));}
export function floodBob(time,reduced=false){return reduced?0:Math.sin(time*1.4)*.025;}

/** Model-space window anchors for the original artist presets, not surveyed architecture. */
export function homeWindows(model,recipe){const v=recipe.stilts.indexOf(model),floor=v<0?.7:1.8+v*.3,w=5.7+Math.max(0,v)*.35,d=7.3+Math.max(0,v)*.4;return [[-w*.29,floor+1.35,d/2-1.10],[w*.28,floor+1.35,d/2-1.10]];}

/** Illustrative labour rhythm for the lighting control, not an observed fishing timetable. */
export function fishingRhythm(tod){if(!Number.isFinite(tod))return .5;const t=((tod%1)+1)%1;return .55+.45*Math.exp(-Math.pow((t-.12)/.10,2))+.35*Math.exp(-Math.pow((t-.70)/.12,2));}
