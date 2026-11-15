import {createSeasonSound} from '../audio/seasonSound.js';
import {createQuickGuide} from '../ui/quickGuide.js';
import {assertSceneMeta} from '../data/contractPolicy.js';
import {siteProfile} from '../data/siteRules.js';
import {defaultSite} from '../data/siteRules.js';
import {Map as MLMap, Marker, setWorkerUrl} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/vietnamese-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/vietnamese-600.css';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/vietnamese-400.css';
import './map.css';
import '../ui/surfaces.css';
import '../ui/layout.css';
import {blockCore} from '../ui/blockCore.js';
import {icon} from '../ui/icons.js';
import {reveal,dismiss,viewIndicator} from '../ui/motion.js';
import {CELL_HA,COLORS,STEPS,DURATION_EDGES,ONSET_NOTE,cellSentences,durationColor,fmtDate,onsetBins,onsetColor} from './contract.js';
import {renderChart,renderStrip} from './panel.js';
import {dateRange} from '../ui/blockSummary.js';
import {boundedPass,readView,observationAt,observationAreas,viewParams,escapeHTML as esc} from './presentation.js';

setWorkerUrl(workerUrl);
const $ = id => document.getElementById(id);
const BASE = import.meta.env.BASE_URL;
const embedded = parent !== window && new URLSearchParams(location.search).get('embed') === '1';
document.body.classList.toggle('is-embedded',embedded);
for(const [selector,name]of [['#back-world','landscape'],['#about-open','info'],['#season','calendar'],['[data-mode=status]','radar'],['[data-mode=onset]','arrival'],['[data-mode=duration]','duration']])document.querySelectorAll(selector).forEach(b=>b.insertAdjacentHTML('afterbegin',icon(name)));
for(const id of ['map-key','map-options'])document.getElementById(id).open=false;
viewIndicator(document.querySelector('#questions'));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const send = (type, detail={}) => { if(embedded) parent.postMessage({channel:'flood-map',type,...detail},location.origin); };
let stopPlayback = () => {};
let mapSite=new URLSearchParams(location.search).get('site')||defaultSite;
let surfaceActive = true;
function returnWorld(cell) { stopPlayback(); if(embedded) send('close',{cell}); else {const u=new URL(BASE,location.origin);u.searchParams.set('site',mapSite);if(cell)u.searchParams.set('cell',cell);location.assign(u);} }
for(const id of ['world-link','back-world']) $(id).onclick = e => {if(embedded){e.preventDefault();returnWorld();}};
function openReference(path){stopPlayback();const site=new URLSearchParams(location.search).get('site')||defaultSite;if(embedded)send('reference',{path,site});else location.assign(BASE+path+'?'+new URLSearchParams({site}));}
$('about-open').onclick=()=>openReference('method/');
$('calendar-open').onclick=e=>{e.preventDefault();openReference('calendar/');};
$('about-close').onclick = () => $('about-dialog').close();
$('about-dialog').addEventListener('close', () => $('about-open').focus());
$('about-dialog').addEventListener('click', e => {if(e.target !== $('about-dialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();});
if(matchMedia('(max-width:700px), (max-height:540px)').matches) $('map-key').open = false;

const missing=[];
async function getJSON(file,required=true) {
  try {const r=await fetch(BASE+'data/'+file);if(!r.ok)throw Error(r.status);return await r.json();}
  catch {if(required)missing.push(file);return null;}
}
async function start() {
  const sites=await getJSON('sites.json');
  const query=new URLSearchParams(location.search);
  const site=query.has('site')?sites?.sites.find(s=>s.id===query.get('site')):sites?.sites.find(s=>s.default)||sites?.sites[0];
  if(!site)throw Error('Observations for this location are not available yet.');
  mapSite=site.id;for(const id of ['world-link','back-world'])$(id).href=BASE+'?'+new URLSearchParams({site:site.id});
  const dir=site.id+'/';
  const [meta,cells,aoi,places,summary]=await Promise.all(['meta.json','cells.geojson','aoi.geojson','places.geojson','summary.json'].map(f=>getJSON(dir+f)));
  if(!meta||!cells||!meta.acquisitions?.length)throw Error('Required water observations could not be loaded.');
  assertSceneMeta(siteProfile(site.id),meta);
  const dataSound=createSeasonSound({passes:summary?.passes,totalHa:summary?.totals.area_ha,fixture:!!meta.fixture});dataSound.mount(document.querySelector('.date-controls'));
  const guide=createQuickGuide({trigger:$('map-help'),view:'map',fixture:!!meta.fixture});if(query.has('debug'))window.__dataSound=dataSound;
  guide.showOnce();

  if(meta.fixture){const notice=document.createElement('p');notice.className='fixture-notice';notice.setAttribute('role','status');notice.textContent='Data pending. Water states are illustrative.';document.body.append(notice);document.body.classList.add('is-fixture');
    $('whole').setAttribute('aria-label','Show the study frame');
    for(const id of ['radar-only','gt30']){$(id).disabled=true;$(id).closest('label').hidden=true;}
    const dialog=$('about-dialog'),heading=dialog.querySelector('.dialog-heading'),credit=$('credit'),description=document.createElement('p');
    description.textContent='Data pending. This map illustrates a synthetic water record. Acquisition dates come from the ASF DAAC catalogue; water states and derived values are not observations.';
    dialog.replaceChildren(heading,description,credit);$('about-title').textContent=site.name+' data status';$('about-open').onclick=()=>dialog.showModal();
  }
  $('site-name').textContent=site.name;
  $('map').setAttribute('aria-label','Water observations in '+site.name+'. Select a block to inspect its record.');
  $('explorer-title').textContent='Explore '+site.name;
  $('credit').textContent=meta.sources.join('; ');
  const acq=meta.acquisitions,last=acq.length-1;
  const features=cells.features, props=features.map(f=>f.properties), bins=onsetBins(props);
  const byCell=new Map(features.map((f,i)=>[f.properties.cell_id,i]));
  const initial=readView(location.search,acq.length);
  const state={...initial,sel:-1,hover:-1,radarOnly:false,gt30:false};dataSound.select(state.pass);
  let series=null,seriesPromise=null,revision=0,playTimer=0,backdropTimer=0,backdropAt=0;
  const loadSeries=()=>seriesPromise||=getJSON(dir+'series.json').then(s=>{
    series=s;
    if(!s){$('errors').textContent='The observation record could not be loaded. Try reloading the map.';$('errors').hidden=false;}
    return s;
  });
  const ha=n=>`${Math.round(n).toLocaleString('en-US')} ha`;
  const duration=()=>reduced()?0:600;
  const map=new MLMap({container:'map',style:{version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#C8D0C7'}}]},
    bounds:site.bounds,fitBoundsOptions:{padding:40},attributionControl:{compact:true},dragRotate:false,pitchWithRotate:false});
  map.touchZoomRotate.disableRotation();
  const placeVisibility=()=>map.getContainer().classList.toggle('hide-place-labels',map.getZoom()<11.6);
  map.on('zoom',placeVisibility);placeVisibility();
  if(query.has('debug'))window.__map=map;
  const padding=()=>innerHeight<540?{top:20,bottom:135,left:260,right:70}:innerWidth<=700?{top:210,bottom:185,left:24,right:24}:{top:35,bottom:190,left:innerWidth>1000?350:310,right:90};
  const fit=()=>map.fitBounds(site.bounds,{padding:padding(),duration:duration(),maxZoom:13});
  $('whole').onclick=fit;
  $('zoom-in').onclick=()=>map.zoomIn({duration:duration()});
  $('zoom-out').onclick=()=>map.zoomOut({duration:duration()});
  function syncUrl() {
    const q=viewParams({...state,cell:state.sel<0?null:props[state.sel].cell_id},site.id);
    if(embedded)q.set('embed','1');
    if(query.has('debug'))q.set('debug','1');
    history.replaceState(null,'',location.pathname+'?'+q);
    send('state',{query:viewParams({...state,cell:state.sel<0?null:props[state.sel].cell_id},site.id).toString()});
  }
  function hatch() {
    const c=document.createElement('canvas');c.width=c.height=8;
    const g=c.getContext('2d');g.strokeStyle='#eef0ecaa';g.lineWidth=1.2;g.beginPath();g.moveTo(0,8);g.lineTo(8,0);g.moveTo(-2,2);g.lineTo(2,-2);g.moveTo(6,10);g.lineTo(10,6);g.stroke();
    return {width:8,height:8,data:new Uint8Array(g.getImageData(0,0,8,8).data.buffer)};
  }
  map.on('load', async()=>{try{
    map.addImage('hatch',hatch());
    map.addSource('base',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenStreetMap contributors'});
    map.addLayer({id:'base-water',type:'fill',source:'base','source-layer':'water',paint:{'fill-color':'#AABFBB'}});
    map.addLayer({id:'base-waterway',type:'line',source:'base','source-layer':'waterway',paint:{'line-color':'#91A9A0','line-width':['interpolate',['linear'],['zoom'],10,.6,14,2]}});
    if(!meta.fixture){map.addSource('backdrop',{type:'image',url:BASE+'data/'+dir+acq[state.pass].backdrop,coordinates:meta.backdrop.corners});
    map.addLayer({id:'backdrop',type:'raster',source:'backdrop',paint:{'raster-opacity':.72,'raster-fade-duration':0}});}
    map.addSource('cells',{type:'geojson',data:cells});
    const fs=(k,d)=>['coalesce',['feature-state',k],d];
    map.addLayer({id:'cells-fill',type:'fill',source:'cells',paint:{'fill-color':['to-color',fs('fill','rgba(0,0,0,0)')],'fill-opacity':fs('op',.9),'fill-opacity-transition':{duration:reduced()?0:180}}});
    map.addLayer({id:'cells-hatch',type:'fill',source:'cells',minzoom:11.7,paint:{'fill-pattern':'hatch','fill-opacity':['case',['boolean',['feature-state','hatch'],false],1,0]}});
    map.addLayer({id:'cells-grid',type:'line',source:'cells',minzoom:11.7,paint:{'line-color':'#1b211f55','line-width':.6}});
    map.addLayer({id:'cells-edge',type:'line',source:'cells',paint:{'line-color':COLORS.water,'line-width':1.5,'line-opacity':['case',['boolean',['feature-state','edge'],false],1,0]}});
    for(const [flag,width,dash] of [['yes',2,null],['possible',1.5,[2,2]]])map.addLayer({id:'gt30-'+flag,type:'line',source:'cells',filter:['==',['get','flag_gt30'],flag],layout:{visibility:'none'},paint:{'line-color':COLORS.radar,'line-width':width,...(dash?{'line-dasharray':dash}:{})}});
    map.addLayer({id:'cells-hover',type:'line',source:'cells',paint:{'line-color':COLORS.ink,'line-width':2,'line-opacity':['case',['boolean',['feature-state','hover'],false],1,0]}});
    map.addLayer({id:'sel-outer',type:'line',source:'cells',paint:{'line-color':COLORS.radar,'line-width':6,'line-opacity':['case',['boolean',['feature-state','sel'],false],1,0]}});
    map.addLayer({id:'sel-inner',type:'line',source:'cells',paint:{'line-color':COLORS.ink,'line-width':2,'line-opacity':['case',['boolean',['feature-state','sel'],false],1,0]}});
    if(aoi){map.addSource('aoi',{type:'geojson',data:aoi});map.addLayer({id:'aoi',type:'line',source:'aoi',paint:{'line-color':COLORS.ink,'line-width':1.5}});}
    for(const f of places?.features||[]){const el=document.createElement('span');el.className='hamlet';el.textContent=f.properties.name;new Marker({element:el}).setLngLat(f.geometry.coordinates).addTo(map);}
    $('date-slider').max=String(last);
    $('date-start').textContent=fmtDate(acq[0].date_local);
    $('date-end').textContent=fmtDate(acq[last].date_local);
    // Load once so every historical area and panel uses the same public record.
    await loadSeries();
    paint();updateDate();fit();
    if(query.get('hamlet'))focusHamlet(query.get('hamlet'));
    if(initial.cell&&byCell.has(initial.cell))select(byCell.get(initial.cell),true);
    $('map-loading').hidden=true;
    if(missing.length){$('errors').textContent='Some map resources are unavailable: '+missing.join(', ')+'.';$('errors').hidden=false;}
    send('ready');
  }catch(error){$('map-loading').hidden=true;$('errors').textContent='The map could not be prepared. '+error.message; $('errors').hidden=false;send('error',{message:error.message});}
  });
  map.on('error',e=>{if(e.sourceId==='base')return;if(!meta.fixture&&e.sourceId==='backdrop'){$('errors').textContent='The radar background is unavailable. Block observations remain visible.';$('errors').hidden=false;}});
  function focusHamlet(name){
    const group=features.filter(f=>f.properties.nearest_hamlet===name);if(!group.length)return;$('explorer-title').textContent='Near '+name;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const f of group)for(const ring of f.geometry.coordinates)for(const [x,y]of ring){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
    map.fitBounds([[x0,y0],[x1,y1]],{padding:padding(),duration:duration()});$('selection-hint').textContent='Nearest-hamlet group: '+name;$('selection-hint').hidden=false;
  }
  function cellLook(p) {
    const look={fill:'rgba(0,0,0,0)',op:.9,hatch:false,edge:false};
    if(state.scope==='image'){
      const o=observationAt(series?.cells[p.cell_id]?.s,state.pass);
      return {...look,fill:o.state==='W'?COLORS.water:o.state==='-'?COLORS.missing:look.fill,hatch:o.state==='-',op:o.carried ? .55 : .9};
    }
    if(p.status==='no_data')return {...look,fill:COLORS.missing,hatch:true};
    if(p.status==='never_water')return look;
    if(p.status==='always_water')return {...look,fill:COLORS.water,op:.35,edge:true};
    return {...look,fill:(state.mode==='status'?(p.status==='flooded'?COLORS.water:COLORS.silt):state.mode==='onset'?onsetColor(bins,p.onset_by_local):durationColor(p.flood_days_min))||look.fill,op:state.mode==='status'&&p.status_confirmed===false ? .5 : .9};
  }
  function paint() {
    if(!map.getSource('cells'))return;
    features.forEach(f=>{const p=f.properties,l=cellLook(p);if(state.gt30&&state.scope==='season'&&!['yes','possible'].includes(p.flag_gt30))l.op=.3;map.setFeatureState({source:'cells',id:f.id},l);});
    for(const b of document.querySelectorAll('#questions button'))b.setAttribute('aria-pressed',String(state.mode===b.dataset.mode));
    for(const f of ['yes','possible'])map.setLayoutProperty('gt30-'+f,'visibility',state.gt30&&state.scope==='season'&&!state.radarOnly?'visible':'none');
    $('gt30').disabled=state.scope==='image';
    $('gt30-note').hidden=!(state.gt30&&state.scope==='season');
    legend();syncUrl();
  }
  function legend() {
    const row=(color,label,area,cls='')=>`<li><i class="sw ${cls}" style="background:${color}" aria-hidden="true"></i><span>${esc(label)}</span>${area===null?'':`<b>${ha(area)}</b>`}</li>`;
    const count=pred=>props.filter(pred).length*CELL_HA;
    let rows='',note='';
    if(state.radarOnly){rows=row('#59615E','HH radar backscatter',null);note=`Image from ${fmtDate(acq[state.pass].date_local)}. Darker is a weaker radar return, not greater depth.`;}
    else if(state.scope==='image'){
      const a=observationAreas(props.map(p=>series?.cells[p.cell_id]?.s||''),state.pass,CELL_HA);
      rows=row(COLORS.water,'Water observed',a.W)+row('transparent','No water observed',a.N,'empty')+row(COLORS.missing,'No observation yet',a['-'],'hatched');
      note=`Pale blocks use an earlier image. ${ha(a.carried)} carried forward.`;
    }else if(state.mode==='status'){
      const tot=summary?.totals?.status_ha;
      rows=row(COLORS.water,'Water present',tot?.flooded??count(p=>p.status==='flooded'))+row(COLORS.silt,'Water receded',tot?.water_gone??count(p=>p.status==='water_gone'))+row('transparent','No water observed',tot?.never_water??count(p=>p.status==='never_water'),'empty')+row('transparent','Water throughout',tot?.always_water??count(p=>p.status==='always_water'),'edge')+row(COLORS.missing,'Insufficient images',tot?.no_data??count(p=>p.status==='no_data'),'hatched');
      note='Pale status colours indicate an unconfirmed observation.';
    }else if(state.mode==='onset'){
      for(const b of bins)rows+=row(b.color,dateRange(b.from,b.to),count(p=>['flooded','water_gone'].includes(p.status)&&p.onset_by_local>=b.from&&p.onset_by_local<=b.to));
      rows+=row('transparent','No water observed',count(p=>p.status==='never_water'),'empty')+row('transparent','Water throughout',count(p=>p.status==='always_water'),'edge')+row(COLORS.missing,'Insufficient images',count(p=>p.status==='no_data'),'hatched');
      note='Lighter means earlier. Arrival dates are bounded by satellite visits.';
    }else{
      for(let b=4;b>=0;b--){const lo=DURATION_EDGES[b],hi=DURATION_EDGES[b+1];rows+=row(STEPS[b],hi===Infinity?`${lo}+ days`:`${lo} to under ${hi} days`,count(p=>['flooded','water_gone'].includes(p.status)&&p.flood_days_min!==null&&p.flood_days_min>=lo&&p.flood_days_min<hi));}
      rows+=row('transparent','No water observed',count(p=>p.status==='never_water'),'empty')+row('transparent','Water throughout',count(p=>p.status==='always_water'),'edge')+row(COLORS.missing,'Insufficient images',count(p=>p.status==='no_data'),'hatched');
      note='Minimum duration. Select a block for its full date range.';
    }
    $('legend').innerHTML='<ul>'+rows+'</ul>';
    $('key-note').textContent=note;
    $('scope-label').textContent=state.radarOnly?'Radar image':state.scope==='season'?'Season record':'By selected date';
    $('layer-description').textContent=state.scope==='image'?'Latest valid water state on or before the selected date.':{status:'Select a block to read its water record.',onset:'When water first appeared in the latest flood episode.',duration:'Minimum time under water in the latest flood episode.'}[state.mode];
  }
  for(const b of document.querySelectorAll('#questions button'))b.onclick=()=>{stopPlayback();state.mode=b.dataset.mode;state.scope='season';paint();updateDate();if(state.sel>=0)openPanel(state.sel);};
  $('radar-only').onchange=e=>{state.radarOnly=e.target.checked;for(const id of ['cells-fill','cells-hatch','cells-edge','gt30-yes','gt30-possible'])map.setLayoutProperty(id,'visibility',state.radarOnly?'none':id.startsWith('gt30')?(state.gt30&&state.scope==='season'?'visible':'none'):'visible');legend();};
  $('gt30').onchange=e=>{state.gt30=e.target.checked;paint();};
  function swapBackdrop(){clearTimeout(backdropTimer);backdropTimer=setTimeout(()=>{backdropAt=performance.now();map.getSource('backdrop')?.updateImage({url:BASE+'data/'+dir+acq[state.pass].backdrop,coordinates:meta.backdrop.corners});},Math.max(0,334-(performance.now()-backdropAt)));}
  function updateDate(){
    const a=acq[state.pass],season=state.scope==='season';
    $('date-context').textContent=season?'All observations':'Water observed by';
    $('tl-label').textContent=season?dateRange(acq[0].date_local,acq[last].date_local):fmtDate(a.date_local);
    $('date-slider').value=String(state.pass);$('date-slider').setAttribute('aria-valuetext',`${fmtDate(a.date_local)}, track ${a.track}`);
    $('season').setAttribute('aria-pressed',String(season));
    $('prev').disabled=!season&&state.pass===0;$('next').disabled=!season&&state.pass===last;
    $('date-note').textContent=meta.fixture?'Fixture record. Image dates are from the ASF catalogue; water states are illustrative.':season?'Select a date to see the latest available water observation.':`Track ${a.track}. Gaps use the most recent valid image${a.valid_share<.999?'; this pass covers part of the study area':''}.`;
  }
  function setPass(i){state.pass=boundedPass(i,acq.length);dataSound.play(state.pass);state.scope='image';swapBackdrop();paint();updateDate();if(state.sel>=0)openPanel(state.sel);}
  $('date-slider').oninput=e=>{stopPlayback();setPass(+e.target.value);};
  $('prev').onclick=()=>{stopPlayback();setPass(Math.max(0,state.pass-1));};
  $('next').onclick=()=>{stopPlayback();setPass(Math.min(last,state.pass+1));};
  $('season').onclick=()=>{stopPlayback();state.scope='season';state.pass=last;swapBackdrop();paint();updateDate();if(state.sel>=0)openPanel(state.sel);};
  stopPlayback=()=>{dataSound.stop();clearInterval(playTimer);playTimer=0;$('play').setAttribute('aria-pressed','false');$('play').setAttribute('aria-label','Play observations');};
  $('play').onclick=()=>{
    if(playTimer){stopPlayback();return;}
    setPass(state.scope==='season'||state.pass===last?0:state.pass);
    $('play').setAttribute('aria-pressed','true');$('play').setAttribute('aria-label','Pause observations');
    playTimer=setInterval(()=>{if(state.pass===last){stopPlayback();return;}setPass(state.pass+1);},1500);
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
  map.on('mousemove','cells-fill',e=>{const id=e.features[0]?.id;if(id===state.hover)return;if(state.hover>=0)map.setFeatureState({source:'cells',id:state.hover},{hover:false});state.hover=id;if(id!==undefined)map.setFeatureState({source:'cells',id},{hover:true});map.getCanvas().style.cursor='pointer';});
  map.on('mouseleave','cells-fill',()=>{if(state.hover>=0)map.setFeatureState({source:'cells',id:state.hover},{hover:false});state.hover=-1;map.getCanvas().style.cursor='';});
  map.on('click','cells-fill',e=>{const id=e.features[0]?.id;if(id!==undefined){const i=features.findIndex(f=>f.id===id);if(i>=0)select(i,innerWidth<=700);}});
  function select(i,zoom=false){
    if(state.sel>=0)map.setFeatureState({source:'cells',id:features[state.sel].id},{sel:false});
    state.sel=i;revision++;
    $('selection-hint').hidden=true;
    $('panel-body').querySelector('.science-details')?.removeAttribute('open');
    if(i<0){dismiss($('panel'));document.body.classList.remove('panel-open');map.getCanvas().focus({preventScroll:true});syncUrl();return;}
    map.setFeatureState({source:'cells',id:features[i].id},{sel:true});syncUrl();openPanel(i);
    if(zoom){const ring=features[i].geometry.coordinates[0],points=ring.slice(0,-1);const centre=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);map.easeTo({center:centre,zoom:Math.max(map.getZoom(),13),duration:duration()});}
  }
  $('panel-close').onclick=()=>select(-1);
  addEventListener('keydown',e=>{if(e.key!=='Escape'||$('about-dialog').open)return;stopPlayback();if(state.sel>=0){e.stopPropagation();select(-1);}else if(embedded)returnWorld();});
  async function openPanel(i){
    const stamp=++revision,p=props[i],old=$('panel-body').querySelector('.science-details')?.open,scroll=$('panel').scrollTop;
    const rec=series?.cells[p.cell_id],obs=observationAt(rec?.s,state.pass);
    const observed=obs.state==='W'?'Water observed':obs.state==='N'?'No open water observed':'No observation available';
    const atDate=state.scope==='image'?`<p class="image-state">${observed}<small>${obs.index<0?'No valid image on or before this date.':`${obs.carried?'Carried from':'Observed on'} ${fmtDate(acq[obs.index].date_local)}${obs.missing?'. No image for this block on the selected date.':''}`}</small></p>`:'';
    $('panel-body').innerHTML=`${meta.fixture?'<p class="fixture-record">Fixture record. Water data pending.</p>':''}${blockCore(p,'block-title')}${atDate}<details class="observation-details"><summary>Observation record <span>${p.n_obs} images</span></summary><div id="strip"></div><p class="strip-key"><span><i class="sw" style="background:var(--water)"></i>Water</span><span><i class="sw empty"></i>No water</span><span><i class="sw hatched"></i>No image</span></p><p class="block-id">${esc(p.cell_id)}</p>${cellSentences(p).filter(t=>t.includes('not yet confirmed')).map(t=>`<p>${esc(t)}</p>`).join('')}<p>${ONSET_NOTE}</p></details><details class="science-details"${old?' open':''}><summary>${meta.fixture?'Synthetic fixture values':'Radar measurements'}</summary><p>${p.n_obs} images from ${p.n_tracks} tracks.</p><div id="chart"></div></details><div class="panel-actions">${embedded?`<button class="primary" type="button" id="see-world">${icon('landscape')}Locate in landscape</button>`:''}<button type="button" id="copy-link">${icon('copy')}Copy link</button></div><p id="copy-status" class="copy-status" role="status"></p>`;
    reveal($('panel'));document.body.classList.add('panel-open');$('panel').scrollTop=scroll;
    $('see-world')?.addEventListener('click',()=>returnWorld(p.cell_id));
    $('copy-link').onclick=async()=>{
      const q=viewParams({...state,cell:p.cell_id},site.id);if(embedded)q.set('view','map');
      const url=new URL(embedded?BASE:BASE+'map/',location.origin);url.search=q;
      try{await navigator.clipboard.writeText(url.href);$('copy-status').textContent='Link copied.';}catch{$('copy-status').textContent=url.href;}
    };
    await loadSeries();if(stamp!==revision||state.sel!==i)return;
    const record=series?.cells[p.cell_id];
    $('strip').innerHTML=record?renderStrip(record.s,acq,state.scope==='image'?state.pass:-1,p):'<p class="key-note">Observation record unavailable.</p>';
    function chart(){if(!record||!$('chart')||$('chart').children.length)return;$('chart').innerHTML=renderChart(record,acq,state.pass,p);$('chart').querySelector('.show-table')?.addEventListener('click',e=>{const t=$('chart').querySelector('table');t.hidden=!t.hidden;e.target.textContent=t.hidden?'Show as table':'Hide table';});}
    const details=$('panel-body').querySelector('.science-details');details.addEventListener('toggle',()=>{if(details.open)chart();});if(details.open)chart();
  }
  addEventListener('message',e=>{
    if(!embedded||e.origin!==location.origin||e.source!==parent||e.data?.channel!=='flood-world')return;
    if(e.data.type==='active'){surfaceActive=!!e.data.active;dataSound.setPaused(!surfaceActive);if(!surfaceActive){stopPlayback();map.stop();}else{map.resize();}}
    if(e.data.type==='navigate'){
      stopPlayback();const next=readView(e.data.query,acq.length);Object.assign(state,{mode:next.mode,scope:next.scope,pass:next.pass});
      swapBackdrop();paint();updateDate();const hamlet=new URLSearchParams(e.data.query).get('hamlet');if(hamlet){select(-1);focusHamlet(hamlet);}if(next.cell&&byCell.has(next.cell))select(byCell.get(next.cell),true);
    }
  });
  // A keyboard alternative to selecting a small block with a pointer.
  const pick=document.createElement('button');pick.type='button';pick.setAttribute('aria-label','Select the block at the map centre');pick.title='Select centre block';pick.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>';
  document.querySelector('.map-navigation').append(pick);pick.onclick=()=>{const f=map.queryRenderedFeatures(map.project(map.getCenter()),{layers:['cells-fill']})[0];if(f){select(features.findIndex(v=>v.id===f.id));$('panel-close').focus();}else{$('selection-hint').hidden=false;$('selection-hint').textContent='Move the map centre over a block, then select it.';}};
}
start().catch(error=>{$('map-loading').hidden=true;$('errors').textContent=error.message+' No substitute data has been generated.';$('errors').hidden=false;send('error',{message:error.message});});
