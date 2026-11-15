// Verify committed real inputs and exact generated output, including explicitly labelled illustrations.
import {readFileSync,writeFileSync,readdirSync,lstatSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {siteProfiles} from '../src/data/siteRules.js';
import {assertPublishedMeta} from '../src/data/contractPolicy.js';
import {makeSiteFixture} from './make-site-fixture.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),web=join(root,'web');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim(),hash=b=>createHash('sha256').update(b).digest('hex');
const names=JSON.parse(readFileSync(join(web,'scripts/public-data-files.json'),'utf8')),expected=new Map();
for(const name of names){
 if(!/^(sites\.json|[a-z0-9_]+\/(?:[a-z_]+\.(?:json|geojson)|backdrop\/[0-9a-z_]+\.webp))$/.test(name))throw Error('Unsafe public path');
 const file=join(root,'data',name),repo='data/'+name;
 for(let p=file;p!==root;p=dirname(p))if(lstatSync(p).isSymbolicLink())throw Error('Linked public input');
 const entry=git('ls-tree','HEAD','--',repo);if(!entry.startsWith('100644 blob ')||git('hash-object','--path='+repo,file)!==entry.split(/\s+/)[2])throw Error('Public input differs from committed HEAD: '+repo);
 expected.set(name,hash(readFileSync(file)));
}
const registry=JSON.parse(readFileSync(join(root,'data/sites.json'),'utf8'));
for(const site of registry.sites)assertPublishedMeta(JSON.parse(readFileSync(join(root,'data',site.id,'meta.json'),'utf8')));
const cache=join(root,'.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'public-verify-'));
function files(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const file=join(dir,entry.name),rel=prefix+entry.name;if(lstatSync(file).isSymbolicLink())throw Error('Linked output');return entry.isDirectory()?files(file,rel+'/'):[[rel,file]];});}
try{
 writeFileSync(join(temp,'sites.json'),readFileSync(join(root,'data/sites.json')));
 for(const profile of Object.values(siteProfiles))if(profile.scene.fixture_preview&&!registry.sites.some(site=>site.id===profile.id))makeSiteFixture(temp,profile);
 for(const [name,file]of files(temp))expected.set(name,hash(readFileSync(file)));
 for(const dir of ['public/data','dist/data']){
  const actual=files(join(web,dir));if(actual.length!==expected.size)throw Error('Unexpected public output file count: '+dir);
  for(const [name,file]of actual)if(expected.get(name)!==hash(readFileSync(file)))throw Error('Unexpected public output bytes: '+dir+'/'+name);
 }
 console.log('Verified '+names.length+' committed real inputs; both outputs exactly match the registry and separately configured illustrations, if any.');
}finally{
 if(dirname(resolve(temp))!==resolve(cache)||!basename(temp).startsWith('public-verify-'))throw Error('Unsafe verifier cleanup');
 rmSync(temp,{recursive:true,force:true});
}
