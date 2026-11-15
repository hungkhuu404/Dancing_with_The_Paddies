// Block panel pieces: pass strip and HH/HV chart as plain SVG strings.
import { COLORS, fmtDate } from './contract.js';

const SYMBOLS = ['circle', 'square', 'triangle']; // one per track, so tracks differ by shape, not only colour
const trackIndex = (acq) => { const t = [...new Set(acq.map((a) => a.track))].sort(); return (tr) => t.indexOf(tr); };
const span = (acq) => [Date.parse(acq[0].date_local), Date.parse(acq[acq.length - 1].date_local)];

export function renderStrip(s, acq, pass, p) {
  const W = 300, H = 34, pad = 6, [t0, t1] = span(acq);
  const x = (d) => pad + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);
  const cw = 9;
  let out = '';
  if (p.onset_by_local) { // bracket: water came in between onset_after and onset_by
    const a = x(p.onset_after_local || acq[0].date_local) - cw / 2, b = x(p.onset_by_local) + cw / 2;
    out += `<path d="M${a} 6 V3 H${b} V6" fill="none" stroke="${COLORS.ink}" stroke-width="1"/>`;
  }
  acq.forEach((q, i) => {
    const cx = x(q.date_local) - cw / 2, ch = s[i];
    if (ch === 'W') out += `<rect x="${cx}" y="10" width="${cw}" height="14" fill="${COLORS.water}"/>`;
    else if (ch === 'N') out += `<rect x="${cx + 0.5}" y="10.5" width="${cw - 1}" height="13" fill="none" stroke="${COLORS.ink}" stroke-opacity="0.7"/>`;
    else out += `<rect x="${cx}" y="10" width="${cw}" height="14" fill="url(#strip-hatch)"/>`;
    if (i === pass) out += `<rect x="${cx - 2}" y="7" width="${cw + 4}" height="20" fill="none" stroke="${COLORS.silt}" stroke-width="1.5"/>`;
  });
  const label = acq.map((q, i) => `${fmtDate(q.date_local)} ${s[i] === 'W' ? 'water' : s[i] === 'N' ? 'no water' : 'no image'}`).join('; ');
  return `<svg class="strip" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pass record: ${label}">
    <defs><pattern id="strip-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${COLORS.missing}" stroke-width="2"/></pattern></defs>${out}</svg>`;
}

function symbol(kind, cx, cy, r, fill, stroke) {
  const st = `fill="${fill}" stroke="${stroke}" stroke-width="1.3"`;
  if (kind === 'square') return `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" ${st}/>`;
  if (kind === 'triangle') return `<path d="M${cx} ${cy - r * 1.2} L${cx + r * 1.15} ${cy + r * 0.8} L${cx - r * 1.15} ${cy + r * 0.8} Z" ${st}/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" ${st}/>`;
}

export function renderChart(rec, acq, pass, p) {
  const W = 300, PH = 92, L = 34, R = 8, T = 8, GAP = 18, [t0, t1] = span(acq);
  const x = (d) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const ti = trackIndex(acq);
  let svg = '';
  const panels = [['hh', 'HH', 'hh_db_max'], ['hv', 'HV', 'hv_db_max']];
  panels.forEach(([key, name, thr], k) => {
    const top = T + k * (PH + GAP);
    const vals = rec[key].filter((v) => v !== null).map((v) => v / 10).concat(acq.map((a) => a[thr]));
    const lo = Math.floor(Math.min(...vals) - 2), hi = Math.ceil(Math.max(...vals) + 2);
    const y = (v) => top + (1 - (v - lo) / (hi - lo)) * PH;
    svg += `<rect x="${L}" y="${top}" width="${W - L - R}" height="${PH}" fill="none" stroke="${COLORS.missing}" stroke-width="0.6"/>`;
    if (p.onset_by_local) { const a = x(p.onset_after_local || acq[0].date_local), b = x(p.onset_by_local); svg += `<rect x="${a}" y="${top}" width="${Math.max(2, b - a)}" height="${PH}" fill="${COLORS.water}" opacity="0.14"/>`; }
    for (const v of [lo, Math.round((lo + hi) / 2), hi]) svg += `<text x="${L - 4}" y="${y(v) + 3}" text-anchor="end" class="ax">${v}</text>`;
    svg += `<text x="${L + 4}" y="${top + 11}" class="ax ax-name">${name} γ0 (dB)</text>`;
    // thresholds: one line when every pass shares it, otherwise a short mark at each point
    const same = acq.every((a) => a[thr] === acq[0][thr]);
    if (same) svg += `<line x1="${L}" x2="${W - R}" y1="${y(acq[0][thr])}" y2="${y(acq[0][thr])}" stroke="${COLORS.silt}" stroke-dasharray="3 3" stroke-width="1"/>`;
    acq.forEach((a, i) => {
      const v = rec[key][i]; if (v === null) return;
      const cx = x(a.date_local), cy = y(v / 10);
      if (!same) svg += `<line x1="${cx - 5}" x2="${cx + 5}" y1="${y(a[thr])}" y2="${y(a[thr])}" stroke="${COLORS.silt}" stroke-width="1.2"/>`;
      const w = rec.s[i] === 'W';
      if (rec.s[i] !== '-') svg += symbol(SYMBOLS[ti(a.track) % 3], cx, cy, 3.4, w ? COLORS.water : 'none', w ? COLORS.water : COLORS.ink);
      if (rec.s_raw[i] !== rec.s[i]) svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="${COLORS.ink}" stroke-width="0.8"/>`;
      if (i === pass) svg += `<line x1="${cx}" x2="${cx}" y1="${top}" y2="${top + PH}" stroke="${COLORS.silt}" stroke-width="1"/>`;
    });
  });
  const yb = T + 2 * PH + GAP + 14;
  svg += `<text x="${L}" y="${yb}" class="ax">${fmtDate(acq[0].date_local)}</text><text x="${W - R}" y="${yb}" text-anchor="end" class="ax">${fmtDate(acq[acq.length - 1].date_local)}</text>`;
  const tracks = [...new Set(acq.map((a) => a.track))].sort();
  const key = tracks.map((t, k) => `<span class="key"><svg width="12" height="12" viewBox="0 0 12 12">${symbol(SYMBOLS[k % 3], 6, 6, 3.4, 'none', COLORS.ink)}</svg>${t}</span>`).join('');
  const filtered = acq.some((_, i) => rec.s_raw[i] !== rec.s[i]) ? '<span class="key">◯ single outlier, filtered</span>' : '';
  const rows = acq.map((a, i) => `<tr><td>${fmtDate(a.date_local)}</td><td>${a.track}</td><td>${rec.hh[i] === null ? '—' : (rec.hh[i] / 10).toFixed(1)}</td><td>${rec.hv[i] === null ? '—' : (rec.hv[i] / 10).toFixed(1)}</td><td>${{ W: 'water', N: 'no water', '-': 'no image' }[rec.s[i]]}</td></tr>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${yb + 4}" role="img" aria-label="HH and HV backscatter of this block for each pass; filled marks are water.">${svg}</svg>
    <p class="keys">${key}<span class="key"><span class="dash"></span>threshold</span>${filtered}</p>
    <p>Points show average block backscatter for context. Water states use the fraction of pixels meeting both thresholds, not these averages.</p>
    <button type="button" class="ghost show-table">Show as table</button>
    <table hidden><thead><tr><th>Date</th><th>Track</th><th>HH dB</th><th>HV dB</th><th>State</th></tr></thead><tbody>${rows}</tbody></table>`;
}
