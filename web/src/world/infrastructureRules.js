// Pure geographic and illustrative placement rules. No DOM, rendering or contract mutation.
export function utm48(lon,lat){
  const a=6378137,f=1/298.257223563,e=f*(2-f),ep=e/(1-e),k=.9996,p=lat*Math.PI/180,l=(lon-105)*Math.PI/180;
  const N=a/Math.sqrt(1-e*Math.sin(p)**2),T=Math.tan(p)**2,C=ep*Math.cos(p)**2,A=Math.cos(p)*l;
  const M=a*((1-e/4-3*e**2/64)*p-(3*e/8+3*e**2/32)*Math.sin(2*p)+(15*e**2/256)*Math.sin(4*p));
  return [500000+k*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep)*A**5/120),k*(M+N*Math.tan(p)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep)*A**6/720))];
}
export const toScene=(lon,lat)=>{const [e,n]=utm48(lon,lat);return [Math.round((e-520375)*10)/10,Math.round((1121125-n)*10)/10];};
export function infrastructureVariant(id){let h=0;for(let i=0;i<String(id).length;i++)h=(Math.imul(h,31)+String(id).charCodeAt(i))|0;return Math.abs(h)%3;}
export function inside(point,poly){let odd=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])odd=!odd;}return odd;}
export function nearestOnLine(x,z,points){
  const out={x:0,z:0,d:Infinity,rot:0};
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;if(l<1e-9)continue;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l)),px=a[0]+t*dx,pz=a[1]+t*dz,d=Math.hypot(x-px,z-pz);if(d<out.d)Object.assign(out,{x:px,z:pz,d,rot:Math.atan2(dx,dz)});}return out;
}
export function roadClass(tags={}){
  const highway=tags.highway||tags.kind||'path',ref=tags.ref||'',name=tags.name||'';
  const arterial=/(?:^|\D)961(?:\D|$)/.test(ref+' '+name);
  const major=['motorway','trunk','primary','secondary'].includes(highway);
  return {surface:major?'asphalt':['residential','service','tertiary','unclassified'].includes(highway)?'concrete':'earth',arterial,width:arterial?7:['motorway','trunk'].includes(highway)?10:major?7:highway==='tertiary'?5:['residential','unclassified'].includes(highway)?4:3,lamps:arterial?40:highway==='secondary'?60:0};
}
export function spacedAlong(points,spacing,offset=0,cap=200){
  const out=[];let distance=0,next=spacing*.5;
  for(let i=1;i<points.length&&out.length<cap;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(L<1e-6)continue;while(next<=distance+L&&out.length<cap){const t=(next-distance)/L;out.push({x:a[0]+t*dx-dz/L*offset,z:a[1]+t*dz+dx/L*offset,rot:Math.atan2(dx,dz),distance:next});next+=spacing;}distance+=L;}return out;
}
export function ownedByTile(x,z,cx,cz,half=1000){return x>=cx-half&&x<cx+half&&z>=cz-half&&z<cz+half;}
export function houseStyle(h,roads){let best=Infinity,major=false;for(const r of roads){const d=nearestOnLine(h.x,h.z,r.points).d;if(d<best){best=d;major=roadClass(r).surface==='asphalt';}}return major&&best<65?'shophouse':best<45?'modern_house':'rural';}
/** Calendar response only: observed N->W / W->N. Missing observations do not claim an opening. */
export function gateEvent(s,index){if(index<1||!['W','N'].includes(s[index]))return null;let j=index-1;while(j>=0&&s[j]==='-')j--;if(j<0||s[j]===s[index])return null;return s[index]==='W'?'inflow':'drain';}
export function gateOpening(event,elapsed,reduced=false){if(!event||elapsed<0||elapsed>=8)return 0;if(reduced)return .7;return Math.min(1,elapsed/1.2,(8-elapsed)/1.5);}
/** Travel time is deliberately illustrative seconds, never inferred water velocity or depth. */
export function irrigationDelay(x,z,gates,max=2.5){let d=Infinity;for(const g of gates)d=Math.min(d,Math.hypot(x-g.x,z-g.z));return Number.isFinite(d)?Math.min(max,d/800):0;}
