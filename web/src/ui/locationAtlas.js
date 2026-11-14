import * as THREE from 'three';
import {atlasPoint,publishedSite} from './entryRules.js';
import {escapeHTML as esc} from '../map/presentation.js';
import {dateRange} from './blockSummary.js';

const BASE=import.meta.env.BASE_URL;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const fetchJSON=async path=>{const r=await fetch(BASE+path);if(!r.ok)throw Error(`Could not load ${path}`);return r.json();};

export async function createLocationAtlas({choose,back}){
  const root=document.createElement('section');root.className='location-atlas';root.setAttribute('aria-labelledby','atlas-title');
  root.innerHTML=`<canvas class="atlas-canvas" aria-hidden="true"></canvas><div class="atlas-markers"></div>
    <div class="atlas-copy"><p class="atlas-eyebrow">NISAR observations</p><h1 id="atlas-title">Choose a<br> location.</h1><p class="atlas-lede">Follow the water through the rice season.</p></div>
    <div class="atlas-locations" aria-label="Study locations"><p class="atlas-fetch" role="status">Reading available locations</p></div>
    <div class="atlas-heading"><span>Southeast Asia</span><span class="atlas-north" aria-label="North">N <i>↑</i></span></div>
    <div class="atlas-flight-status" role="status" hidden><span class="atlas-status-text">Preparing the landscape</span><button type="button" class="atlas-cancel">Back</button></div>
    <button type="button" class="atlas-resume" hidden>Continue exploring</button>
    <footer class="atlas-credit"><span>Geographic overview</span><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Natural Earth</a></footer>`;
  document.body.append(root);
  const markers=root.querySelector('.atlas-markers'),cards=root.querySelector('.atlas-locations'),status=root.querySelector('.atlas-flight-status');
  let visible=true,flight=false,cancelled=false,flightSkipped=false,choiceRevision=0,frame=0,renderer=null,camera=null,scene=null;
  const target=new THREE.Vector3(),view=new THREE.Vector3(0,0,0),projected=new THREE.Vector3();
  const northA=new THREE.Vector3(),northB=new THREE.Vector3();
  const pointer={x:0,y:0,sx:0,sy:0};
  const normalPosition=new THREE.Vector3(10,19,20),normalTarget=new THREE.Vector3(0,0,-.5);
  let dataset=null,locations=[],lastFrame=0;
  root.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!flight){pointer.x=(e.clientX/innerWidth-.5)*.8;pointer.y=(e.clientY/innerHeight-.5)*.6;}});
  root.addEventListener('pointerleave',()=>{pointer.x=pointer.y=0;});
  const statusText=root.querySelector('.atlas-status-text');
  root.querySelector('.atlas-cancel').onclick=()=>{cancelled=true;choiceRevision++;flight=false;root.classList.remove('is-preparing');root.setAttribute('aria-busy','false');status.hidden=true;};
  root.querySelector('.atlas-resume').onclick=back;
  function message(text){statusText.textContent=text;}
  function startChoice(location){
    if(flight)return;flight=true;cancelled=false;const revision=++choiceRevision;root.classList.add('is-preparing');root.setAttribute('aria-busy','true');status.hidden=false;message('Preparing '+location.name);
    const isCancelled=()=>cancelled||revision!==choiceRevision;
    choose(location,{cancelled:isCancelled,fly:()=>isCancelled()?Promise.resolve(false):fly(location),message}).catch(error=>{
      if(isCancelled())return;
      flight=false;root.classList.remove('is-preparing');root.setAttribute('aria-busy','false');message('Landscape unavailable.');if(!status.querySelector('.atlas-map-fallback')){const a=document.createElement('a');a.href=BASE+'map/?site='+encodeURIComponent(location.id);a.textContent='Open observation map';a.className='atlas-map-fallback';status.append(a);}
    });
  }
  try{
    const [registry,geography]=await Promise.all([fetchJSON('data/sites.json'),fetchJSON('atlas/region.json').catch(()=>null)]);dataset=geography;
    const published=await Promise.all(registry.sites.map(async site=>({site,meta:await fetchJSON(`data/${site.id}/meta.json`).catch(()=>null)})));
    locations=published.map(({site,meta})=>({...site,available:publishedSite(site,meta),meta}));
    if(!locations.some(l=>l.id==='bang_rakam'))locations.push({id:'bang_rakam',name:'Bang Rakam',region:'Thailand',center:[100.12,16.75],available:false});
    cards.innerHTML=locations.map(l=>l.available?`<button type="button" class="atlas-location" data-location="${esc(l.id)}"><span class="atlas-location-name">${esc(l.name)}</span><span class="atlas-location-arrow" aria-hidden="true">↗</span><span class="atlas-location-region">${esc(l.region||'')}</span><span class="atlas-location-record">${l.meta.acquisitions.length} observations <span>${dateRange(l.meta.acquisitions[0].date_local,l.meta.acquisitions.at(-1).date_local)}</span></span></button>`:`<article class="atlas-location is-pending"><span class="atlas-location-name">${esc(l.name)}</span><span class="atlas-pending-label">Data pending</span><span class="atlas-location-region">${esc(l.region||'')}</span></article>`).join('');
    locations.forEach(l=>{
      const el=document.createElement(l.available?'button':'div');el.className='atlas-pin'+(l.available?'':' is-pending');
      el.innerHTML=`<i aria-hidden="true"></i><span>${esc(l.name)}<small>${l.available?'Explore':'Data pending'}</small></span>`;
      if(l.available){el.type='button';el.setAttribute('aria-label','Explore '+l.name);el.onclick=()=>startChoice(l);cards.querySelector(`[data-location="${l.id}"]`).onclick=()=>startChoice(l);}
      markers.append(el);l.element=el;l.point=atlasPoint(...l.center);l.lastX=l.lastY=NaN;
    });
  }catch(error){cards.innerHTML=`<p class="atlas-error" role="alert">${esc(error.message)}. No substitute observations are available.</p><a class="atlas-location" href="${BASE}map/">Open observation map</a>`;}

  if(dataset){
    try{
      renderer=new THREE.WebGLRenderer({canvas:root.querySelector('canvas'),alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#102529',1);
      scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#102529',.012);
      camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,300);camera.position.copy(normalPosition);camera.lookAt(normalTarget);
      scene.add(new THREE.HemisphereLight('#eff2df','#233c36',2.2));const sun=new THREE.DirectionalLight('#fff1d0',3);sun.position.set(-8,14,6);scene.add(sun);
      const landTop=new THREE.MeshStandardMaterial({color:'#9DAE8C',roughness:.87,metalness:0});
      const landSide=new THREE.MeshStandardMaterial({color:'#536651',roughness:1});
      const coastPositions=[];
      for(const polygon of dataset.land){
        const shape=new THREE.Shape();polygon[0].forEach((p,i)=>{const [x,z]=atlasPoint(...p);i?shape.lineTo(x,-z):shape.moveTo(x,-z);});
        for(const ring of polygon.slice(1)){const hole=new THREE.Path();ring.forEach((p,i)=>{const [x,z]=atlasPoint(...p);i?hole.lineTo(x,-z):hole.moveTo(x,-z);});shape.holes.push(hole);}
        const geometry=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false,steps:1,curveSegments:1});geometry.rotateX(-Math.PI/2);
        scene.add(new THREE.Mesh(geometry,[landTop,landSide]));
        for(let i=1;i<polygon[0].length;i++){for(const p of [polygon[0][i-1],polygon[0][i]]){const [x,z]=atlasPoint(...p);coastPositions.push(x,.17,z);}}
      }
      const line=(points,color,opacity)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));const m=new THREE.LineBasicMaterial({color,transparent:true,opacity});const o=new THREE.LineSegments(g,m);scene.add(o);return o;};
      line(coastPositions,'#dae0be',.5);
      const riverPositions=[];for(const river of dataset.rivers)for(let i=1;i<river.length;i++)for(const p of [river[i-1],river[i]]){const [x,z]=atlasPoint(...p);riverPositions.push(x,.175,z);}
      line(riverPositions,'#477E85',.9);
      const grid=[];for(let lon=95;lon<=112;lon+=5){const [x]=atlasPoint(lon,14);grid.push(x,-.05,-10,x,-.05,9);}for(let lat=5;lat<=24;lat+=5){const [,z]=atlasPoint(103.5,lat);grid.push(-9,-.05,z,9,-.05,z);}line(grid,'#53706c',.16);
      const sea=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:'#143338',roughness:.56,metalness:.1}));sea.rotation.x=-Math.PI/2;sea.position.y=-.12;scene.add(sea);
      for(const l of locations){
        const peg=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.55,10),new THREE.MeshBasicMaterial({color:l.available?'#EDB65A':'#8caaa1'}));peg.position.set(l.point[0],.43,l.point[1]);scene.add(peg);
        const ring=new THREE.Mesh(new THREE.RingGeometry(.11,.15,32),new THREE.MeshBasicMaterial({color:l.available?'#EDB65A':'#829a91',side:THREE.DoubleSide,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;ring.position.set(l.point[0],.18,l.point[1]);scene.add(ring);
      }
    }catch{renderer?.dispose();renderer=null;}
    if(!renderer){
      root.classList.add('atlas-flat');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('atlas-fallback');svg.setAttribute('viewBox','0 0 17 19');svg.setAttribute('aria-hidden','true');
      for(const p of dataset.land){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',p.map(r=>'M'+r.map(v=>`${v[0]-95},${24-v[1]}`).join('L')+'Z').join(''));svg.append(path);}root.querySelector('canvas').replaceWith(svg);
    }
  }
  function positionLabels(){
    if(!camera)return;
    northA.copy(normalTarget).project(camera);northB.copy(normalTarget);northB.z-=1;northB.project(camera);
    root.querySelector('.atlas-north i').style.transform=`rotate(${Math.atan2(northB.x-northA.x,northB.y-northA.y)}rad)`;
    for(const l of locations){projected.set(l.point[0],.75,l.point[1]).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
      if(Math.abs(x-l.lastX)>.25||Math.abs(y-l.lastY)>.25||!Number.isFinite(l.lastX)){l.element.style.transform=`translate(${x}px,${y}px)`;l.lastX=x;l.lastY=y;}
    }
  }
  function resize(){
    normalPosition.set(10,19,20);if(innerWidth<=760&&innerHeight>500)normalPosition.multiplyScalar(1.4);
    if(renderer){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.clearViewOffset();if(innerWidth>760||innerHeight<=500)camera.setViewOffset(innerWidth,innerHeight,-innerWidth*.13,0,innerWidth,innerHeight);camera.position.copy(normalPosition);camera.updateProjectionMatrix();camera.lookAt(normalTarget);positionLabels();render();}
    else{
      const svg=root.querySelector('.atlas-fallback'),s=svg?getComputedStyle(svg):null;
      const left=s?parseFloat(s.paddingLeft):0,top=s?parseFloat(s.paddingTop):0;
      const width=innerWidth-left-(s?parseFloat(s.paddingRight):0),height=innerHeight-top-(s?parseFloat(s.paddingBottom):0),scale=Math.min(width/17,height/19);
      for(const l of locations)l.element.style.transform=`translate(${left+(width-17*scale)/2+(l.center[0]-95)*scale}px,${top+(height-19*scale)/2+(24-l.center[1])*scale}px)`;
    }
  }
  function render(){if(renderer&&visible){camera.updateMatrixWorld();renderer.render(scene,camera);positionLabels();}}
  let flyStarted=0;
  const flyPosition=new THREE.Vector3(),flyTarget=new THREE.Vector3();
  function loop(now){
    if(!visible)return;
    if(reduced()){render();frame=0;return;}
    frame=requestAnimationFrame(loop);
    if(flyStarted)return;
    const interval=1000/60;if(now-lastFrame<interval)return;lastFrame=now-(now-lastFrame)%interval;
    if(!flyStarted&&!reduced()){
      pointer.sx+=(pointer.x-pointer.sx)*.06;pointer.sy+=(pointer.y-pointer.sy)*.06;
      const drift=Math.sin(now*.00015)*.14;camera?.position.set(normalPosition.x+drift+pointer.sx,normalPosition.y+pointer.sy,normalPosition.z);camera?.lookAt(normalTarget);
    }
    render();
  }
  async function fly(location){
    if(cancelled)return false;
    root.classList.add('is-flying');root.querySelector('.atlas-cancel').hidden=true;
    if(!renderer||reduced())return true;
    const to=new THREE.Vector3(location.point[0],.18,location.point[1]),destination=to.clone().add(new THREE.Vector3(1.4,2.6,3.5));flyPosition.copy(camera.position);flyTarget.copy(normalTarget);flyStarted=performance.now();flightSkipped=false;
    return new Promise(resolve=>{const step=now=>{if(cancelled||flightSkipped){flyStarted=0;resolve(!cancelled);return;}const t=Math.min(1,(now-flyStarted)/1450),q=t*t*(3-2*t);
      target.lerpVectors(flyTarget,to,q);camera.position.lerpVectors(flyPosition,destination,q);camera.fov=36-5*q;camera.lookAt(target);camera.updateProjectionMatrix();render();
      if(t<1)requestAnimationFrame(step);else resolve(true);
    };requestAnimationFrame(step);});
  }
  function show(returning=false){visible=true;flight=false;cancelled=false;flyStarted=0;root.hidden=false;root.setAttribute('aria-busy','false');root.classList.remove('is-flying','is-preparing','is-leaving');status.hidden=true;root.querySelector('.atlas-cancel').hidden=false;root.querySelector('.atlas-resume').hidden=!returning;if(camera){camera.position.copy(normalPosition);camera.fov=36;}resize();cancelAnimationFrame(frame);frame=requestAnimationFrame(loop);cards.querySelector('button')?.focus({preventScroll:true});}
  function hide(){visible=false;cancelled=true;choiceRevision++;cancelAnimationFrame(frame);root.hidden=true;}
  addEventListener('resize',resize);show(false);
  return {root,locations,show,hide,message,skipFlight(){flightSkipped=true;},async leave(instant=false){root.classList.add('is-leaving');if(!instant&&!reduced())await new Promise(r=>setTimeout(r,650));hide();},get cancelled(){return cancelled;},get ready(){return !!renderer;}};
}
