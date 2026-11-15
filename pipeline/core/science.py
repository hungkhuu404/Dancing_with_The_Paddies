"""Pure S2–S5 computations; no file, network, or geometry I/O."""

from datetime import datetime, timedelta, timezone

import numpy as np


def classification_grid(hh, hv, xs, ys):
    """Represent aligned native 20 m pixels as four equal 10 m area samples.

    Power and missing masks are copied, never interpolated. Reference windows
    stay native. Existing 10 m coordinates and calculations remain unchanged.
    """
    hh, hv = np.asarray(hh, float), np.asarray(hv, float)
    xs, ys = np.asarray(xs, float), np.asarray(ys, float)
    if xs.ndim != 1 or ys.ndim != 1 or hh.shape != (len(ys), len(xs)) or hv.shape != hh.shape:
        raise ValueError('incompatible raster or coordinate shapes')
    steps = []
    for axis in (xs, ys):
        if not len(axis) or not np.isfinite(axis).all():
            raise ValueError('empty or nonfinite pixel coordinates')
        if len(axis) > 1:
            step = float(axis[1] - axis[0])
            if not np.allclose(np.diff(axis), step, atol=1e-6, rtol=0) or not any(
                    np.isclose(abs(step), size, atol=1e-6, rtol=0) for size in (10, 20)):
                raise ValueError('pixel centers must have regular 10 m or 20 m spacing')
            steps.append(abs(step))
    if steps and not np.allclose(steps, steps[0], atol=1e-6, rtol=0):
        raise ValueError('mixed raster axis spacing')
    if not steps or np.isclose(steps[0], 10, atol=1e-6, rtol=0):
        return hh, hv, xs, ys
    if min(len(xs), len(ys)) < 2:
        raise ValueError('20 m raster requires two centers on each axis')
    # A 10 m half-pixel grid makes area overlap exact at 250 m boundaries.
    if any(not np.allclose(axis / 10, np.round(axis / 10), atol=1e-7, rtol=0) for axis in (xs, ys)):
        raise ValueError('20 m pixel footprints must align to the 10 m area grid')
    def split(axis):
        offset = 5 * np.sign(axis[1] - axis[0])
        return np.column_stack((axis - offset, axis + offset)).ravel()
    return (np.repeat(np.repeat(hh, 2, axis=0), 2, axis=1),
            np.repeat(np.repeat(hv, 2, axis=0), 2, axis=1), split(xs), split(ys))


def pixel_fraction_states(hh, hv, xs, ys, cell_x, cell_y, cell_size_m, min_valid_fraction, hh_db_max, hv_db_max):
    hh, hv, xs, ys = classification_grid(hh, hv, xs, ys)
    hh, hv = np.asarray(hh, float), np.asarray(hv, float)
    xs, ys = np.asarray(xs, float), np.asarray(ys, float)
    cx, cy = np.asarray(cell_x, float), np.asarray(cell_y, float)
    size = float(cell_size_m)
    if (xs.ndim != 1 or ys.ndim != 1 or hh.shape != (len(ys), len(xs)) or hv.shape != hh.shape or
        cx.ndim != 1 or cx.shape != cy.shape or not np.isfinite(size) or size <= 0 or
        not np.isclose(size / 10, round(size / 10)) or not 0 <= min_valid_fraction <= 1 or
        not np.isfinite([hh_db_max, hv_db_max]).all() or not np.isfinite(cx).all() or not np.isfinite(cy).all() or
        not np.allclose(cx / size, np.round(cx / size), rtol=0, atol=1e-8) or
        not np.allclose(cy / size, np.round(cy / size), rtol=0, atol=1e-8) or
        len(set(zip(cx, cy))) != len(cx)):
        raise ValueError('invalid raster, grid, or thresholds')
    for axis in (xs, ys):
        if not np.isfinite(axis).all() or (len(axis) > 1 and not (
            np.allclose(np.diff(axis), 10, atol=1e-6, rtol=0) or np.allclose(np.diff(axis), -10, atol=1e-6, rtol=0))):
            raise ValueError('pixel centers must have regular 10 m spacing')
    side = round(size / 10)
    out50 = np.zeros(len(cx), dtype=np.uint8)
    out75 = np.zeros(len(cx), dtype=np.uint8)
    for j, (x, y) in enumerate(zip(cx, cy)):
        ix = np.flatnonzero((xs >= x) & (xs < x + size))
        iy = np.flatnonzero((ys >= y) & (ys < y + size))
        if len(ix) != side or len(iy) != side:
            continue
        h, v = hh[np.ix_(iy, ix)], hv[np.ix_(iy, ix)]
        valid = np.isfinite(h) & np.isfinite(v) & (h > 0) & (v > 0)
        n = int(valid.sum())
        if n == 0 or n / (side * side) < min_valid_fraction:
            continue
        wet = int(((h[valid] < 10 ** (hh_db_max / 10)) & (v[valid] < 10 ** (hv_db_max / 10))).sum())
        out50[j] = 2 if wet / n >= .5 else 1
        out75[j] = 2 if wet / n >= .75 else 1
    return out50, out75


