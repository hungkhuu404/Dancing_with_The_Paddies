// Original five-scene score. No samples, services or data sonification.
// Mid-register harmony survives small laptop/phone speakers.
const ROOTS=[261.6256,293.6648,329.6276,293.6648,261.6256];
export const scoreScene=seconds=>Math.min(4,Math.floor(Math.max(0,Number.isFinite(seconds)?seconds:0)/12));
export function createTourScore({Context=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
  let ac=null,master=null,duck=null,active=false,scene=-1,muted=false,suspendTimer=0;
  const voices=new Set();
  function init(){
    if(ac||!Context)return;
    ac=new Context();master=ac.createGain();master.gain.value=0;duck=ac.createGain();duck.gain.value=1;
    const filter=ac.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1400;
    master.connect(duck).connect(filter).connect(ac.destination);
  }
  function tone(frequency,at,duration,gain,pan=0,type='sine'){
    const oscillator=ac.createOscillator(),envelope=ac.createGain(),stereo=ac.createStereoPanner();
    oscillator.type=type;oscillator.frequency.value=frequency;stereo.pan.value=pan;
    const attack=Math.min(1.3,duration*.2),release=Math.min(2.8,duration*.4);
    envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(gain,at+attack);
    envelope.gain.setValueAtTime(gain,at+duration-release);envelope.gain.linearRampToValueAtTime(0,at+duration);
    oscillator.connect(envelope).connect(stereo).connect(master);voices.add(oscillator);
    oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();envelope.disconnect();stereo.disconnect();};
    oscillator.start(at);oscillator.stop(at+duration+.02);
  }
  function setLevel(){if(master)master.gain.setTargetAtTime(active&&!muted ? .8 : 0,ac.currentTime,.16);}
  return {
    start(){init();if(!ac)return;clearTimeout(suspendTimer);active=true;scene=-1;ac.resume().catch(()=>{});setLevel();},
    update(seconds){
      if(!active||!ac)return;const next=scoreScene(seconds);if(next===scene)return;scene=next;
      const now=ac.currentTime,remaining=12-(Math.max(0,seconds)%12),root=ROOTS[next];
      // Pads lift as speech finishes; harmony changes on the first frame of each scene.
      tone(root,now,remaining,.045,-.4);tone(root*1.5,now,remaining,.025,.4);tone(root*2,now,remaining,.018);
      if(remaining>2){tone(root*2,now+.08,2.2,.035,-.2,'triangle');if(next===2||next===4)tone(root*(next===2?3:5),now+.38,1.8,.025,.3,'triangle');}
      if(remaining>9){tone(root*2.5,now+4.2,2.4,.03,.2,'triangle');tone(root*3,now+8,2.8,.035,-.2,'triangle');}
    },
    setSpeaking(value){if(duck)duck.gain.setTargetAtTime(value ? .48 : 1,ac.currentTime,value ? .12 : .8);},
    setMuted(value){muted=!!value;setLevel();},
    stop(){active=false;scene=-1;if(!ac)return;setLevel();for(const voice of voices)try{voice.stop(ac.currentTime+.5);}catch{/* already ended */}clearTimeout(suspendTimer);suspendTimer=setTimeout(()=>{if(!active)ac.suspend().catch(()=>{});},600);},
    get available(){return !!Context;},
  };
}
