import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from science import aggregate_cells, classify, evaluate_references, filter_singletons, metrics_for_cell


def test_aggregation_joint_valid_and_full_cell_denominator():
    xs = np.arange(5, 100, 10)
    ys = np.arange(95, 0, -10)
    hh = np.full((10, 10), 0.01)
    hv = np.full((10, 10), 0.001)
    hh.flat[:30] = np.nan
    r = aggregate_cells(hh, hv, xs, ys, [0], [0], 100, .7)
    assert r['n_valid'].tolist() == [70]
    assert r['valid_fraction'].tolist() == [.7]
    assert r['hh_db'][0] == pytest.approx(-20)
    assert r['hv_db'][0] == pytest.approx(-30)
    hv.flat[30] = 0
    r = aggregate_cells(hh, hv, xs, ys, [0], [0], 100, .7)
    assert r['n_valid'].tolist() == [69]
    assert np.isnan(r['hh_db'][0]) and np.isnan(r['hv_db'][0])


def test_aggregation_shifted_grid_partial_cells_and_spacing():
    r = aggregate_cells(np.ones((2, 2)), np.ones((2, 2)), [99, 109], [11, 1], [0, 100], [0, 0], 20, .5)
    assert r['n_valid'].tolist() == [0, 2]
    assert r['valid_fraction'].tolist() == [0, .5]
    assert r['hh_db'][1] == 0
    with pytest.raises(ValueError):
        aggregate_cells(np.ones((2, 2)), np.ones((2, 2)), [0, 11], [0, 10], [0], [0], 20, .7)


def test_classification_and_filter_raw():
    h = np.array([[-15., -14., np.nan], [-15, -15, -15]])
    v = np.array([[-21., -21., -21], [-21, -19, np.inf]])
    assert classify(h, v, [-14, -16], -20).tolist() == [[2, 1, 0], [1, 1, 0]]
    for raw, expected in [('112122', '111222'), ('22122', '22222'), ('11211', '11111'), ('11112', '11112'), ('12012', '11022')]:
        a = np.array([int(c) for c in raw], dtype=np.uint8)[:, None]
        assert ''.join(map(str, filter_singletons(a)[:, 0])) == expected
        assert ''.join(map(str, a[:, 0])) == raw


def dates(days):
    base = datetime(2026, 8, 1, 22, tzinfo=timezone.utc)
    return [(base + timedelta(days=d)).isoformat().replace('+00:00', 'Z') for d in days]


