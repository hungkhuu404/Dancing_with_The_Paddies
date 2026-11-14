import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/vietnamese-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/vietnamese-600.css';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/vietnamese-400.css';
import './reference.css';
const embedded=parent!==window&&new URLSearchParams(location.search).get('embed')==='1';
document.body.classList.toggle('is-embedded',embedded);
document.body.classList.toggle('is-preview',new URLSearchParams(location.search).get('preview')==='1');
export const referenceSend=(type,detail={})=>{if(embedded)parent.postMessage({channel:'flood-reference',type,...detail},location.origin);};
export function pageReady(site){
  for(const node of document.querySelectorAll('[data-site]'))node.textContent=site.name;
  for(const link of document.querySelectorAll('[data-site-link]')){const u=new URL(link.href);u.searchParams.set('site',site.id);if(embedded)u.searchParams.set('embed','1');link.href=u;}
  document.querySelector('[data-back]').onclick=e=>{if(embedded){e.preventDefault();referenceSend('close');}};
  addEventListener('keydown',e=>{if(embedded&&e.key==='Escape'){e.preventDefault();referenceSend('close');}});
  document.querySelector('[data-back]').textContent=embedded?'Back to exploration':'Explore the fields';
  for(const a of document.querySelectorAll('a[href]')){const u=new URL(a.href);if(u.origin!==location.origin){a.target='_blank';a.rel='noopener noreferrer';a.title='Opens the source in a new tab';}}
  document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!embedded||!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.hasAttribute('download'))return;const u=new URL(a.href);if(u.origin!==location.origin||a.hasAttribute('data-back'))return;if(u.pathname===location.pathname&&u.hash){e.preventDefault();document.getElementById(decodeURIComponent(u.hash.slice(1)))?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});history.replaceState(null,'',u);}else if(a.hasAttribute('data-site-link')){e.preventDefault();location.replace(u);}});
  referenceSend('ready',{title:document.title});
}
export function pageError(error){const el=document.querySelector('#page-status');el.hidden=false;el.setAttribute('role','alert');el.textContent=error.message+' No substitute observations are shown.';}
export function openCalendarMap(query){if(embedded)referenceSend('map',{query});else location.assign(import.meta.env.BASE_URL+'map/?'+query);}
