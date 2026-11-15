"""Tân's local S1–S5 runner, producing the agreed internal handoff formats."""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import time

import numpy as np
from pyproj import Transformer
from shapely import contains_xy, transform
from shapely.geometry import shape

from check_inputs import require_inputs
from read_cache import event, load_inputs, read_batch
from gcov_io import validate_cached_record
from science import aggregate_cells, classify, evaluate_references, filter_dual, metrics_for_cell, pixel_fraction_states


def build_grid(cfg, base):
    raw = json.loads((Path(base) / cfg["boundary"]["file"]).read_text(encoding="utf-8"))
    geometry = raw["features"][0]["geometry"] if raw["type"] == "FeatureCollection" else raw.get("geometry", raw)
    project = Transformer.from_crs(cfg["boundary"]["epsg"], cfg["grid"]["epsg"], always_xy=True)
    aoi = transform(shape(geometry), project.transform, interleaved=False)
    size = cfg["grid"]["cell_size_m"]
    x0, y0, x1, y1 = cfg["grid"]["bbox_utm_m"]
    gx, gy = np.meshgrid(np.arange(x0, x1, size), np.arange(y0, y1, size))
    selected = contains_xy(aoi, gx + size / 2, gy + size / 2)
    cells = sorted((f"E{int(x)}N{int(y)}", int(x), int(y)) for x, y in zip(gx[selected], gy[selected]))
    return np.array([c[0] for c in cells]), np.array([c[1] for c in cells]), np.array([c[2] for c in cells])


def reference_observation(row, data):
    observation = {"acq_utc": row["acq_utc"], "track": row["track"] + row["direction"], "crid": row["crid"]}
    for label in ("water", "stable"):
        hh, hv = data[f"ref_{label}_hh"], data[f"ref_{label}_hv"]
        valid = np.isfinite(hh) & np.isfinite(hv) & (hh > 0) & (hv > 0)
        observation[f"{label}_n_valid"] = int(valid.sum())
        observation[f"{label}_n_total"] = int(valid.size)
        for pol, array in (("hh", hh), ("hv", hv)):
            observation[f"{label}_{pol}_db"] = float(10 * np.log10(array[valid].mean(dtype=np.float64))) if valid.any() else None
    return observation


def write_json(value, path):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(path)


def write_metrics(rows, path):
    path = Path(path)
    temporary = path.with_suffix(".csv.tmp")
    with temporary.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: str(v).lower() if isinstance(v, bool) else v for k, v in row.items()})
    temporary.replace(path)


def build_method_definition(cfg, run, rules, quality):
    if cfg["thresholds"]["filter_single_anomaly"] is not True:
        raise ValueError("DualFilterRequired")
    return {
        "site": cfg["site"], "status": "draft_not_frozen", "frozen_utc": None,
        "threshold_rules": rules, "reference_regions": cfg["references"],
        "min_valid_pixel_fraction": cfg["thresholds"]["min_valid_pixel_fraction"],
        "classification": {"name": "pixel_fraction_75_dual_50", "water_fraction": 0.75,
            "fill_min_fraction": 0.5, "joint_valid_fraction": cfg["thresholds"]["min_valid_pixel_fraction"],
            "valid_mask": "gcov_fully_focused_1_254",
            "comparison": "HH and HV linear power strictly below their acquisition thresholds"},
        "selection": {"status": "post_hoc", "reference": "DSWx-S1; agreement is not independent validation or ground truth"},
        "single_anomaly_filter": {"enabled": cfg["thresholds"]["filter_single_anomaly"], "comparison": "simultaneous 75% raw valid observations; N-to-W fill requires at least 50% water pixels; missing ignored"},
        "metric_definitions": {"source": "docs/data-contract.md",
            "aggregation": "HH/HV means are diagnostic only; classify jointly valid pixels before 75% aggregation",
            "main_episode": "latest starting consecutive W episode among valid observations",
            "durations": "UTC acquisition differences, days rounded to one decimal",
            "status_precedence": ["no_data", "never_water", "always_water", "flooded", "water_gone"],
            "minimum_observations": 4, "gt30": "strictly more than 30 days, cropland only",
            "no_data_periods": "null", "never_water_periods": "null"},
        "config_sha256": run["config_sha256"], "code_sha256": run["code_sha256"],
        "disclosure": "Pixel method selected post-hoc after reviewing per-cell DSWx agreement; DSWx is not ground truth.",
        "quality": quality,
    }


