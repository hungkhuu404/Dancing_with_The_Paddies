"""BANG-3: OPERA DSWx-S1 reader -> per-cell water fractions per pass.

Config-driven (TOML). Token path from env EARTHDATA_TOKEN_FILE; token and signed
URLs are never printed. Modes: cells_250 (product, Tan Hoi) and dev_npz
(reproduces the H0 dev-site reference).
"""
import argparse
import csv
import json
import os
import tempfile
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np


def _ssl_ctx():
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def load_config(path):
    path = Path(path).resolve()
    with open(path, "rb") as f:
        cfg = tomllib.load(f)
    cfg["_base"] = path.parent  # paths are relative to the supplied TOML
    return cfg


def rel(cfg, p):
    return (cfg["_base"] / p).resolve()


# ---------------------------------------------------------------- grid
def cell_id(x, y):
    return f"E{int(x)}N{int(y)}"


def build_grid(cfg):
    """Return dict: ids (n,), bounds (n,4) x0,y0,x1,y1, shape (tuple) of output cell array,
    window (xmin,ymin,xmax,ymax) to read."""
    g = cfg["grid"]
    if g["mode"] == "dev_npz":
        d0 = np.load(rel(cfg, g["npz_path"]))
        xs, ys = d0["xs"], d0["ys"]
        R = C = int(g["cell_px"])
        pad = g["edge_pad_m"]
        nr, nc = len(ys) // R, len(xs) // C
        ids, bounds = [], []
        for i in range(nr):
            for j in range(nc):
                ids.append(f"r{i}c{j}")
                bounds.append((xs[j * C] - pad, ys[(i + 1) * R - 1] - pad,
                               xs[(j + 1) * C - 1] + pad, ys[i * R] + pad))
        m = g["window_margin_m"]
        return dict(ids=np.array(ids), bounds=np.array(bounds, float), shape=(nr, nc),
                    window=(xs[0] - m, ys[-1] - m, xs[-1] + m, ys[0] + m), epsg=int(d0["epsg"]))
    if g["mode"] == "cells_250":
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from landcover import cells_in_polygon, load_boundary
        size = g["cell_size_m"]
        frame = (g["frame_e_min"], g["frame_e_max"], g["frame_n_min"], g["frame_n_max"])
        if g.get("boundary_path"):
            s = dict(cfg["site"], boundary_epsg=g["boundary_epsg"], epsg=cfg["site"]["epsg"])
            poly = load_boundary({"_base": cfg["_base"], "site": dict(s, boundary_path=g["boundary_path"])})
        else:  # no commune boundary: every cell of the frame
            from shapely.geometry import box
            poly = box(frame[0], frame[2], frame[1], frame[3])
        cells = cells_in_polygon(poly, frame, size)
        ids = np.array([cell_id(x, y) for x, y in cells])
        bounds = np.array([(x, y, x + size, y + size) for x, y in cells], float)
        m = g["window_margin_m"]
        return dict(ids=ids, bounds=bounds, shape=(len(cells),),
                    window=(frame[0] - m, frame[2] - m, frame[1] + m, frame[3] + m),
                    epsg=int(cfg["site"]["epsg"]))
    raise ValueError("unknown grid mode")


# ---------------------------------------------------------------- aggregation
def aggregate(a, tf, bounds, th):
    """a: 2D code array, tf: Affine of a. Returns F1, F3, VS (n,) float arrays.
    Pixel geometry: cell bounds -> pixel index range by rounding (same as H0 prototype)."""
    n = len(bounds)
    f1 = np.full(n, np.nan)
    f3 = np.full(n, np.nan)
    vs = np.zeros(n)
    inv = ~tf
    for k, (x0, y0, x1, y1) in enumerate(bounds):
        c0, r0 = inv * (x0, y1)
        c1, r1 = inv * (x1, y0)
        b = a[max(int(round(r0)), 0):max(int(round(r1)), 0), max(int(round(c0)), 0):max(int(round(c1)), 0)]
        ok = b < th["valid_code_lt"]
        if b.size:
            vs[k] = ok.mean()
            if ok.any() and vs[k] >= th["valid_share_min"]:
                f1[k] = (b[ok] == th["water_code"]).mean()
                f3[k] = (b[ok] == th["extra_code"]).mean()
    return f1, f3, vs


