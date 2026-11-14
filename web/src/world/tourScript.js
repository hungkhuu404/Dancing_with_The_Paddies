// Three short, single-line captions per 12-second scene. No inferred water facts.
export const TOUR_SCRIPT = [
  ['After harvest in Tân Hội', 'Rice fields change with the season', 'Water observations tell their story'],
  ['Clouds can obscure the fields', 'Radar offers another view', 'It records the surface through cloud'],
  ['Smooth water often appears dark', 'Buildings and plants scatter differently', 'These responses are illustrated here'],
  ['Select a block to read its record', 'See when water arrived and how long it stayed', 'Dates are ranges between observations'],
  ['Compare the season across 24 hamlets', 'Each column is one satellite visit', 'Gaps remain visible in the water calendar'],
];
export const TOUR_NARRATION = TOUR_SCRIPT.map(lines=>lines.join('. ')+'.');
export function tourCaption(seconds,manifest=null) {
  const t=Math.max(0,Math.min(59.999,Number.isFinite(seconds)?seconds:0));
  const scene=Math.floor(t/12),offset=t%12,starts=manifest?.clips?.[scene]?.cue_starts;
  const valid=Array.isArray(starts)&&starts.length===3&&starts[0]===0&&starts.every((v,i)=>Number.isFinite(v)&&v>=0&&v<12&&(i===0||v>starts[i-1]));
  const cue=valid?(offset>=starts[2]?2:offset>=starts[1]?1:0):Math.floor(offset/4);
  return TOUR_SCRIPT[scene][cue];
}
