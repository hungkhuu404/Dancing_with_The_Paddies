import json
from pathlib import Path
import tomllib

import numpy as np
import pytest

from science import aggregate_cells, pixel_fraction_states, classification_grid
from check_inputs import check_inputs
from run_pipeline import build_grid, process


@pytest.mark.parametrize("reverse", [False, True])
def test_native20_matches_independent_area_intersections(reverse):
    xs = np.arange(-10, 530, 20.)
    ys = np.arange(510, -30, -20.)
    rng = np.random.default_rng(41)
    hh = np.where(rng.random((len(ys), len(xs))) < .82, .001, .1)
    hv = np.full_like(hh, .001)
    hh[3:6, 2:7] = np.nan
    hv[8:10, 5:8] = 0  # Joint-valid mask, not HH alone.
    if reverse:
        xs, ys, hh, hv = xs[::-1], ys[::-1], hh[::-1, ::-1], hv[::-1, ::-1]
    cx, cy = [0, 250, 0, 250], [0, 0, 250, 250]
    aggregated = aggregate_cells(hh, hv, xs, ys, cx, cy, 250, .7)
    a, b = pixel_fraction_states(hh, hv, xs, ys, cx, cy, 250, .7, -14, -20)
    valid = np.isfinite(hh) & np.isfinite(hv) & (hh > 0) & (hv > 0)
    for i, (x, y) in enumerate(zip(cx, cy)):
        wx = np.maximum(0, np.minimum(xs + 10, x + 250) - np.maximum(xs - 10, x))
        wy = np.maximum(0, np.minimum(ys + 10, y + 250) - np.maximum(ys - 10, y))
        weights = wy[:, None] * wx[None, :] * valid
        area = weights.sum()
        wet = ((hh < 10 ** -1.4) & (hv < .01) & valid)
        share = weights[wet].sum() / area
        assert aggregated['valid_fraction'][i] == pytest.approx(area / 62500)
        assert aggregated['n_valid'][i] == pytest.approx(area / 100)
        for field, power in [('hh_db', hh), ('hv_db', hv)]:
            expected = 10 * np.log10(np.sum(np.where(valid, power, 0) * weights) / area)
            assert aggregated[field][i] == pytest.approx(expected)
        assert a[i] == (2 if share >= .5 else 1)
        assert b[i] == (2 if share >= .75 else 1)


def test_no_interpolation_missing_and_threshold_equality():
    xs, ys = np.arange(10, 270, 20.), np.arange(250, -10, -20.)
    h = np.full((13, 13), 10 ** (-14 / 10))
    v = np.full_like(h, .001)
    assert pixel_fraction_states(h, v, xs, ys, [0], [0], 250, .7, -14, -20)[1].tolist() == [1]
    h[:] = np.nan
    assert pixel_fraction_states(h, v, xs, ys, [0], [0], 250, .7, -14, -20)[1].tolist() == [0]
    assert np.isnan(aggregate_cells(h, v, xs, ys, [0], [0], 250, .7)['hh_db'][0])
    ten = np.ones((2, 2))
    converted = classification_grid(ten, ten, [5, 15], [15, 5])
    assert converted[0] is ten
    with pytest.raises(ValueError, match='align'):
        classification_grid(ten, ten, [11, 31], [31, 11])
    with pytest.raises(ValueError, match='mixed'):
        classification_grid(ten, ten, [10, 30], [15, 5])


@pytest.mark.parametrize('site', ['tan_hoi', 'bang_rakam'])
def test_site_configuration_covers_published_grid_and_catalogue(site):
    root = Path(__file__).resolve().parents[2]
    config = root / 'config/sites' / (site + '.toml')
    cfg = tomllib.loads(config.read_text(encoding='utf-8'))
    assert check_inputs(config, require_files=False)['ready']
    meta = json.loads((root / 'data' / site / 'meta.json').read_text(encoding='utf-8'))
    assert cfg['grid']['epsg'] == meta['grid']['epsg']
    assert cfg['timezone'] == meta['timezone']
    for acq in meta['acquisitions']:
        assert cfg['catalog']['start_date_local'].isoformat() <= acq['date_local'] <= cfg['catalog']['end_date_local'].isoformat()
        assert any(p['track'] + p['direction'] == acq['track'] and p['frame'] == acq['frame'] for p in cfg['catalog']['passes'])
    ids = build_grid(cfg, config.parent)[0]
    cells = json.loads((root / 'data' / site / 'cells.geojson').read_text(encoding='utf-8'))
    assert set(ids) == {f['properties']['cell_id'] for f in cells['features']}
    assert len(ids) == meta['grid']['n_cells']


