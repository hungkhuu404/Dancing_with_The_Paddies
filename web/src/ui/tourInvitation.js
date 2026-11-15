import {shouldInvite} from './tourRules.js';
import './tourExperience.css';
export function createTourInvitation({site,enabled,fixture=false,onStart,onExplore}){
 const key='flood-calendar-tour-invitation-'+site;let answered=false,seen=false;try{seen=sessionStorage.getItem(key)==='answered';}catch{}
 const eligible=shouldInvite({enabled,fixture,seen,search:location.search});
 const dialog=document.createElement('dialog');dialog.className='tour-invitation';dialog.setAttribute('aria-labelledby','tour-invitation-title');dialog.innerHTML='<p class="tour-eyebrow">Welcome to Tân Hội</p><h2 id="tour-invitation-title">Take a one-minute tour?</h2><p>See how radar follows the water through the season.</p><div class="tour-invitation-actions"><button type="button" class="tour-accept" autofocus>Start tour</button><button type="button" class="tour-decline">Explore on my own</button></div>';document.body.append(dialog);
 function answer(start){if(answered)return;answered=true;try{sessionStorage.setItem(key,'answered');}catch{}dialog.close();document.body.classList.remove('tour-invitation-open');if(start)onStart();else onExplore();}
 dialog.querySelector('.tour-accept').onclick=()=>answer(true);dialog.querySelector('.tour-decline').onclick=()=>answer(false);dialog.addEventListener('cancel',e=>{e.preventDefault();answer(false);});
 return {offer(){if(!eligible||answered||dialog.open)return false;if(document.querySelector('dialog[open]'))return false;dialog.showModal();document.body.classList.add('tour-invitation-open');return true;}};
}
