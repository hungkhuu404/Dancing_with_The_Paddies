// Prepare public OSM source files for the existing commune generator; no water observations.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {siteOptions} from './site-options.mjs';
import {osmFeatures} from './osm-geometry.mjs';
const {args,profile}=siteOptions();if(args.length!==2)throw Error('Usage: node web/tools/prepare-osm.mjs <snapshot.json> <source-directory> --site <id>');
const groups=osmFeatures(JSON.parse(readFileSync(args[0],'utf8')));mkdirSync(args[1],{recursive:true});
for(const [key,data] of Object.entries(groups))writeFileSync(join(args[1],'osm_'+key+'.geojson'),JSON.stringify(data));
console.log(JSON.stringify({site:profile.id,counts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.features.length]))}));
