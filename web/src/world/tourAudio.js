import {tapForRecording} from '../audio/recordMix.js';
// Static files only. Credentials and speech generation never enter the browser.
export function createTourAudio({base,manifest=null,legacy=false,AudioClass=globalThis.Audio,onSpeaking=()=>{}}) {
  let audio=null,scene=-1,muted=false,active=false,context=null,voiceGain=null,source=null;
  const clips=Array.isArray(manifest?.clips)&&manifest.clips.length===5&&manifest.clips.every((c,i)=>c?.file===`tour-${i+1}.mp3`)?manifest.clips:null;
  const available=!!clips||legacy;
  function release(){source?.disconnect();source=null;if(audio){audio.pause();audio.onplaying=audio.onended=audio.onerror=audio.onpause=null;audio.removeAttribute('src');audio.load();audio=null;}onSpeaking(false);}
  function play(file,offset=0){release();const current=audio=new AudioClass(base+file);current.preload='auto';current.volume=.85;current.muted=muted;
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(Context)try{if(!context){context=new Context();voiceGain=context.createGain();voiceGain.connect(context.destination);tapForRecording(context,voiceGain);}source=context.createMediaElementSource(current);source.connect(voiceGain);current.volume=1;voiceGain.gain.value=muted?0:.85;context.resume().catch(()=>{});}catch{/* regular HTML audio remains available */}
    current.onplaying=()=>{if(current===audio)onSpeaking(!muted);};
    current.onended=current.onerror=current.onpause=()=>{if(current===audio)onSpeaking(false);};
    if(offset)current.currentTime=offset;
    current.play().catch(()=>{if(current===audio)onSpeaking(false);});
  }
  return {
    available,
    start(){active=true;scene=-1;if(legacy&&!clips)play('tour-en.mp3');},
    update(seconds){if(!active||!clips)return;const next=Math.min(4,Math.floor(Math.max(0,seconds)/12));if(next===scene)return;scene=next;play(clips[next].file,Math.max(0,seconds-next*12));},
    stop(){active=false;scene=-1;release();},
    toggle(){muted=!muted;if(voiceGain)voiceGain.gain.value=muted?0:.85;if(audio){audio.muted=muted;onSpeaking(!muted&&!audio.paused&&!audio.ended);}return muted;},
    get muted(){return muted;},
  };
}
