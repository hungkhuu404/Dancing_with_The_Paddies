from contextlib import contextmanager
import json

import h5py
import numpy as np
import pytest

from gcov_io import read_acquisition
from gcov_io import validate_cached_record


def test_read_crop_references_and_cache_without_second_source_open(tmp_path):
    h5 = tmp_path / "input.h5"
    with h5py.File(h5, "w") as f:
        g = f.create_group("/science/LSAR/GCOV/grids/frequencyA")
        g.create_dataset("xCoordinates", data=np.arange(5, 405, 10))
        g.create_dataset("yCoordinates", data=np.arange(395, -5, -10))
        g.create_dataset("projection", data=0).attrs["epsg_code"] = 32648
        g.create_dataset("HHHH", data=np.full((40, 40), .01))
        g.create_dataset("HVHV", data=np.full((40, 40), .001))
        g.create_dataset("mask", data=np.ones((40, 40), dtype=np.uint8))
    cfg = {
        "grid": {"epsg": 32648, "bbox_utm_m": [0, 0, 250, 250]},
        "read": {"gcov_group": "/science/LSAR/GCOV/grids/frequencyA", "layers": ["HHHH", "HVHV"], "cache_dir": "cache"},
        "references": {"water": {"epsg": 32648, "bbox_utm_m": [0, 250, 100, 400]}, "stable": {"epsg": 32648, "bbox_utm_m": [0, 0, 100, 100]}},
    }
    row = dict(track="047", direction="D", frame="083", acq_utc="2026-10-27T11:23:21Z", crid="P05036", granule="test", url="https://example.invalid/input.h5")
    calls = []
    @contextmanager
    def source(url):
        calls.append(url)
        with h5.open("rb") as stream:
            yield stream
    first = read_acquisition(row, cfg, tmp_path, open_source=source)
    assert first["cache_hit"] is False
    assert first["valid_pixel_fraction"] == 1
    with np.load(first["path"], allow_pickle=False) as d:
        assert d["hh"].shape == (25, 25)
        assert d["ref_water_hh"].shape == (15, 10)
        assert d["ref_stable_hv"].shape == (10, 10)
        assert d["utc"].item() == row["acq_utc"]
        assert d["hh"][0, 0] == pytest.approx(.01)
    second = read_acquisition(row, cfg, tmp_path, open_source=source)
    assert second["cache_hit"] is True
    assert len(calls) == 1
    assert "url" not in json.dumps(first)
    cfg["references"]["water"]["bbox_utm_m"] = [0, 250, 200, 400]
    third = read_acquisition(row, cfg, tmp_path, open_source=source)
    assert third["cache_hit"] is False and len(calls) == 2
    assert Path(first["path"]) != Path(third["path"])


from pathlib import Path


def test_reader_failure_does_not_publish_cache(tmp_path):
    cfg = {"grid": {"epsg": 32648, "bbox_utm_m": [0, 0, 250, 250]}, "read": {"cache_dir": "cache"}, "references": {}}
    row = dict(track="047", direction="D", acq_utc="2026-10-27T11:23:21Z", crid="P05036", granule="test", url="https://example.invalid/input.h5")
    @contextmanager
    def failure(url):
        raise TimeoutError("secret-url-must-not-be-persisted")
        yield
    with pytest.raises(TimeoutError):
        read_acquisition(row, cfg, tmp_path, open_source=failure)
    assert not list((tmp_path / "cache").glob("*.npz"))


def test_reader_masks_unfocused_and_fill_samples_in_all_windows(tmp_path):
    h5 = tmp_path / 'input.h5'
    with h5py.File(h5, 'w') as f:
        g = f.create_group('/science/LSAR/GCOV/grids/frequencyA')
        g.create_dataset('xCoordinates', data=np.arange(5, 255, 10))
        g.create_dataset('yCoordinates', data=np.arange(245, -5, -10))
        g.create_dataset('projection', data=0).attrs['epsg_code'] = 32648
        g.create_dataset('HHHH', data=np.full((25, 25), .01))
        g.create_dataset('HVHV', data=np.full((25, 25), .001))
        mask = np.ones((25, 25), dtype=np.uint8)
        mask[0, 0] = 0
        mask[0, 1] = 255
        g.create_dataset('mask', data=mask)
    cfg = {'grid': {'epsg': 32648, 'bbox_utm_m': [0, 0, 250, 250]},
           'read': {'gcov_group': '/science/LSAR/GCOV/grids/frequencyA', 'layers': ['HHHH', 'HVHV'], 'cache_dir': 'cache'},
           'references': {k: {'epsg': 32648, 'bbox_utm_m': [0, 0, 250, 250]} for k in ('water', 'stable')}}
    row = dict(track='047', direction='D', frame='083', acq_utc='2026-10-27T11:23:21Z', crid='P05036', granule='test', url='https://example.invalid/input.h5')
    @contextmanager
    def source(_):
        with h5.open('rb') as f:
            yield f
    result = read_acquisition(row, cfg, tmp_path, open_source=source)
    assert result['valid_pixel_fraction'] == 623 / 625
    with np.load(result['path'], allow_pickle=False) as d:
        for key in ('hh', 'hv', 'ref_water_hh', 'ref_water_hv', 'ref_stable_hh', 'ref_stable_hv'):
            assert np.isnan(d[key][0, :2]).all()
            assert np.isfinite(d[key][0, 2])