def metric(s, days=None, cropland=True):
    return metrics_for_cell([int(x) for x in s], dates(days if days is not None else list(range(len(s)))), ['A', 'B'] * (len(s)//2) + (['A'] if len(s)%2 else []), cropland)


def test_metric_status_and_latest_episode():
    assert metric('1111')['status'] == 'never_water'
    assert metric('2222')['status'] == 'always_water'
    low = metric('2220')
    assert (low['status'], low['n_obs'], low['n_tracks'], low['last_obs_local'], low['n_episodes']) == ('no_data', 3, 2, '2026-08-04', None)
    m = metric('12211221', [0, 1, 2, 3, 4, 5, 7, 9])
    assert (m['status'], m['n_episodes'], m['onset_after_local'], m['onset_by_local'], m['end_after_local'], m['end_by_local']) == ('water_gone', 2, '2026-08-06', '2026-08-07', '2026-08-09', '2026-08-11')
    assert (m['flood_days_min'], m['flood_days_max'], m['max_gap_days'], m['n_tracks'], m['flag_gt30']) == (2.0, 5.0, 2.0, 2, 'no')
    first = metric('2211')
    assert first['onset_after_local'] is None and first['flood_days_max'] is None and first['flag_gt30'] == 'possible'
    ongoing = metric('11022')
    assert ongoing['status'] == 'flooded' and ongoing['ongoing'] is True and ongoing['end_after_local'] is None
    assert ongoing['status_confirmed'] is True


def test_metric_gt30_strict_and_no_cropland():
    m = metric('1221', [0, 1, 31, 32])
    assert (m['flood_days_min'], m['flood_days_max'], m['flag_gt30']) == (30., 32., 'possible')
    assert metric('1221', [0, 1, 32, 33])['flag_gt30'] == 'yes'
    assert metric('1221', [0, 1, 32, 33], False)['flag_gt30'] == 'na'
    assert metric('0000')['status'] == 'no_data'
    with pytest.raises(ValueError):
        metrics_for_cell([1, 3], dates([1, 0]), ['A', 'A'], True)


def obs(day, crid='P05023', water=(-17., -23.), stable=(0., 0.), n=1000):
    return dict(acq_utc=dates([day])[0], track='A', crid=crid, water_hh_db=water[0], water_hv_db=water[1], water_n_valid=n, stable_hh_db=stable[0], stable_hv_db=stable[1], stable_n_valid=100)


def test_reference_gates_and_individual_fallback():
    o = [obs(0, water=(-15., -21.), stable=(0., 0.)), obs(1, water=(-15., -21.), stable=(1., 1.)), obs(2, 'P05036', water=(-19., -25.), stable=(5., 5.))]
    report, rules = evaluate_references(o, -14., -20.)
    json.dumps(report, allow_nan=False)
    assert report['tracks']['A']['p1'] == 'fail'
    assert report['tracks']['A']['p2'] == 'fail'
    assert report['tracks']['A']['p3'] == 'fail'
    assert rules[0]['hh_db_max'] == -12. and rules[0]['rule'] == 'Q1'
    assert rules[2]['hh_db_max'] == -16. and rules[2]['hv_db_max'] == -22.
    assert report['qc_pass'] is False


def test_reference_unresolved_and_minimum_pixels():
    report, rules = evaluate_references([obs(0, 'P05036', n=999)], -14, -20)
    assert report['tracks']['A']['p1'] == 'unresolved'
    assert report['tracks']['A']['p3'] == 'unresolved'
    assert report['qc_pass'] is False
    assert rules[0]['hh_db_max'] is None
    json.dumps([report, rules], allow_nan=False)


def test_reference_pass_boundary_and_p3_fail_overrides_p1_pass():
    good = [obs(0, water=(-16, -22), stable=(0, 0)), obs(1, water=(-16, -22), stable=(0, 0)), obs(2, 'P05036', water=(-16, -22), stable=(0, 0))]
    report, rules = evaluate_references(good, -14, -20)
    assert (report['tracks']['A']['p1'], report['tracks']['A']['p2'], report['tracks']['A']['p3'], report['qc_pass']) == ('pass', 'pass', 'pass', True)
    assert [r['rule'] for r in rules] == ['Q0', 'Q0', 'Q0']
    good[-1] = obs(2, 'P05036', water=(-18, -24), stable=(1, 0))
    report, rules = evaluate_references(good, -14, -20)
    assert report['tracks']['A']['p1'] == 'pass'
    assert report['tracks']['A']['p3'] == 'fail'
    assert (rules[2]['rule'], rules[2]['hh_db_max'], rules[2]['hv_db_max']) == ('Q1', -15, -21)


def test_metric_unconfirmed_and_non_water_conventions():
    m = metric('1112')
    assert (m['status'], m['status_confirmed'], m['ongoing'], m['flag_gt30']) == ('flooded', False, True, 'possible')
    m = metric('1111')
    assert (m['n_episodes'], m['ongoing'], m['onset_by_local'], m['flood_days_min'], m['flag_gt30']) == (0, False, None, None, 'na')
    assert metric('0000')['max_gap_days'] is None


def test_p1_fallback_is_not_reported_as_gate_pass():
    report, rules = evaluate_references([obs(0, water=(-15, -21)), obs(1, water=(-15, -21))], -14, -20)
    assert report['tracks']['A']['p1'] == 'fail'
    assert report['tracks']['A']['p2'] == 'pass'
    assert report['qc_pass'] is False
    assert all(r['rule'] == 'Q1' for r in rules)
