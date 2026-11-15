import test from 'node:test';
import assert from 'node:assert/strict';
import {tapForRecording,createRecordingMix} from '../src/audio/recordMix.js';
class Node {constructor(){this.connections=[];}connect(n){this.connections.push(n);return n;}disconnect(){this.disconnected=true;}}
class Context {constructor(){this.sources=[];this.closed=0;}createMediaStreamDestination(){const d=new Node();const track={stopped:false,stop(){this.stopped=true;}};d.stream={getTracks:()=>[track],getAudioTracks:()=>[track]};return d;}createDynamicsCompressor(){const n=new Node();n.threshold={value:0};n.ratio={value:0};return n;}createMediaStreamSource(stream){const n=new Node();n.stream=stream;this.sources.push(n);return n;}resume(){return Promise.resolve();}close(){this.closed++;return Promise.resolve();}}
test('recording mixer accepts existing and late playback sources without duplicating speakers or stopping playback',()=>{
 const app=new Context(),output=new Node();tapForRecording(app,output);assert.equal(output.connections.length,1);
 let recorder;class Capture extends Context{constructor(){super();recorder=this;}}
 const mix=createRecordingMix(Capture);assert.equal(recorder.sources.length,1);
 const late=new Node();tapForRecording(app,late);assert.equal(recorder.sources.length,2);assert.equal(late.connections.length,1);
 const tracks=recorder.sources.map(n=>n.stream.getTracks()[0]);mix.close();mix.close();assert.equal(recorder.closed,1);assert.ok(recorder.sources.every(n=>n.disconnected));assert.ok(tracks.every(t=>!t.stopped),'playback streams must survive stopping a recording');assert.equal(mix.stream.getTracks()[0].stopped,true);
 tapForRecording(app,new Node());assert.equal(recorder.sources.length,2,'closed recording does not subscribe to new sources');
});
test('unavailable or blocked audio capture preserves a video-only path',()=>{
 assert.equal(createRecordingMix(null),null);class Blocked{constructor(){throw Error('unavailable');}}assert.equal(createRecordingMix(Blocked),null);tapForRecording({},new Node());assert.doesNotThrow(()=>tapForRecording({createMediaStreamDestination(){throw Error("blocked");}},new Node()));
});