def test_reader_refuses_missing_gcov_mask(tmp_path):
    h5 = tmp_path / 'input.h5'
    with h5py.File(h5, 'w') as f:
        g = f.create_group('grid')
        g.create_dataset('HHHH', data=np.ones((1, 1)))
        g.create_dataset('HVHV', data=np.ones((1, 1)))
    cfg = {'grid': {}, 'read': {'gcov_group': '/grid', 'layers': ['HHHH', 'HVHV'], 'cache_dir': 'cache'}, 'references': {}}
    row = dict(track='047', direction='D', acq_utc='2026-10-27T11:23:21Z', crid='P05036', granule='test', url='https://example.invalid/input.h5')
    @contextmanager
    def source(_):
        with h5.open('rb') as f:
            yield f
    with pytest.raises(KeyError, match='MissingGCOVMask'):
        read_acquisition(row, cfg, tmp_path, open_source=source)
    assert not list((tmp_path / 'cache').glob('*.npz'))


def test_reader_rejects_mask_shape_mismatch(tmp_path):
    h5 = tmp_path / 'input.h5'
    with h5py.File(h5, 'w') as f:
        g = f.create_group('grid')
        g.create_dataset('xCoordinates', data=np.arange(5, 255, 10))
        g.create_dataset('yCoordinates', data=np.arange(245, -5, -10))
        g.create_dataset('projection', data=0).attrs['epsg_code'] = 32648
        g.create_dataset('HHHH', data=np.ones((25, 25)))
        g.create_dataset('HVHV', data=np.ones((25, 25)))
        g.create_dataset('mask', data=np.ones((1, 1), dtype=np.uint8))
    cfg = {'grid': {'epsg': 32648, 'bbox_utm_m': [0, 0, 250, 250]},
           'read': {'gcov_group': '/grid', 'layers': ['HHHH', 'HVHV'], 'cache_dir': 'cache'},
           'references': {k: {'epsg': 32648, 'bbox_utm_m': [0, 0, 250, 250]} for k in ('water', 'stable')}}
    row = dict(track='047', direction='D', acq_utc='2026-10-27T11:23:21Z', crid='P05036', granule='test', url='https://example.invalid/input.h5')
    @contextmanager
    def source(_):
        with h5.open('rb') as f:
            yield f
    with pytest.raises(ValueError, match='GCOVMaskShapeMismatch'):
        read_acquisition(row, cfg, tmp_path, open_source=source)
    assert not list((tmp_path / 'cache').glob('*.npz'))


def test_offline_cache_rejects_changed_granule_without_opening(tmp_path):
    row = dict(acq_utc="2026-10-27T00:00:00Z", track="047", direction="D", frame="083", crid="P05036", granule="new")
    record = {**row, "granule": "old", "path": str(tmp_path / "missing.npz")}
    with pytest.raises(ValueError, match="CacheMetadataMismatch"):
        validate_cached_record(row, {}, record)


def test_cache_identity_ignores_notes_but_detects_region_changes():
    import hashlib
    from gcov_io import cache_identity
    cfg = {"grid": {"epsg": 32648}, "read": {"gcov_group": "g", "layers": ["a", "b"]},
        "references": {"water": {"epsg": 32648, "bbox_utm_m": [0, 0, 330, 330], "confirmation_owner": "before"}}}
    row = {"granule": "a"}
    initial = cache_identity(row, cfg)
    old_identity = {'grid': cfg['grid'], 'references': {'water': {'epsg': 32648, 'bbox_utm_m': [0, 0, 330, 330]}},
                    'group': 'g', 'layers': ['a', 'b'], 'granule': 'a', 'version': 2}
    assert initial != hashlib.sha256(json.dumps(old_identity, sort_keys=True).encode()).hexdigest()[:16]
    cfg["references"]["water"]["confirmation_owner"] = "after"
    assert cache_identity(row, cfg) == initial
    cfg["references"]["water"]["bbox_utm_m"][2] = 340
    assert cache_identity(row, cfg) != initial
