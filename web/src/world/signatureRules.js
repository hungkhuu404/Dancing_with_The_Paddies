import {siteProfile} from '../data/siteRules.js';
// Pure helpers for the science views. No observed quantities are invented here.
import SunCalc from 'suncalc';
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const ease = x => { x=clamp01(x); return x*x*(3-2*x); };
export function hourlyWeather(history, iso) {
  const h=history?.hourly, t=Date.parse(iso);
  if(!h?.time?.length || !Number.isFinite(t)) return null;
  const times=h.time, first=Date.parse(times[0]+'Z'), u=(t-first)/3600000, i=Math.floor(u), f=u-i;
  if(i<0 || i>=times.length || (f>0 && i+1>=times.length)) return null;
  const out={};
  for(const key of ['cloud_cover','rain','wind_speed_10m','wind_direction_10m']) {
    const a=h[key]?.[i], b=h[key]?.[Math.min(i+1,times.length-1)];
    if(!Number.isFinite(a)||!Number.isFinite(b)) return null;
    out[key]=key==='wind_direction_10m'?((a+(((b-a+540)%360)-180)*f+360)%360):a+(b-a)*f;
  }
  return out;
}
export function celestial(iso, lat=siteProfile().astronomy_center[1], lon=siteProfile().astronomy_center[0]) {
  const date=new Date(iso), sun=SunCalc.getPosition(date,lat,lon), moon=SunCalc.getMoonPosition(date,lat,lon), phase=SunCalc.getMoonIllumination(date);
  const direction=p=>{const a=p.azimuth+Math.PI,c=Math.cos(p.altitude);return [c*Math.sin(a),Math.sin(p.altitude),-c*Math.cos(a)];};
  return {sun:direction(sun),moon:direction(moon),elevation:sun.altitude*180/Math.PI,moonElevation:moon.altitude, fraction:phase.fraction,phase:phase.phase,angle:phase.angle-moon.parallacticAngle};
}
// Inverse of the existing artistic time slider; night endpoint is 19:30 local.
export function todHour(t) {
  const k=[[0,5.5],[.33,12],[.66,17],[.83,18.2],[1,19.5]];
  t=clamp01(t);for(let i=1;i<k.length;i++)if(t<=k[i][0])return k[i-1][1]+(t-k[i-1][0])/(k[i][0]-k[i-1][0])*(k[i][1]-k[i-1][1]);
  return 19.5;
}
const localFormatters=new Map();
export function sceneDate(date,tod,timezone=siteProfile().timezone) {
  const midnight=Date.parse(date.slice(0,10)+'T00:00:00Z');
  let local=localFormatters.get(timezone);if(!local){local=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});localFormatters.set(timezone,local);}
  const p=Object.fromEntries(local.formatToParts(midnight).map(v=>[v.type,v.value]));
  const shifted=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  return new Date(midnight-(shifted-midnight)+todHour(tod)*3600000).toISOString();
}
export function sideLookingPosition(x,z,dir,height=1800,side=1,incidence=40,out={}) {
  const offset=height*Math.tan(incidence*Math.PI/180)*side;
  out.x=x-dir[1]*offset;out.y=height;out.z=z+dir[0]*offset;return out;
}
export function tourPose(seconds,anchor,out={},route=null) {
  const t=Math.max(0,Math.min(60,seconds)), i=Math.min(4,Math.floor(t/12)), u=ease((t-i*12-6)/6);
  if(route){
    if(route.length!==5)throw Error('A tour route needs five scenes');
    const from=route[i],to=route[Math.min(4,i+1)],a=from.target==='record'?anchor:from.target,b=to.target==='record'?anchor:to.target;
    out.scene=i;out.r=from.r+(to.r-from.r)*u;out.polar=from.polar+(to.polar-from.polar)*u;out.az=from.az+(to.az-from.az)*u;out.x=a[0]+(b[0]-a[0])*u;out.z=a[1]+(b[1]-a[1])*u;return out;
  }
  const r=[1400,850,600,38,16000], p=[.65,.9,.9,1.1,.28], a=[-.5,.3,1,1.5,1.8];
  out.scene=i;out.r=r[i]+(r[Math.min(4,i+1)]-r[i])*u;
  out.polar=p[i]+(p[Math.min(4,i+1)]-p[i])*u;out.az=a[i]+(a[Math.min(4,i+1)]-a[i])*u;
  out.x=anchor[0]*(1-(i===4?u:0));out.z=anchor[1]*(1-(i===4?u:0));return out;
}
export function recordingType(supported) {return ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(supported)||null;}
export function fitFrame(sw,sh,dw,dh) {const s=Math.min(dw/sw,dh/sh);return {x:(dw-sw*s)/2,y:(dh-sh*s)/2,w:sw*s,h:sh*s};}
