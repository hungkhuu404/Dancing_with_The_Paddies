// Pinned 2016 CC BY optical mosaic. Never substitutes a newer, differently licensed layer.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {siteOptions} from './site-options.mjs';
const {profile,args,bounds}=siteOptions();if(!args[0])throw Error('Explicit optical source directory required');
const b=bounds.map(v=>Math.round(v*1e5)/1e5),merc=([lon,lat])=>[lon*Math.PI/180*6378137,Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*6378137],frame=[...merc(b.slice(0,2)),...merc(b.slice(2))],url=new URL('https://tiles.maps.eox.at/wms');
Object.entries({service:'WMS',version:'1.1.1',request:'GetMap',layers:'s2cloudless_3857',styles:'',srs:'EPSG:3857',bbox:frame.join(','),width:2048,height:2048,format:'image/png'}).forEach(([k,v])=>url.searchParams.set(k,v));
if(args.includes('--url-only')){console.log(String(url));process.exit(0);}
const response=await fetch(url,{headers:{'User-Agent':'FloodCalendar/1.0 (public geographic research)'},signal:AbortSignal.timeout(60000)});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error('EOX image unavailable; no imagery has been fabricated');
const bytes=Buffer.from(await response.arrayBuffer());mkdirSync(args[0],{recursive:true});writeFileSync(join(args[0],profile.scene.optical+'.png'),bytes);writeFileSync(join(args[0],profile.scene.optical+'.json'),JSON.stringify({crs:'EPSG:3857',bounds_3857:frame,width:2048,height:2048,year:2016,license:'CC BY 4.0',source:String(url),sha256:createHash('sha256').update(bytes).digest('hex')}));
