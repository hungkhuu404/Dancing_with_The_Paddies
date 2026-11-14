// Rendering recipes, not a crop/species survey. Only observations up to pass
// participate; future water must not turn pre-flood rice into drained soil.
export function fieldAppearance(series, pass, acquisitions = []) {
  const current = series[pass];
  if (!current || current === '-') return {kind:'missing',standing:0,drained:0,longWet:0};
  let firstWet=-1,hadWet=false;
  for(let i=0;i<=pass;i++) {
    if(series[i]==='W'){if(firstWet<0)firstWet=i;hadWet=true;}
    if(series[i]==='N')firstWet=-1;
  }
  const stamp=i=>Date.parse(acquisitions[i]?.acq_utc||acquisitions[i]?.date||acquisitions[i]?.date_local||'');
  const days=firstWet>=0?(stamp(pass)-stamp(firstWet))/86400000:0,wet=current==='W';
  return {kind:wet?'flooded':hadWet?'water_gone':'standing',standing:!wet&&!hadWet?1:0,drained:!wet&&hadWet?1:0,longWet:wet&&Number.isFinite(days)&&days>30?1:0};
}
export function seeded(seed){let s=seed>>>0;return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}
export function bankPlantings(canals,seed=26,cap=180){
  if(cap<=0)return [];
  const random=seeded(seed),out=[];
  for(const canal of canals)for(let i=1;i<canal.points.length;i++){
    const [ax,az]=canal.points[i-1],[bx,bz]=canal.points[i],dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz);
    if(L<8)continue;
    const spacing=(canal.width_m||4)>=8?32:18;
    for(let d=spacing/2;d<L;d+=spacing)for(const side of [-1,1]){
      const o=(canal.width_m||4)/2+3.6;
      const margin=['sesbania','sedge','morning_glory','water_spinach','so_dua'];
      const kind=side===1&&spacing===32?(i%2?'acacia':'eucalyptus'):margin[Math.floor(d/spacing)%margin.length];
      out.push({x:ax+dx*d/L-dz/L*o*side,z:az+dz*d/L+dx/L*o*side,kind,scale:.8+random()*.4});
      if(out.length>=cap)return out;
    }
  }return out;
}
export function gardenPlantings(houses,seed=81,cap=90){
  if(cap<=0)return [];
  const random=seeded(seed),out=[];
  let house=0;
  for(const h of houses){const a=h.rot||0,c=Math.cos(a),s=Math.sin(a);
    const kinds=[['papaya','guava','jackfruit','mango'][house%4],'vegetables',house%3===0?'trellis':house%3===1?'hibiscus':'bougainvillea'];
    if(house%5===0)kinds.push('coop');
    for(let i=0;i<kinds.length;i++){const x=(i-1)*2.6,z=8+random();out.push({x:h.x+x*c+z*s,z:h.z-x*s+z*c,kind:kinds[i],scale:.8+random()*.3});if(out.length>=cap)return out;}
    house++;
  }return out;
}
export function roadsidePlantings(roads,cap=32){
  if(cap<=0)return [];
  const out=[];
  for(const road of roads){if((road.width_m||0)<5)continue;
    for(let i=1;i<road.points.length;i++){
      const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz);if(L<60)continue;
      for(let d=35;d<L;d+=70){const o=(road.width_m||5)/2+3;out.push({x:ax+dx*d/L-dz/L*o,z:az+dz*d/L+dx/L*o,kind:out.length%2?'tram_bau':'dau',scale:1});if(out.length>=cap)return out;}
    }
  }return out;
}
