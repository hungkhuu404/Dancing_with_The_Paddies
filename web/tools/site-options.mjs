import {siteProfile,siteBounds} from '../src/data/siteRules.js';
export function siteOptions(argv=process.argv.slice(2)){
  if(argv.filter(v=>v==='--site').length>1)throw Error('Supply --site once');
  const i=argv.indexOf('--site');if(i>=0&&(!argv[i+1]||argv[i+1].startsWith('--')))throw Error('--site needs an id');
  const args=argv.filter((_,j)=>i<0||j!==i&&j!==i+1),profile=siteProfile(i<0?undefined:argv[i+1]);
  return {profile,args,bounds:siteBounds(profile),sceneURL:new URL('../public/'+profile.scene.base,import.meta.url)};
}
