// Preserve the exact accessibility state of controls while their opacity fades.
export function createTourFocus(){
 let saved=[],origin=null,active=false,cardInert=false;
 const card=()=>document.querySelector('#card');
 return {enter(){if(active)return;active=true;origin=document.activeElement;cardInert=card()?.inert||false;if(card())card().inert=true;
 saved=[...document.querySelectorAll('#ui > :not(#card),.landscape-guide-toggle,.quick-guide,#lens-label,.lens-handle')].map(node=>({node,inert:node.inert,aria:node.getAttribute('aria-hidden')}));
 for(const {node}of saved){node.inert=true;node.setAttribute('aria-hidden','true');node.classList.add('tour-muted');}document.body.classList.add('tour-focus');queueMicrotask(()=>document.querySelector('.tour-stop')?.focus({preventScroll:true}));},
 record(show){document.body.classList.toggle('tour-show-record',!!show);if(card())card().inert=!show;},
 exit(){if(!active)return;active=false;for(const {node,inert,aria}of saved){node.inert=inert;if(aria===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',aria);node.classList.remove('tour-muted');}saved=[];if(card())card().inert=cardInert;document.body.classList.remove('tour-focus','tour-show-record');const target=origin?.isConnected&&origin.getClientRects().length?origin:document.querySelector('#tour-start');target?.focus({preventScroll:true});}
 };
}
