"""Run S1 with safe event logging, resumable cache, and explicit skipped records."""
import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import time
import tomllib
from urllib.error import HTTPError

from gcov_io import read_acquisition


def event(name, **context):
    print(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(), "event": name, **context}), flush=True)


def load_inputs(config_path, track=None):
    path = Path(config_path).resolve()
    cfg = tomllib.loads(path.read_text(encoding="utf-8"))
    with (path.parent / cfg["catalog"]["output_file"]).open(encoding="utf-8-sig", newline="") as source:
        rows = sorted(csv.DictReader(source), key=lambda r: r["acq_utc"])
    if track:
        rows = [r for r in rows if r["track"] + r["direction"] == track]
    if not rows:
        raise ValueError("EmptyAcquisitionSelection")
    keys = [(r["track"], r["direction"], r["frame"], r["acq_utc"]) for r in rows]
    if len(set(keys)) != len(keys):
        raise ValueError("DuplicateAcquisition")
    return cfg, rows, path.parent


def read_batch(config_path, output, track=None, force=False):
    cfg, rows, base = load_inputs(config_path, track)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = {"acquisitions": [], "skipped": []}
    for row in rows:
        metadata = {k: row[k] for k in ("track", "direction", "frame", "acq_utc", "date_local", "crid", "granule")}
        started = time.monotonic()
        for attempt in range(cfg["read"]["network_retries"] + 1):
            try:
                cache = read_acquisition(row, cfg, base, force=force)
                record = {**metadata, **cache, "duration_s": round(time.monotonic() - started, 3)}
                manifest["acquisitions"].append(record)
                event("gcov.cache", track=row["track"] + row["direction"], date=row["date_local"], cache_hit=cache["cache_hit"], valid_pixel_fraction=round(cache["valid_pixel_fraction"], 5), duration_s=record["duration_s"])
                break
            except Exception as error:
                # Only the exception type crosses the logging boundary, never a signed URL.
                error_type = type(error).__name__
                http_status = error.code if isinstance(error, HTTPError) else getattr(error, "status", None)
                event("gcov.read_error", track=row["track"] + row["direction"], date=row["date_local"], attempt=attempt + 1, error_type=error_type, http_status=http_status)
                if http_status in (401, 403):
                    raise PermissionError("EarthdataAuthorizationFailed") from None
                permanent = http_status is not None and 400 <= http_status < 500 and http_status not in (408, 429)
                if permanent or error_type in ("KeyError", "ValueError", "FileNotFoundError") or attempt == cfg["read"]["network_retries"]:
                    missing_hv = isinstance(error, KeyError) and error.args == ("MissingPolarization",)
                    manifest["skipped"].append({**metadata, "reason": "missing_hv" if missing_hv else "read_error", "detail": error_type})
                    break
                time.sleep(2 ** attempt)
        temporary = output / "manifest.json.tmp"
        temporary.write_text(json.dumps(manifest, indent=2, allow_nan=False), encoding="utf-8")
        temporary.replace(output / "manifest.json")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--track")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    try:
        manifest = read_batch(args.config, args.output, args.track, args.force)
        raise SystemExit(2 if manifest["skipped"] else 0)
    except Exception as error:
        event("gcov.batch_failed", error_type=type(error).__name__)
        raise SystemExit(2)
