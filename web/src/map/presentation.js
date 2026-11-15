// Presentation state only. Data-contract water metrics remain authoritative.
export const MODES = ['status', 'onset', 'duration'];
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function boundedPass(value, count) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < count ? n : Math.max(0, count - 1);
}
export function readView(search, count) {
  const q = new URLSearchParams(search);
  return {mode: MODES.includes(q.get('layer')) ? q.get('layer') : 'status',
    scope: q.get('scope') === 'image' ? 'image' : 'season', pass: boundedPass(q.get('pass') ?? NaN, count),
    cell: q.get('cell') || null};
}
export function observationAt(s = '', pass = 0) {
  const index = Math.min(pass, s.length - 1);
  for (let i = index; i >= 0; i--) if (s[i] === 'W' || s[i] === 'N') {
    return {state:s[i], index:i, carried:i !== index, missing:s[index] === '-'};
  }
  return {state:'-', index:-1, carried:false, missing:true};
}
export function observationAreas(records, pass, cellHa) {
  const area = {W:0, N:0, '-':0, carried:0};
  for (const s of records) {
    const o = observationAt(s, pass); area[o.state] += cellHa;
    if (o.carried) area.carried += cellHa;
  }
  return area;
}
export function viewParams(state, site) {
  const q = new URLSearchParams({site, layer:state.mode, scope:state.scope, pass:String(state.pass)});
  if (state.cell) q.set('cell', state.cell);
  return q;
}
export function sceneCellCentre(id, origin) {
  const m = /^E(\d+)N(\d+)$/.exec(id || '');
  if (!m) return null;
  return {x:Number(m[1]) + 125 - origin.utm_e, z:origin.utm_n - Number(m[2]) - 125};
}
