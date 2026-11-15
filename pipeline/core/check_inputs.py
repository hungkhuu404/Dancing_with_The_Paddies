"""Offline preflight for S1-S5; never contacts Earthdata or changes data."""
import argparse
import json
import math
from pathlib import Path
import tomllib


def check_inputs(config_path, require_files=True):
    path = Path(config_path).resolve()
    cfg = tomllib.loads(path.read_text(encoding="utf-8"))
    missing = []
    for section, field in (("boundary", "file"), ("boundary", "epsg"),
                           ("catalog", "output_file"), ("landcover", "file")):
        value = cfg.get(section, {}).get(field)
        key = section + "." + field
        if value is None:
            missing.append(key)
        elif require_files and field in ("file", "output_file") and not (path.parent / value).is_file():
            missing.append(key + ":file_missing")
    for label in ("water", "stable"):
        ref = cfg.get("references", {}).get(label, {})
        key = "references." + label
        if not isinstance(ref.get("epsg"), int):
            missing.append(key + ".epsg")
        bbox = ref.get("bbox_utm_m")
        if (not isinstance(bbox, list) or len(bbox) != 4 or
                not all(isinstance(v, (float, int)) and math.isfinite(v) for v in bbox) or
                bbox[0] >= bbox[2] or bbox[1] >= bbox[3]):
            missing.append(key + ".bbox_utm_m")
        if ref.get("status") == "pending":
            missing.append(key + ".confirmation")
    return {"site": cfg.get("site"), "ready": not missing, "files_checked": require_files, "missing": missing}


def require_inputs(config_path):
    result = check_inputs(config_path)
    if not result["ready"]:
        raise ValueError("PipelineInputsIncomplete:" + ",".join(result["missing"]))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--config", required=True)
    p.add_argument("--config-only", action="store_true", help="Check values without requiring local inputs")
    args = p.parse_args()
    result = check_inputs(args.config, require_files=not args.config_only)
    print(json.dumps(result))
    raise SystemExit(0 if result["ready"] else 2)
