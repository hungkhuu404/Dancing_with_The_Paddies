import test from 'node:test';
import assert from 'node:assert/strict';
import {TOUR_SCRIPT,TOUR_NARRATION,tourCaption} from '../src/world/tourScript.js';
import {createTourAudio} from '../src/world/tourAudio.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('caption cues cover the whole minute with concise single-line copy',()=>{
  assert.equal(TOUR_SCRIPT.length,5);assert.equal(TOUR_NARRATION.length,5);
  for(let i=0;i<5;i++)for(let j=0;j<3;j++){
    const text=TOUR_SCRIPT[i][j];assert.ok(text.length<=48);assert.ok(!/[\r\n]/.test(text));
    assert.equal(tourCaption(i*12+j*4),text);assert.equal(tourCaption(i*12+j*4+3.99),text);
  }
  assert.equal(tourCaption(-1),TOUR_SCRIPT[0][0]);assert.equal(tourCaption(60),TOUR_SCRIPT[4][2]);
  const recorded={clips:[{cue_starts:[0,2.7,6.2]}]};
  assert.equal(tourCaption(3,recorded),TOUR_SCRIPT[0][1]);assert.equal(tourCaption(7,recorded),TOUR_SCRIPT[0][2]);
  assert.equal(tourCaption(3,{clips:[{cue_starts:[0,-1,20]}]}),TOUR_SCRIPT[0][0]);
});

function harness(manifest,legacy=false){
  const players=[],speaking=[];
  class Player{
    constructor(src){this.src=src;this.paused=true;this.ended=false;players.push(this);}
    play(){this.paused=false;this.onplaying?.();return Promise.resolve();}
    pause(){this.paused=true;this.onpause?.();}
    removeAttribute(){}load(){}
  }
  return {players,speaking,voice:createTourAudio({base:'/audio/tour/',manifest,legacy,AudioClass:Player,onSpeaking:v=>speaking.push(v)})};
}
const manifest={clips:Array.from({length:5},(_,i)=>({file:`tour-${i+1}.mp3`}))};
test('voice segments follow scene time, release old playback and unduck on mute, error and stop',()=>{
  const {voice,players,speaking}=harness(manifest);voice.start();voice.update(0);assert.equal(players.length,1);assert.equal(speaking.at(-1),true);
  voice.update(11.99);assert.equal(players.length,1);voice.update(12.5);assert.equal(players.length,2);assert.equal(players[0].paused,true);assert.equal(players[1].currentTime,.5);
  assert.equal(voice.toggle(),true);assert.equal(speaking.at(-1),false);voice.update(24);assert.equal(players[2].muted,true);
  voice.toggle();assert.equal(speaking.at(-1),true);players[2].onerror();assert.equal(speaking.at(-1),false);
  voice.stop();assert.equal(players[2].paused,true);voice.update(36);assert.equal(players.length,3);assert.equal(speaking.at(-1),false);
});
test('absent or invalid voice files preserve a silent subtitle-only tour',()=>{
  for(const data of [null,{clips:[]},{clips:manifest.clips.map(c=>({file:'https://external.invalid/'+c.file}))}]){
    const {voice,players}=harness(data);assert.equal(voice.available,false);voice.start();voice.update(0);voice.stop();assert.equal(players.length,0);
  }
});
test('existing single-file narration remains compatible',()=>{
  const {voice,players}=harness(null,true);voice.start();voice.update(12);assert.equal(players.length,1);assert.ok(players[0].src.endsWith('tour-en.mp3'));voice.stop();
});
test('published voice clips match the script, timestamps and reviewed binary hashes',async()=>{
  const base=new URL('../public/audio/tour/',import.meta.url),data=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
  assert.equal(data.clips.length,5);
  assert.equal(data.script_sha256,createHash('sha256').update(JSON.stringify(TOUR_SCRIPT)).digest('hex'));
  for(let i=0;i<5;i++){
    const c=data.clips[i];assert.equal(c.file,`tour-${i+1}.mp3`);assert.equal(c.text,TOUR_NARRATION[i]);assert.ok(c.duration_seconds>0&&c.duration_seconds<11.8);
    assert.equal(c.cue_starts.length,3);assert.equal(c.cue_starts[0],0);
    for(let j=1;j<3;j++)assert.ok(c.cue_starts[j]>c.cue_starts[j-1]&&c.cue_starts[j]<c.duration_seconds);
    const bytes=await readFile(new URL(c.file,base));assert.ok(bytes.length>1000&&bytes.length<200000);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256);
  }
});
