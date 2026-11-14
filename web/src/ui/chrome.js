// One place for secondary tools, dialogs and keyboard focus. No scene/data rules.
import {reveal,dismiss,enterDialog,leaveDialog,viewIndicator} from './motion.js';
import {icon} from './icons.js';
export function createChrome({canvas,signature}) {
  const $=s=>document.querySelector(s), menu=$('#menu-btn'),panel=$('#tools-panel');
  $('.calendar-launch').insertAdjacentHTML('afterbegin',icon('calendar'));
  $('.method-launch').insertAdjacentHTML('afterbegin',icon('info'));
  $('#scene-views').prepend($('.signature-views'));
  viewIndicator($('.signature-views'));
  $('#presentation-tools').append($('.signature-tools'));
  // Move the real control, retaining its listener and tour state. No duplicate action.
  $('.app-actions').prepend($('#tour-start'));
  const key=document.createElement('aside');key.className='view-key';key.setAttribute('aria-label','View legend');key.append($('.world-view-caption'),$('#calendar-legend'));document.body.append(key);
  $('#science-note').remove();
  $('#places-slot')?.remove();
  for(const [selector,name] of [['#tour-start','tour'],['#record-start','record'],['#sound-btn','sound'],['[data-dialog="help-dialog"]','help'],['[data-dialog="sources-dialog"]','info']])document.querySelectorAll(selector).forEach(b=>{if(!b.querySelector('svg'))b.insertAdjacentHTML('afterbegin',icon(name));});
  new MutationObserver(()=>{const b=$('#record-start');if(!b.querySelector('.ui-icon'))b.insertAdjacentHTML('afterbegin',icon('record'));}).observe($('#record-start'),{childList:true});
  let origin=null;
  const toolsOpen=()=>!panel.hidden&&panel.dataset.phase!=='closing';
  function closeTools(focus=true){dismiss(panel);menu.setAttribute('aria-expanded','false');if(focus)menu.focus({preventScroll:true});}
  function openTools(focus=false){reveal(panel);menu.setAttribute('aria-expanded','true');if(focus)$('#tools-close').focus({preventScroll:true});}
  menu.onclick=()=>toolsOpen()?closeTools():openTools(true);$('#tools-close').onclick=()=>closeTools();
  document.querySelectorAll('[data-dialog]').forEach(b=>b.onclick=()=>{
    origin=b;closeTools(false);enterDialog($('#'+b.dataset.dialog));
  });
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.querySelector('[data-close-dialog]').onclick=()=>leaveDialog(dialog);
    dialog.addEventListener('cancel',e=>{e.preventDefault();leaveDialog(dialog);});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)leaveDialog(dialog);}});
    dialog.addEventListener('close',()=>{if(origin?.closest('#tools-panel')){openTools();origin.focus({preventScroll:true});}else origin?.focus({preventScroll:true});});
  });
  document.addEventListener('pointerdown',e=>{if(toolsOpen()&&!panel.contains(e.target)&&!menu.contains(e.target)&&!document.body.classList.contains('is-recording'))closeTools(false);});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&document.body.classList.contains('is-recording')){e.stopPropagation();signature.recorder.stop();return;}
    if(e.key==='Escape'&&toolsOpen()&&!document.querySelector('dialog[open]')){e.stopPropagation();closeTools();}
  },true);
  $('#sound-btn').addEventListener('click',()=>{$('#sound-btn span').textContent=$('#sound-btn').getAttribute('aria-pressed')==='true'?'On':'Off';});
  const watch=new MutationObserver(()=>{
    if(document.body.classList.contains('is-recording'))openTools();
    else if(!$('#tour-skip').hidden){closeTools(false);canvas.focus({preventScroll:true});}
  });
  watch.observe($('#record-start'),{childList:true});watch.observe($('#tour-skip'),{attributes:true,attributeFilter:['hidden']});
  // Tour cancellation remains reachable even while the tools panel is closed.
  const tourStop=document.createElement('button');tourStop.className='tour-stop';tourStop.type='button';tourStop.textContent='End tour';tourStop.hidden=true;document.body.append(tourStop);
  const tourWatch=new MutationObserver(()=>{$('#tour-skip').hidden?dismiss(tourStop):reveal(tourStop);});tourWatch.observe($('#tour-skip'),{attributes:true,attributeFilter:['hidden']});tourStop.onclick=()=>$('#tour-skip').click();
  canvas.tabIndex=0;
  $('#whole-btn').addEventListener('click',()=>signature.stopTour(),true);
}
