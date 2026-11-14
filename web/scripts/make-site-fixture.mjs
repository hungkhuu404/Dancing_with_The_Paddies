// Explicitly labelled Bang Rakam fixture; never writes the data team's source directory.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {siteBounds,framePolygon} from '../src/data/siteRules.js';
import {inverseUtm} from '../src/data/projection.js';
import {cellMetrics,flagGt30,stateAsOf} from '../src/map/contract.js';
import {fixtureHistory,fixtureSummary} from './fixtureRules.mjs';
export function makeSiteFixture(out,profile){
 const web=fileURLToPath(new URL('../',import.meta.url)),real=resolve(web,'../data');if((resolve(out)===real||resolve(out).startsWith(real+sep)))throw Error('Fixture output must not be the source data directory');
 const existingRegistry=join(out,'sites.json');if(existsSync(join(out,profile.id,'meta.json'))||existsSync(existingRegistry)&&JSON.parse(readFileSync(existingRegistry,'utf8')).sites.some(s=>s.id===profile.id))throw Error('Refusing to replace an existing site with fixture data');
 const src=new URL('../fixtures/'+profile.id+'/',import.meta.url),catalog=JSON.parse(readFileSync(new URL('acquisitions.json',src),'utf8')),places=JSON.parse(readFileSync(new URL('places.geojson',src),'utf8')),river=JSON.parse(readFileSync(new URL('yom.json',src),'utf8'));
 const site=join(out,profile.id),back=join(site,'backdrop');mkdirSync(back,{recursive:true});
 // A valid empty WebP is generated offline; this is not a synthetic radar image.
 const empty=readFileSync(new URL('no-radar.webp',src)),fmt=new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
 const acquisitions=catalog.acquisitions.map((a,i)=>{const parts=Object.fromEntries(fmt.formatToParts(new Date(a.acq_utc)).map(p=>[p.type,p.value])),date_local=parts.year+'-'+parts.month+'-'+parts.day,backdrop='backdrop/'+date_local.replaceAll('-','')+'_'+a.track.toLowerCase()+'_hh.webp';writeFileSync(join(site,backdrop),empty);return {i,acq_utc:a.acq_utc,date_local,track:a.track,frame:a.frame,crid:a.crid,valid_share:1,rule:'Q0',hh_db_max:-14,hv_db_max:-20,backdrop};});
 const cells={},features=[],f=profile.frame,CELL=250;
 for(let e=f.e0;e<f.e1;e+=CELL)for(let n=f.n0;n<f.n1;n+=CELL){const id=features.length,cell_id=`E${e}N${n}`,c=inverseUtm(e+125,n+125,profile.zone),s=fixtureHistory(e+125,n+125,acquisitions,river.lines),m=cellMetrics(s,acquisitions);let nearest=null,distance=Infinity;for(const place of places.features){const q=place.geometry.coordinates,d=Math.hypot(q[0]-c[0],q[1]-c[1]);if(d<distance){distance=d;nearest=place.properties.name;}}
  cells[cell_id]={s,s_raw:s,hh:[...s].map(v=>v==='-'?null:v==='W'?-185:-85),hv:[...s].map(v=>v==='-'?null:v==='W'?-255:-165)};
  features.push({type:'Feature',id,geometry:{type:'Polygon',coordinates:[[[e,n],[e+250,n],[e+250,n+250],[e,n+250],[e,n]].map(p=>inverseUtm(...p,profile.zone))]},properties:{cell_id,...m,cropland:true,flag_gt30:flagGt30(m,true),nearest_hamlet:nearest}});
 }
 const corners=[[f.e0,f.n1],[f.e1,f.n1],[f.e1,f.n0],[f.e0,f.n0]].map(p=>inverseUtm(...p,profile.zone));
 const summary=fixtureSummary(features,cells,acquisitions,stateAsOf);for(const a of acquisitions)a.valid_share=summary.passes[a.i].valid_ha/summary.totals.area_ha;
 const meta={contract_version:'1.0.0',site:profile.id,fixture:true,generated_utc:catalog.retrieved_utc,timezone:profile.timezone,grid:{epsg:profile.epsg,cell_m:250,n_cells:features.length},method:{rule:'Q0',hh_db_max:-14,hv_db_max:-20,single_flip_filter:false,frozen_utc:null},acquisitions,skipped:catalog.skipped,backdrop:{db_min:-25,db_max:-5,corners},sources:['Fixture data: all water states, cropland flags and HH/HV values are synthetic, not observations.','ASF DAAC NISAR catalogue: acquisition times only.','© OpenStreetMap contributors (ODbL): place names and river geometry.']};
 const outputs={'meta.json':meta,'cells.geojson':{type:'FeatureCollection',features},'series.json':{cells},'summary.json':summary,'aoi.geojson':{type:'FeatureCollection',features:[{type:'Feature',properties:{site:profile.id,name:'Bang Rakam study frame',osm_relation:null,area_ha:(f.e1-f.e0)*(f.n1-f.n0)/10000},geometry:{type:'Polygon',coordinates:[framePolygon(profile).map(p=>inverseUtm(...p,profile.zone))]}}]},'places.geojson':places};
 for(const [name,data]of Object.entries(outputs))writeFileSync(join(site,name),JSON.stringify(data));
 const registry=join(out,'sites.json'),sites=existsSync(registry)?JSON.parse(readFileSync(registry,'utf8')):{sites:[]};if(sites.sites.some(s=>s.id===profile.id))throw Error('Refusing to replace an existing site with fixture data');sites.sites.push({id:profile.id,name:profile.name,region:profile.region,epsg:profile.epsg,center:profile.center,bounds:siteBounds(profile),default:false});writeFileSync(registry,JSON.stringify(sites));
 return {cells:features.length,acquisitions:acquisitions.length};
}
