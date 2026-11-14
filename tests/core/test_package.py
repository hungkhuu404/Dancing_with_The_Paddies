import zipfile
from pathlib import Path

from package_handoff import safe_members, validate_provenance, validate_frozen_snapshot
import json
import pytest


def test_package_members_reject_secret_and_link_escape(tmp_path):
    (tmp_path / "ok.csv").write_text("cell_id\nE0N0\n")
    (tmp_path / "earthdata_token.txt").write_text("not-a-real-token")
    assert [p.name for p in safe_members(tmp_path)] == ["ok.csv"]


def test_provenance_rejects_changed_config_before_packaging(tmp_path):
    run = tmp_path / "run"; out = tmp_path / "output"
    (run / "config").mkdir(parents=True); out.mkdir()
    (run / "config/tan_hoi.toml").write_text("changed")
    (out / "run_manifest.json").write_text(json.dumps({"config_sha256": "not-matching", "code_sha256": {}}))
    with pytest.raises(ValueError, match="ProcessingConfigChangedSinceRun"):
        validate_provenance(out, run)


def test_provenance_uses_explicit_config_outside_code_directory(tmp_path):
    import hashlib
    run = tmp_path / 'core'; out = tmp_path / 'out'
    run.mkdir(); out.mkdir()
    config = tmp_path / 'site.toml'; config.write_bytes(b'site = "example"')
    (run / 'science.py').write_bytes(b'# source')
    (out / 'run_manifest.json').write_text(json.dumps({'config_sha256': hashlib.sha256(config.read_bytes()).hexdigest(),
        'code_sha256': {'science.py': hashlib.sha256(b'# source').hexdigest()}}))
    assert validate_provenance(out, run, config)['config_sha256'] == hashlib.sha256(config.read_bytes()).hexdigest()
    config.write_bytes(b'changed')
    with pytest.raises(ValueError, match='ProcessingConfigChangedSinceRun'):
        validate_provenance(out, run, config)


def test_frozen_package_rejects_changed_scientific_artifact(tmp_path):
    import hashlib
    out = tmp_path / "output"; out.mkdir()
    artifact = out / "cube.npz"
    artifact.write_bytes(b"changed")
    evidence = {"artifacts_sha256": {"cube.npz": hashlib.sha256(b"original").hexdigest()}}
    (out / "acceptance.json").write_text(json.dumps(evidence))
    (out / "method_freeze.json").write_text(json.dumps({"status": "frozen", "frozen_utc": "2026-11-13T00:00:00Z", "acceptance": evidence}))
    with pytest.raises(ValueError, match="FrozenArtifactChanged"):
        validate_frozen_snapshot(out, tmp_path)


def test_zip_root_keeps_handoff_name_not_last_source_filename(tmp_path, monkeypatch):
    import hashlib
    import package_handoff
    run = tmp_path / "run"; out = tmp_path / "output"
    (run / "config").mkdir(parents=True); (run / "tests").mkdir(); (run / "reference-selection").mkdir(); out.mkdir()
    config = '[catalog]\noutput_file = "../catalog.csv"\n[boundary]\nfile = "../aoi.geojson"\n[landcover]\nfile = "../landcover.csv"\n[read]\ncache_dir = "../cache"\n'
    (run / "config/tan_hoi.toml").write_text(config)
    for name in ("catalog.csv", "aoi.geojson", "landcover.csv", "requirements.txt"):
        (run / name).write_text("fixture")
    (run / "reference-selection/selection.json").write_text("{}")
    for name in ("science.py", "gcov_io.py", "read_cache.py", "run_pipeline.py", "probe_access.py"):
        (run / name).write_text("# fixture")
    for name in ("tan_hoi_cube.npz", "tan_hoi_metrics.csv", "method_freeze.draft.json"):
        (out / name).write_text("fixture")
    (out / "reference.json").write_text('{"tracks":{}}')
    (out / "manifest.json").write_text('{"acquisitions":[],"skipped":[]}')
    (out / "run_manifest.json").write_text(json.dumps({"config_sha256": hashlib.sha256((run / "config/tan_hoi.toml").read_bytes()).hexdigest(), "code_sha256": {"science.py": hashlib.sha256(b"# fixture").hexdigest()}}))
    monkeypatch.setattr(package_handoff, "__file__", str(run / "package_handoff.py"))
    package_handoff.package(out, "H2A", tmp_path / "delivery")
    with zipfile.ZipFile(tmp_path / "delivery/H2A.zip") as archive:
        assert "H2A/SHA256.json" in archive.namelist()
        assert all(name.startswith("H2A/") for name in archive.namelist())
