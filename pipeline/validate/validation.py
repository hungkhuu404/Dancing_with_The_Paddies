"""BANG-4: pure functions for NISAR-vs-DSWx validation (spec s.8). No tuning anywhere."""
from datetime import datetime, timedelta, timezone

import numpy as np


def _dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def utc_z(value):
    """Serialize the same instant as UTC Z, preserving fractional seconds."""
    parsed = _dt(value)
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("Validation timestamps must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_timestamps(document):
    """Normalize public S6 timestamps without changing gate/H3 evidence."""
    out = dict(document)
    for key in ("frozen_utc", "first_dswx_read_utc"):
        out[key] = utc_z(out[key])
    if "posthoc" in out:
        out["posthoc"] = [dict(entry, changed_utc=utc_z(entry["changed_utc"]))
                          for entry in out["posthoc"]]
    return out


def confusion(nisar_w, dswx_w):
    """Both bool arrays (already restricted to cells valid in both). DSWx = reference."""
    a, b = np.asarray(nisar_w, bool), np.asarray(dswx_w, bool)
    return dict(tp=int((a & b).sum()), fp=int((a & ~b).sum()), fn=int((~a & b).sum()), tn=int((~a & ~b).sum()))


def agreement_stats(nisar_w, dswx_w):
    """Cohen kappa (binary), precision (positive=water, DSWx reference), recall, n. None if undefined."""
    c = confusion(nisar_w, dswx_w)
    n = c["tp"] + c["fp"] + c["fn"] + c["tn"]
    kappa = prec = rec = None
    if n:
        po = (c["tp"] + c["tn"]) / n
        pe = ((c["tp"] + c["fp"]) * (c["tp"] + c["fn"]) + (c["fn"] + c["tn"]) * (c["fp"] + c["tn"])) / n ** 2
        kappa = None if pe >= 1 else (po - pe) / (1 - pe)
    if c["tp"] + c["fp"]:
        prec = c["tp"] / (c["tp"] + c["fp"])
    if c["tp"] + c["fn"]:
        rec = c["tp"] / (c["tp"] + c["fn"])
    return dict(kappa=kappa, precision=prec, recall=rec, n_cells=n)


def pair_acquisitions(nisar_utc, dswx_utc, max_days=3.0):
    """Each NISAR acquisition -> nearest DSWx pass (by UTC time) within max_days.
    Returns list of (i_nisar, j_dswx, gap_days_exact). Ties -> earlier DSWx pass."""
    nt = [_dt(x) for x in nisar_utc]
    dt = [_dt(x) for x in dswx_utc]
    out = []
    for i, t in enumerate(nt):
        best = None
        for j, u in enumerate(dt):
            gap = abs((t - u).total_seconds()) / 86400
            if best is None or gap < best[1] - 1e-12:
                best = (j, gap)
        if best is not None and best[1] <= max_days:
            out.append((i, best[0], best[1]))
    return out


def summarize(values):
    v = [x for x in values if x is not None]
    if not v:
        return dict(kappa_median=None, kappa_min=None, kappa_max=None)
    return dict(kappa_median=float(np.median(v)), kappa_min=float(min(v)), kappa_max=float(max(v)))


def interval_overlap(a0, a1, b0, b1):
    """Closed ISO-date intervals intersect."""
    return not (a1 < b0 or b1 < a0)


def midpoint_diff_days(a0, a1, b0, b1):
    d = lambda s: datetime.fromisoformat(s)
    ma = d(a0) + (d(a1) - d(a0)) / 2
    mb = d(b0) + (d(b1) - d(b0)) / 2
    return (ma - mb) / timedelta(days=1)


def onset_comparison(nisar_rows, dswx_rows):
    """rows: lists of dicts with onset_after_local/onset_by_local (per cell, same order)."""
    n = ov = 0
    diffs = []
    for a, b in zip(nisar_rows, dswx_rows):
        if a["onset_after_local"] is None or b["onset_after_local"] is None:
            continue
        n += 1
        ov += interval_overlap(a["onset_after_local"], a["onset_by_local"],
                               b["onset_after_local"], b["onset_by_local"])
        diffs.append(midpoint_diff_days(a["onset_after_local"], a["onset_by_local"],
                                        b["onset_after_local"], b["onset_by_local"]))
    return dict(n_cells=n, overlap_share=(ov / n if n else None),
                median_diff_days=(float(np.median(diffs)) if diffs else None))


FLAGS3 = ("yes", "possible", "no")


def gt30_comparison(nisar_flags, dswx_flags):
    """Precision/recall of 'yes' (DSWx reference) and 3x3 table (rows NISAR, cols DSWx),
    over cells where both flags are in yes/possible/no."""
    table = {r: {c: 0 for c in FLAGS3} for r in FLAGS3}
    other = 0
    for a, b in zip(nisar_flags, dswx_flags):
        if a in FLAGS3 and b in FLAGS3:
            table[a][b] += 1
        else:
            other += 1
    n = sum(sum(r.values()) for r in table.values())
    tp = table["yes"]["yes"]
    npos = sum(table["yes"].values())
    dpos = sum(table[r]["yes"] for r in FLAGS3)
    return dict(n_cells=n, precision=(tp / npos if npos else None), recall=(tp / dpos if dpos else None),
                table_rows_nisar_cols_dswx=table, n_cells_excluded_na_on_either_side=other)
