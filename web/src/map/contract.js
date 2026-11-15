// Pure helpers for the data contract (docs/data-contract.md). No DOM, no MapLibre:
// used by the map page, the fixture generator and the node tests.

export const CELL_HA = 6.25;
const DAY = 86400000;
export const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

// Per-cell indicators from the filtered state string s (W / N / '-') and meta.acquisitions.
export function cellMetrics(s, acq) {
  const valid = [];
  for (let i = 0; i < s.length; i++) if (s[i] !== '-') valid.push(i);
  const date = (i) => acq[i].date_local;
  const tracks = new Set(valid.map((i) => acq[i].track));
  let maxGap = 0;
  for (let k = 1; k < valid.length; k++) maxGap = Math.max(maxGap, daysBetween(date(valid[k - 1]), date(valid[k])));
  const base = {
    n_obs: valid.length, n_tracks: tracks.size, max_gap_days: valid.length > 1 ? maxGap : null,
    last_obs_local: valid.length ? date(valid[valid.length - 1]) : null,
    onset_after_local: null, onset_by_local: null, end_after_local: null, end_by_local: null,
    flood_days_min: null, flood_days_max: null, ongoing: false, n_episodes: 0, status_confirmed: true,
  };
  // episodes = runs of consecutive valid W
  const eps = [];
  for (let k = 0; k < valid.length; k++) {
    if (s[valid[k]] !== 'W') continue;
    if (k > 0 && s[valid[k - 1]] === 'W') eps[eps.length - 1].end = k; else eps.push({ start: k, end: k });
  }
  base.n_episodes = eps.length;
  if (valid.length >= 2) base.status_confirmed = s[valid[valid.length - 1]] === s[valid[valid.length - 2]];

  // status order: no_data, never_water, always_water, flooded, water_gone
  if (valid.length < 4) return { ...base, status: 'no_data' };
  if (!eps.length) return { ...base, status: 'never_water' };
  if (eps.length === 1 && eps[0].start === 0 && eps[0].end === valid.length - 1) return { ...base, status: 'always_water', ongoing: true };

  const main = eps[eps.length - 1]; // latest-starting episode
  const last = valid.length - 1;
  const ongoing = main.end === last;
  const onsetAfter = main.start > 0 ? date(valid[main.start - 1]) : null;
  const onsetBy = date(valid[main.start]);
  const endAfter = ongoing ? null : date(valid[main.end]);
  const endBy = ongoing ? null : date(valid[main.end + 1]);
  const lastDate = date(valid[last]);
  return {
    ...base,
    status: ongoing ? 'flooded' : 'water_gone', ongoing,
    onset_after_local: onsetAfter, onset_by_local: onsetBy, end_after_local: endAfter, end_by_local: endBy,
    flood_days_min: daysBetween(onsetBy, ongoing ? lastDate : endAfter),
    flood_days_max: onsetAfter ? daysBetween(onsetAfter, ongoing ? lastDate : endBy) : null,
  };
}

export function flagGt30(m, cropland) {
  if (!cropland || !['flooded', 'water_gone'].includes(m.status)) return 'na';
  if (m.flood_days_min > 30) return 'yes';
  if (m.ongoing || m.flood_days_max === null || m.flood_days_max > 30) return 'possible';
  return 'no';
}

// "As of pass i": latest valid state at or before i (summary asof_*).
export function stateAsOf(s, i) {
  for (let k = i; k >= 0; k--) if (s[k] !== '-') return s[k];
  return '-';
}

// Panel sentences. Dates and numbers always come from the data.
export function fmtDate(d) {
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number);
  return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}
// The radar can mark the start of flooding early on dry, flat fields.
export const ONSET_NOTE = 'Radar can date the start early on dry, flat fields.';
export function cellSentences(p) {
  const out = [];
  const dmin = p.flood_days_min === null ? null : Math.floor(p.flood_days_min);
  const dmax = p.flood_days_max === null ? null : Math.ceil(p.flood_days_max);
  const came = p.onset_after_local === null
    ? 'Water was already there in the first image.'
    : `Water came in between ${fmtDate(p.onset_after_local)} and ${fmtDate(p.onset_by_local)}.`;
  const under = (sofar) => (dmax === null ? `Under water at least ${dmin} days${sofar}.` : `Under water ${dmin} to ${dmax} days${sofar}.`);
  switch (p.status) {
    case 'flooded': out.push(came, under(' so far'), `Still there on ${fmtDate(p.last_obs_local)}.`); break;
    case 'water_gone': out.push(came, under(''), `Open water no longer seen since between ${fmtDate(p.end_after_local)} and ${fmtDate(p.end_by_local)}.`); break;
    case 'never_water': out.push(`No open water seen in ${p.n_obs} images.`); break;
    case 'always_water': out.push('Water in every image (canal, pond, or flooded all season).'); break;
    default: out.push(`Not enough images (${p.n_obs}).`);
  }
  if (p.status_confirmed === false && ['flooded', 'water_gone'].includes(p.status)) out.push('Seen in one image only, not yet confirmed.');
  if (p.onset_after_local !== null && ['flooded', 'water_gone'].includes(p.status)) out.push(ONSET_NOTE);
  return out;
}

// 5-step scales. Step 5 = brightest = earliest / longest.
export const STEPS = ['#047686', '#3593A3', '#58B0C0', '#8ACCD8', '#B9E8F1'];
export const COLORS = { water: '#3D9AAA', silt: '#EDB65A', missing: '#59615E', radar: '#1B211F', ink: '#E7ECE8' };

// Onset bins: each bin is a range of real pass dates. Splits the distinct onset_by dates into 5 groups.
export function onsetBins(cells) {
  const dates = [...new Set(cells.map((p) => p.onset_by_local).filter(Boolean))].sort();
  if (!dates.length) return [];
  const n = Math.min(5, dates.length);
  const bins = [];
  for (let b = 0; b < n; b++) {
    const lo = dates[Math.floor((b * dates.length) / n)], hi = dates[Math.floor(((b + 1) * dates.length) / n) - 1];
    bins.push({ from: lo, to: hi, color: STEPS[STEPS.length - 1 - b] });
  }
  return bins;
}
export const onsetColor = (bins, d) => (d ? (bins.find((b) => d >= b.from && d <= b.to) || {}).color : null);

// Duration bins (days). 30 days must be a bin edge.
export const DURATION_EDGES = [0, 15, 30, 45, 60, Infinity];
export function durationColor(days) {
  if (days === null || days === undefined) return null;
  for (let b = 0; b < 5; b++) if (days >= DURATION_EDGES[b] && days < DURATION_EDGES[b + 1]) return STEPS[b];
  return STEPS[4];
}
