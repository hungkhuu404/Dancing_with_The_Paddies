// Shared map geometry for the geographic overview. Units are display units, never terrain height.
export function atlasLayout(bounds){
  const [west,south,east,north]=bounds;
  const scale=40,cos=Math.cos(14*Math.PI/180);
  return {width:(east-west)*cos*scale,height:(north-south)*scale,
    point(lon,lat){return [(lon-west)*cos*scale,(north-lat)*scale];}};
}
export function atlasPath(lines,layout,close=false){
  return lines.map(line=>'M'+line.map(p=>layout.point(...p).map(v=>v.toFixed(2)).join(',')).join('L')+(close?'Z':'')).join('');
}