def filter_dual(raw50, raw75):
    a, b = np.asarray(raw50), np.asarray(raw75)
    if (a.ndim != 2 or a.shape != b.shape or not np.isin(a, [0, 1, 2]).all() or
        not np.isin(b, [0, 1, 2]).all() or not np.array_equal(a == 0, b == 0) or
        np.any((b == 2) & (a != 2))):
        raise ValueError('inconsistent 50% and 75% raw states')
    result = filter_singletons(b)
    result[(b == 1) & (result == 2) & (a == 1)] = 1
    return result


def aggregate_cells(hh, hv, xs, ys, cell_x, cell_y, cell_size_m, min_valid_fraction):
    hh, hv, xs, ys = classification_grid(hh, hv, xs, ys)
    hh, hv = np.asarray(hh, dtype=float), np.asarray(hv, dtype=float)
    xs, ys = np.asarray(xs, dtype=float), np.asarray(ys, dtype=float)
    cx, cy = np.asarray(cell_x, dtype=float), np.asarray(cell_y, dtype=float)
    size = float(cell_size_m)
    if hh.shape != (len(ys), len(xs)) or hv.shape != hh.shape or cx.ndim != 1 or cx.shape != cy.shape:
        raise ValueError('incompatible raster or cell shapes')
    if not np.isfinite(size) or size <= 0 or not np.isclose(size / 10, round(size / 10)) or not 0 <= min_valid_fraction <= 1:
        raise ValueError('invalid cell size or fraction')
    for axis in (xs, ys):
        if axis.ndim != 1 or not np.isfinite(axis).all() or (len(axis) > 1 and not (np.allclose(np.diff(axis), 10, atol=1e-6, rtol=0) or np.allclose(np.diff(axis), -10, atol=1e-6, rtol=0))):
            raise ValueError('pixel centers must have regular 10 m spacing')
    if not np.isfinite(cx).all() or not np.isfinite(cy).all() or not np.allclose(cx / size, np.round(cx / size), rtol=0, atol=1e-8) or not np.allclose(cy / size, np.round(cy / size), rtol=0, atol=1e-8):
        raise ValueError('cell origins must align to cell size')
    keys = list(zip(cx.astype(float), cy.astype(float)))
    if len(set(keys)) != len(keys):
        raise ValueError('duplicate cells')
    indices = {key: i for i, key in enumerate(keys)}
    xx, yy = np.meshgrid(np.floor(xs / size) * size, np.floor(ys / size) * size)
    valid = np.isfinite(hh) & np.isfinite(hv) & (hh > 0) & (hv > 0)
    counts = np.zeros(len(cx), dtype=np.int64)
    sh = np.zeros(len(cx)); sv = np.zeros(len(cx))
    for x, y, h, v in zip(xx[valid], yy[valid], hh[valid], hv[valid]):
        i = indices.get((x, y))
        if i is not None:
            counts[i] += 1
            sh[i] += h
            sv[i] += v
    fraction = counts / (round(size / 10) ** 2)
    good = (fraction >= min_valid_fraction) & (counts > 0)
    out_h = np.full(len(cx), np.nan); out_v = np.full(len(cx), np.nan)
    out_h[good] = 10 * np.log10(sh[good] / counts[good])
    out_v[good] = 10 * np.log10(sv[good] / counts[good])
    return dict(hh_db=out_h, hv_db=out_v, valid_fraction=fraction, n_valid=counts)


