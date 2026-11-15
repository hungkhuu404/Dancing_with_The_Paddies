import numpy as np
import pytest

from science import filter_dual, pixel_fraction_states


def test_pixel_fractions_joint_valid_and_boundaries():
    xs = np.arange(5, 250, 10)
    ys = np.arange(245, 0, -10)
    hh = np.ones((25, 25))
    hv = np.ones((25, 25)) * .001
    hh.flat[:375] = .001
    hh.flat[500:] = np.nan
    fifty, seventyfive = pixel_fraction_states(hh, hv, xs, ys, [0], [0], 250, .7, -14., -20.)
    assert fifty.tolist() == [2]
    assert seventyfive.tolist() == [2]
    hh.flat[374] = 1.
    assert pixel_fraction_states(hh, hv, xs, ys, [0], [0], 250, .7, -14., -20.)[1].tolist() == [1]
    hh.flat[438:] = np.nan
    hh.flat[:219] = .001
    hh.flat[219:438] = 1.
    a, b = pixel_fraction_states(hh, hv, xs, ys, [0], [0], 250, .7, -14., -20.)
    assert (a.tolist(), b.tolist()) == ([2], [1])
    hh.flat[218] = 1.
    assert pixel_fraction_states(hh, hv, xs, ys, [0], [0], 250, .7, -14., -20.)[0].tolist() == [1]
    hh.flat[437] = np.nan
    assert pixel_fraction_states(hh, hv, xs, ys, [0], [0], 250, .7, -14., -20.)[0].tolist() == [0]


def test_partial_patch_and_bad_geometry():
    xs = np.arange(5, 205, 10)
    ys = np.arange(245, 0, -10)
    h = np.ones((25, 20)) * .001
    assert pixel_fraction_states(h, h, xs, ys, [0], [0], 250, .7, -14., -20.)[0].tolist() == [0]
    with pytest.raises(ValueError):
        pixel_fraction_states(h, h[:, :-1], xs, ys, [0], [0], 250, .7, -14., -20.)


def test_method_cannot_claim_dual_filter_when_disabled():
    from run_pipeline import build_method_definition
    cfg = {'site': 'synthetic', 'references': {},
           'thresholds': {'min_valid_pixel_fraction': .7, 'filter_single_anomaly': False}}
    with pytest.raises(ValueError, match='DualFilterRequired'):
        build_method_definition(cfg, {'config_sha256': 'x', 'code_sha256': {}}, [], {})


def test_dual_filter_singletons_missing_and_invalid():
    a = np.array([[2, 2, 1], [1, 2, 2], [0, 0, 0], [2, 2, 1]])
    b = np.array([[2, 2, 1], [1, 1, 2], [0, 0, 0], [2, 2, 1]])
    original = b.copy()
    assert filter_dual(a, b).tolist() == [[2, 2, 1], [1, 2, 1], [0, 0, 0], [2, 2, 1]]
    assert np.array_equal(b, original)
    with pytest.raises(ValueError):
        filter_dual(np.array([[1]]), np.array([[2]]))
    with pytest.raises(ValueError):
        filter_dual(np.array([[0]]), np.array([[1]]))


def test_offline_pipeline_persists_dual_states_and_posthoc_method(tmp_path):
    import csv
    import json
    import tomllib
    from gcov_io import cache_identity
    from run_pipeline import process

    config = tmp_path / 'site.toml'
    config.write_text('''site = "synthetic"
[grid]
epsg = 32648
bbox_utm_m = [0, 0, 250, 250]
cell_size_m = 250
[boundary]
file = "aoi.geojson"
epsg = 32648
[catalog]
output_file = "catalog.csv"
[read]
gcov_group = "test"
layers = ["HHHH", "HVHV"]
[landcover]
file = "landcover.csv"
[thresholds]
hh_db = -14.0
hv_db = -20.0
min_valid_pixel_fraction = 0.7
filter_single_anomaly = true
[references.water]
epsg = 32648
bbox_utm_m = [0, 0, 250, 250]
min_pixels = 1
[references.stable]
epsg = 32648
bbox_utm_m = [0, 0, 250, 250]
''')
    (tmp_path / 'aoi.geojson').write_text(json.dumps({'type': 'Polygon', 'coordinates': [[[0, 0], [250, 0], [250, 250], [0, 250], [0, 0]]]}))
    (tmp_path / 'landcover.csv').write_text('cell_id,cropland\nE0N0,true\n')
    cfg = tomllib.loads(config.read_text())
    dates = ['2026-08-01', '2026-08-10', '2026-08-20', '2026-08-30', '2026-09-10']
    rows = [dict(acq_utc=d+'T00:00:00Z', date_local=d, track='047', direction='D', frame='083', crid='P05023', granule=f'g{i}') for i, d in enumerate(dates)]
    with (tmp_path / 'catalog.csv').open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=rows[0]); writer.writeheader(); writer.writerows(rows)
    output = tmp_path / 'output'; output.mkdir()
    records = []
    for i, row in enumerate(rows):
        hh = np.full((25, 25), .001 if i in (0, 2, 3) else 1.)
        hv = np.full((25, 25), .001)
        if i == 1:
            hh.flat[:300] = .001
        key = cache_identity(row, cfg)
        path = tmp_path / f'cache{i}.npz'
        np.savez_compressed(path, hh=hh, hv=hv, xs=np.arange(5,250,10), ys=np.arange(245,0,-10),
            ref_water_hh=np.array([[.001]]), ref_water_hv=np.array([[.001]]),
            ref_stable_hh=np.array([[1.]]), ref_stable_hv=np.array([[1.]]),
            cache_key=key, utc=row['acq_utc'], crid=row['crid'])
        records.append({**row, 'path': str(path), 'cache_key': key, 'valid_pixel_fraction': 1., 'duration_s': 0.})
    (output / 'manifest.json').write_text(json.dumps({'acquisitions': records, 'skipped': []}))
    process(config, output, read_network=False)
    with np.load(output / 'synthetic_cube.npz', allow_pickle=False) as cube:
        assert cube['s_raw'][:, 0].tolist() == [2, 1, 2, 2, 1]
        assert cube['s'][:, 0].tolist() == [2, 1, 2, 2, 1]
    method = json.loads((output / 'method_freeze.draft.json').read_text(encoding='utf-8'))
    assert method['classification']['name'] == 'pixel_fraction_75_dual_50'
    assert method['classification']['valid_mask'] == 'gcov_fully_focused_1_254'
    assert method['selection']['status'] == 'post_hoc'
