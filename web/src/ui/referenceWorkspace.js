import {defaultSite} from '../data/siteRules.js';
import {enterDialog,leaveDialog} from './motion.js';
export function createReferenceWorkspace({site=defaultSite,onOpen,onClose,openMap}){
  const dialog=document.createElement('dialog');dialog.className='reference-workspace';dialog.setAttribute('aria-label','Flood Calendar reference');
  const closeButton=document.createElement('button');closeButton.className='reference-close';closeButton.type='button';closeButton.setAttribute('aria-label','Close reference view');closeButton.textContent='×';
  const frame=document.createElement('iframe');frame.title='Flood Calendar reference';dialog.append(closeButton,frame);document.body.append(dialog);
  let active=false,origin=null,owned=false;
  function open(path,siteId=site){
    if(!['calendar/','method/'].includes(path))return;
    if(!active){origin=document.activeElement;onOpen();active=true;history.pushState({...history.state,floodReference:true},'',location.href);owned=true;}
    const q=new URLSearchParams({site:siteId,embed:'1'});const target=import.meta.env.BASE_URL+path+'?'+q;if(frame.hasAttribute('src'))frame.contentWindow.location.replace(target);else frame.src=target;enterDialog(dialog);closeButton.focus();
  }
  function close(fromHistory=false,after=null){
    if(!active)return;active=false;leaveDialog(dialog);onClose();(origin?.isConnected?origin:document.querySelector('#gl'))?.focus({preventScroll:true});
    if(owned&&!fromHistory){owned=false;if(after)addEventListener('popstate',after,{once:true});history.back();}else{owned=false;after?.();}
  }
  dialog.addEventListener('close',()=>{if(!active)(origin?.isConnected?origin:document.querySelector('#gl'))?.focus({preventScroll:true});});
  closeButton.onclick=()=>close();dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  addEventListener('popstate',()=>{if(active&&!history.state?.floodReference)close(true);});
  document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const u=new URL(a.href);if(u.origin!==location.origin)return;const path=['calendar/','method/'].find(p=>u.pathname===import.meta.env.BASE_URL+p);if(!path)return;e.preventDefault();open(path,u.searchParams.get('site')||site);});
  document.addEventListener('open-reference',e=>open(e.detail.path,e.detail.site));
  addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.channel!=='flood-reference')return;
    if(e.data.type==='close')close();if(e.data.type==='ready'){frame.title=e.data.title;dialog.setAttribute('aria-label',e.data.title);}
    if(e.data.type==='map'){const q=new URLSearchParams(e.data.query);close(false,()=>openMap(import.meta.env.BASE_URL+'map/?'+q));}
  });
  return {get active(){return active;},open,close};
}
