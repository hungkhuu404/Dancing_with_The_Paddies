const facing=glare=>Number.isFinite(glare)?Math.max(0,Math.min(1,glare)):0;
/** Preserve the accepted general grade while keeping direct sun glare mild. */
export function glareBloom(glare,enabled=true){return enabled?.6*(1-.94*facing(glare)):0;}
export function glareExposure(base,glare){return base*(1-.55*facing(glare));}
