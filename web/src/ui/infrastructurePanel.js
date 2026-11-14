/** Keyboard-accessible counterpart of the physical bridge signs. Names are source text, never HTML. */
export function createInfrastructurePanel(source,go){
  const root=document.createElement('details');root.className='infrastructure-panel';root.id='infrastructure-panel';
  root.innerHTML='<summary>Places</summary><label for="bridge-select">Named bridges</label><select id="bridge-select"><option value="">Choose a bridge</option></select><p id="infrastructure-name" aria-live="polite"></p><p class="infrastructure-note">Positions and names: OpenStreetMap. Architecture, traffic and irrigation are illustrative; no measured depth or gate operation.</p><a id="infrastructure-source" target="_blank" rel="noopener noreferrer" hidden>View OpenStreetMap source</a>';
  document.body.append(root);const select=root.querySelector('select'),name=root.querySelector('#infrastructure-name'),link=root.querySelector('a');
  const landmarkLabel=document.createElement('label');landmarkLabel.htmlFor='landmark-select';landmarkLabel.textContent='Churches and landmarks';const landmarks=document.createElement('select');landmarks.id='landmark-select';const empty=document.createElement('option');empty.value='';empty.textContent='Choose a landmark';landmarks.append(empty);select.after(landmarkLabel,landmarks);
  for(const p of source.buildings.filter(p=>p.name)){const option=document.createElement('option');option.value=p.osm_id;option.textContent=p.name+(p.in_commune?'':' (nearby)');landmarks.append(option);}
  const bridges=[...source.bridges].sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  for(const p of bridges){const option=document.createElement('option');option.value=p.osm_id;option.textContent=p.name;select.append(option);}
  function show(p,travel=false){if(!p)return;root.open=true;name.textContent=p.name;select.value=p.osm_id;landmarks.value=p.osm_id;link.href='https://www.openstreetmap.org/'+p.osm_id;link.hidden=false;if(travel)go(p);}
  select.addEventListener('change',()=>show(bridges.find(p=>p.osm_id===select.value),true));
  landmarks.addEventListener('change',()=>show(source.buildings.find(p=>p.osm_id===landmarks.value),true));
  return {root,show,bridges};
}
