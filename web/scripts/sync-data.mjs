import {siteProfiles} from '../src/data/siteRules.js';
import {makeSiteFixture} from './make-site-fixture.mjs';
// Copy reviewed real inputs first; a separate opt-in illustration is appended below.
import { readFileSync, existsSync, lstatSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import {isPixelV2} from '../src/science/pixelMethod.js';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
const OUT = join(WEB, 'public', 'data');
const allowlist = JSON.parse(readFileSync(new URL('./public-data-files.json', import.meta.url), 'utf8'));
const within = (base, file) => { const rel = relative(base, file); return rel && !rel.startsWith('..') && !isAbsolute(rel); };
function rejectLinks(file) {
  for (let current = file; within(ROOT, current); current = dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Refusing linked path: ${relative(ROOT, current)}`);
  }
}
if (!Array.isArray(allowlist) || !allowlist.length) throw new Error('Public data allowlist is empty');
const files = allowlist.map(name => {
  if (typeof name !== 'string' || !/^(sites\.json|[a-z0-9_]+\/(?:[a-z_]+\.(?:json|geojson)|backdrop\/[0-9a-z_]+\.webp))$/.test(name)) throw new Error('Invalid public-data path');
  const source = resolve(ROOT, 'data', name);
  if (!within(join(ROOT, 'data'), source)) throw new Error('Data path outside root');
  rejectLinks(source);
  if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error(`Missing required public data: data/${name}. No fixture will be generated.`);
  return {name, source};
});
const realRegistry=JSON.parse(readFileSync(join(ROOT,'data/sites.json'),'utf8'));
for(const site of realRegistry.sites){
 if(!files.some(file=>file.name===site.id+'/meta.json'))throw Error('Published site is missing its reviewed allowlist: '+site.id);
 const meta=JSON.parse(readFileSync(join(ROOT,'data',site.id,'meta.json'),'utf8'));
 if(meta.site!==site.id||!isPixelV2(meta))throw Error('Published site metadata is incompatible: '+site.id);
}
rejectLinks(OUT);
if (!within(join(WEB, 'public'), OUT)) throw new Error('Invalid generated output');
rmSync(OUT, { recursive: true, force: true });
for (const {name, source} of files) {
  const target = join(OUT, name);
  mkdirSync(dirname(target), {recursive: true});
  cpSync(source, target);
}
console.log(`data: synced ${files.length} allowlisted public files; no synthetic fallback`);
if (!allowlist.includes('tan_hoi/validation.json')) console.warn('data: validation.json absent from snapshot; validation results unavailable.');

const registry=JSON.parse(readFileSync(join(OUT,'sites.json'),'utf8'));
for(const profile of Object.values(siteProfiles))if(profile.scene.fixture_preview&&!registry.sites.some(site=>site.id===profile.id)){
 makeSiteFixture(OUT,profile);console.log(profile.name+': explicit illustration only; not published observations');
}