def flags(f1, f3, vs, th):
    valid = vs >= th["valid_share_min"]
    with np.errstate(invalid="ignore"):
        water = valid & (f1 >= th["water_share_min"])
        water13 = valid & ((f1 + f3) >= th["water_share_min"])
    return valid, water, water13


# ---------------------------------------------------------------- CMR
def parse_ur(gid):
    p = gid.split("_")
    return p[3], p[4]  # tile, acquisition time


def select_latest(items):
    """Keep latest version (largest GranuleUR) per (tile, acquisition time)."""
    latest = {}
    for g in items:
        gid = g["umm"]["GranuleUR"]
        key = parse_ur(gid)
        if key not in latest or gid > latest[key]["umm"]["GranuleUR"]:
            latest[key] = g
    return latest


def cmr_search(cfg):
    s, b = cfg["search"], cfg["site"]["bbox"]
    items, page = [], 1
    while True:
        q = urllib.parse.urlencode({
            "short_name": s["short_name"], "bounding_box": ",".join(str(v) for v in b),
            "temporal": f"{s['temporal_start']},{s['temporal_end']}",
            "page_size": s["page_size"], "page_num": page})
        with urllib.request.urlopen(f"{s['cmr_url']}?{q}", timeout=60, context=_ssl_ctx()) as r:
            it = json.load(r)["items"]
        items += it
        if len(it) < s["page_size"]:
            break
        page += 1
    return items


def to_local(acq, tzname):
    """'20260818T224403Z' -> (utc aware, local aware)."""
    utc = datetime.strptime(acq, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    return utc, utc.astimezone(ZoneInfo(tzname))


def layer_url(g, suffix):
    return next((u["URL"] for u in g["umm"]["RelatedUrls"]
                 if u["URL"].startswith("https") and u["URL"].endswith(suffix)), None)


# ---------------------------------------------------------------- signed read
class _NoFollow(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def _sign(url, token):
    op = urllib.request.build_opener(_NoFollow, urllib.request.HTTPSHandler(context=_ssl_ctx()))
    try:
        op.open(urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}), timeout=60)
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307):
            return e.headers["Location"]
        raise RuntimeError(f"HTTP {e.code}") from None
    return url


def read_window(url, token, epsg, window, retries=2):
    """Return (array, transform6 list) or None if CRS differs. Retries network errors."""
    os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_USE_HEAD="NO",
                      GDAL_HTTP_MAX_RETRY="3", GDAL_HTTP_RETRY_DELAY="2")
    import rasterio
    from rasterio.windows import from_bounds
    last = None
    for _ in range(retries + 1):
        try:
            with rasterio.open(_sign(url, token)) as s:
                if s.crs is None or s.crs.to_epsg() != epsg:
                    return None
                w = from_bounds(*window, s.transform).round_offsets().round_lengths()
                inside = (w.col_off >= 0 and w.row_off >= 0 and w.col_off + w.width <= s.width
                          and w.row_off + w.height <= s.height)
                a = s.read(1, window=w) if inside else s.read(1, window=w, boundless=True, fill_value=255)
                return a, list(s.window_transform(w))[:6]
        except RuntimeError as e:
            if str(e).startswith("HTTP 40"):
                raise
            last = e
        except Exception as e:  # network/GDAL
            last = e
    raise last


def cached_window(cfg, g, token, grid, force=False):
    cache = rel(cfg, cfg["output"]["cache_dir"])
    cache.mkdir(parents=True, exist_ok=True)
    f = cache / (g["umm"]["GranuleUR"] + ".npz")
    if f.exists() and not force:
        d = np.load(f)
        return d["a"], list(d["tf"]), True
    url = layer_url(g, cfg["search"]["layer_suffix"])
    if not url:
        return None
    r = read_window(url, token, grid["epsg"], grid["window"])
    if r is None:
        return None
    a, tf = r
    fd, tmp = tempfile.mkstemp(dir=cache, suffix=".tmp")
    os.close(fd)
    with open(tmp, "wb") as fh:
        np.savez_compressed(fh, a=a, tf=np.array(tf))
    os.replace(tmp, f)
    return a, tf, False


