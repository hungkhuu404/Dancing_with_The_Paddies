import './atlasSweep.css';

/** A decorative scan over the existing geography, never an observation/data layer. */
export function atlasSweep({width,height,land,coasts,rivers}){
  const trail=height*.24,distance=height+trail;
  return `<g class="atlas-sweep" aria-hidden="true" style="--atlas-sweep-distance:${distance}px">
    <defs>
      <linearGradient id="atlas-sweep-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="white" stop-opacity="0"/>
        <stop offset=".25" stop-color="white" stop-opacity=".04"/>
        <stop offset=".6" stop-color="white" stop-opacity=".22"/>
        <stop offset=".85" stop-color="white" stop-opacity=".65"/>
        <stop offset=".97" stop-color="white" stop-opacity="1"/>
        <stop offset="1" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="atlas-sweep-line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#bce8d8" stop-opacity="0"/>
        <stop offset=".18" stop-color="#bce8d8" stop-opacity=".24"/>
        <stop offset=".5" stop-color="#d8f4e9" stop-opacity=".55"/>
        <stop offset=".82" stop-color="#bce8d8" stop-opacity=".24"/>
        <stop offset="1" stop-color="#bce8d8" stop-opacity="0"/>
      </linearGradient>
      <filter id="atlas-sweep-glow" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">
        <feGaussianBlur stdDeviation="2"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <mask id="atlas-sweep-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:alpha">
        <rect class="atlas-sweep-motion" x="0" y="${-trail}" width="${width}" height="${trail}" fill="url(#atlas-sweep-fade)"/>
      </mask>
    </defs>
    <g mask="url(#atlas-sweep-mask)">
      <path class="atlas-sweep-land" fill-rule="evenodd" d="${land}"/>
      <path class="atlas-sweep-coasts" filter="url(#atlas-sweep-glow)" d="${coasts}"/>
      <path class="atlas-sweep-rivers" d="${rivers}"/>
    </g>
    <g class="atlas-sweep-motion">
      <rect x="0" y="${-trail*.03}" width="${width}" height="2" fill="url(#atlas-sweep-line)"/>
    </g>
  </g>`;
}
