export function frameBudget(tier,distance,height,riding=false){
 const low=tier==='low';
 return {shadowEvery:low?4:distance<250?1:2,mirror:riding||height<(low?170:700),mirrorEvery:low?4:distance<250?1:2};
}
