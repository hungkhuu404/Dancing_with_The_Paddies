// Shared display timing, independent of viewport size and unrelated to radar acquisition time.
export const ATLAS_SWEEP_PERIOD=11000;
export function atlasSweepGeometry(height){
  const trail=height*.24;
  return {trail,distance:height+trail,headOffset:trail*.03};
}
export function atlasSweepHit(y,height){
  const {distance,headOffset}=atlasSweepGeometry(height);
  return (y+headOffset)/distance*ATLAS_SWEEP_PERIOD;
}