def classify(hh_db, hv_db, hh_db_max, hv_db_max):
    hh, hv = np.asarray(hh_db, dtype=float), np.asarray(hv_db, dtype=float)
    if hh.ndim != 2 or hh.shape != hv.shape:
        raise ValueError('channels must have matching t,n shapes')
    def threshold(x):
        a = np.asarray(x, dtype=float)
        if a.ndim == 1 and a.shape == (hh.shape[0],):
            a = a[:, None]
        if a.ndim not in (0, 2) or (a.ndim == 2 and a.shape != (hh.shape[0], 1)) or not np.isfinite(a).all():
            raise ValueError('threshold must be finite scalar or per acquisition')
        return a
    th, tv = threshold(hh_db_max), threshold(hv_db_max)
    valid = np.isfinite(hh) & np.isfinite(hv)
    return np.where(valid, np.where((hh < th) & (hv < tv), 2, 1), 0).astype(np.uint8)


def filter_singletons(states):
    raw = np.asarray(states)
    if raw.ndim != 2 or not np.isin(raw, [0, 1, 2]).all():
        raise ValueError('states must be t,n with codes 0,1,2')
    result = raw.astype(np.uint8, copy=True)
    for col in range(raw.shape[1]):
        idx = np.flatnonzero(raw[:, col])
        seq = raw[idx, col]
        flip = (seq[:-2] == seq[2:]) & (seq[1:-1] != seq[:-2])
        result[idx[1:-1][flip], col] = seq[:-2][flip]
    return result


def _times(acq_utc):
    times = []
    for item in acq_utc:
        dt = datetime.fromisoformat(item.replace('Z', '+00:00'))
        if dt.utcoffset() != timedelta(0):
            raise ValueError('acquisitions must be UTC')
        times.append(dt)
    if any(a >= b for a, b in zip(times, times[1:])):
        raise ValueError('acquisitions must be strictly increasing')
    return times


def metrics_for_cell(states, acq_utc, tracks, cropland):
    s = np.asarray(states)
    if s.ndim != 1 or len(s) != len(acq_utc) or len(s) != len(tracks) or not np.isin(s, [0, 1, 2]).all():
        raise ValueError('incompatible states, times, or tracks')
    times = _times(acq_utc)
    idx = np.flatnonzero(s)
    seq = s[idx]
    ts = [times[i] for i in idx]
    local = lambda dt: (dt + timedelta(hours=7)).date().isoformat()
    days = lambda a, b: round((b - a).total_seconds() / 86400, 1)
    result = dict(onset_after_local=None, onset_by_local=None, end_after_local=None, end_by_local=None,
                  flood_days_min=None, flood_days_max=None, ongoing=None, status='no_data',
                  status_confirmed=None, flag_gt30='na', last_obs_local=local(ts[-1]) if ts else None,
                  n_obs=len(idx), n_tracks=len({tracks[i] for i in idx}),
                  max_gap_days=max((days(a, b) for a, b in zip(ts, ts[1:])), default=None), n_episodes=None)
    if len(idx) < 4:
        return result
    result['status_confirmed'] = bool(seq[-1] == seq[-2])
    result['ongoing'] = bool(seq[-1] == 2)
    starts = [i for i, value in enumerate(seq) if value == 2 and (i == 0 or seq[i-1] == 1)]
    result['n_episodes'] = len(starts)
    if not starts:
        result['status'] = 'never_water'
        return result
    start = starts[-1]
    end = start
    while end + 1 < len(seq) and seq[end+1] == 2:
        end += 1
    ongoing = end == len(seq) - 1
    result['status'] = 'always_water' if np.all(seq == 2) else ('flooded' if ongoing else 'water_gone')
    result['onset_by_local'] = local(ts[start])
    result['onset_after_local'] = local(ts[start-1]) if start else None
    result['end_after_local'] = None if ongoing else local(ts[end])
    result['end_by_local'] = None if ongoing else local(ts[end+1])
    result['flood_days_min'] = days(ts[start], ts[end])
    result['flood_days_max'] = days(ts[start-1], ts[end] if ongoing else ts[end+1]) if start else None
    if cropland and result['status'] != 'always_water':
        if result['flood_days_min'] > 30:
            result['flag_gt30'] = 'yes'
        elif ongoing or result['flood_days_max'] is None or result['flood_days_max'] > 30:
            result['flag_gt30'] = 'possible'
        else:
            result['flag_gt30'] = 'no'
    return result


