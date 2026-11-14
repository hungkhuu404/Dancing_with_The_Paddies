export async function referenceData(files){
  const base=import.meta.env.BASE_URL+'data/';
  const get=async name=>{const r=await fetch(base+name);if(!r.ok)throw Error('Published observations could not be loaded.');return r.json();};
  const registry=await get('sites.json'),id=new URLSearchParams(location.search).get('site');
  const site=id?registry.sites.find(s=>s.id===id):registry.sites.find(s=>s.default)||registry.sites[0];
  if(!site||!/^[a-z0-9_]+$/.test(site.id))throw Error('This location is not published.');
  const values=await Promise.all(files.map(f=>get(site.id+'/'+f))),data=Object.fromEntries(files.map((f,i)=>[f,values[i]]));
  if(data['meta.json']?.fixture)throw Error('Published observations are required.');
  return {site,data};
}
