// Rebuild source-based physical geography. Python tool requires Shapely; runtime has no GIS dependency.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const revision='ca96624a56bd078437bca8184e78163e5039ad19';
const args=process.argv.slice(2),value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const cache=resolve(value('--cache','.cache/atlas-source')),out=resolve(value('--out','web/public/atlas'));
await mkdir(cache,{recursive:true});
for(const file of ['ne_10m_land.geojson','ne_10m_minor_islands.geojson','ne_10m_geography_regions_polys.geojson','ne_50m_rivers_lake_centerlines.geojson']){
  const response=await fetch(`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/${file}`);
  if(!response.ok)throw Error(`${response.status}: ${file}`);
  await writeFile(resolve(cache,file),new Uint8Array(await response.arrayBuffer()));
}
const result=spawnSync(value('--python','python'),[resolve(import.meta.dirname,'build-atlas.py'),'--source',cache,'--out',out],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;