def evaluate_references(observations, default_hh_db, default_hv_db, min_water_pixels=1000):
    """Return (report, per-input rules); unresolved thresholds are null, never Q0 guesses."""
    if not np.isfinite([default_hh_db, default_hv_db]).all() or min_water_pixels < 1:
        raise ValueError('invalid default thresholds or minimum pixels')
    report = {'tracks': {}, 'qc_pass': False}
    rules = [None] * len(observations)
    for track in dict.fromkeys(o['track'] for o in observations):
        entries = [(i, o) for i, o in enumerate(observations) if o['track'] == track]
        def vals(o, prefix, minimum):
            pair = [o.get(prefix + '_hh_db'), o.get(prefix + '_hv_db')]
            if o.get(prefix + '_n_valid', 0) < minimum or any(v is None or not np.isfinite(v) for v in pair):
                return None
            return np.array(pair, dtype=float)
        water = [v for _, o in entries if (v := vals(o, 'water', min_water_pixels)) is not None]
        stable = [v for _, o in entries if (v := vals(o, 'stable', 1)) is not None]
        old = [v for _, o in entries if o['crid'] == 'P05023' and (v := vals(o, 'stable', 1)) is not None]
        median = np.median(water, axis=0) if water else None
        p1 = 'unresolved' if median is None else ('pass' if np.all(median <= np.array([default_hh_db, default_hv_db]) - 2) else 'fail')
        std = np.std(stable, axis=0) if len(stable) >= 2 else None
        p2 = 'unresolved' if std is None else ('pass' if np.all(std <= .5) else 'fail')
        comparisons = []
        for i, o in entries:
            if o['crid'] == 'P05036':
                v = vals(o, 'stable', 1)
                status = 'unresolved' if len(old) < 2 or v is None else ('pass' if np.all(np.abs(v - np.mean(old, axis=0)) <= 3 * np.std(old, axis=0)) else 'fail')
                comparisons.append({'index': i, 'acq_utc': o['acq_utc'], 'status': status})
        p3 = ('fail' if any(c['status'] == 'fail' for c in comparisons) else 'unresolved' if any(c['status'] == 'unresolved' for c in comparisons) else 'pass' if comparisons else 'not_applicable')
        report['tracks'][track] = {'p1': p1, 'p2': p2, 'p3': p3, 'p3_acquisitions': comparisons,
                                    'water_median_db': median.tolist() if median is not None else None,
                                    'stable_std_db': std.tolist() if std is not None else None,
                                    'n_water': len(water), 'n_stable': len(stable), 'n_old_stable': len(old)}
        by_index = {c['index']: c['status'] for c in comparisons}
        for i, o in entries:
            p3_status = by_index.get(i)
            if p3_status == 'fail':
                v = vals(o, 'water', min_water_pixels)
                thresholds, rule = (v + 3 if v is not None else None), 'Q1'
            elif p3_status == 'unresolved' or p1 == 'unresolved':
                thresholds, rule = None, None
            elif p1 == 'fail':
                thresholds, rule = median + 3, 'Q1'
            else:
                thresholds, rule = [default_hh_db, default_hv_db], 'Q0'
            rules[i] = {'acq_utc': o['acq_utc'], 'track': track, 'rule': rule,
                        'hh_db_max': float(thresholds[0]) if thresholds is not None else None,
                        'hv_db_max': float(thresholds[1]) if thresholds is not None else None}
    report['qc_pass'] = bool(report['tracks']) and all(t['p1'] == 'pass' and t['p2'] == 'pass' and t['p3'] in ('pass', 'not_applicable') for t in report['tracks'].values()) and all(r['hh_db_max'] is not None for r in rules)
    return report, rules
