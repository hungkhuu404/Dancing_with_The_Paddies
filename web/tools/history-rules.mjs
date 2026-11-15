import {hourlyWeather} from '../src/world/signatureRules.js';
export function historyWindow(acquisitions){
 if(!Array.isArray(acquisitions)||!acquisitions.length)throw Error('No acquisition dates');
 const times=acquisitions.map(a=>Date.parse(a.acq_utc));if(times.some(t=>!Number.isFinite(t)))throw Error('Invalid acquisition UTC');
 return {start_date:new Date(Math.min(...times)).toISOString().slice(0,10),end_date:new Date(Math.max(...times)+3600000).toISOString().slice(0,10)};
}
export function historyCoverage(hourly,acquisitions){
 const keys=['cloud_cover','rain','wind_speed_10m','wind_direction_10m'],n=hourly?.time?.length;
 if(!n||keys.some(k=>!Array.isArray(hourly[k])||hourly[k].length!==n))throw Error('Incomplete hourly arrays');
 for(let i=0;i<n;i++){
  const t=Date.parse(hourly.time[i]+'Z');if(!Number.isFinite(t)||i&&t-Date.parse(hourly.time[i-1]+'Z')!==3600000)throw Error('Non-hourly or unordered time axis');
  for(const k of keys){const v=hourly[k][i];if(v!==null&&(!Number.isFinite(v)||v<0||k==='cloud_cover'&&v>100||k==='wind_direction_10m'&&v>360))throw Error('Invalid weather value');}
 }
 const covered=acquisitions.filter(a=>hourlyWeather({hourly},a.acq_utc)!==null).map(a=>a.i);
 return {covered,total:acquisitions.length,complete:covered.length===acquisitions.length};
}
