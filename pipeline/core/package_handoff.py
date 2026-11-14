"""Create an explicit local handoff package; never upload or claim receipt."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tomllib
import zipfile


def safe_members(root):
    root = Path(root).resolve()
    forbidden = ("token", "secret", "credential", ".env", ".venv")
    return [p for p in sorted(root.rglob("*")) if p.is_file() and not p.is_symlink()
        and p.resolve().is_relative_to(root) and not any(word in str(p.relative_to(root)).lower() for word in forbidden)]


def validate_provenance(output, run_root, config_path=None):
    run = json.loads((Path(output) / "run_manifest.json").read_text(encoding="utf-8"))
    config_file = Path(config_path) if config_path is not None else Path(run_root) / "config/tan_hoi.toml"
    config_hash = hashlib.sha256(config_file.read_bytes()).hexdigest()
    if config_hash != run["config_sha256"]:
        raise ValueError("ProcessingConfigChangedSinceRun")
    for name, expected in run["code_sha256"].items():
        path = Path(run_root) / name
        if path.parent != Path(run_root) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("ProcessingCodeChangedSinceRun")
    return run


def validate_frozen_snapshot(output, run_root):
    output, run_root = Path(output), Path(run_root)
    if not (output / "method_freeze.json").is_file():
        return None
    frozen = json.loads((output / "method_freeze.json").read_text(encoding="utf-8"))
    acceptance = json.loads((output / "acceptance.json").read_text(encoding="utf-8"))
    if frozen.get("status") != "frozen" or not frozen.get("frozen_utc") or frozen.get("acceptance") != acceptance:
        raise ValueError("InvalidFrozenSnapshot")
    for name, expected in acceptance["artifacts_sha256"].items():
        path = (output / name).resolve()
        if path.parent != output.resolve() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("FrozenArtifactChanged")
    for name, expected in (("bang1_adapter.py", acceptance["bang1"]["adapter_sha256"]), ("freeze_method.py", acceptance["finalizer_sha256"])):
        if hashlib.sha256((run_root / name).read_bytes()).hexdigest() != expected:
            raise ValueError("AcceptanceCodeChanged")
    return acceptance


def package(output, name, destination, config_path=None, selection_path=None, bang_suite=None, bang_receipt=None):
    output = Path(output).resolve()
    run_root = Path(__file__).resolve().parent
    config_path = Path(config_path).resolve() if config_path else run_root / "config/tan_hoi.toml"
    selection_path = Path(selection_path).resolve() if selection_path else run_root / "reference-selection/selection.json"
    run = validate_provenance(output, run_root, config_path)
    acceptance = validate_frozen_snapshot(output, run_root)
    if not selection_path.is_file():
        raise FileNotFoundError("ReferenceSelectionRequired")
    if acceptance and (bang_suite is None or bang_receipt is None):
        raise ValueError("ExplicitBang1SuiteAndReceiptRequired")
    if acceptance:
        suite = Path(bang_suite).resolve()
        if suite.name == "tests":
            suite = suite.parent
        receipt_path = Path(bang_receipt).resolve()
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt["files"] != acceptance["bang1"]["suite_files_sha256"] or receipt["archive_sha256"] != acceptance["bang1"]["archive_sha256"]:
            raise ValueError("ReceiptDoesNotMatchAcceptance")
    target = Path(destination).resolve() / name
    if target.exists():
        raise FileExistsError("ExistingHandoffPreserved")
    target.mkdir(parents=True)
    for filename in ("tan_hoi_cube.npz", "tan_hoi_metrics.csv", "reference.json", "run_manifest.json", "method_freeze.draft.json"):
        shutil.copy2(output / filename, target / filename)
    if acceptance:
        for filename in ("method_freeze.json", "acceptance.json"):
            shutil.copy2(output / filename, target / filename)
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    cache = target / "cache"
    cache.mkdir()
    for record in manifest["acquisitions"]:
        source = Path(record["path"])
        if acceptance and hashlib.sha256(source.read_bytes()).hexdigest() != acceptance["real_data"]["cache_sha256"].get(source.name):
            raise ValueError("FrozenCacheChanged")
        shutil.copy2(source, cache / source.name)
        if acceptance and hashlib.sha256((cache / source.name).read_bytes()).hexdigest() != acceptance["real_data"]["cache_sha256"][source.name]:
            raise ValueError("CopiedFrozenCacheMismatch")
        record["path"] = "cache/" + source.name
    if acceptance:
        shutil.copy2(output / "manifest.json", target / "manifest.json")
        (target / "manifest.portable.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    else:
        (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    code = target / "pipeline/core"
    code.mkdir(parents=True)
    for filename in ("science.py", "gcov_io.py", "read_cache.py", "run_pipeline.py", "probe_access.py", "bang1_adapter.py", "freeze_method.py", "package_handoff.py"):
        if not (run_root / filename).is_file():
            continue
        shutil.copy2(run_root / filename, code / filename)
    tests_dir = run_root / "tests" if (run_root / "tests").is_dir() else run_root.parents[1] / "tests/core"
    requirements = run_root / "requirements.txt" if (run_root / "requirements.txt").is_file() else run_root.parents[1] / "requirements.txt"
    shutil.copytree(tests_dir, target / "internal_tests", ignore=shutil.ignore_patterns("__pycache__", "test_package.py"))
    shutil.copy2(requirements, target / "requirements.txt")
    shutil.copy2(config_path, target / "processing_config.toml")
    config_text = config_path.read_text(encoding="utf-8")
    cfg = tomllib.loads(config_text)
    sources = target / "source-data"
    sources.mkdir()
    for key, field, source_name in (("catalog", "output_file", "catalog.csv"), ("boundary", "file", "aoi.geojson"), ("landcover", "file", "tan_hoi_landcover.csv")):
        original = cfg[key][field]
        shutil.copy2((config_path.parent / original).resolve(), sources / source_name)
        config_text = config_text.replace(f'{field} = "{original}"', f'{field} = "source-data/{source_name}"')
    config_text = config_text.replace(f'cache_dir = "{cfg["read"]["cache_dir"]}"', 'cache_dir = "cache"')
    (target / "portable_config.toml").write_text(config_text, encoding="utf-8")
    shutil.copy2(selection_path, target / "reference_selection.json")
    if hashlib.sha256((target / "processing_config.toml").read_bytes()).hexdigest() != run["config_sha256"]:
        raise ValueError("CopiedConfigHashMismatch")
    for filename, expected in run["code_sha256"].items():
        if hashlib.sha256((code / filename).read_bytes()).hexdigest() != expected:
            raise ValueError("CopiedCodeHashMismatch")
    if acceptance:
        for filename, expected in acceptance["bang1"]["suite_files_sha256"].items():
            source = (suite / filename).resolve()
            if not source.is_relative_to(suite):
                raise ValueError("SuitePathEscape")
            if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
                raise ValueError("ReceivedBang1FileChanged")
            destination_file = target / "BANG-1" / filename
            destination_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination_file)
        evidence = target / "evidence"
        evidence.mkdir()
        shutil.copy2(receipt_path, evidence / "bang1-receipt.json")
        for key, extension in (("log_sha256", "txt"), ("junit_sha256", "xml")):
            matches = [p for p in (output / "verification").glob("bang1-final-*." + extension) if hashlib.sha256(p.read_bytes()).hexdigest() == acceptance["bang1"][key]]
            if not matches:
                raise ValueError("AcceptanceTestEvidenceMissing")
            shutil.copy2(matches[0], evidence / ("bang1." + extension))
    note = "# " + name + "\n\n"
    note += "Bản chuẩn bị local của Tân, actor OpenCode. Chưa upload, chưa có xác nhận đã nhận.\n"
    note += "Cube theo task board mục 6, trục t × n, mã 0/1/2 = thiếu/không nước/nước. CSV null là ô trống, boolean true/false.\n"
    note += "manifest.json trỏ cache tương đối từ thư mục gói. Mỗi cache có hh/hv công suất tuyến tính, xs/ys UTM, epsg, utc, crid và hai cửa sổ tham chiếu.\n"
    if acceptance:
        note = note.replace("manifest.json trỏ cache tương đối từ thư mục gói.", "manifest.json giữ nguyên bản đã nghiệm thu để kiểm hash; manifest.portable.json trỏ cache tương đối từ thư mục gói.")
    if acceptance:
        note += "BANG-1 cũ đạt 62 test, không skip; chỉ kiểm các hàm phương pháp cũ, không xác nhận phân loại pixel. method_freeze.json là snapshot phương pháp pixel hậu kiểm, chưa gửi hoặc được xác nhận nhận.\n"
        note += "acceptance.json ghi kiểm tra mới nhất. run_manifest.json và method_freeze.draft.json giữ nguyên lịch sử xử lý trước nghiệm thu; trạng thái nhận bộ test không đồng nghĩa bộ test đã đạt ở thời điểm xử lý.\n"
        note += "CONTRACT-001 2.0.0 đề xuất; cần hai nhóm xác nhận. Phương pháp pixel được chọn sau khi đã xem DSWx, không phải kiểm chứng độc lập.\n"
        note += "Chạy lại BANG-1 từ thư mục gói: python -I -m pytest -p no:cacheprovider -q BANG-1/tests --bang1-adapter pipeline/core/bang1_adapter.py --bang1-require-adapter.\n"
    else:
        note += "BANG-2 đã dùng. Gói chưa có nghiệm thu BANG-1. method_freeze.draft.json KHÔNG phải H3, frozen_utc vẫn null.\n"
    reference = json.loads((output / "reference.json").read_text(encoding="utf-8"))
    note += "\n## P1–P3 và phương án theo spec\n\n"
    for track, report in reference["tracks"].items():
        note += f"- {track}: P1 {report['p1']}, P2 {report['p2']}, P3 {report['p3']}.\n"
    note += "P1 không đạt dùng Q1 theo track; P3 không đạt dùng Q1 của chính ảnh P05036. Ngưỡng cụ thể ở cube và reference.json. Quy tắc pixel 75% và ngưỡng lấp 50% được chọn hậu kiểm sau khi xem DSWx.\n"
    note += "Nguồn code nằm pipeline/core; các script dùng import cùng thư mục. processing_config.toml giữ nguyên cấu hình đã tính và hash trong run_manifest. portable_config.toml chỉ đổi đường dẫn sang source-data/ và cache/ của gói.\n"
    note += "Để đọc lại cache: gọi read_cache.py --config portable_config.toml --output rerun, thêm --track 047D cho gói H2A. Khi chạy run_pipeline.py, cache hợp lệ không tải mạng. Bộ test nội bộ cần PYTHONPATH trỏ pipeline/core.\n"
    note += "Code và tests có trợ giúp AI; số liệu chỉ từ GCOV thật, không có dữ liệu giả và không có payload DSWx Tân Hội.\n"
    (target / "DOC_BAN_GIAO.md").write_text(note, encoding="utf-8")
    members = safe_members(target)
    hashes = {p.relative_to(target).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in members}
    (target / "SHA256.json").write_text(json.dumps(hashes, indent=2), encoding="utf-8")
    archive_path = target.with_suffix(".zip")
    with zipfile.ZipFile(archive_path, "x", compression=zipfile.ZIP_STORED) as archive:
        for path in safe_members(target):
            archive.write(path, arcname=name + "/" + path.relative_to(target).as_posix())
    print(json.dumps({"package": str(archive_path), "bytes": archive_path.stat().st_size, "sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(), "uploaded": False}))
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--destination", default="handoff")
    parser.add_argument("--config", required=True)
    parser.add_argument("--reference-selection", required=True)
    parser.add_argument("--bang-suite")
    parser.add_argument("--bang-receipt")
    args = parser.parse_args()
    package(args.output, args.name, args.destination, args.config, args.reference_selection, args.bang_suite, args.bang_receipt)
