import * as THREE from 'three';
import {U} from '../scene/shaderlib.js';
import {onsetBins,onsetColor,COLORS,fmtDate} from '../map/contract.js';
import {hourlyWeather,celestial,sceneDate,ease,TOUR_TEXT,tourPose} from './signatureRules.js';
import {createRecorder} from './recorder.js';
import {rng} from './paths.js';
import {dateRange} from '../ui/blockSummary.js';
import {reveal,dismiss} from '../ui/motion.js';
import {icon} from '../ui/icons.js';

/** Extra scene controls; contract parsing remains owned by data/load.js. */
export async function createSignature(ctx) {
  const {scene,camera,canvas,tiles,contract,grid,parcelTex,sky,clouds,world,reduced}=ctx;
  const moonDirection=new THREE.Vector3(),radarBackground=new THREE.Color('#1B211F');
  let history=null;try {const r=await fetch(import.meta.env.BASE_URL+'scene/history.json');if(r.ok)history=await r.json();}catch{/* explicit unavailable */}
  let mode=0,radar=0,calendar=0,pass=-1,oldTod=-1,astronomy=null,weather=null,weatherOn=true,age=0;
  let tour=null,tourTime=0,tourSaved=null,lastScene=-1;
  const bins=onsetBins([...(contract?.props.values()||[])]);
  const panel=document.createElement('section');panel.className='signature-tools';panel.setAttribute('aria-label','Science and video tools');
  panel.innerHTML=`<div class="signature-views" role="group" aria-label="World view"><button data-view="0" aria-pressed="true">${icon('landscape')}Landscape</button><button data-view="1" aria-pressed="false">${icon('radar')}Radar</button><button data-view="2" aria-pressed="false">${icon('arrival')}Arrival</button></div>
    <p class="signature-note" id="science-note"></p><div id="calendar-legend" hidden></div>
    <button id="tour-start">Guided tour <span>60 sec</span></button><button id="tour-skip" hidden>End tour</button>
    <button id="record-start">Record 30s</button><button id="record-download" hidden>Download video</button><p id="record-status" role="status"></p>
  `;
  document.body.append(panel);
  const controls=new Map([...panel.querySelectorAll('[id]')].map(node=>[node.id,node]));
  const find=id=>controls.get(id),note=find('science-note');
  const subtitle=document.createElement('div');subtitle.className='story-caption';subtitle.hidden=true;subtitle.setAttribute('aria-live','polite');document.body.append(subtitle);
  const viewCaption=document.createElement('p');viewCaption.className='world-view-caption';viewCaption.hidden=true;document.body.append(viewCaption);
  let calData=null,calTexture=null;
  if(grid&&parcelTex){
    calData=new Uint8Array(grid.cols*grid.rows*4);calTexture=new THREE.DataTexture(calData,grid.cols,grid.rows,THREE.RGBAFormat);calTexture.magFilter=calTexture.minFilter=THREE.NearestFilter;
    U.uCalendarTex.value=calTexture;U.uParcelAtlas.value=parcelTex;U.uCalendarN.value.set(grid.cols,grid.rows);U.uHasCalendar.value=1;
    const c=new THREE.Color();
    for(const [id,p] of contract.props){const m=/^E(\d+)N(\d+)$/.exec(id);if(!m)continue;const col=(+m[1]-ctx.frame.e0)/contract.step,row=(+m[2]-ctx.frame.n0)/contract.step;if(col<0||row<0||col>=grid.cols||row>=grid.rows)continue;
      const color=onsetColor(bins,p.onset_by_local)||(p.status==='no_data'?COLORS.missing:p.status==='never_water'?COLORS.silt:COLORS.water);c.set(color);const o=(row*grid.cols+col)*4;calData[o]=Math.round(c.r*255);calData[o+1]=Math.round(c.g*255);calData[o+2]=Math.round(c.b*255);calData[o+3]=128;
    }
  }
  // Distinct date bins from the same function used by /map/.
  const legend=find('calendar-legend');for(const b of bins){const line=document.createElement('span');const chip=document.createElement('i');chip.style.background=b.color;line.append(chip,document.createTextNode(dateRange(b.from,b.to)));legend.append(line);}
  const residual=document.createElement('span');residual.className='legend-note';
  for(const [label,color] of [['No water observed',COLORS.silt],['Water in every image',COLORS.water],['Insufficient data',COLORS.missing]]){const row=document.createElement('span'),chip=document.createElement('i');chip.style.background=color;row.append(chip,document.createTextNode(label));residual.append(row);}legend.append(residual);
  function setMode(i){mode=Math.max(0,Math.min(2,+i));document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.view===mode)));legend.hidden=mode!==2;
    note.textContent=mode===0?'Illustrated landscape. Water states use the selected image.':mode===1?'Fixed HH image from 27 Oct 2026. Objects are illustrated.':'Season summary. Lighter fields indicate earlier water arrival.';
    viewCaption.hidden=mode===0;viewCaption.textContent=note.textContent;
  }
  setMode(0);panel.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setMode(b.dataset.view));
  function updateAge(){U.uAgeHaze.value=0;}
  function applyWeather(){world.atmo.setHistorical(weatherOn?weather:null);if(!weatherOn||!weather){world.atmo.setWeather('clear');sky.sky.material.uniforms.cloudCoverage.value=.32;oldTod=-1;}}
  const recorder=createRecorder(canvas,{subtitle:()=>tour?TOUR_TEXT[Math.min(4,Math.floor(tourTime/12))].join('. '):note.textContent,credit:()=>`${contract?.meta.fixture?'Fixture data, not results. ':''}Flood Calendar, Tân Hội. ${fmtDate(ctx.passes[pass]?.date)}. Illustrated landscape.`,onState:s=>{
    document.body.classList.toggle('is-recording',s.active);find('record-start').textContent=s.active?'Stop recording':'Record 30s';find('record-download').hidden=!s.url;find('record-status').textContent=s.error||(s.active?'Recording':s.url?`Video ready (${(s.bytes/1e6).toFixed(1)} MB)`:'');
  }});
  find('record-start').onclick=()=>recorder.state.active?recorder.stop():recorder.start({wide:true,hide:true});find('record-download').onclick=()=>recorder.download();
  // Seeded star field is an illustration, not an astrometric catalogue.
  const rand=rng(905),positions=new Float32Array(1600*3);for(let i=0;i<1600;i++){const y=rand()*2-1,a=rand()*Math.PI*2,r=Math.sqrt(1-y*y);positions.set([r*Math.cos(a)*6000,y*6000,r*Math.sin(a)*6000],i*3);}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xeef0ec,size:1.6,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,fog:false}));stars.name='illustrative-stars';stars.frustumCulled=false;scene.add(stars);
  const moonMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uPhase:{value:0},uAngle:{value:0},uOpacity:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;uniform float uPhase;uniform float uAngle;uniform float uOpacity;void main(){vec2 p=vUv*2.-1.;float r=dot(p,p);if(r>1.)discard;vec3 n=vec3(p,sqrt(1.-r));float z=-cos(uPhase*6.2831853);float xy=sqrt(max(0.,1.-z*z));vec3 light=vec3(sin(uAngle)*xy,cos(uAngle)*xy,z);float lit=smoothstep(-.02,.02,dot(n,light));gl_FragColor=vec4(vec3(.85,.86,.80)*lit,uOpacity*(1.-smoothstep(.96,1.,r)));}`});
  const moon=new THREE.Mesh(new THREE.PlaneGeometry(52,52),moonMat);moon.name='astronomical-moon-phase';moon.frustumCulled=false;scene.add(moon);
  const pose={};let audio=null,audioAvailable=false;
  try {const r=await fetch(import.meta.env.BASE_URL+'audio/tour-en.mp3',{method:'HEAD'});audioAvailable=r.ok&&(r.headers.get('content-type')||'').startsWith('audio/');}catch{/* subtitles only */}
  function startTour(){
    if(tour)return;ctx.stopActivities();tourSaved={view:ctx.saveView(),mode,age};
    tour=[ctx.target().x,ctx.target().z];
    let nearest=Infinity;for(const t of tiles.ready)for(const p of t.layout.parcels){let x=0,z=0;for(const v of p.poly){x+=v[0];z+=v[1];}x/=p.poly.length;z/=p.poly.length;const d=(x-ctx.target().x)**2+(z-ctx.target().z)**2;if(d<nearest){nearest=d;tour[0]=x;tour[1]=z;}}
    age=0;updateAge();tourTime=0;lastScene=-1;reveal(subtitle);find('tour-skip').hidden=false;find('tour-start').disabled=true;
    if(audioAvailable){audio=new Audio(import.meta.env.BASE_URL+'audio/tour-en.mp3');audio.play().catch(()=>{});}
  }
  function stopTour(){if(!tour)return;audio?.pause();audio=null;tour=null;dismiss(subtitle);find('tour-skip').hidden=true;find('tour-start').disabled=false;ctx.restoreView(tourSaved.view);setMode(tourSaved.mode);age=tourSaved.age;updateAge();}
  find('tour-start').onclick=startTour;find('tour-skip').onclick=stopTour;
  canvas.addEventListener('pointerdown',()=>{if(tour)stopTour();});
  addEventListener('keydown',e=>{if(document.body.classList.contains('is-atlas')||document.querySelector('dialog[open]')||e.target.closest?.('#tools-panel')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;if(['1','2','3'].includes(e.key)){if(tour)stopTour();setMode(+e.key-1);}if(e.key==='Escape')stopTour();});
  function update(dt){
    const current=ctx.pass(),tod=ctx.tod();
    if(current!==pass){pass=current;age=0;updateAge();
      const acq=contract?.acq?.[pass];weather=hourlyWeather(history,acq?.acq_utc);applyWeather();
      let text=weather?`Weather at ${acq.acq_utc}. ERA5 reanalysis estimates ${weather.cloud_cover.toFixed(0)}% cloud cover, ${weather.rain.toFixed(1)} mm hourly rain and wind of ${weather.wind_speed_10m.toFixed(1)} m/s. The rain effect is illustrative.`:'Archived weather is unavailable for this acquisition.';
      const optical=history?.optical?.find(p=>p.datetime.slice(0,10)===acq?.date_local);if(optical)text+=` Sentinel-2 tile cloud cover: ${optical.cloud_cover.toFixed(0)}% (not commune-specific).`;
      document.querySelector('#weather-source-note').textContent=text;
      if(calData){for(const c of grid.cells)calData[(c.row*grid.cols+c.col)*4+3]=c.s[pass]==='-'?255:128;calTexture.needsUpdate=true;}
      oldTod=-1;
    }
    if(Math.abs(tod-oldTod)>.0008){const date=contract?.acq?.[pass]?.date_local||ctx.passes[pass].date;astronomy=celestial(sceneDate(date,tod));sky.setAstronomy(astronomy);sky.set(tod);oldTod=tod;}
    if(weatherOn&&weather){sky.state.cloud=weather.cloud_cover/100;sky.sky.material.uniforms.cloudCoverage.value=weather.cloud_cover/100;const a=weather.wind_direction_10m*Math.PI/180;ctx.wind.set(-Math.sin(a)*weather.wind_speed_10m,Math.cos(a)*weather.wind_speed_10m);}
    radar+=(+(mode===1)-radar)*Math.min(1,dt*6);calendar+=(+(mode===2)-calendar)*Math.min(1,dt*6);if(reduced){radar=+(mode===1);calendar=+(mode===2);}U.uRadarMode.value=radar;U.uCalendarMode.value=calendar;
    if(tour){tourTime+=dt;tourPose(tourTime,tour,pose);if(!reduced||pose.scene!==lastScene)ctx.pose(pose);if(pose.scene!==lastScene){lastScene=pose.scene;setMode([0,0,1,0,2][lastScene]);subtitle.replaceChildren(Object.assign(document.createElement('strong'),{textContent:TOUR_TEXT[lastScene][0]}),Object.assign(document.createElement('span'),{textContent:TOUR_TEXT[lastScene][1]}));if(lastScene===3)ctx.selectAt(tour[0],tour[1]);}if(tourTime>=60)stopTour();}
    stars.position.copy(camera.position);stars.material.opacity=(astronomy?Math.max(0,1-astronomy.fraction/.15):0)*sky.state.night*(1-(weatherOn&&weather?weather.cloud_cover/100:sky.state.cloud))*.9*(1-radar);stars.visible=stars.material.opacity>.01;
    if(astronomy){moon.position.copy(camera.position).addScaledVector(moonDirection.fromArray(astronomy.moon),5500);moon.quaternion.copy(camera.quaternion);moonMat.uniforms.uPhase.value=astronomy.phase;moonMat.uniforms.uAngle.value=astronomy.angle;moonMat.uniforms.uOpacity.value=(1-radar)*(1-sky.state.cloud*.8);moon.visible=astronomy.moonElevation>0&&sky.state.night>.01;}
  }
  function renderState(){const optical=radar<.98;sky.sky.visible=optical;clouds.mesh.visible=optical;clouds.mist.visible=optical&&sky.state.mist>.02;world.atmo.group.visible=optical;world.atmo.dome.visible=optical&&world.atmo.dome.visible;scene.background=radar>.98?radarBackground:null;}
  return {update,renderState,recorder,setMode,startTour,stopTour,get slow(){return 1;},get state(){return {mode,radar,calendar,pass,weather,weatherOn,astronomy,tour:!!tour,tourTime,recording:recorder.state};}};
}
