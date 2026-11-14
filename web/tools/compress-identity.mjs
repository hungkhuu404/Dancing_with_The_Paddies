// Compress only this original asset set with a pinned external glTF Transform 4.5.1 CLI.
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
const [raw,out,cli]=process.argv.slice(2);if(!raw||!out||!cli)throw Error('Usage: node compress-identity.mjs <raw-directory> <review-output-directory> <gltf-transform-4.5.1-cli.js>');
mkdirSync(out,{recursive:true});const assets=[];
for(const name of readdirSync(raw).filter(n=>/^thai_[a-z_]+\.glb$/.test(n)).sort()){
 const input=resolve(raw,name),output=resolve(out,name);if(input===output)throw Error('Review output must differ from raw source');
 execFileSync(process.execPath,[resolve(cli),'meshopt',input,output,'--level','medium'],{stdio:'pipe',windowsHide:true});
 const bytes=statSync(output).size;if(bytes>400000)throw Error(name+' exceeds 400 KB');const buffer=readFileSync(output),json=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());if(!json.extensionsRequired?.includes('EXT_meshopt_compression'))throw Error('Missing meshopt');assets.push({file:name,bytes});
}
writeFileSync(join(out,'sizes.json'),JSON.stringify(assets,null,2)+'\n');console.log(JSON.stringify(assets));
