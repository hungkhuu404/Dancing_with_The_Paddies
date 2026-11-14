import './ui/atlas.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/vietnamese-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/vietnamese-400.css';
import {entryState} from './ui/entryState.js';
import {bypassAtlas} from './ui/entryRules.js';

let hasWorld=false;
function locationTrigger(){const trigger=document.querySelector('.app-bar .brand');trigger.classList.add('location-trigger');trigger.tabIndex=0;trigger.setAttribute('role','button');trigger.setAttribute('aria-label','Choose a location');trigger.title='Choose a location';return trigger;}
if(bypassAtlas(location.search)){
  hasWorld=true;import('./main.js');let opening=false;
  const trigger=locationTrigger();const open=()=>{if(!opening){opening=true;launch(true);}};
  trigger.onclick=open;trigger.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
}else launch();

async function launch(initialReturning=false){
  entryState.active=true;document.body.classList.add('is-atlas');
  entryState.pauseSound?.(true);
  const ui=document.getElementById('ui'),canvas=document.getElementById('gl');ui.inert=canvas.inert=true;
  let atlas,worldRequested=hasWorld,returning=initialReturning,skip=false;
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
  entryState.onReady=()=>{entryState.ready=true;resolveReady();};
  entryState.onError=error=>{entryState.error=error;rejectReady(error);};
  if(entryState.ready)resolveReady();else if(entryState.error)rejectReady(entryState.error);
  const prepare=()=>{if(worldRequested)return;worldRequested=hasWorld=true;import('./main.js').catch(entryState.onError);};
  const skipButton=document.createElement('button');skipButton.type='button';skipButton.className='entrance-skip';skipButton.textContent='Skip flight';skipButton.hidden=true;document.body.append(skipButton);
  skipButton.onclick=()=>{skip=true;if(entryState.active)atlas?.skipFlight();else entryState.enter?.(true);};
  const stage=new MutationObserver(()=>{if(atlas?.root.classList.contains('is-preparing'))atlas.message(document.getElementById('loading-stage')?.textContent||'Preparing the landscape');});
  stage.observe(document.getElementById('loading-stage'),{childList:true,characterData:true,subtree:true});
  function release(){entryState.active=false;document.body.classList.remove('is-atlas');ui.inert=canvas.inert=false;entryState.pauseSound?.(false);}
  const {createLocationAtlas}=await import('./ui/locationAtlas.js');
  atlas=await createLocationAtlas({
    async choose(site,transition){
      if(site.id!=='tan_hoi'){location.assign(`${import.meta.env.BASE_URL}map/?site=${encodeURIComponent(site.id)}`);return;}
      prepare();await ready;if(transition.cancelled())return;
      skip=false;skipButton.hidden=false;
      if(!await transition.fly()){skipButton.hidden=true;return;}
      if(transition.cancelled())return;
      release();entryState.enter?.(skip||matchMedia('(prefers-reduced-motion: reduce)').matches);returning=true;
      await atlas.leave(skip);canvas.focus({preventScroll:true});
    },
    back(){atlas.hide();release();skipButton.hidden=true;document.querySelector('.app-bar .brand')?.focus({preventScroll:true});},
  });
  entryState.onFinish=()=>{skipButton.hidden=true;};
  if(initialReturning)atlas.show(true);
  const trigger=locationTrigger();
  const show=()=>{if(!returning)return;entryState.active=true;document.body.classList.add('is-atlas');ui.inert=canvas.inert=true;entryState.pauseSound?.(true);atlas.show(true);};
  trigger.onclick=show;trigger.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}};
  addEventListener('keydown',e=>{if(e.key==='Escape'&&entryState.active&&returning)atlas.root.querySelector('.atlas-resume').click();});
  window.__atlas={show,enter:()=>atlas.root.querySelector('[data-location="tan_hoi"]')?.click(),get active(){return entryState.active;},get worldReady(){return entryState.ready;}};
  prepare();
}
