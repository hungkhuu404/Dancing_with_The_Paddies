// WGS84, northern UTM zones. No site or scene origin is embedded here.
function central(zone){if(!Number.isInteger(zone)||zone<1||zone>60)throw Error('Invalid UTM zone');return zone*6-183;}
export function utm(lon,lat,zone){
  const meridian=central(zone);if(!Number.isFinite(lon)||!Number.isFinite(lat)||lat<0||lat>84)throw Error('Northern UTM coordinate outside supported range');
  const a=6378137,f=1/298.257223563,e=f*(2-f),ep=e/(1-e),k=.9996,p=lat*Math.PI/180,l=(lon-meridian)*Math.PI/180;
  const N=a/Math.sqrt(1-e*Math.sin(p)**2),T=Math.tan(p)**2,C=ep*Math.cos(p)**2,A=Math.cos(p)*l;
  const M=a*((1-e/4-3*e**2/64)*p-(3*e/8+3*e**2/32)*Math.sin(2*p)+(15*e**2/256)*Math.sin(4*p));
  return [500000+k*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep)*A**5/120),k*(M+N*Math.tan(p)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep)*A**6/720))];
}
export function inverseUtm(e,n,zone){
  let lon=central(zone)+(e-500000)/109600,lat=n/110600;
  if(!Number.isFinite(e)||!Number.isFinite(n))throw Error('Invalid UTM coordinate');
  for(let i=0;i<7;i++){const [x,y]=utm(lon,lat,zone),[xa,ya]=utm(lon+1e-6,lat,zone),[xb,yb]=utm(lon,lat+1e-6,zone),a=(xa-x)/1e-6,b=(xb-x)/1e-6,c=(ya-y)/1e-6,d=(yb-y)/1e-6,det=a*d-b*c;lon+=(d*(e-x)-b*(n-y))/det;lat+=(-c*(e-x)+a*(n-y))/det;}
  return [lon,lat];
}
