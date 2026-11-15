// Capture only application playback. Never opens a microphone or a system-audio prompt.
const taps=new Set(),listeners=new Set();
export function tapForRecording(context,output){
 if(!context?.createMediaStreamDestination)return;
 try{const destination=context.createMediaStreamDestination();output.connect(destination);
 taps.add(destination.stream);for(const add of listeners)try{add(destination.stream);}catch{/* capture must not interrupt playback */}
 }catch{/* playback still works when capture is unavailable */}
}
export function createRecordingMix(Context=globalThis.AudioContext||globalThis.webkitAudioContext){
 if(!Context)return null;let context;
 try{context=new Context();const destination=context.createMediaStreamDestination(),nodes=[];
  const limiter=context.createDynamicsCompressor();limiter.threshold.value=-3;limiter.ratio.value=12;limiter.connect(destination);
  const add=stream=>{const node=context.createMediaStreamSource(stream);node.connect(limiter);nodes.push(node);};
  for(const stream of taps)add(stream);listeners.add(add);context.resume().catch(()=>{});
  let closed=false;return {stream:destination.stream,close(){if(closed)return;closed=true;listeners.delete(add);for(const node of nodes)node.disconnect();limiter.disconnect();destination.stream.getTracks().forEach(t=>t.stop());context.close().catch(()=>{});}};
 }catch{context?.close().catch(()=>{});return null;}
}
