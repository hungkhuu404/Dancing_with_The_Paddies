import sys
from pathlib import Path
import numpy as np
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline/validate"))
import validation as V


def test_kappa_perfect_and_chance():
    a = np.array([1, 1, 0, 0], bool)
    assert V.agreement_stats(a, a)["kappa"] == pytest.approx(1.0)
    s = V.agreement_stats(a, ~a)
    assert s["kappa"] == pytest.approx(-1.0)


def test_kappa_known_value():
    # tp=20 fp=5 fn=10 tn=15 -> po=.7, pe=(25*30+25*20)/2500=.5 -> kappa=.4
    n = np.array([1] * 20 + [1] * 5 + [0] * 10 + [0] * 15, bool)
    d = np.array([1] * 20 + [0] * 5 + [1] * 10 + [0] * 15, bool)
    s = V.agreement_stats(n, d)
    assert s["kappa"] == pytest.approx(0.4)
    assert s["precision"] == pytest.approx(20 / 25)
    assert s["recall"] == pytest.approx(20 / 30)
    assert s["n_cells"] == 50


def test_degenerate_none():
    z = np.zeros(5, bool)
    s = V.agreement_stats(z, z)
    assert s["kappa"] is None and s["precision"] is None and s["recall"] is None
    assert V.agreement_stats([], [])["n_cells"] == 0


def test_pairing_within_3_days():
    n = ["2026-08-11T11:31:41Z", "2026-08-19T00:00:00Z", "2026-09-01T00:00:00Z"]
    d = ["2026-08-17T22:44:00Z", "2026-08-18T11:10:00Z", "2026-08-20T11:00:00Z", "2026-09-04T00:00:00Z"]
    p = V.pair_acquisitions(n, d, 3.0)
    assert [(i, j) for i, j, _ in p] == [(1, 1), (2, 3)]  # first is >3 d from any pass
    assert p[0][2] == pytest.approx((12 + 50 / 60) / 24, abs=1e-3)


def test_pairing_picks_nearest_of_two_daily_passes():
    d = ["2026-08-18T22:44:00Z", "2026-08-19T11:10:00Z"]
    p = V.pair_acquisitions(["2026-08-19T05:00:00Z"], d)
    assert p[0][1] == 1


def test_onset_overlap():
    assert V.interval_overlap("2026-09-01", "2026-09-10", "2026-09-10", "2026-09-12")
    assert not V.interval_overlap("2026-09-01", "2026-09-09", "2026-09-10", "2026-09-12")
    n = [dict(onset_after_local="2026-09-01", onset_by_local="2026-09-13"),
         dict(onset_after_local="2026-09-01", onset_by_local="2026-09-13"),
         dict(onset_after_local=None, onset_by_local="2026-09-13")]
    d = [dict(onset_after_local="2026-09-20", onset_by_local="2026-09-21"),
         dict(onset_after_local="2026-09-05", onset_by_local="2026-09-07"),
         dict(onset_after_local="2026-09-05", onset_by_local="2026-09-07")]
    r = V.onset_comparison(n, d)
    assert r["n_cells"] == 2 and r["overlap_share"] == 0.5
    # midpoints: N 09-07 ; D 09-20.5 and 09-06 -> diffs -13.5, +1 -> median -6.25
    assert r["median_diff_days"] == pytest.approx(-6.25)


def test_gt30_table():
    n = ["yes", "yes", "possible", "no", "na", "yes"]
    d = ["yes", "possible", "yes", "no", "yes", "na"]
    r = V.gt30_comparison(n, d)
    assert r["n_cells"] == 4 and r["n_cells_excluded_na_on_either_side"] == 2
    t = r["table_rows_nisar_cols_dswx"]
    assert t["yes"]["yes"] == 1 and t["yes"]["possible"] == 1 and t["possible"]["yes"] == 1 and t["no"]["no"] == 1
    assert r["precision"] == pytest.approx(0.5) and r["recall"] == pytest.approx(0.5)