def process(config_path, output, track=None, read_network=True, force=False, freeze=False, bang_tests=None, bang_receipt=None):
    started = time.monotonic()
    output = Path(output).resolve()
    if (output / "method_freeze.json").exists():
        raise FileExistsError("FrozenOutputDirectoryIsImmutable")
    if freeze:
        from freeze_method import finalize
        return finalize(config_path, output, bang_tests, bang_receipt=bang_receipt)
    require_inputs(config_path)
    cfg, rows, base = load_inputs(config_path, track)
    if cfg["thresholds"]["filter_single_anomaly"] is not True:
        raise ValueError("DualFilterRequired")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if read_network:
        manifest = read_batch(config_path, output, track, force)
    else:
        manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    records = {r["acq_utc"]: r for r in manifest["acquisitions"]}
    skipped = {r["acq_utc"] for r in manifest["skipped"]}
    missing = [r["acq_utc"] for r in rows if r["acq_utc"] not in records and r["acq_utc"] not in skipped]
    if missing or not records:
        raise ValueError("IncompleteAcquisitionCache")
    rows = [r for r in rows if r["acq_utc"] in records]
    for row in rows:
        validate_cached_record(row, cfg, records[row["acq_utc"]])
    cell_id, cell_x, cell_y = build_grid(cfg, base)
    if not 2300 <= len(cell_id) <= 2380 and cfg["site"] == "tan_hoi":
        raise ValueError("UnexpectedCommuneCellCount")
    with (base / cfg["landcover"]["file"]).open(encoding="utf-8-sig", newline="") as source:
        landcover = {r["cell_id"]: r["cropland"].lower() == "true" for r in csv.DictReader(source)}
    if set(landcover) != set(cell_id):
        raise ValueError("LandcoverCellMismatch")
    stage_timings = {"S1_initial_reads": round(sum(r["duration_s"] for r in manifest["acquisitions"]), 3)}
    stage_started = time.monotonic()
    observations, hh, hv = [], [], []
    for row in rows:
        with np.load(records[row["acq_utc"]]["path"], allow_pickle=False) as data:
            aggregated = aggregate_cells(data["hh"], data["hv"], data["xs"], data["ys"], cell_x, cell_y,
                cfg["grid"]["cell_size_m"], cfg["thresholds"]["min_valid_pixel_fraction"])
            hh.append(aggregated["hh_db"])
            hv.append(aggregated["hv_db"])
            observations.append(reference_observation(row, data))
        event("pipeline.aggregate", track=row["track"] + row["direction"], date=row["date_local"], valid_cells=int(np.isfinite(hh[-1]).sum()))
    stage_timings["S2"] = round(time.monotonic() - stage_started, 3)
    stage_started = time.monotonic()
    reference, rules = evaluate_references(observations, cfg["thresholds"]["hh_db"], cfg["thresholds"]["hv_db"], cfg["references"]["water"]["min_pixels"])
    reference.update({"observations": observations, "regions": cfg["references"], "acquisition_rules": rules})
    write_json(reference, output / "reference.json")
    if any(r["hh_db_max"] is None or r["hv_db_max"] is None for r in rules):
        raise ValueError("ReferenceThresholdUnresolved")
    stage_timings["S3"] = round(time.monotonic() - stage_started, 3)
    stage_started = time.monotonic()
    hh, hv = np.stack(hh), np.stack(hv)
    th, tv = [r["hh_db_max"] for r in rules], [r["hv_db_max"] for r in rules]
    raw50, raw75 = [], []
    for i, row in enumerate(rows):
        with np.load(records[row["acq_utc"]]["path"], allow_pickle=False) as data:
            a, b = pixel_fraction_states(data["hh"], data["hv"], data["xs"], data["ys"], cell_x, cell_y,
                cfg["grid"]["cell_size_m"], cfg["thresholds"]["min_valid_pixel_fraction"], th[i], tv[i])
            raw50.append(a)
            raw75.append(b)
    raw50, raw = np.stack(raw50), np.stack(raw75)
    states = filter_dual(raw50, raw)
    hh[raw == 0] = np.nan
    hv[raw == 0] = np.nan
    stage_timings["S4"] = round(time.monotonic() - stage_started, 3)
    stage_started = time.monotonic()
    times = [r["acq_utc"] for r in rows]
    tracks = [r["track"] + r["direction"] for r in rows]
    metrics = [{"cell_id": str(cid), **metrics_for_cell(states[:, i], times, tracks, landcover[cid])} for i, cid in enumerate(cell_id)]
    stage_timings["S5"] = round(time.monotonic() - stage_started, 3)
    stable_hh = np.array([o["stable_hh_db"] for o in observations], dtype=float)[:, None]
    stable_hv = np.array([o["stable_hv_db"] for o in observations], dtype=float)[:, None]
    stable_states = classify(stable_hh, stable_hv, th, tv)
    stable_valid = stable_states != 0
    stable_water_share = float((stable_states == 2).sum() / stable_valid.sum()) if stable_valid.any() else None
    quality = {
        "s1_coverage": all(records[r["acq_utc"]]["valid_pixel_fraction"] >= (.70 if r["track"] == "148" else .95) for r in rows),
        "s2_cell_count": len(cell_id),
        "s3_every_water_window_1000_valid": all(o["water_n_valid"] >= cfg["references"]["water"]["min_pixels"] for o in observations),
        "s3_p2": all(t["p2"] == "pass" for t in reference["tracks"].values()),
        "s3_fallbacks_recorded": all(r["rule"] in ("Q0", "Q1") for r in rules),
        "s4_stable_water_share": stable_water_share,
        "s4_stable_control": stable_water_share is not None and stable_water_share <= .05,
        "s5_duration_order": all(m["flood_days_min"] is None or m["flood_days_max"] is None or m["flood_days_min"] <= m["flood_days_max"] for m in metrics),
        "bang1_external_tests_received": (Path(__file__).parent / "verification/bang1-receipt.json").is_file(),
    }
    cube = {"cell_id": cell_id, "acq_utc": np.array(times), "track": np.array(tracks),
        "frame": np.array([r["frame"] for r in rows]), "crid": np.array([r["crid"] for r in rows]),
        "rule": np.array([r["rule"] for r in rules]), "hh_db_max": np.array(th), "hv_db_max": np.array(tv),
        "hh_db": hh, "hv_db": hv, "s_raw": raw, "s": states}
    temporary = output / (cfg["site"] + "_cube.npz.tmp")
    with temporary.open("wb") as target:
        np.savez_compressed(target, **cube)
    temporary.replace(output / (cfg["site"] + "_cube.npz"))
    write_metrics(metrics, output / (cfg["site"] + "_metrics.csv"))
    status_counts = dict(Counter(m["status"] for m in metrics))
    package_versions = {name: importlib.metadata.version(name) for name in ("numpy", "h5py", "fsspec", "aiohttp", "pyproj", "shapely")}
    run = {"site": cfg["site"], "config_sha256": hashlib.sha256(Path(config_path).read_bytes()).hexdigest(),
        "code_sha256": {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in
            ("run_pipeline.py", "science.py", "check_inputs.py", "gcov_io.py", "read_cache.py", "probe_access.py", "bang1_adapter.py", "freeze_method.py", "package_handoff.py")},
        "generated_utc": datetime.now(timezone.utc).isoformat(), "duration_s": round(time.monotonic() - started, 3),
        "libraries": package_versions, "stage_timings_s": stage_timings,
        "skipped": manifest["skipped"],
        "acquisitions": [{k: row[k] for k in ("acq_utc", "track", "direction", "frame", "crid", "granule")} for row in rows],
        "quality": quality, "status_counts": status_counts,
        "internal_handoff_ready": False, "notes": ["External BANG-1 acceptance is recorded separately in acceptance.json after this processing run; internal synthetic tests are separate.", "CONTRACT-001 approval not inferred from draft docs.", "WorldCover 2021 selection does not establish current ground truth."]}
    write_json(run, output / "run_manifest.json")
    freeze_definition = build_method_definition(cfg, run, rules, quality)
    write_json(freeze_definition, output / "method_freeze.draft.json")
    event("pipeline.output", output=str(output), acquisitions=len(rows), cells=len(cell_id), status_counts=status_counts, quality=quality)
    return run


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--track")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--freeze", action="store_true")
    parser.add_argument("--bang-tests")
    parser.add_argument("--bang-receipt")
    args = parser.parse_args()
    try:
        process(args.config, args.output, args.track, not args.offline, args.force, args.freeze, args.bang_tests, args.bang_receipt)
    except Exception as error:
        event("pipeline.failed", error_type=type(error).__name__, error_code=str(error) if type(error) is ValueError and (str(error).isidentifier() or str(error).startswith("PipelineInputsIncomplete:")) else "SeeSafeStageEvents")
        raise SystemExit(2)
