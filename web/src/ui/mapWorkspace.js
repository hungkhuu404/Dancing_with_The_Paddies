import {enterDialog,leaveDialog} from './motion.js';

/** Lazy, same-origin map workspace. The native dialog makes the world inert. */
export function createMapWorkspace({beforeOpen,onReturn,current}) {
  const dialog=document.createElement('dialog');dialog.className='map-workspace';dialog.setAttribute('aria-label','Flood Calendar map');
  const frame=document.createElement('iframe');frame.title='Flood Calendar water map';frame.allow='clipboard-write';
  const loading=document.createElement('div');loading.className='map-workspace-loading';loading.innerHTML='<p role="status">Opening the water map</p><button type="button">Back to 3D world</button>';
  dialog.append(frame,loading);document.body.append(dialog);
  let active=false,ready=false,ownedEntry=false,originControl=null,savedWorldUrl=location.href;
  let lastQuery='',pendingQuery='',sentQuery='';
  const post=(type,detail={})=>frame.contentWindow?.postMessage({channel:'flood-world',type,...detail},location.origin);
  const updateAddress=query=>{const u=new URL(savedWorldUrl);u.searchParams.set('view','map');for(const [k,v]of new URLSearchParams(query))u.searchParams.set(k,v);history.replaceState(history.state,'',u);};
  function close(cell,fromHistory=false) {
    if(!active)return;
    active=false;post('active',{active:false});leaveDialog(dialog);document.body.classList.remove('map-is-open');
    onReturn?.({cell,query:lastQuery});
    if(!fromHistory){if(ownedEntry){ownedEntry=false;history.back();}else history.replaceState(history.state,'',savedWorldUrl);}
    originControl?.focus({preventScroll:true});
  }
  function open(input=null,push=true) {
    if(active)return;
    originControl=document.activeElement;savedWorldUrl=location.href;
    if(!push){const clean=new URL(savedWorldUrl);for(const k of ['view','cell','layer','scope','site'])clean.searchParams.delete(k);savedWorldUrl=clean.href;}
    const url=new URL(input||`${import.meta.env.BASE_URL}map/`,location.origin);
    // Preserve the existing map viewport and layer when reopened from the top bar.
    const explicit=!!input;
    const q=explicit?url.searchParams:new URLSearchParams(lastQuery||'');
    if(!q.has('pass'))q.set('pass',String(current().pass));
    if(!q.has('scope'))q.set('scope','season');
    if(!q.has('site'))q.set('site',current().site);
    if(!q.has('cell')&&current().cell)q.set('cell',current().cell);
    pendingQuery=q.toString();lastQuery=pendingQuery;
    beforeOpen();active=true;document.body.classList.add('map-is-open');
    if(push){ownedEntry=true;history.pushState({floodMap:true},'',location.href);}else ownedEntry=false;
    updateAddress(pendingQuery);enterDialog(dialog);
    if(!frame.hasAttribute('src')){sentQuery=pendingQuery;q.set('embed','1');frame.src=`${import.meta.env.BASE_URL}map/?${q}`;loading.hidden=false;}
    else if(ready){if(explicit)post('navigate',{query:pendingQuery});post('active',{active:true});frame.focus();}
  }
  loading.querySelector('button').onclick=()=>close();
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(active)close();else (originControl?.isConnected?originControl:document.querySelector('#gl'))?.focus({preventScroll:true});});
  addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.channel!=='flood-map')return;
    if(e.data.type==='ready'){ready=true;loading.hidden=true;if(pendingQuery!==sentQuery)post('navigate',{query:pendingQuery});post('active',{active});if(active)frame.focus();}
    if(e.data.type==='state'&&active){lastQuery=e.data.query;updateAddress(lastQuery);}
    if(e.data.type==='close')close(e.data.cell);
    if(e.data.type==='error'){loading.hidden=true;}
  });
  // Intercept ordinary in-app links only. Modified clicks retain normal link behaviour.
  document.addEventListener('click',e=>{
    const link=e.target.closest('a[href]');if(!link||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
    const u=new URL(link.href);if(u.origin!==location.origin||u.pathname!==`${import.meta.env.BASE_URL}map/`)return;
    e.preventDefault();open(u.search?u.href:null);
  });
  addEventListener('popstate',()=>{
    if(new URL(location.href).searchParams.get('view')==='map'){if(!active)open(`${import.meta.env.BASE_URL}map/${location.search}`,false);}
    else {ownedEntry=false;close(null,true);}
  });
  return {open,close,get active(){return active;},openDeepLink(){if(new URL(location.href).searchParams.get('view')==='map'){
    const original=new URL(location.href);savedWorldUrl=new URL(import.meta.env.BASE_URL,location.origin).href;
    open(`${import.meta.env.BASE_URL}map/${original.search}`,false);
    const clean=new URL(original);for(const k of ['view','cell','layer','scope','pass','site'])clean.searchParams.delete(k);savedWorldUrl=clean.href;
  }}};
}
