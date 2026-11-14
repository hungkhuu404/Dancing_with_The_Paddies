// Short, interruptible transitions. Visibility and focus remain explicit.
const running=new WeakMap();
const resting='translateY(0) scale(1)';
const shifted='translateY(8px) scale(.985)';
export const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function transition(el,show,finish=()=>{}) {
  const previous=running.get(el);
  const current=previous?getComputedStyle(el):null;
  const from=current?{opacity:current.opacity,transform:current.transform}:{opacity:show?0:1,transform:show?shifted:resting};
  previous?.cancel();
  running.delete(el);
  if(reducedMotion()||!el.animate){delete el.dataset.phase;finish();return;}
  el.dataset.phase=show?'entering':'closing';
  const animation=el.animate([from,{opacity:show?1:0,transform:show?resting:shifted}],{
    duration:show?240:170,easing:show?'cubic-bezier(.2,.8,.2,1)':'cubic-bezier(.4,0,1,1)',
  });
  running.set(el,animation);
  animation.finished.then(()=>{
    if(running.get(el)!==animation)return;
    running.delete(el);delete el.dataset.phase;finish();
  }).catch(()=>{});
}

export function reveal(el){el.hidden=false;el.inert=false;transition(el,true);}
export function dismiss(el){if(el.hidden)return;el.inert=true;transition(el,false,()=>{el.hidden=true;el.inert=false;});}
export function enterDialog(el){el.inert=false;if(!el.open)el.showModal();transition(el,true);}
export function leaveDialog(el){if(!el.open)return;el.inert=true;transition(el,false,()=>{el.inert=false;el.close();});}

export function viewIndicator(group) {
  const marker=document.createElement('span');marker.className='view-selection';marker.setAttribute('aria-hidden','true');group.prepend(marker);
  const update=()=>{const active=group.querySelector('[aria-pressed="true"]');if(!active)return;marker.style.width=active.offsetWidth+'px';marker.style.transform=`translateX(${active.offsetLeft}px)`;};
  new MutationObserver(update).observe(group,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
  new ResizeObserver(update).observe(group);update();
}
