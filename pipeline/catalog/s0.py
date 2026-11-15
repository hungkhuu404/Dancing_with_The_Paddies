#!/usr/bin/env python3
"""NISAR metadata only: configuration -> CMR -> deduplicated catalog CSV.

No Earthdata token or HDF5 download. Paths in TOML are relative to that TOML.
baseline replay is explicit and never writes the live catalog.csv.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import re
import ssl
import sys
import time
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, time as day_time, timedelta, timezone
from importlib.metadata import version
from pathlib import Path
from zoneinfo import ZoneInfo

import certifi
from pyproj import Transformer

CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
NAME = re.compile(
    r"^NISAR_L2_PR_GCOV_(?P<cycle>\d{3})_(?P<track>\d{3})_"
    r"(?P<direction>[AD])_(?P<frame>\d{3})_(?P<radar_mode>\d{4})_"
    r"(?P<polarization>[A-Z]{4})_(?P<source>[AM])_"
    r"(?P<start>\d{8}T\d{6})_(?P<end>\d{8}T\d{6})_"
    r"(?P<crid>[A-Z]\d{5})_(?P<accuracy>[PMNF])_(?P<coverage>[FP])_"
    r"(?P<tail>[A-Z])_(?P<product_version>\d{3})(?:\.h5)?$"
)
FIELDS = ["site", "track", "direction", "frame", "acq_utc", "date_local",
          "cycle", "radar_mode", "polarization", "crid", "granule", "url",
          "collection", "concept_id", "revision_id"]


class CatalogError(Exception):
    """Safe, actionable metadata/configuration failure."""


def iso_utc(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_text(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(value, encoding="utf-8")
    temp.replace(path)


def write_json(path, data):
    atomic_text(path, json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def load_config(path):
    with path.open("rb") as stream:
        config = tomllib.load(stream)
    try:
        catalog, grid = config["catalog"], config["grid"]
        zone = ZoneInfo(config["timezone"])
        first, last = catalog["start_date_local"], catalog["end_date_local"]
        if type(first) is not date or type(last) is not date or first > last:
            raise CatalogError("start/end_date_local must be ordered TOML dates")
        passes = catalog["passes"]
        if not passes or any(
            not re.fullmatch(r"\d{3}", p["track"])
            or p["direction"] not in ("A", "D")
            or not re.fullmatch(r"\d{3}", p["frame"]) for p in passes
        ):
            raise CatalogError("Every pass needs a three-digit track/frame and A/D direction")
        if catalog["mode"] != "DHDH" or set(catalog["required_polarizations"]) != {"HH", "HV"}:
            raise CatalogError("This S0 supports GCOV DHDH with both HH and HV")
        if catalog["keep_latest_crid_per_acquisition"] is not True:
            raise CatalogError("S0 requires latest CRID deduplication")
        collections = catalog["collections"]
        if not collections or any(not re.fullmatch(r"NISAR_L2_GCOV_(?:PROVISIONAL_)?V\d+", c) for c in collections):
            raise CatalogError("Only configured NISAR GCOV collections may be queried")
        bounds = grid["bbox_utm_m"]
        if len(bounds) != 4 or not all(math.isfinite(v) for v in bounds):
            raise CatalogError("bbox_utm_m requires four finite numbers")
        if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
            raise CatalogError("bbox_utm_m must be ordered west,south,east,north")
        transformer = Transformer.from_crs(grid["epsg"], 4326, always_xy=True)
        bbox = transformer.transform_bounds(*bounds, densify_pts=101, errcheck=True)
        if not (-180 <= bbox[0] < bbox[2] <= 180 and -90 <= bbox[1] < bbox[3] <= 90):
            raise CatalogError("Invalid geographic bounding box (antimeridian unsupported)")
        # Round outward so rounding does not exclude a sliver at the edge.
        bbox = [math.floor(v * 1e9) / 1e9 if i < 2 else math.ceil(v * 1e9) / 1e9
                for i, v in enumerate(bbox)]
        config["_bbox"] = bbox
        config["_start"] = datetime.combine(first, day_time.min, zone).astimezone(timezone.utc)
        config["_end"] = datetime.combine(last + timedelta(days=1), day_time.min, zone).astimezone(timezone.utc)
        config["_passes"] = {(p["track"], p["direction"], p["frame"]) for p in passes}
        config["_output"] = (path.parent / catalog["output_file"]).resolve()
    except (KeyError, TypeError, ValueError) as exc:
        raise CatalogError(f"Missing/invalid S0 configuration field: {exc}") from exc
    return config


def request_json(url, headers, retries=2):
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(url, headers={
                "Accept": "application/json", "User-Agent": "NasaPrep-QUAN1-S0/1.0", **headers,
            })
            with urllib.request.urlopen(request, timeout=45,
                                        context=ssl.create_default_context(cafile=certifi.where())) as response:
                data = json.load(response)
                result_headers = {k.lower(): v for k, v in response.headers.items()}
            if result_headers.get("cmr-timed-out", "false").lower() == "true":
                raise CatalogError("CMR-Timed-Out: true; incomplete response refused")
            return data, result_headers
        except urllib.error.HTTPError as exc:
            failure = f"CMR HTTP {exc.code}"
            retryable = exc.code in (408, 429, 500, 502, 503, 504)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            reason = getattr(exc, "reason", exc)
            failure = f"CMR {type(exc).__name__}; cause={type(reason).__name__}; errno={getattr(reason, 'errno', None)}"
            retryable = True
        if not retryable or attempt == retries:
            raise CatalogError(failure)
        time.sleep(attempt + 1)
    raise AssertionError("unreachable")


def fetch_collection(collection, config, run_dir, page_size, pages, fetch=request_json):
    query = {
        "short_name": collection,
        "bounding_box": ",".join(f"{v:.9f}" for v in config["_bbox"]),
        # CMR may include the end instant; selection below enforces [start,end).
        "temporal": f'{iso_utc(config["_start"])},{iso_utc(config["_end"])}',
        "page_size": page_size,
        "sort_key[]": ["start_date", "producer_granule_id"],
    }
    url = CMR + "?" + urllib.parse.urlencode(query, doseq=True)
    cursor, seen_cursors, all_items, expected_hits = None, set(), [], None
    number = 0
    while True:
        number += 1
        headers = {"CMR-Search-After": cursor} if cursor else {}
        data, response_headers = fetch(url, headers)
        items = data.get("items")
        if not isinstance(items, list):
            raise CatalogError("CMR UMM response has no items array")
        hits = int(response_headers["cmr-hits"]) if "cmr-hits" in response_headers else data.get("hits")
        if expected_hits is None:
            expected_hits = hits
        elif hits is not None and expected_hits != hits:
            raise CatalogError("CMR hit count changed during pagination; rerun for consistent catalog")
        filename = f"{collection}_page_{number:04d}.json"
        write_json(run_dir / filename, data)
        pages.append({"collection": collection, "page": number, "query": query,
                      "request_search_after": cursor, "hits": hits, "returned": len(items),
                      "metadata_file": filename})
        all_items.extend(items)
        if not items:
            break
        next_cursor = response_headers.get("cmr-search-after")
        if not next_cursor:
            if len(items) == page_size and (expected_hits is None or len(all_items) < expected_hits):
                raise CatalogError("Full CMR page without continuation cursor; refusing partial catalog")
            break
        if next_cursor in seen_cursors:
            raise CatalogError("Repeated CMR-Search-After cursor; refusing pagination loop")
        seen_cursors.add(next_cursor)
        cursor = next_cursor
    if expected_hits is not None and len(all_items) != expected_hits:
        raise CatalogError(f"CMR pagination incomplete: received {len(all_items)}, expected {expected_hits}")
    return [{"collection": collection, "item": item} for item in all_items]


def acquisition_key(row):
    return tuple(row[k] for k in ("track", "direction", "frame", "acq_utc"))


def h5_url(umm, granule):
    candidates = []
    for link in umm.get("RelatedUrls", []):
        url = link.get("URL", "")
        parsed = urllib.parse.urlsplit(url)
        # Exact product basename excludes QA_STATS, browse and unrelated HDF5 links.
        if (parsed.scheme == "https" and parsed.netloc
                and Path(urllib.parse.unquote(parsed.path)).name == granule + ".h5"
                and not parsed.query and not parsed.fragment):
            candidates.append((link.get("Type") != "GET DATA", url))
    return min(candidates)[1] if candidates else ""


def select_records(records, config):
    groups, audit = defaultdict(list), []
    for record in records:
        item = record["item"]
        umm, meta = item["umm"], item.get("meta", {})
        name = umm["GranuleUR"]
        match = NAME.fullmatch(name)
        if not match:
            audit.append({"granule": name, "reason": "unrecognized_granule_name"})
            continue
        parts = match.groupdict()
        granule = name.removesuffix(".h5")
        stamp = datetime.strptime(parts["start"], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        reasons = []
        if (parts["track"], parts["direction"], parts["frame"]) not in config["_passes"]:
            reasons.append("track_direction_frame_not_configured")
        if parts["polarization"] != config["catalog"]["mode"]:
            reasons.append("polarization_not_DHDH_missing_required_HH_or_HV")
        if not config["_start"] <= stamp < config["_end"]:
            reasons.append("outside_configured_local_date_interval")
        if reasons:
            audit.append({"granule": granule, "reason": "; ".join(reasons)})
            continue
        row = {k: parts[k] for k in ("track", "direction", "frame", "cycle", "radar_mode", "polarization", "crid")}
        row.update(site=config["site"], acq_utc=iso_utc(stamp),
                   date_local=stamp.astimezone(ZoneInfo(config["timezone"])).date().isoformat(),
                   granule=granule, url=h5_url(umm, granule), collection=record["collection"],
                   concept_id=meta.get("concept-id", ""), revision_id=meta.get("revision-id", 0),
                   _version=int(parts["product_version"]))
        groups[acquisition_key(row)].append(row)
    selected = []
    for key, rows in sorted(groups.items()):
        if len({r["crid"][0] for r in rows}) != 1:
            raise CatalogError(f"Cannot rank different CRID families for {key}")
        # Numeric CRID first; same CRID: newest product/CMR revision, stable lexical tie break.
        rows.sort(key=lambda r: (int(r["crid"][1:]), r["_version"], int(r["revision_id"]),
                                 bool(r["url"]), r["granule"], r["collection"], r["concept_id"]), reverse=True)
        winner = rows[0]
        if not winner["url"]:
            raise CatalogError(f'Latest granule has no direct HTTPS product .h5 URL: {winner["granule"]}')
        for row in rows[1:]:
            reason = "older_crid" if row["crid"] != winner["crid"] else "duplicate_acquisition_same_crid"
            audit.append({"granule": row["granule"], "reason": reason, "kept": winner["granule"]})
        selected.append({k: winner[k] for k in FIELDS})
    selected.sort(key=lambda r: (r["acq_utc"], r["track"], r["direction"], r["frame"]))
    return selected, audit


def read_h0(path):
    records = []
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            url = row["url"]
            name = Path(urllib.parse.unquote(urllib.parse.urlsplit(url).path)).stem
            match = NAME.fullmatch(name)
            if not match:
                raise CatalogError(f"baseline URL has unrecognized granule basename: {name}")
            parts = match.groupdict()
            # baseline row fields must agree with the actual product filename.
            for field, h0field in (("track", "track"), ("direction", "huong"), ("frame", "frame"),
                                   ("crid", "crid"), ("polarization", "phan_cuc")):
                if parts[field] != row[h0field]:
                    raise CatalogError(f"baseline field {h0field} disagrees with product filename: {name}")
            stamp = iso_utc(datetime.strptime(parts["start"], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc))
            if stamp != row["utc"]:
                raise CatalogError(f"baseline UTC disagrees with product filename: {name}")
            records.append({"collection": "H0_OFFLINE", "item": {
                "umm": {"GranuleUR": name, "RelatedUrls": [{"URL": url, "Type": "GET DATA"}]}, "meta": {},
            }})
    return records


def counts(rows):
    return dict(sorted(Counter(f'{r["track"]}/{r["direction"]}/{r["frame"]}' for r in rows).items()))


def reconcile(rows, baseline, audit):
    actual, expected = {acquisition_key(r): r for r in rows}, {acquisition_key(r): r for r in baseline}
    rejected = {a["granule"]: a["reason"] for a in audit}
    changes = []
    for key in sorted(actual.keys() | expected.keys()):
        new, old = actual.get(key), expected.get(key)
        if old is None:
            changes.append({"kind": "added", "granule": new["granule"],
                            "reason": "Returned by current CMR query and passes config; absent from the selected baseline. New footprint/time metadata vs later ingest cannot be distinguished from baseline CSV alone."})
        elif new is None:
            changes.append({"kind": "missing", "granule": old["granule"],
                            "reason": rejected.get(old["granule"], "Acquisition absent from completed current CMR query; deletion/metadata change not established by this query.")})
        elif new["granule"] != old["granule"]:
            changes.append({"kind": "replacement", "granule": new["granule"], "previous": old["granule"],
                            "reason": f'Current selection by latest CRID/product revision: {old["crid"]} -> {new["crid"]}'})
        elif new["url"] != old["url"]:
            changes.append({"kind": "url_change", "granule": new["granule"], "reason": "Same granule, different direct URL in current metadata"})
    return changes


def csv_text(rows):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def comparison_markdown(manifest, rows, baseline, changes, h0_audit):
    lines = ["# S0 — đối chiếu danh mục", "", f'- Nguồn chạy: `{manifest["source"]}`.',
             f'- Trạng thái: `{manifest["status"]}`; metadata UTC: `{manifest["started_utc"]}`.',
             "- Chỉ kiểm metadata và URL; không tải hoặc xác nhận nội dung HDF5.", "",
             "| Track/hướng/frame | baseline sau lọc | Kết quả |", "| --- | ---: | ---: |"]
    old_counts, new_counts = counts(baseline), counts(rows)
    for track in sorted(old_counts.keys() | new_counts.keys()):
        lines.append(f"| {track} | {old_counts.get(track, 0)} | {new_counts.get(track, 0)} |")
    lines += ["", f"Tổng: {len(baseline)} baseline hợp lệ; {len(rows)} dòng kết quả.", "", "## Chênh lệch", ""]
    if not changes:
        lines.append("Không có chênh lệch granule hoặc URL so với baseline sau lọc.")
    for change in changes:
        lines += [f'- **{change["kind"]}** `{change["granule"]}`: {change["reason"]}']
        if "previous" in change:
            lines.append(f'  - Bản baseline: `{change["previous"]}`.')
    lines += ["", "## Các granule baseline bị loại theo cấu hình", ""]
    lines += [f'- `{a["granule"]}`: {a["reason"]}.' for a in h0_audit]
    if manifest["source"] != "CMR_LIVE":
        lines += ["", "**Đây chỉ là kiểm lại baseline. Chưa xác nhận metadata hiện tại, phân trang mạng hoặc phủ khung UTM mới.**"]
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--h0-csv", type=Path, help="Optional baseline comparison (never used to fill live gaps)")
    parser.add_argument("--h0-check-only", action="store_true", help="Offline replay; writes catalog_h0_check.csv only")
    parser.add_argument("--page-size", type=int, default=200)
    args = parser.parse_args(argv)
    if not 1 <= args.page_size <= 2000:
        parser.error("--page-size must be 1..2000")
    if args.h0_check_only and not args.h0_csv:
        parser.error("--h0-check-only requires --h0-csv")
    config_path = args.config.resolve()
    config = load_config(config_path)
    output = config["_output"]
    if args.h0_check_only:
        output = output.with_name("catalog_h0_check.csv")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = output.parent / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    manifest = {
        "source": "H0_OFFLINE" if args.h0_check_only else "CMR_LIVE", "status": "running",
        "started_utc": iso_utc(datetime.now(timezone.utc)), "site": config["site"],
        "config_sha256": hashlib.sha256(config_path.read_bytes()).hexdigest(),
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "python": sys.version.split()[0], "pyproj": version("pyproj"), "certifi": version("certifi"),
        "bbox_wgs84": config["_bbox"], "start_utc_inclusive": iso_utc(config["_start"]),
        "end_utc_exclusive": iso_utc(config["_end"]), "page_size": args.page_size, "pages": [],
    }
    began = time.monotonic()
    try:
        baseline, h0_audit = [], []
        if args.h0_csv:
            h0_records = read_h0(args.h0_csv)
            baseline, h0_audit = select_records(h0_records, config)
            manifest["h0_sha256"] = hashlib.sha256(args.h0_csv.read_bytes()).hexdigest()
            manifest["h0_input_rows"] = len(h0_records)
        if args.h0_check_only:
            records = h0_records
        else:
            records = []
            for collection in config["catalog"]["collections"]:
                print(f"Querying {collection} ...", flush=True)
                records.extend(fetch_collection(collection, config, run_dir, args.page_size, manifest["pages"]))
        rows, audit = select_records(records, config)
        write_json(run_dir / "selection_audit.json", audit)
        if any(a["reason"] == "unrecognized_granule_name" for a in audit):
            raise CatalogError("Unrecognized NISAR granule names; see selection_audit.json before accepting catalog")
        if not rows:
            raise CatalogError("No matching acquisitions; refusing to replace catalog with an empty result")
        if len({acquisition_key(r) for r in rows}) != len(rows):
            raise CatalogError("Duplicate acquisitions survived selection")
        changes = reconcile(rows, baseline, audit) if args.h0_csv else []
        content = csv_text(rows)
        manifest.update(status="complete", input_records=len(records), output_rows=len(rows), counts=counts(rows),
                        catalog_sha256=hashlib.sha256(content.encode()).hexdigest(),
                        acquisitions=[{k: r[k] for k in ("granule", "crid", "url")} for r in rows],
                        h0_counts=counts(baseline), differences=changes)
        atomic_text(run_dir / output.name, content)
        if args.h0_csv:
            atomic_text(run_dir / "comparison.md", comparison_markdown(manifest, rows, baseline, changes, h0_audit))
        atomic_text(output, content)
        print(json.dumps({"output": str(output), "rows": len(rows), "counts": counts(rows),
                          "comparison": str(run_dir / "comparison.md") if args.h0_csv else None}, ensure_ascii=False))
        return 0
    except (CatalogError, OSError, ValueError, KeyError) as exc:
        # Network exceptions are sanitized in request_json. Never log token/link exception payloads.
        message = str(exc) if isinstance(exc, CatalogError) else type(exc).__name__
        manifest.update(status="failed", error=message)
        print(f"S0 failed: {message}", file=sys.stderr)
        print("Existing catalog was not replaced; this run is incomplete.", file=sys.stderr)
        return 1
    finally:
        manifest["elapsed_seconds"] = round(time.monotonic() - began, 3)
        manifest["finished_utc"] = iso_utc(datetime.now(timezone.utc))
        write_json(run_dir / "run_manifest.json", manifest)
        print(f"Run manifest: {run_dir / 'run_manifest.json'}", flush=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CatalogError as exc:
        print(f"S0 configuration error: {exc}", file=sys.stderr)
        raise SystemExit(2)
