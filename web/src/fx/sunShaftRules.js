const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
/** Artistic scattering strength, never an estimate of measured irradiance. */
export function shaftStrength({tier,enabled,reduced=false,radar=false,forward=0,x=0,y=0,elevation=0,cloud=0,night=0,rain=0}){
  if(tier!=='high'||!enabled||reduced||radar||!Number.isFinite(forward)||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(elevation)||!Number.isFinite(cloud)||!Number.isFinite(night)||!Number.isFinite(rain))return 0;
  const bounds=1-smooth(1.05,1.65,Math.max(Math.abs(x),Math.abs(y)));
  return .11*bounds*smooth(0,.15,forward)*smooth(1.5,10,elevation)*(1-clamp(night))*clamp(cloud*4)*(1-smooth(.75,1,cloud))*(1-smooth(.05,.25,rain));
}
/** A bounded low-resolution mask matches aspect without spending a full-size
 * render target; no dimensions below one or above the declared pixel budget. */
export function shaftMaskSize(width,height,maxWidth=384){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return {width:1,height:1};
  const scale=Math.min(1,maxWidth/width,maxWidth/height);
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
