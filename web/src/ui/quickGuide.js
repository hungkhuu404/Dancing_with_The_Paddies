import {icon} from './icons.js';
import {enterDialog} from './motion.js';
import './quickGuide.css';
export function createQuickGuide({view='landscape',trigger,fixture=false}={}){
 const key='flood-calendar-guide-'+view;let seen=false;try{seen=localStorage.getItem(key)==='seen';}catch{}
 const panel=document.createElement('aside');panel.className='quick-guide';panel.hidden=true;panel.setAttribute('aria-label','Quick guide');
 const title=view==='map'?'Read the water record':'Start with the fields';
 const lines=view==='map'?['Select a block to see when water arrived and receded.','Change the date to compare observations.','Arrival and Duration show the full-season record.']:['Choose Guided tour for a one-minute introduction.','Select a field to read its water record.','Press Play to watch and hear the season change.'];
 panel.innerHTML='<button type="button" class="guide-close" aria-label="Dismiss quick guide">×</button><h2>'+title+'</h2><ul>'+lines.map(s=>'<li>'+s+'</li>').join('')+'</ul><p>'+(fixture?'Water data is pending. This landscape is illustrative.':'More tones mean more observed water. Use the speaker to mute.')+'</p>';
 document.body.append(panel);
 const own=!trigger;if(own){trigger=document.createElement('button');trigger.type='button';trigger.className='quick-guide-toggle';document.body.append(trigger);}trigger.innerHTML=icon('help');trigger.setAttribute('aria-label','Show quick guide');trigger.title='Quick guide';trigger.setAttribute('aria-expanded','false');
 function close(){panel.hidden=true;trigger.setAttribute('aria-expanded','false');try{localStorage.setItem(key,'seen');}catch{}}
 trigger.onclick=()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));};panel.querySelector('button').onclick=()=>{close();trigger.focus({preventScroll:true});};
 if(view==='landscape'&&document.querySelector('#help-dialog')){const all=document.createElement('button');all.type='button';all.className='guide-all';all.textContent='All controls';all.onclick=()=>{close();enterDialog(document.querySelector('#help-dialog'));};panel.append(all);}
 addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden&&!panel.inert){e.preventDefault();e.stopPropagation();close();trigger.focus({preventScroll:true});}},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)panel.hidden=true;});
 return {showOnce(){if(!seen){panel.hidden=false;trigger.setAttribute('aria-expanded','true');seen=true;try{localStorage.setItem(key,'seen');}catch{}}},close};
}
