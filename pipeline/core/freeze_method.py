"""Verify the protocol regression suite and real outputs, then freeze one local snapshot."""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

import numpy as np

from package_handoff import validate_provenance
from read_cache import load_inputs
from science import aggregate_cells, classify, evaluate_references, filter_dual, metrics_for_cell, pixel_fraction_states
from gcov_io import validate_cached_record


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify_suite(suite, receipt):
    suite = Path(suite).resolve()
    for name, expected in receipt["files"].items():
        path = (suite / name).resolve()
        if not path.is_relative_to(suite) or not path.is_file() or sha256(path) != expected:
            raise ValueError("ReceivedBang1FileChanged")


def write_exclusive_json(value, destination):
    destination = Path(destination)
    fd, name = tempfile.mkstemp(dir=destination.parent, suffix=".freeze.tmp")
    temporary = Path(name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as target:
            json.dump(value, target, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
            target.flush()
            os.fsync(target.fileno())
        os.link(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def validate_draft(draft, expected):
    if draft != expected:
        raise ValueError("MethodDraftDoesNotMatchVerifiedRun")


def validate_cube_metadata(cube, catalog, rules):
    expected = {"track": [r["track"] + r["direction"] for r in catalog],
        "frame": [r["frame"] for r in catalog], "crid": [r["crid"] for r in catalog],
        "rule": [r["rule"] for r in rules]}
    if any(cube[name].tolist() != values for name, values in expected.items()):
        raise ValueError("CubeAcquisitionMetadataMismatch")


def validate_aggregate_values(actual_hh, actual_hv, cube_hh, cube_hv):
    if not np.array_equal(actual_hh, cube_hh, equal_nan=True) or not np.array_equal(actual_hv, cube_hv, equal_nan=True):
        raise ValueError("CubeDoesNotMatchCachedRasters")


def check_outputs(config_path, output):
    from run_pipeline import build_grid, build_method_definition, reference_observation
    cfg, catalog, base = load_inputs(config_path)
    output = Path(output)
    run = validate_provenance(output, Path(__file__).resolve().parent, config_path)
    if sha256(config_path) != run["config_sha256"]:
        raise ValueError("SuppliedConfigDoesNotMatchRun")
    reference = json.loads((output / "reference.json").read_text(encoding="utf-8"))
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    records = {r["acq_utc"]: r for r in manifest["acquisitions"]}
    observations, coverage, cache_hashes, aggregate_hh, aggregate_hv = [], [], {}, [], []
    grid_ids, grid_x, grid_y = build_grid(cfg, base)
    cache_root = (base / cfg["read"]["cache_dir"]).resolve()
    for row in catalog:
        record = records[row["acq_utc"]]
        path = Path(record["path"]).resolve()
        if not path.is_relative_to(cache_root):
            raise ValueError("CacheOutsideConfiguredDirectory")
        validate_cached_record(row, cfg, record)
        cache_hashes[path.name] = sha256(path)
        with np.load(path, allow_pickle=False) as data:
            observations.append(reference_observation(row, data))
            hh, hv = data["hh"], data["hv"]
            valid = np.isfinite(hh) & np.isfinite(hv) & (hh > 0) & (hv > 0)
            xs, ys = data["xs"], data["ys"]
            pixel_area = abs(float(xs[1] - xs[0]) * float(ys[1] - ys[0]))
            x0, y0, x1, y1 = cfg["grid"]["bbox_utm_m"]
            fraction = float(valid.sum() / ((x1 - x0) * (y1 - y0) / pixel_area))
            coverage.append(fraction >= (.7 if row["track"] == "148" else .95))
            aggregate = aggregate_cells(hh, hv, xs, ys, grid_x, grid_y, cfg["grid"]["cell_size_m"], cfg["thresholds"]["min_valid_pixel_fraction"])
            aggregate_hh.append(aggregate["hh_db"])
            aggregate_hv.append(aggregate["hv_db"])
    report, rules = evaluate_references(observations, cfg["thresholds"]["hh_db"], cfg["thresholds"]["hv_db"], cfg["references"]["water"]["min_pixels"])
    if observations != reference["observations"] or report["tracks"] != reference["tracks"] or report["qc_pass"] != reference["qc_pass"] or reference["regions"] != cfg["references"]:
        raise ValueError("ReferenceReportMismatch")
    with (base / cfg["landcover"]["file"]).open(encoding="utf-8-sig", newline="") as source:
        cropland = {r["cell_id"]: r["cropland"].lower() == "true" for r in csv.DictReader(source)}
    with (output / (cfg["site"] + "_metrics.csv")).open(encoding="utf-8-sig", newline="") as source:
        metric_rows = list(csv.DictReader(source))
    if len({r["cell_id"] for r in metric_rows}) != len(metric_rows):
        raise ValueError("DuplicateMetricCell")
    metrics = {r["cell_id"]: r for r in metric_rows}
    with np.load(output / (cfg["site"] + "_cube.npz"), allow_pickle=False) as cube:
        ids = cube["cell_id"].tolist()
        times = cube["acq_utc"].tolist()
        tracks = cube["track"].tolist()
        if times != [r["acq_utc"] for r in catalog] or ids != grid_ids.tolist() or len(set(ids)) != len(ids) or set(ids) != set(metrics) or set(ids) != set(cropland):
            raise ValueError("HandoffIdentityMismatch")
        validate_cube_metadata(cube, catalog, rules)
        expected_tracks = {p["track"] + p["direction"] for p in cfg["catalog"]["passes"]}
        if set(tracks) != expected_tracks or cube["s"].shape != (len(times), len(ids)):
            raise ValueError("CubeShapeMismatch")
        a50, a75 = [], []
        for i, row in enumerate(catalog):
            with np.load(records[row["acq_utc"]]["path"], allow_pickle=False) as data:
                first, second = pixel_fraction_states(data["hh"], data["hv"], data["xs"], data["ys"], grid_x, grid_y,
                    cfg["grid"]["cell_size_m"], cfg["thresholds"]["min_valid_pixel_fraction"],
                    rules[i]["hh_db_max"], rules[i]["hv_db_max"])
                a50.append(first)
                a75.append(second)
        raw = np.stack(a75)
        expected_hh, expected_hv = np.stack(aggregate_hh), np.stack(aggregate_hv)
        expected_hh[raw == 0] = np.nan
        expected_hv[raw == 0] = np.nan
        validate_aggregate_values(expected_hh, expected_hv, cube["hh_db"], cube["hv_db"])
        filtered = filter_dual(np.stack(a50), raw) if cfg["thresholds"]["filter_single_anomaly"] else raw
        if not np.array_equal(raw, cube["s_raw"]) or not np.array_equal(filtered, cube["s"]):
            raise ValueError("CubeStateMismatch")
        if rules != reference["acquisition_rules"] or not np.array_equal(cube["hh_db_max"], [r["hh_db_max"] for r in rules]) or not np.array_equal(cube["hv_db_max"], [r["hv_db_max"] for r in rules]):
            raise ValueError("ReferenceRuleMismatch")
        statuses = Counter()
        for i, cell_id in enumerate(ids):
            expected = metrics_for_cell(filtered[:, i], times, tracks, cropland[cell_id])
            for key, value in expected.items():
                text = "" if value is None else str(value).lower() if isinstance(value, bool) else str(value)
                if metrics[cell_id].get(key) != text:
                    raise ValueError("MetricPayloadMismatch")
            if expected["onset_after_local"] and expected["onset_by_local"] and expected["onset_after_local"] >= expected["onset_by_local"]:
                raise ValueError("OnsetBoundsMismatch")
            statuses[expected["status"]] += 1
    stable = classify(np.array([o["stable_hh_db"] for o in observations])[:, None], np.array([o["stable_hv_db"] for o in observations])[:, None],
        [r["hh_db_max"] for r in rules], [r["hv_db_max"] for r in rules])
    stable_share = float((stable == 2).sum() / (stable != 0).sum()) if (stable != 0).any() else None
    checked_quality = {"s1_coverage": bool(all(coverage)),
        "s3_every_water_window_1000_valid": all(o["water_n_valid"] >= cfg["references"]["water"]["min_pixels"] for o in observations),
        "s3_p2": all(t["p2"] == "pass" for t in report["tracks"].values()),
        "s3_fallbacks_recorded": all(r["rule"] in ("Q0", "Q1") for r in rules),
        "s4_stable_control": stable_share is not None and stable_share <= .05,
        "s5_duration_order": all(not r["flood_days_min"] or not r["flood_days_max"] or float(r["flood_days_min"]) <= float(r["flood_days_max"]) for r in metric_rows)}
    if not all(checked_quality.values()) or any(run["quality"].get(key) != value for key, value in checked_quality.items()):
        raise ValueError("RealDataQualityGateFailed")
    draft = json.loads((output / "method_freeze.draft.json").read_text(encoding="utf-8"))
    validate_draft(draft, build_method_definition(cfg, run, rules, run["quality"]))
    if dict(statuses) != run["status_counts"] or not set(statuses) <= {"never_water", "always_water", "flooded", "water_gone", "no_data"}:
        raise ValueError("StatusAreaMismatch")
    cell_ha = cfg["grid"]["cell_size_m"] ** 2 / 10000
    return {"n_acquisitions": len(times), "n_cells": len(ids), "area_ha": len(ids) * cell_ha,
        "status_ha": {name: count * cell_ha for name, count in statuses.items()},
        "all_metrics_recomputed_and_matched": True, "all_states_recomputed_and_matched": True, "all_cell_aggregates_recomputed_and_matched": True,
        "raw_reference_qc_pass": reference["qc_pass"], "fallbacks_preserved": True,
        "recomputed_quality": checked_quality, "stable_water_share": stable_share, "cache_sha256": cache_hashes}


def finalize(config_path, output, bang_tests=None, check_only=False, bang_receipt=None):
    output = Path(output).resolve()
    frozen_path = output / "method_freeze.json"
    if frozen_path.exists():
        raise FileExistsError("FrozenOutputDirectoryIsImmutable")
    if (output / "acceptance.json").exists():
        raise FileExistsError("ExistingAcceptancePreserved")
    root = Path(__file__).resolve().parent
    if bang_tests is None or bang_receipt is None:
        raise ValueError("ExplicitBang1SuiteAndReceiptRequired")
    suite = Path(bang_tests).resolve()
    if suite.name == "tests":
        suite = suite.parent
    receipt = json.loads(Path(bang_receipt).read_text(encoding="utf-8"))
    verify_suite(suite, receipt)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    # Verify and publish a fresh owned snapshot, never a directory with active pipeline writers.
    snapshot = output.parent / ("SNAPSHOT-" + stamp)
    snapshot.mkdir()
    artifact_names = ["tan_hoi_cube.npz", "tan_hoi_metrics.csv", "reference.json", "run_manifest.json", "manifest.json", "method_freeze.draft.json"]
    for name in artifact_names:
        shutil.copy2(output / name, snapshot / name)
    output = snapshot
    frozen_path = output / "method_freeze.json"
    real_data = check_outputs(config_path, output)
    artifacts = {name: sha256(output / name) for name in artifact_names}
    adapter = root / "bang1_adapter.py"
    adapter_hash = sha256(adapter)
    evidence_dir = snapshot / "verification"
    evidence_dir.mkdir()
    xml_path = evidence_dir / ("bang1-final-" + stamp + ".xml")
    command = [sys.executable, "-I", "-m", "pytest", "-p", "no:cacheprovider", "-q", str(suite / "tests"),
        "--bang1-adapter", str(adapter), "--bang1-require-adapter", "--junitxml", str(xml_path)]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", env={**os.environ, "PYTHONUTF8": "1"})
    log = xml_path.with_suffix(".txt")
    log.write_text(result.stdout + result.stderr, encoding="utf-8")
    if result.returncode != 0 or not xml_path.is_file():
        raise ValueError("Bang1TestsFailed")
    suites = ET.parse(xml_path).getroot().iter("testsuite")
    totals = {name: 0 for name in ("tests", "failures", "errors", "skipped")}
    for test_suite in suites:
        for name in totals:
            totals[name] += int(test_suite.get(name, "0"))
    if totals != {"tests": 62, "failures": 0, "errors": 0, "skipped": 0}:
        raise ValueError("IncompleteBang1Run")
    verify_suite(suite, receipt)
    validate_provenance(output, root, config_path)
    cache_root = (Path(config_path).resolve().parent / load_inputs(config_path)[0]["read"]["cache_dir"]).resolve()
    if sha256(config_path) != json.loads((output / "run_manifest.json").read_text())["config_sha256"] or sha256(adapter) != adapter_hash or any(sha256(output / name) != value for name, value in artifacts.items()) or any(sha256(cache_root / name) != value for name, value in real_data["cache_sha256"].items()):
        raise ValueError("ArtifactChangedDuringAcceptance")
    evidence = {"accepted_utc": datetime.now(timezone.utc).isoformat(), "bang1": {**totals,
        "scope": "legacy cell-average classification and symmetric filter; does not validate pixel dual classification",
        "archive_sha256": receipt["archive_sha256"], "suite_files_sha256": receipt["files"],
        "adapter_sha256": adapter_hash, "log_sha256": sha256(log), "junit_sha256": sha256(xml_path)},
        "real_data": real_data, "artifacts_sha256": artifacts, "finalizer_sha256": sha256(__file__),
        "contract_h1": "Version 2.0.0 proposed; this method freeze does not approve the cross-team contract.",
        "delivery": "local_only_not_uploaded_or_acknowledged", "snapshot_directory": str(snapshot)}
    if check_only:
        return evidence
    frozen = json.loads((output / "method_freeze.draft.json").read_text(encoding="utf-8"))
    frozen.update(status="frozen", frozen_utc=datetime.now(timezone.utc).isoformat(), acceptance=evidence)
    frozen["quality"] = {**frozen["quality"], "bang1_external_tests_received": True, "bang1_external_tests_passed": True}
    write_exclusive_json(evidence, output / "acceptance.json")
    # Publish the freeze last: existence means complete immutable JSON is already on disk.
    write_exclusive_json(frozen, frozen_path)
    print(json.dumps({"event": "method.frozen", "snapshot_directory": str(snapshot), "bang1_tests_passed": totals["tests"], "frozen_utc": frozen["frozen_utc"]}), flush=True)
    return evidence


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--bang-tests")
    parser.add_argument("--bang-receipt")
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(finalize(args.config, args.output, args.bang_tests, args.check_only, args.bang_receipt), ensure_ascii=False, indent=2))
    except Exception as error:
        print(json.dumps({"event": "method.freeze_failed", "error_type": type(error).__name__, "error_code": str(error) if type(error) is ValueError and str(error).isidentifier() else "SeeAcceptanceEvidence"}))
        raise SystemExit(2)
