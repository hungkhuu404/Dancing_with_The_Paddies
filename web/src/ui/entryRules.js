const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
export const ATLAS_ORIGIN=[103.5,14];
export function atlasPoint(lon,lat){return [(lon-ATLAS_ORIGIN[0])*Math.cos(ATLAS_ORIGIN[1]*Math.PI/180),14-lat];}
export function bypassAtlas(search){
  const p=new URLSearchParams(search);
  return ['view','cell','at','village','nointro'].some(k=>p.has(k));
}
export function publishedSite(site,meta){return !!site&&!!meta&&!meta.fixture&&Array.isArray(meta.acquisitions)&&meta.acquisitions.length>0;}

/** Fill caller-owned state: geometric descent, a bounded bank and a gentle final settle. */
export function entrancePose(t,start,end,out){
  const q=smooth(t),tilt=smooth((t-.08)/.92);
  out.r=Math.exp(mix(Math.log(start.r),Math.log(end.r),q));
  out.polar=mix(start.polar,end.polar,tilt);
  out.az=mix(start.az,end.az,q)-.16*Math.sin(Math.PI*q);
  out.x=mix(start.target.x,end.target.x,q);
  out.z=mix(start.target.z,end.target.z,q);
  out.fov=40+10*(1-q)+8*Math.sin(Math.PI*q);
  out.roll=.045*Math.sin(2*Math.PI*q)*Math.sin(Math.PI*q);
  return out;
}

/** A labelled illustration may be entered without being published as observations. */
export function entryKind(profile,site,meta){return publishedSite(site,meta)?'published':profile?.scene.fixture_preview&&meta?.fixture===true&&meta.site===profile.id?'fixture':'pending';}
