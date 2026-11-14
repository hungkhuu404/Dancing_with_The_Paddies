/** Deterministic illustration, never a water classification or elevation model. */
export function distanceToRiver(e,n,lines){let best=Infinity;for(const points of lines)for(let i=1;i<points.length;i++){const[a,b]=[points[i-1],points[i]],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((e-a[0])*dx+(n-a[1])*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(e-a[0]-t*dx,n-a[1]-t*dy));}return best;}
const hash=(e,n)=>{let x=(Math.imul(e|0,73856093)^Math.imul(n|0,19349663))>>>0;x=Math.imul(x^(x>>>16),2246822507)>>>0;return (x^(x>>>13))>>>0;};
export function fixtureHistory(e,n,acquisitions,lines){
 const h=hash(e,n),d=distanceToRiver(e,n,lines),base=Date.parse('2026-08-01T00:00:00Z'),on=18+Math.min(45,d/160)+(h%11),end=78+(h%19);
 return acquisitions.map((a,i)=>{if(hash(e+i,n+i)%31===0)return '-';const day=(Date.parse(a.acq_utc)-base)/86400000;if(d<70)return 'W';if(h%11===0)return 'N';return day>=on&&day<end?'W':'N';}).join('');
}
export function fixtureSummary(features,cells,acquisitions,metrics){
 const area=6.25,status_ha=Object.fromEntries(['flooded','water_gone','never_water','always_water','no_data'].map(k=>[k,0])),gt30_ha=Object.fromEntries(['yes','possible','no','na'].map(k=>[k,0]));
 for(const f of features){status_ha[f.properties.status]+=area;gt30_ha[f.properties.flag_gt30]+=area;}
 const passes=acquisitions.map((a,i)=>{let valid=0,water=0,newW=0,gone=0,obs=0,asofW=0;for(const {s} of Object.values(cells)){const previous=metrics(s,i-1),current=metrics(s,i);if(s[i]!=='-'){valid++;if(s[i]==='W')water++;if(s[i]==='W'&&previous==='N')newW++;if(s[i]==='N'&&previous==='W')gone++;}if(current!=='-'){obs++;if(current==='W')asofW++;}}return {i,date_local:a.date_local,track:a.track,valid_ha:valid*area,water_ha:water*area,new_water_ha:newW*area,water_gone_ha:gone*area,asof_obs_ha:obs*area,asof_water_ha:asofW*area};});
 return {passes,totals:{n_cells:features.length,area_ha:features.length*area,last_obs_local:acquisitions.at(-1).date_local,status_ha,gt30_ha}};
}
