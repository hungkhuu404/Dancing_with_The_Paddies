import {createRecordingMix} from '../audio/recordMix.js';
import {recordingType,fitFrame} from './signatureRules.js';
export function createRecorder(source,{subtitle=()=>'',credit=()=> 'Flood Calendar · Tân Hội · illustrative 3D',onState=()=>{}}={}) {
  let mix=null,recorder=null,stream=null,frame=0,timer=0,url=null,started=0,chunks=[],copy=null,ctx=null,fit=null;
  const state={active:false,url:null,mime:null,bytes:0,error:null};
  function finish(){mix?.close();mix=null;clearTimeout(timer);cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());document.body.classList.remove('record-clean');state.active=false;onState(state);}
  function start({wide=true,hide=true,duration=30}={}){
    if(state.active)return;
    const mime=globalThis.MediaRecorder&&recordingType(t=>MediaRecorder.isTypeSupported(t));
    if(!mime||!HTMLCanvasElement.prototype.captureStream){state.error='Canvas recording is unavailable in this browser.';onState(state);return;}
    if(url)URL.revokeObjectURL(url);chunks=[];state.error=null;state.url=null;state.bytes=0;
    copy=document.createElement('canvas');copy.width=wide?1280:source.width;copy.height=wide?720:source.height;ctx=copy.getContext('2d');fit=fitFrame(source.width,source.height,copy.width,copy.height);
    try {
      stream=copy.captureStream(30);mix=createRecordingMix();if(mix)for(const track of mix.stream.getAudioTracks())stream.addTrack(track);state.audio=stream.getAudioTracks().length>0;recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=e=>{state.error=e.error?.message||'Recording failed';finish();};
      recorder.onstop=()=>{if(chunks.length){const blob=new Blob(chunks,{type:recorder.mimeType});url=URL.createObjectURL(blob);state.url=url;state.bytes=blob.size;state.mime=recorder.mimeType;}finish();};
      state.active=true;state.mime=mime;started=performance.now();if(hide)document.body.classList.add('record-clean');recorder.start(1000);timer=setTimeout(stop,duration*1000);onState(state);
    } catch(e){state.error=e.message;finish();}
  }
  // Called synchronously after the WebGL render: preserveDrawingBuffer is not needed.
  function capture(){if(!state.active)return;ctx.fillStyle='#1B211F';ctx.fillRect(0,0,copy.width,copy.height);ctx.drawImage(source,fit.x,fit.y,fit.w,fit.h);ctx.font='20px "IBM Plex Sans"';ctx.fillStyle='#EEF0EC';ctx.fillText(credit(),24,copy.height-20);const text=subtitle();if(text){ctx.save();ctx.fillStyle='#EEF0EC';ctx.font='500 18px "IBM Plex Sans"';ctx.textAlign='center';ctx.shadowColor='#000';ctx.shadowBlur=6;ctx.shadowOffsetY=1;ctx.fillText(text,copy.width/2,copy.height-64,copy.width-48);ctx.restore();}}

  function stop(){if(recorder?.state==='recording')recorder.stop();}
  function download(){if(!state.url)return;const a=document.createElement('a');a.href=state.url;a.download='flood-calendar.'+(state.mime.includes('mp4')?'mp4':'webm');document.body.append(a);a.click();a.remove();}
  return {state,start,stop,capture,download,get elapsed(){return state.active?(performance.now()-started)/1000:0;}};
}
