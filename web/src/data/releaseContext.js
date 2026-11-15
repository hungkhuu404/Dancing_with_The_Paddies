import {utm} from './projection.js';
﻿/** Release context is frontend disclosure, never an alteration of data-team exports. */
export function releaseContext(meta){
  if(meta?.fixture||meta?.method?.selection_status!=='post_hoc')return null;
  const details=meta.site==='bang_rakam'
    ? 'Candidate observations. Review of the 31 October 105D Q1 threshold is pending. Reference agreement is post-hoc, not independent evidence of accuracy.'
    : 'Candidate observations with the GCOV mask correction and an interim acquisition catalogue. This is not the final H7 release. Reference agreement is post-hoc.';
  return {label:'Candidate radar release',details};
}
/** Prefer the scene reference where supplied; otherwise use the last actual backdrop. */
export function radarReference(profile,index,meta){
  if(meta?.fixture)return null;
  if(index.textures?.radar)return {path:profile.scene.base+index.textures.radar,date:index.radar_date||profile.scene.reference_radar_date};
  const a=meta?.acquisitions?.findLast(v=>v.backdrop);
  return a?{path:`data/${profile.id}/${a.backdrop}`,date:a.date_local}:null;
}
export function siteLimitText(meta,aoi){
  const note=releaseContext(meta)?.details||'';
  if(aoi?.aoi_type!=='study_bbox')return note;
  const [w,s,e,n]=aoi.bbox_utm_m;
  return `${note} The study window is ${(e-w)/1000} × ${(n-s)/1000} km in EPSG:${aoi.epsg}, not an administrative boundary. Track 112A images with no valid samples after the GCOV mask are excluded. Native 20 m samples use overlap-area weighting at 250 m block edges; cells are not assumed to contain 625 native pixels.`;
}

/** Map the scene frame into the actual padded raster footprint, with north-up texture v. */
export function radarUv(profile,meta){
 const c=meta.backdrop.corners.map(p=>utm(...p,profile.zone));
 const west=(c[0][0]+c[3][0])/2,east=(c[1][0]+c[2][0])/2,south=(c[2][1]+c[3][1])/2,north=(c[0][1]+c[1][1])/2,f=profile.frame;
 return [(f.e0-west)/(east-west),(f.n0-south)/(north-south),(f.e1-f.e0)/(east-west),(f.n1-f.n0)/(north-south)];
}
