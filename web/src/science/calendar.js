import {createSeasonSound} from '../audio/seasonSound.js';
import {referenceData} from './referenceData.js';
import {pageReady,pageError,openCalendarMap} from './referencePage.js';
import {waterCalendar,calendarColor,calendarMapQuery} from './calendarModel.js';
import {fmtDate} from '../map/contract.js';
const pct=v=>Math.round(v*100)+'%';
let exportData=null;
async function start(){
  const {site,data}=await referenceData(['meta.json','cells.geojson','series.json','places.geojson','summary.json']);
  const acq=data['meta.json'].acquisitions,rows=waterCalendar(data['cells.geojson'],data['series.json'],acq,data['places.geojson']);
  document.documentElement.style.setProperty('--calendar-pass-count',String(acq.length));
  pageReady(site);
document.querySelector('#calendar-title').textContent=site.name;
  document.querySelector('#calendar-summary').textContent=`${rows.length} hamlet groups, ${acq.length} observations. ${fmtDate(acq[0].date_local)} to ${fmtDate(acq.at(-1).date_local)}. Ordered by first water observation.`;
  if(!new URLSearchParams(location.search).has('preview')){
   const summary=data['summary.json'],sound=createSeasonSound({passes:summary.passes,totalHa:summary.totals.area_ha}),bar=document.createElement('section');bar.className='calendar-audio';bar.setAttribute('aria-label','Season playback');
   const play=document.createElement('button'),readout=document.createElement('output');play.type='button';play.textContent='Play the season';play.setAttribute('aria-pressed','false');readout.textContent='Sound follows observed water area';bar.append(play,readout);sound.mount(bar);const key=document.createElement('small');key.className='calendar-sound-key';key.textContent='More tones mean more observed water.';bar.append(key);document.querySelector('#calendar-summary').after(bar);let timer=0,index=0;
   const stop=()=>{clearInterval(timer);timer=0;sound.stop();play.textContent='Play the season';play.setAttribute('aria-pressed','false');};
   const step=()=>{readout.textContent=fmtDate(acq[index].date_local);sound.play(index);document.querySelectorAll('.calendar-cell').forEach(b=>b.classList.toggle('is-listening',+b.dataset.pass===index));index++;};
   play.onclick=()=>{if(timer){stop();return;}index=0;play.textContent='Pause';play.setAttribute('aria-pressed','true');step();timer=setInterval(()=>{if(index===acq.length)stop();else step();},1500);};
   document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});addEventListener('pagehide',stop);addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.channel==='flood-reference'&&e.data.type==='active'&&!e.data.active)stop();});
  }
  const table=document.querySelector('#calendar-table'),thead=table.createTHead(),head=thead.insertRow();
  const th=(row,text,scope)=>{const el=document.createElement('th');el.scope=scope;el.textContent=text;row.append(el);return el;};
  th(head,'Nearest hamlet','col');
  for(const a of acq){const cell=th(head,'','col');const date=document.createElement('span'),track=document.createElement('small');date.textContent=fmtDate(a.date_local).replace(/ 20\d\d$/,'');track.textContent=a.track;cell.append(date,track);cell.title=fmtDate(a.date_local)+' '+a.track;}
  const body=table.createTBody(),buttons=[];
  const inspect=(row,v,i)=>{document.querySelector('#calendar-detail').textContent=`${row.name}, ${fmtDate(acq[i].date_local)}, track ${acq[i].track}. ${v.display?pct(v.ratio)+' of observed blocks have water.':'Water percentage withheld because coverage is below 50%.'} ${v.valid} of ${v.total} blocks observed (${pct(v.coverage)} coverage).`;};
  rows.forEach((row,r)=>{const tr=body.insertRow(),label=th(tr,row.name,'row'),count=document.createElement('small');count.textContent=row.total+' blocks';label.title=count.textContent;
    row.values.forEach((v,i)=>{const td=tr.insertCell(),button=document.createElement('button');button.type='button';button.tabIndex=buttons.length? -1:0;button.dataset.row=r;button.dataset.pass=i;button.className='calendar-cell'+(v.display?'':' is-missing');button.textContent=v.display?pct(v.ratio):'—';
      if(v.display){button.style.background=calendarColor(v);button.style.color=v.ratio<.2?'#EEF0EC':'#1B211F';}
      const desc=`${row.name}, ${fmtDate(acq[i].date_local)}, track ${acq[i].track}. ${v.display?pct(v.ratio)+' water among observed blocks':'Insufficient coverage'}. ${v.valid} of ${v.total} blocks observed. Open this observation in the map.`;
      button.setAttribute('aria-label',desc);button.title=desc;
      button.onfocus=()=>{buttons.forEach(b=>b.tabIndex=-1);button.tabIndex=0;inspect(row,v,i);};button.onpointerenter=()=>inspect(row,v,i);
      button.onclick=()=>openCalendarMap(calendarMapQuery(site.id,i,row.name));td.append(button);buttons.push(button);
    });
  });
  table.onkeydown=e=>{const index=buttons.indexOf(e.target);if(index<0)return;let next=index;
    if(e.key==='ArrowRight')next=Math.min(buttons.length-1,index+1);else if(e.key==='ArrowLeft')next=Math.max(0,index-1);else if(e.key==='ArrowDown')next=Math.min(buttons.length-1,index+acq.length);else if(e.key==='ArrowUp')next=Math.max(0,index-acq.length);else if(e.key==='Home')next=e.ctrlKey?0:Math.floor(index/acq.length)*acq.length;else if(e.key==='End')next=e.ctrlKey?buttons.length-1:Math.floor(index/acq.length)*acq.length+acq.length-1;else return;
    e.preventDefault();buttons[next].focus();};
  inspect(rows[0],rows[0].values[0],0);exportData={site,rows,acq};document.querySelector('#save-calendar').disabled=false;document.querySelector('#page-status').hidden=true;
}
document.querySelector('#save-calendar').onclick=async()=>{
  if(!exportData)return;await document.fonts.ready;const {site,rows,acq}=exportData,w=192+acq.length*48,h=184+rows.length*29,canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;const g=canvas.getContext('2d');g.scale(2,2);g.fillStyle='#EEF0EC';g.fillRect(0,0,w,h);g.fillStyle='#1B211F';g.font='30px Newsreader';g.fillText('Flood Calendar, '+site.name,24,40);g.font='11px "IBM Plex Sans"';g.fillText(fmtDate(acq[0].date_local)+' to '+fmtDate(acq.at(-1).date_local)+'. Water among observed blocks. Hatched cells have less than 50% coverage.',24,64);
  acq.forEach((a,i)=>{g.fillText(fmtDate(a.date_local).replace(/ 20\d\d$/,''),190+i*48,92);g.fillText(a.track,190+i*48,106);});
  rows.forEach((row,r)=>{const y=119+r*29;g.fillStyle='#1B211F';g.font='12px "IBM Plex Sans"';g.fillText(row.name,24,y+18);row.values.forEach((v,i)=>{const x=188+i*48;g.fillStyle=calendarColor(v)||'#D7DCD5';g.fillRect(x,y,44,25);if(!v.display){g.save();g.beginPath();g.rect(x,y,44,25);g.clip();g.strokeStyle='#59615E';for(let k=-25;k<44;k+=7){g.beginPath();g.moveTo(x+k,y+25);g.lineTo(x+k+25,y);g.stroke();}g.restore();}g.fillStyle=v.display&&v.ratio<.2?'#EEF0EC':'#1B211F';g.textAlign='center';g.fillText(v.display?pct(v.ratio):'—',x+22,y+17);g.textAlign='left';});});
  g.fillStyle='#1B211F';g.font='10px "IBM Plex Sans"';g.fillText('Rows group blocks by nearest hamlet. They are not official boundaries.',24,h-28);g.fillText('Source: NISAR L2 GCOV (NASA/ISRO), ASF DAAC. Each column is one acquisition.',24,h-12);
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='flood-calendar-'+site.id+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});
};
start().catch(pageError);
