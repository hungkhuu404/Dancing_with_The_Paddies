// Explicit offline asset build. Never imported by the browser or normal build.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {scriptFor} from '../src/world/tourScript.js';
import {siteOptions} from './site-options.mjs';
const {profile,args}=siteOptions();
const TOUR_SCRIPT=scriptFor(profile.tour.script||profile.id),TOUR_NARRATION=TOUR_SCRIPT.map(lines=>lines.join('. ')+'.');

const get=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--generate')||!args.includes('--key-file')||!args.includes('--out')){
  console.log('Usage: node web/tools/build-tour-voice.mjs --generate --key-file <private-file> --out <new-staging-directory>');
  console.log(`Five clips, ${TOUR_NARRATION.join('').length} text characters. Generation uses ElevenLabs credits; normal builds never call this tool.`);
  process.exit(0);
}
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),keyFile=path.resolve(get('--key-file')),out=path.resolve(get('--out'));
const relative=path.relative(repo,keyFile);
if(relative===''||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw Error('The API credential file must be outside the checkout.');
await fs.mkdir(out,{recursive:true});
if((await fs.readdir(out)).length)throw Error('Use an empty staging directory to prevent overwriting or regenerating paid assets.');
const key=(await fs.readFile(keyFile,'utf8')).replace(/^\uFEFF/,'').trim();
if(!key.startsWith('sk_')||/\s/.test(key))throw Error('The private file must contain only the secret API key.');
const voice='MFZUKuGQUsGJPQjTS4wC',model='eleven_multilingual_v2';
const settings={stability:.65,similarity_boost:.75,style:.1,use_speaker_boost:true,speed:.94};
const manifest={site:profile.id,provider:'ElevenLabs',voice_id:voice,voice_name:'Jon - Warm & Grounded Storyteller',model,created_at:new Date().toISOString(),source:'https://elevenlabs.io/voice-library',licence:'Generated with a paid ElevenLabs subscription; use subject to https://elevenlabs.io/terms-of-use',voice_settings:settings,script_sha256:createHash('sha256').update(JSON.stringify(TOUR_SCRIPT)).digest('hex'),clips:[]};
let reusable=null,reuseDir=null;
if(args.includes('--reuse')){reuseDir=path.resolve(get('--reuse'));reusable=JSON.parse(await fs.readFile(path.join(reuseDir,'manifest.json'),'utf8'));if(reusable.voice_id!==voice||reusable.model!==model)throw Error('Reuse must use the same reviewed voice and model');}
for(let i=0;i<TOUR_NARRATION.length;i++){
  const reused=reusable?.clips?.find(c=>c.text===TOUR_NARRATION[i]);
  if(reused){const buffer=await fs.readFile(path.join(reuseDir,reused.file));if(createHash('sha256').update(buffer).digest('hex')!==reused.sha256)throw Error('Reuse hash mismatch');const file=`tour-${i+1}.mp3`;await fs.writeFile(path.join(out,file),buffer);manifest.clips.push({...reused,file,reused_from:reused.file});await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({clip:i+1,reused:true,bytes:buffer.length}));continue;}

  const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,{
    method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},
    body:JSON.stringify({text:TOUR_NARRATION[i],model_id:model,voice_settings:settings,seed:20261114+i}),
  });
  if(!response.ok)throw Error(`ElevenLabs generation failed for clip ${i+1} (HTTP ${response.status}); no retry was made.`);
  const data=await response.json(),alignment=data.alignment;
  if(!data.audio_base64||!alignment?.characters?.length)throw Error(`Missing audio or timestamps in clip ${i+1}.`);
  const text=alignment.characters.join(''),cue_starts=[0];
  for(const line of TOUR_SCRIPT[i].slice(1)){
    const index=text.indexOf(line);if(index<0)throw Error(`Cannot align caption in clip ${i+1}.`);
    cue_starts.push(alignment.character_start_times_seconds[index]);
  }
  const duration=Math.max(...alignment.character_end_times_seconds),file=`tour-${i+1}.mp3`;
  const buffer=Buffer.from(data.audio_base64,'base64');await fs.writeFile(path.join(out,file),buffer);
  manifest.clips.push({file,text:TOUR_NARRATION[i],duration_seconds:duration,cue_starts,sha256:createHash('sha256').update(buffer).digest('hex')});
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({clip:i+1,bytes:buffer.length,duration_seconds:duration,cue_starts}));
  if(duration>11.8)throw Error(`Clip ${i+1} exceeds its scene budget. Review the staged asset before generating more.`);
}
console.log('Five clips staged. Review playback before publishing to the selected site audio directory.');
