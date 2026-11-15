import {siteProfiles,checkSiteIndex,checkSiteMeta} from '../data/siteRules.js';
import {entryKind} from './entryRules.js';
import {atlasLayout,atlasPath} from './atlasLayout.js';
import {escapeHTML as esc} from '../map/presentation.js';
import {dateRange} from './blockSummary.js';

const BASE=import.meta.env.BASE_URL;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const fetchJSON=async path=>{const r=await fetch(BASE+path);if(!r.ok)throw Error(`Could not load ${path}`);return r.json();};
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const shortDate=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));

export async function createLocationAtlas({choose,back}){
  const root=document.createElement('section');root.className='location-atlas';root.setAttribute('aria-labelledby','atlas-title');
  root.innerHTML=`<div class="atlas-cartography"><div class="atlas-map-plane"><div class="atlas-map-art"></div><div class="atlas-markers"></div></div><span class="atlas-map-caption">Southeast Asia <span>Physical coastline / illustrative sweep</span></span></div>
    <header class="atlas-heading"><a class="atlas-wordmark" href="${BASE}" aria-label="Flood Calendar home"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M3 8h30M3 18h30M3 28h30M12 8v10m12 0v10M18 8v10M9 18v10"/></svg><span>Flood Calendar</span></a><span class="atlas-edition">NISAR field observations</span><span class="atlas-north" aria-label="North is up">N ↑</span></header>
    <main class="atlas-copy"><p class="atlas-eyebrow"><span></span> After the harvest</p><h1 id="atlas-title">Follow<br>the <em>flood.</em></h1><p class="atlas-lede">See when water arrives,<br>how long it stays, and when it recedes.</p>
    <figure class="atlas-radar"><div class="atlas-radar-image"><img alt="" decoding="async"><span class="atlas-radar-reticle" aria-hidden="true"></span></div><figcaption><span class="atlas-radar-title">A field record</span><span class="atlas-radar-detail">Choose a landscape below</span></figcaption></figure></main>
    <div class="atlas-selection"><p class="atlas-selection-label">Choose your landscape <span>Enter to explore</span></p><div class="atlas-locations" aria-label="Study locations"><p class="atlas-fetch" role="status">Reading available locations</p></div></div>
    <div class="atlas-flight-status" role="status" hidden><span class="atlas-status-text">Preparing the landscape</span><button type="button" class="atlas-cancel">Back</button></div><button type="button" class="atlas-resume" hidden>Continue exploring ${arrow}</button>
    <footer class="atlas-credit"><span>Radar: NISAR / ASF DAAC</span><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Geography: Natural Earth</a></footer>`;
  document.body.append(root);
  const markers=root.querySelector('.atlas-markers'),cards=root.querySelector('.atlas-locations'),status=root.querySelector('.atlas-flight-status'),plane=root.querySelector('.atlas-map-plane');
  let flight=false,cancelled=false,flightAnimation=null,choiceRevision=0,locations=[],layout=null;
  const statusText=root.querySelector('.atlas-status-text');
  root.querySelector('.atlas-cancel').onclick=()=>{cancelled=true;choiceRevision++;flight=false;root.classList.remove('is-preparing');root.setAttribute('aria-busy','false');status.hidden=true;};
  root.querySelector('.atlas-resume').onclick=back;
  function message(text){statusText.textContent=text;}
  function startChoice(location){
    if(flight)return;flight=true;cancelled=false;const revision=++choiceRevision;root.classList.add('is-preparing');root.setAttribute('aria-busy','true');status.hidden=false;status.querySelector('.atlas-map-fallback')?.remove();message('Preparing '+location.name);
    const isCancelled=()=>cancelled||revision!==choiceRevision;
    choose(location,{cancelled:isCancelled,fly:()=>isCancelled()?Promise.resolve(false):fly(location),message}).catch(error=>{
      if(isCancelled())return;
      flight=false;root.classList.remove('is-preparing');root.setAttribute('aria-busy','false');message('The landscape could not open. Try the water calendar instead.');
      if(!status.querySelector('.atlas-map-fallback')){const a=document.createElement('a');a.href=BASE+'calendar/?site='+encodeURIComponent(location.id);a.textContent='Open water calendar';a.className='atlas-map-fallback';status.append(a);}
    });
  }
  function highlight(location){
    root.dataset.preview=location.id;
    for(const l of locations){l.element?.classList.toggle('is-highlighted',l===location);cards.querySelector(`[data-location="${l.id}"]`)?.classList.toggle('is-highlighted',l===location);}
    const figure=root.querySelector('.atlas-radar'),img=figure.querySelector('img');
    const acq=location.meta?.acquisitions?.at(-1),hasRadar=!location.fixture&&!!acq?.backdrop;
    figure.classList.remove('has-radar');
    if(hasRadar){const src=BASE+`data/${location.id}/${acq.backdrop}`;const ready=()=>{if(root.dataset.preview===location.id&&img.getAttribute('src')===src)figure.classList.add('has-radar');};img.onload=ready;if(img.getAttribute('src')!==src)img.src=src;else if(img.complete&&img.naturalWidth>1)ready();}
    figure.querySelector('.atlas-radar-title').textContent=hasRadar?`${location.name} from orbit`:`${location.name}: data pending`;
    figure.querySelector('.atlas-radar-detail').textContent=hasRadar?`HH radar / ${shortDate(acq.date_local)}`:'Explore an illustrative landscape';
  }
  try{
    const [registry,geography]=await Promise.all([fetchJSON('data/sites.json'),fetchJSON('atlas/region.json').catch(()=>null)]);
    const published=await Promise.all(registry.sites.map(async site=>({site,meta:await fetchJSON(`data/${site.id}/meta.json`).catch(()=>null)})));
    locations=await Promise.all(Object.values(siteProfiles).map(async profile=>{
      const record=published.find(v=>v.site.id===profile.id),site=record?.site||profile,meta=record?.meta;
      let sceneReady=false;try{checkSiteIndex(profile,await fetchJSON(profile.scene.base+'index.json'));checkSiteMeta(profile,meta);sceneReady=true;}catch{/* pending landscape */}
      return {...site,available:sceneReady&&entryKind(profile,site,meta)!=='pending',fixture:meta?.fixture===true,meta};
    }));
    cards.innerHTML=locations.map((l,i)=>{
      const content=`<span class="atlas-location-index">0${i+1}</span><span class="atlas-location-info"><span class="atlas-location-region">${esc(l.region||'')}</span><span class="atlas-location-name">${esc(l.name)}</span><span class="atlas-location-record">${l.fixture||!l.available?'Data pending':l.meta.acquisitions.length+' radar observations'}<span>${l.fixture?'Illustrative landscape':l.available?dateRange(l.meta.acquisitions[0].date_local,l.meta.acquisitions.at(-1).date_local):'Observations not yet available'}</span></span></span><span class="atlas-location-arrow">${arrow}</span>`;
      return l.available?`<button type="button" class="atlas-location" data-location="${esc(l.id)}" aria-label="Explore ${esc(l.name)}${l.fixture?', illustrative landscape, data pending':''}">${content}</button>`:`<article class="atlas-location is-pending">${content}</article>`;
    }).join('');
    if(geography){
      layout=atlasLayout(geography.bounds);const {width,height}=layout;
      plane.style.aspectRatio=`${width}/${height}`;
      const grid=[];for(let lon=95;lon<=120;lon+=5)grid.push([[lon,2],[lon,27]]);for(let lat=5;lat<=25;lat+=5)grid.push([[91,lat],[123,lat]]);
      const labels=geography.island_labels.map(l=>{const [x,y]=layout.point(...l.center);return `<g class="atlas-island-label" transform="translate(${x},${y})"><path d="M-10 0h-12m6-6v12"/><text x="0" y="4">${esc(l.name)}</text><text class="atlas-island-international" x="0" y="20">${esc(l.international_name)}</text></g>`;}).join('');
      root.querySelector('.atlas-map-art').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Physical coastline of Southeast Asia, including Hoàng Sa and Trường Sa. Study locations are separate buttons."><defs><pattern id="atlas-dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#8ba89a" opacity=".25"/></pattern><pattern id="atlas-ocean" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M25 23v4m-2-2h4" stroke="#74958a" stroke-width=".65" opacity=".18"/></pattern></defs><rect width="100%" height="100%" fill="url(#atlas-ocean)"/><path class="atlas-graticule" d="${atlasPath(grid,layout)}"/><path class="atlas-land" fill-rule="evenodd" d="${atlasPath(geography.land.flat(),layout,true)}"/><path class="atlas-land-dots" fill="url(#atlas-dots)" fill-rule="evenodd" d="${atlasPath(geography.land.flat(),layout,true)}"/><path class="atlas-coasts" d="${atlasPath(geography.coasts,layout)}"/><path class="atlas-rivers" d="${atlasPath(geography.rivers,layout)}"/>${labels}</svg>`;
    }else{root.querySelector('.atlas-map-art').innerHTML='<p class="atlas-geography-error">Geographic overview unavailable. Choose a landscape below.</p>';}
    locations.forEach(l=>{
      const card=cards.querySelector(`[data-location="${l.id}"]`);
      if(card){card.onclick=()=>startChoice(l);card.onpointerenter=card.onfocus=()=>highlight(l);}
      if(!layout)return;
      const el=document.createElement(l.available?'button':'div');el.className='atlas-pin'+(l.available?'':' is-pending');
      el.innerHTML=`<span class="atlas-pin-target" aria-hidden="true"><i></i></span><span class="atlas-pin-label">${esc(l.name)}<small>${l.fixture||!l.available?'Data pending':esc(l.region?.split(',')[0]||'Explore')}</small></span>`;
      const [x,y]=layout.point(...l.center);l.point=[x/layout.width*100,y/layout.height*100];el.style.left=l.point[0]+'%';el.style.top=l.point[1]+'%';
      if(l.available){el.type='button';el.setAttribute('aria-label','Explore '+l.name+(l.fixture?', data pending':''));el.onclick=()=>startChoice(l);el.onpointerenter=el.onfocus=()=>highlight(l);}
      markers.append(el);l.element=el;
    });
    if(locations.length)highlight(locations.find(l=>!l.fixture&&l.available)||locations[0]);
  }catch(error){cards.innerHTML=`<p class="atlas-error" role="alert">${esc(error.message)}. No substitute observations are available.</p><a class="atlas-location" href="${BASE}map/">Open observation map</a>`;}
  // Motion is compositor-only. No continuous WebGL context or animation loop on the chooser.
  async function fly(location){
    if(cancelled)return false;
    root.classList.add('is-flying');root.querySelector('.atlas-cancel').hidden=true;
    if(reduced()||!layout)return true;
    plane.style.transformOrigin=`${location.point[0]}% ${location.point[1]}%`;
    const animation=flightAnimation=plane.animate([{transform:'scale(1)',opacity:1},{transform:'scale(1.25)',opacity:1,offset:.3},{transform:'scale(7)',opacity:0}],{duration:1650,easing:'cubic-bezier(.7,0,.2,1)',fill:'forwards'});
    try{await animation.finished;}catch{return false;}
    // Retain the final zoom until hide; cancelling here would flash the full map during release.
    return !cancelled;
  }
  function show(returning=false){flightAnimation?.cancel();flightAnimation=null;flight=false;cancelled=false;root.hidden=false;root.setAttribute('aria-busy','false');root.classList.remove('is-flying','is-preparing','is-leaving');status.hidden=true;root.querySelector('.atlas-cancel').hidden=false;root.querySelector('.atlas-resume').hidden=!returning;if(returning)root.querySelector('.atlas-resume').focus({preventScroll:true});}
  function hide(){flightAnimation?.cancel();flightAnimation=null;cancelled=true;choiceRevision++;root.hidden=true;}
  show(false);
  return {root,locations,show,hide,message,skipFlight(){flightAnimation?.finish();},async leave(instant=false){root.classList.add('is-leaving');if(!instant&&!reduced())await new Promise(r=>setTimeout(r,650));hide();},get cancelled(){return cancelled;},get ready(){return !!layout;}};
}
