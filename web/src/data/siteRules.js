import registry from './site-profiles.json' with {type:'json'};
import {inverseUtm} from './projection.js';

export class SiteMismatchError extends Error {
  constructor(message){super(message);this.name='SiteMismatchError';}
}
export const siteProfiles=registry.sites;
export const defaultSite=registry.default;
export function siteProfile(id=defaultSite){
  if(!Object.hasOwn(siteProfiles,id))throw Error('Unknown study site');
  return siteProfiles[id];
}
export function requestedSite(search){
  const id=new URLSearchParams(search).get('site')||defaultSite;
  siteProfile(id);
  return id;
}
export function siteBounds(profile){
  const f=profile.frame;
  const points=[[f.e0,f.n0],[f.e0,f.n1],[f.e1,f.n0],[f.e1,f.n1]].map(v=>inverseUtm(...v,profile.zone));
  return [Math.min(...points.map(v=>v[0])),Math.min(...points.map(v=>v[1])),Math.max(...points.map(v=>v[0])),Math.max(...points.map(v=>v[1]))];
}
export function framePolygon(profile){
  const f=profile.frame;
  return [[f.e0,f.n0],[f.e1,f.n0],[f.e1,f.n1],[f.e0,f.n1],[f.e0,f.n0]];
}
/** Prevent a scene from one projection or study frame being used for another. */
export function checkSiteIndex(profile,index){
  if(!index.tiles?.length)throw Error(profile.name+' scene is not available yet');
  if(index.origin?.epsg!==profile.epsg)throw new SiteMismatchError('Scene projection does not match the selected site');
  if(index.origin.utm_e!==profile.origin.utm_e||index.origin.utm_n!==profile.origin.utm_n||['e0','e1','n0','n1'].some(k=>index.frame?.[k]!==profile.frame[k])){
    throw new SiteMismatchError('Scene frame does not match the selected site');
  }
  return index;
}
export function checkSiteMeta(profile,meta){
  const id=typeof meta.site==='string'?meta.site:meta.site?.id;
  if(id!==profile.id||meta.grid?.epsg!==profile.epsg)throw new SiteMismatchError('Observation metadata does not match the selected site');
  return meta;
}
