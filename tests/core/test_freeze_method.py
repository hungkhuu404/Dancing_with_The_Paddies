import hashlib
import json

import pytest

from freeze_method import finalize, verify_suite, write_exclusive_json, validate_draft, validate_aggregate_values, validate_cube_metadata
import numpy as np


def test_received_suite_tampering_is_rejected(tmp_path):
    suite = tmp_path / "BANG-1"
    suite.mkdir()
    (suite / "test.py").write_bytes(b"changed")
    receipt = {"files": {"test.py": hashlib.sha256(b"received").hexdigest()}}
    with pytest.raises(ValueError, match="ReceivedBang1FileChanged"):
        verify_suite(suite, receipt)


def test_existing_method_freeze_is_not_overwritten(tmp_path):
    output = tmp_path / "output"
    output.mkdir()
    frozen = output / "method_freeze.json"
    frozen.write_bytes(b'{"status":"frozen"}')
    with pytest.raises(FileExistsError):
        finalize(tmp_path / "missing.toml", output)
    assert frozen.read_bytes() == b'{"status":"frozen"}'
    assert sorted(p.name for p in output.iterdir()) == ["method_freeze.json"]


def test_freeze_requires_explicit_suite_and_receipt_before_creating_snapshot(tmp_path):
    output = tmp_path / 'run'
    output.mkdir()
    with pytest.raises(ValueError, match='ExplicitBang1SuiteAndReceiptRequired'):
        finalize(tmp_path / 'site.toml', output)
    assert [p.name for p in tmp_path.iterdir()] == ['run']


def test_atomic_freeze_publish_never_replaces_existing_data(tmp_path):
    destination = tmp_path / "method_freeze.json"
    write_exclusive_json({"status": "frozen"}, destination)
    assert json.loads(destination.read_text()) == {"status": "frozen"}
    before = destination.read_bytes()
    with pytest.raises(FileExistsError):
        write_exclusive_json({"status": "wrong"}, destination)
    assert destination.read_bytes() == before
    assert not list(tmp_path.glob("*.freeze.tmp"))


@pytest.mark.parametrize("field,value", [("threshold_rules", [{"hh_db_max": -99}]), ("reference_regions", {"wrong": True}), ("metric_definitions", {"wrong": True}), ("config_sha256", "wrong")])
def test_draft_must_match_verified_method_not_merely_have_a_hash(field, value):
    verified = {"threshold_rules": [], "reference_regions": {}, "metric_definitions": {}, "config_sha256": "verified"}
    changed = {**verified, field: value}
    with pytest.raises(ValueError, match="MethodDraftDoesNotMatchVerifiedRun"):
        validate_draft(changed, verified)


def test_supplied_config_itself_must_match_recorded_hash(tmp_path, monkeypatch):
    import freeze_method
    config = tmp_path / "other.toml"
    config.write_text("different input")
    monkeypatch.setattr(freeze_method, "load_inputs", lambda path: ({}, [], tmp_path))
    monkeypatch.setattr(freeze_method, "validate_provenance", lambda output, root, config: {"config_sha256": "original-run-hash"})
    with pytest.raises(ValueError, match="SuppliedConfigDoesNotMatchRun"):
        freeze_method.check_outputs(config, tmp_path)


def test_stale_cube_cannot_be_accepted_against_new_raster_aggregates():
    with pytest.raises(ValueError, match="CubeDoesNotMatchCachedRasters"):
        validate_aggregate_values(np.array([[-10.]]), np.array([[-20.]]), np.array([[-15.]]), np.array([[-20.]]))
    validate_aggregate_values(np.array([[np.nan, -15.]]), np.array([[np.nan, -20.]]), np.array([[np.nan, -15.]]), np.array([[np.nan, -20.]]))


@pytest.mark.parametrize("key", ["track", "frame", "crid", "rule"])
def test_cube_acquisition_metadata_must_match_each_catalog_row(key):
    catalog = [dict(track="047", direction="D", frame="083", crid="P05036")]
    rules = [{"rule": "Q1"}]
    cube = {"track": np.array(["047D"]), "frame": np.array(["083"]), "crid": np.array(["P05036"]), "rule": np.array(["Q1"])}
    validate_cube_metadata(cube, catalog, rules)
    cube[key] = np.array(["wrong"])
    with pytest.raises(ValueError, match="CubeAcquisitionMetadataMismatch"):
        validate_cube_metadata(cube, catalog, rules)