@pytest.mark.parametrize('value,expected', [
    ('2026-11-13T06:23:57.749213+00:00', '2026-11-13T06:23:57.749213Z'),
    ('2026-11-13T06:23:57Z', '2026-11-13T06:23:57Z'),
    ('2026-11-13T06:23:57.749213Z', '2026-11-13T06:23:57.749213Z'),
    ('2026-11-13T13:23:57.749213+07:00', '2026-11-13T06:23:57.749213Z'),
    ('2026-11-13T23:23:57-07:00', '2026-11-14T06:23:57Z'),
])
def test_utc_z_preserves_instant_and_precision(value, expected):
    assert V.utc_z(value) == expected
    assert V._dt(value) == V._dt(expected)


@pytest.mark.parametrize('value', ['2026-11-13T06:23:57', '2026-11-13', 'not-a-time'])
def test_utc_z_rejects_missing_or_invalid_timezone(value):
    with pytest.raises(ValueError):
        V.utc_z(value)


def test_normalize_public_timestamps_without_mutating_evidence():
    import copy
    evidence = dict(frozen_utc='2026-11-13T06:23:57.749213+00:00',
                    first_dswx_read_utc='2026-11-13T07:29:02Z',
                    filtered={'kappa_median': 0.5073},
                    posthoc=[{'id': 'PH-01', 'changed_utc': '2026-11-14T14:58:38+07:00'}])
    original = copy.deepcopy(evidence)
    result = V.normalize_timestamps(evidence)
    assert result['frozen_utc'] == '2026-11-13T06:23:57.749213Z'
    assert result['first_dswx_read_utc'] == original['first_dswx_read_utc']
    assert result['posthoc'][0]['changed_utc'] == '2026-11-14T07:58:38Z'
    assert result['filtered'] == original['filtered']
    assert evidence == original


def test_posthoc_attachment_keeps_original_frozen_microseconds(tmp_path):
    import json
    import add_posthoc
    block = dict(n_pairs=17, kappa_median=0.5073, kappa_min=0.0506,
                 kappa_max=0.555, by_track={}, by_n_tracks={})
    before = dict(frozen_utc='2026-11-13T06:23:57.749213+00:00', filtered=block)
    new = dict(frozen_utc='2026-11-14T00:00:00Z',
               first_dswx_read_utc='2026-11-13T07:29:02+00:00',
               filtered={**block, 'kappa_median': 0.559}, posthoc=[])
    entry = dict(id='PH-01', changed_utc='2026-11-14T07:58:38+00:00')
    paths = [tmp_path/name for name in ('new.json', 'before.json', 'entry.json')]
    for path, document in zip(paths, (new, before, entry)):
        path.write_text(json.dumps(document), encoding='utf-8')
    original_before = paths[1].read_bytes()
    add_posthoc.main(*paths)
    output = json.loads(paths[0].read_text())
    assert output['frozen_utc'] == '2026-11-13T06:23:57.749213Z'
    assert output['first_dswx_read_utc'] == '2026-11-13T07:29:02Z'
    assert output['posthoc'][0]['changed_utc'] == '2026-11-14T07:58:38Z'
    assert output['posthoc'][0]['before']['kappa_median'] == 0.5073
    assert output['posthoc'][0]['after']['kappa_median'] == 0.559
    assert paths[1].read_bytes() == original_before


def test_public_limits_omit_agreement_numbers_and_old_freeze_claim():
    import make_limits_text
    text = make_limits_text.render({'filtered': {'kappa_median': 0.559123}})
    assert '0.559123' not in text
    assert 'kappa' not in text.lower()
    assert 'precision' not in text.lower()
    assert 'the method was frozen before' not in text.lower()
    assert 'not an independent' in text
    assert 'used OPERA DSWx-S1 when choosing' in text


def test_internal_limits_handle_undefined_statistics():
    import make_limits_text
    v = {'filtered': dict(n_pairs=0, kappa_median=None, kappa_min=None,
         kappa_max=None, gt30=dict(n_cells=0, precision=None, recall=None),
         onset=dict(n_cells=0, overlap_share=None, median_diff_days=None))}
    text = make_limits_text.render(v, internal=True)
    assert 'internal only' in text
    assert 'not available' in text
    assert 'the method was frozen before' not in text.lower()
