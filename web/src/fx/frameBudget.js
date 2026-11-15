// Shared immutable policies: no object allocation in the animation loop.
const pair=(shadowEvery,mirrorEvery)=>[false,true].map(mirror=>Object.freeze({shadowEvery,mirror,mirrorEvery}));
const low=pair(4,4),near=pair(1,1),far=pair(2,2);
export function frameBudget(tier,distance,height,riding=false){
 const light=tier==='low',mirror=riding||height<(light?170:700);
 return (light?low:distance<250?near:far)[mirror?1:0];
}
