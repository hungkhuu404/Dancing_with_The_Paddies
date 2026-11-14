import test from 'node:test';
import assert from 'node:assert/strict';
import {createTourScore,scoreScene} from '../src/world/tourScore.js';

test('score follows the five scene boundaries and creates nodes only on scene changes',()=>{
  let context;
  class Param{constructor(){this.values=[];}setValueAtTime(...a){this.values.push(a);}linearRampToValueAtTime(...a){this.values.push(a);}setTargetAtTime(...a){this.values.push(a);}}
  class Node{constructor(){this.gain=new Param();this.frequency={value:0};this.pan={value:0};}connect(){return this;}disconnect(){}start(){}stop(){this.stopped=true;}}
  class Context{constructor(){context=this;this.currentTime=0;this.destination={};this.nodes=[];this.gains=[];}createGain(){const n=new Node();this.gains.push(n);return n;}createBiquadFilter(){return new Node();}createStereoPanner(){return new Node();}createOscillator(){const n=new Node();this.nodes.push(n);return n;}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}}
  const score=createTourScore({Context});score.start();score.update(0);assert.equal(context.nodes.length,6);
  for(let t=0;t<12;t+=.05)score.update(t);assert.equal(context.nodes.length,6);
  for(const t of [12,24,36,48]){context.currentTime=t;score.update(t);assert.equal(scoreScene(t),t/12);}
  assert.equal(context.nodes.length,32);
  score.setSpeaking(true);assert.equal(context.gains[1].gain.values.at(-1)[0],.48);
  score.setSpeaking(false);assert.equal(context.gains[1].gain.values.at(-1)[0],1);
  score.setMuted(true);assert.equal(context.gains[0].gain.values.at(-1)[0],0);
  score.stop();assert.ok(context.nodes.every(n=>n.stopped));score.update(59);assert.equal(context.nodes.length,32);
});
test('tour score degrades safely when Web Audio is unavailable',()=>{
  const score=createTourScore({Context:null});assert.equal(score.available,false);score.start();score.update(0);score.setMuted(true);score.setSpeaking(true);score.stop();
  assert.equal(scoreScene(-5),0);assert.equal(scoreScene(60),4);
});
