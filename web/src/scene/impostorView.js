/** Nearest baked view, matching the runtime shader's eight azimuths and two
 * elevations. Azimuth zero looks at model +Z; yaw is instance rotation. */
export function impostorLayout(meta){
  if(!meta||!Number.isFinite(meta.span)||meta.span<=0||!Number.isFinite(meta.center)||meta.azimuths!==8||meta.elevations?.length!==2||!meta.elevations.every(Number.isFinite)||meta.elevations[0]>=meta.elevations[1])throw new TypeError('Invalid two-elevation, eight-azimuth impostor metadata');
  return {azimuths:8,rows:2,splitRadians:(meta.elevations[0]+meta.elevations[1])*Math.PI/360};
}
export function impostorView(dx,dy,dz,yaw=0){
  const azimuth=Math.atan2(dx,dz)-yaw;
  const column=((Math.floor(azimuth/(Math.PI*2)*8+.5)%8)+8)%8;
  const row=Math.atan2(dy,Math.hypot(dx,dz))>=42.5*Math.PI/180?1:0;
  return {column,row};
}
