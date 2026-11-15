import json
from pathlib import Path

import numpy as np

from run_pipeline import build_grid, reference_observation, write_metrics
from run_pipeline import process
import pytest


def test_grid_uses_cell_center_and_stable_ids(tmp_path):
    boundary = tmp_path / "aoi.geojson"
    boundary.write_text(json.dumps({"type": "Polygon", "coordinates": [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]]}))
    cfg = {"grid": {"epsg": 32648, "bbox_utm_m": [0, 0, 30, 30], "cell_size_m": 10}, "boundary": {"file": "aoi.geojson", "epsg": 32648}}
    ids, x, y = build_grid(cfg, tmp_path)
    assert ids.tolist() == ["E0N0", "E0N10", "E10N0", "E10N10"]
    assert x.tolist() == [0, 0, 10, 10]
    assert y.tolist() == [0, 10, 0, 10]


def test_reference_averages_linear_with_joint_mask():
    data = {}
    for name in ("water", "stable"):
        data[f"ref_{name}_hh"] = np.array([[.01, .09, np.nan]])
        data[f"ref_{name}_hv"] = np.array([[.001, .009, .1]])
    row = dict(acq_utc="2026-01-01T00:00:00Z", track="047", direction="D", crid="P05023")
    r = reference_observation(row, data)
    assert r["water_n_valid"] == 2
    assert abs(r["water_hh_db"] - -13.0102999566) < 1e-9
    assert abs(r["stable_hv_db"] - -23.0102999566) < 1e-9


def test_csv_null_and_boolean_are_safe(tmp_path):
    path = tmp_path / "metrics.csv"
    write_metrics([dict(cell_id="E0N0", ongoing=True, flood_days_max=None)], path)
    assert path.read_text() == "cell_id,ongoing,flood_days_max\nE0N0,true,\n"


def test_existing_freeze_blocks_before_any_processing(tmp_path):
    out = tmp_path / "frozen"
    out.mkdir()
    (out / "method_freeze.json").write_text('{"frozen_utc":"2026-11-13T00:00:00Z"}')
    with pytest.raises(FileExistsError):
        process(tmp_path / "missing.toml", out, read_network=False)
    assert sorted(p.name for p in out.iterdir()) == ["method_freeze.json"]


@pytest.mark.parametrize("native_pixel_m", [10, 20])
def test_offline_pipeline_preserves_skips_and_repeats_data_bytes(tmp_path, native_pixel_m):
    import csv
    import tomllib
    from gcov_io import cache_identity
    config = tmp_path / "site.toml"
    config.write_text('''site = "synthetic"
[grid]
epsg = 32648
bbox_utm_m = [0, 0, 100, 100]
cell_size_m = 100
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
bbox_utm_m = [0, 0, 100, 100]
min_pixels = 1
[references.stable]
epsg = 32648
bbox_utm_m = [0, 0, 100, 100]
''')
    (tmp_path / "aoi.geojson").write_text(json.dumps({"type": "Polygon", "coordinates": [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]}))
    (tmp_path / "landcover.csv").write_text("cell_id,cropland\nE0N0,true\n")
    cfg = tomllib.loads(config.read_text())
    rows = [dict(acq_utc=f"2026-08-{i+1:02d}T00:00:00Z", date_local=f"2026-08-{i+1:02d}", track="047", direction="D", frame="083", crid="P05023", granule=f"g{i}") for i in range(5)]
    with (tmp_path / "catalog.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    output = tmp_path / "output"; output.mkdir()
    records = []
    for i, row in enumerate(rows):
        if i == 2:
            continue
        digest = cache_identity(row, cfg)
        path = tmp_path / f"cache{i}.npz"
        side = 100 // native_pixel_m
        half = native_pixel_m / 2
        np.savez_compressed(path, hh=np.full((side, side), .01), hv=np.full((side, side), .001), xs=np.arange(half, 100, native_pixel_m), ys=np.arange(100-half, 0, -native_pixel_m),
            ref_water_hh=np.array([[.01]]), ref_water_hv=np.array([[.001]]), ref_stable_hh=np.array([[1.]]), ref_stable_hv=np.array([[1.]]), cache_key=digest, utc=row["acq_utc"], crid=row["crid"])
        records.append({**row, "path": str(path), "cache_key": digest, "valid_pixel_fraction": 1., "duration_s": 0.})
    manifest = {"acquisitions": records, "skipped": [{**rows[2], "reason": "read_error", "detail": "TimeoutError"}]}
    (output / "manifest.json").write_text(json.dumps(manifest))
    run = process(config, output, read_network=False)
    assert len(run["acquisitions"]) == 4
    assert run["skipped"][0]["acq_utc"] == rows[2]["acq_utc"]
    assert set(run["stage_timings_s"]) == {"S1_initial_reads", "S2", "S3", "S4", "S5"}
    data_files = [output / name for name in ("synthetic_cube.npz", "synthetic_metrics.csv", "reference.json")]
    first = [p.read_bytes() for p in data_files]
    process(config, output, read_network=False)
    assert [p.read_bytes() for p in data_files] == first
    with np.load(output / "synthetic_cube.npz", allow_pickle=False) as cube:
        assert cube["s"].tolist() == [[2], [2], [2], [2]]
    assert "always_water" in (output / "synthetic_metrics.csv").read_text()