def test_missing_inputs_fail_before_network_or_output(tmp_path, monkeypatch):
    import run_pipeline
    config = tmp_path / 'missing.toml'
    config.write_text('site="synthetic"\n')
    result = check_inputs(config)
    assert not result['ready']
    assert 'references.water.bbox_utm_m' in result['missing']
    monkeypatch.setattr(run_pipeline, 'read_batch', lambda *a: pytest.fail('must not access network'))
    with pytest.raises(ValueError, match='PipelineInputsIncomplete'):
        process(config, tmp_path / 'out')
    assert not (tmp_path / 'out').exists()


def test_reader_keeps_boundary_pixels_and_native_references(tmp_path):
    from contextlib import contextmanager
    import h5py
    from gcov_io import read_acquisition
    from run_pipeline import reference_observation
    file = tmp_path / 'native.h5'
    with h5py.File(file, 'w') as f:
        g = f.create_group('grid')
        xs, ys = np.arange(-10, 290, 20.), np.arange(270, -30, -20.)
        g['xCoordinates'], g['yCoordinates'] = xs, ys
        g.create_dataset('projection', data=0).attrs['epsg_code'] = 32647
        g['HHHH'] = np.full((len(ys), len(xs)), .001)
        g['HVHV'] = np.full((len(ys), len(xs)), .001)
        g['mask'] = np.ones((len(ys), len(xs)), dtype=np.uint8)
    cfg = {'grid': {'epsg': 32647, 'bbox_utm_m': [0, 0, 250, 250]},
           'read': {'gcov_group': '/grid', 'layers': ['HHHH', 'HVHV'], 'cache_dir': 'cache'},
           'references': {k: {'epsg': 32647, 'bbox_utm_m': [0, 0, 250, 250]} for k in ('water', 'stable')}}
    row = dict(track='105', direction='D', frame='080', acq_utc='2026-10-31T11:54:58Z',
               date_local='2026-10-31', crid='P05036', granule='synthetic', url='unused')
    @contextmanager
    def source(url):
        with file.open('rb') as stream:
            yield stream
    result = read_acquisition(row, cfg, tmp_path, open_source=source)
    assert result['valid_pixel_fraction'] == 1
    with np.load(result['path'], allow_pickle=False) as d:
        assert reference_observation(row, d)['water_n_valid'] == 144
        aggregate = aggregate_cells(d['hh'], d['hv'], d['xs'], d['ys'], [0], [0], 250, .7)
        assert aggregate['n_valid'].tolist() == [625]
        assert pixel_fraction_states(d['hh'], d['hv'], d['xs'], d['ys'], [0], [0], 250, .7, -14, -20)[1].tolist() == [2]


def test_empty_mask_scene_is_skipped_without_restoring_states(tmp_path, monkeypatch):
    import read_cache
    cfg = {'read': {'network_retries': 0}}
    row = dict(track='112', direction='A', frame='010', acq_utc='2026-08-20T22:54:19Z',
               date_local='2026-08-21', crid='P05023', granule='synthetic')
    monkeypatch.setattr(read_cache, 'load_inputs', lambda *args: (cfg, [row], tmp_path))
    monkeypatch.setattr(read_cache, 'read_acquisition', lambda *a, **kw: {'valid_pixel_fraction': 0., 'cache_hit': True})
    result = read_cache.read_batch('unused', tmp_path / 'out')
    assert not result['acquisitions']
    assert result['skipped'][0]['detail'] == 'NoValidPixelsAfterGCOVMask'