# ---------------------------------------------------------------- main
def merge_same_pass(td, tdu, F1, F3, VS, gap_s=600):
    """Tiles of one Sentinel-1 pass (UTC times < gap_s apart) become one slice; per cell the
    tile with the highest valid share wins. No-op when every pass has a single tile."""
    t = [datetime.fromisoformat(x) for x in tdu]
    groups, cur = [], [0]
    for k in range(1, len(t)):
        if (t[k] - t[cur[0]]).total_seconds() < gap_s:
            cur.append(k)
        else:
            groups.append(cur); cur = [k]
    groups.append(cur)
    if all(len(g) == 1 for g in groups):
        return td, tdu, F1, F3, VS
    o1, o3, ov, otd, otu = [], [], [], [], []
    for g in groups:
        best = np.argmax(VS[g], axis=0)
        col = np.arange(VS.shape[1])
        o1.append(F1[g][best, col]); o3.append(F3[g][best, col]); ov.append(VS[g][best, col])
        otd.append(td[g[0]]); otu.append(tdu[g[0]])
    return otd, otu, np.stack(o1), np.stack(o3), np.stack(ov)


def run(cfg, force=False):
    from affine import Affine
    tok_file = os.environ.get("EARTHDATA_TOKEN_FILE")
    if not tok_file:
        raise SystemExit("EARTHDATA_TOKEN_FILE not set")
    token = Path(tok_file).expanduser().read_text(encoding="utf-8").strip()
    th, tz = cfg["thresholds"], cfg["search"]["local_tz"]
    grid = build_grid(cfg)
    items = cmr_search(cfg)
    latest = select_latest(items)
    print("granules", len(items), "kept", len(latest), flush=True)
    td, tdu, F1, F3, VS = [], [], [], [], []
    for key in sorted(latest, key=lambda k: k[1]):
        g = latest[key]
        utc, loc = to_local(key[1], tz)
        try:
            r = cached_window(cfg, g, token, grid, force)
        except Exception as e:
            print("read error", loc.date(), type(e).__name__, flush=True)
            if isinstance(e, RuntimeError) and str(e).startswith("HTTP 40"):
                raise SystemExit("auth failure, stop")
            continue
        if r is None:
            continue
        a, tf, _ = r
        f1, f3, vs = aggregate(a, Affine(*tf), grid["bounds"], th)
        td.append(loc.replace(tzinfo=None).isoformat())
        tdu.append(utc.replace(tzinfo=None).isoformat())
        F1.append(f1); F3.append(f3); VS.append(vs)
        print(f"  {loc:%d/%m %H:%M} valid cells {np.isfinite(f1).mean():.0%} | "
              f"code 1 {np.nanmean(f1):.1%} | code 3 {np.nanmean(f3):.1%}", flush=True)
    F1, F3, VS = np.stack(F1), np.stack(F3), np.stack(VS)
    td, tdu, F1, F3, VS = merge_same_pass(td, tdu, F1, F3, VS)
    valid, water, water13 = flags(F1, F3, VS, th)
    sh = (len(td),) + grid["shape"]
    out = rel(cfg, cfg["output"]["npz"])
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez(out, F1=F1.reshape(sh), F3=F3.reshape(sh), VS=VS.reshape(sh), TD=np.array(td),
             TD_utc=np.array(tdu), cell_id=grid["ids"], cell_bounds=grid["bounds"],
             valid=valid.reshape(sh), water=water.reshape(sh), water13=water13.reshape(sh))
    with open(rel(cfg, cfg["output"]["csv"]), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["date_local", "time_local", "n_valid_cells", "mean_code1_share",
                    "mean_code3_share", "water_cell_share", "water13_cell_share"])
        for k, t in enumerate(td):
            nv = int(valid[k].sum())
            w.writerow([t[:10], t[11:16], nv, f"{np.nanmean(F1[k]):.4f}", f"{np.nanmean(F3[k]):.4f}",
                        f"{water[k].sum() / nv:.4f}" if nv else "", f"{water13[k].sum() / nv:.4f}" if nv else ""])
    print("wrote", out.name)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("config")
    ap.add_argument("--force", action="store_true", help="re-download cached windows")
    args = ap.parse_args()
    try:
        run(load_config(args.config), args.force)
    except SystemExit:
        raise
    except Exception as e:  # never print message/traceback (may hold signed URL)
        raise SystemExit(f"failed: {type(e).__name__}")


if __name__ == "__main__":
    main()
