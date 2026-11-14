"""BANG-2: ESA WorldCover 2021 cropland/built-up share per 250 m cell (Tan Hoi)."""
import argparse
import json
import os
import tomllib
from pathlib import Path

import numpy as np


def load_config(path):
    path = Path(path).resolve()
    with open(path, "rb") as f:
        cfg = tomllib.load(f)
    cfg["_base"] = path.parent  # paths are relative to the supplied TOML
    return cfg


def rel(cfg, p):
    return (cfg["_base"] / p).resolve()


def cell_id(x, y):
    return f"E{int(x)}N{int(y)}"


def load_boundary(cfg):
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform
    s = cfg["site"]
    if not s.get("boundary_path"):  # no commune boundary (e.g. Bang Rakam): whole frame
        from shapely.geometry import box
        return box(s["frame_e_min"], s["frame_n_min"], s["frame_e_max"], s["frame_n_max"])
    with open(rel(cfg, cfg["site"]["boundary_path"]), encoding="utf-8") as f:
        gj = json.load(f)
    geom = gj["features"][0]["geometry"] if gj["type"] == "FeatureCollection" else (
        gj["geometry"] if gj["type"] == "Feature" else gj)
    s = cfg["site"]
    tr = Transformer.from_crs(s["boundary_epsg"], s["epsg"], always_xy=True)
    return transform(tr.transform, shape(geom))


def cells_in_polygon(poly, frame, size):
    """SW corners (x, y) of cells whose center is inside poly, sorted by (y, x)."""
    from shapely import contains_xy
    e0, e1, n0, n1 = frame
    xs = np.arange(e0, e1, size)
    ys = np.arange(n0, n1, size)
    gx, gy = np.meshgrid(xs, ys)
    gx, gy = gx.ravel(), gy.ravel()
    m = contains_xy(poly, gx + size / 2, gy + size / 2)
    pts = sorted(zip(gy[m].tolist(), gx[m].tolist()))
    return [(x, y) for y, x in pts]


def fetch_window(cfg):
    """Return (array uint8, rasterio Affine) for the frame+margin window; cached."""
    import rasterio
    from pyproj import Transformer
    from rasterio.windows import Window, from_bounds
    cache = rel(cfg, cfg["worldcover"]["cache_path"])
    if cache.exists():
        with rasterio.open(cache) as ds:
            return ds.read(1), ds.transform
    s, w = cfg["site"], cfg["worldcover"]
    m = w["window_margin_m"]
    tr = Transformer.from_crs(s["epsg"], 4326, always_xy=True)
    corners = [(s["frame_e_min"] - m, s["frame_n_min"] - m), (s["frame_e_max"] + m, s["frame_n_min"] - m),
               (s["frame_e_min"] - m, s["frame_n_max"] + m), (s["frame_e_max"] + m, s["frame_n_max"] + m)]
    ll = [tr.transform(*c) for c in corners]
    lon0, lon1 = min(p[0] for p in ll), max(p[0] for p in ll)
    lat0, lat1 = min(p[1] for p in ll), max(p[1] for p in ll)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        with rasterio.open("/vsicurl/" + w["url"]) as src:
            win = from_bounds(lon0, lat0, lon1, lat1, src.transform)
            win = Window(int(np.floor(win.col_off)), int(np.floor(win.row_off)),
                         int(np.ceil(win.width)) + 1, int(np.ceil(win.height)) + 1)
            arr = src.read(1, window=win)
            transform = src.window_transform(win)
            crs = src.crs
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_name(cache.name + ".tmp")
    with rasterio.open(tmp, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1,
                       dtype=arr.dtype, crs=crs, transform=transform) as dst:
        dst.write(arr, 1)
    os.replace(tmp, cache)
    return arr, transform


def pixel_cell_indices(arr_shape, transform, epsg, size):
    """Floor each pixel CENTER (projected to UTM) to the grid. Returns (cx, cy) SW corners."""
    from pyproj import Transformer
    rows, cols = np.indices(arr_shape)
    lon, lat = transform * (cols.ravel() + 0.5, rows.ravel() + 0.5)
    tr = Transformer.from_crs(4326, epsg, always_xy=True)
    x, y = tr.transform(np.asarray(lon), np.asarray(lat))
    cx = (np.floor(x / size) * size).astype(np.int64)
    cy = (np.floor(y / size) * size).astype(np.int64)
    return cx, cy


def compute_shares(classes, cx, cy, cells, w):
    """classes/cx/cy: flat arrays. cells: list of (x, y). Returns list of dict rows."""
    nodata = w["nodata_class"]
    valid = classes != nodata
    key = {c: i for i, c in enumerate(cells)}
    idx = np.fromiter((key.get((a, b), -1) for a, b in zip(cx.tolist(), cy.tolist())),
                      dtype=np.int64, count=len(cx))
    sel = valid & (idx >= 0)
    n = len(cells)
    n_px = np.bincount(idx[sel], minlength=n)
    cnt = {}
    for name in ("cropland", "builtup", "water", "tree"):
        sel_c = sel & (classes == w[f"{name}_class"])
        cnt[name] = np.bincount(idx[sel_c], minlength=n)
    rows = []
    for i, (x, y) in enumerate(cells):
        r = {"cell_id": cell_id(x, y), "x_m": x, "y_m": y, "n_px": int(n_px[i])}
        for name in cnt:
            r[f"{name}_share"] = (cnt[name][i] / n_px[i]) if n_px[i] > 0 else None
        rows.append(r)
    return rows


def write_csv(rows, path, decimals, threshold):
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = ["cell_id", "x_m", "y_m", "n_px", "cropland_share", "builtup_share", "water_share", "tree_share", "cropland"]
    lines = [",".join(cols)]
    for r in rows:
        vals = [r["cell_id"], str(r["x_m"]), str(r["y_m"]), str(r["n_px"])]
        for k in ("cropland_share", "builtup_share", "water_share", "tree_share"):
            vals.append("" if r[k] is None else f"{round(r[k], decimals):.{decimals}f}")
        c = r["cropland_share"]
        vals.append("" if c is None else ("true" if c >= threshold else "false"))
        lines.append(",".join(vals))
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(lines) + "\n")
    os.replace(tmp, path)


def make_png(rows, poly, path, size):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig, ax = plt.subplots(figsize=(9, 8))
    cmap = plt.get_cmap("YlGn")
    for r in rows:
        v = r["cropland_share"]
        ax.add_patch(Rectangle((r["x_m"], r["y_m"]), size, size,
                               facecolor="lightgrey" if v is None else cmap(v), edgecolor="none"))
    geoms = poly.geoms if hasattr(poly, "geoms") else [poly]
    for g in geoms:
        ax.plot(*g.exterior.xy, color="k", lw=1)
    ax.set_aspect("equal")
    ax.autoscale()
    ax.set_xlabel("E (m, EPSG:32648)")
    ax.set_ylabel("N (m)")
    ax.set_title("Cropland share per 250 m cell (WorldCover 2021)")
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(0, 1))
    fig.colorbar(sm, ax=ax, label="cropland_share")
    fig.savefig(path, dpi=120, metadata={"Software": None})
    plt.close(fig)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    s, w, o = cfg["site"], cfg["worldcover"], cfg["output"]
    poly = load_boundary(cfg)
    frame = (s["frame_e_min"], s["frame_e_max"], s["frame_n_min"], s["frame_n_max"])
    cells = cells_in_polygon(poly, frame, s["cell_size_m"])
    if len(cells) != s["expected_cells"]:
        raise SystemExit(f"STOP: got {len(cells)} cells, expected {s['expected_cells']}")
    arr, transform = fetch_window(cfg)
    cx, cy = pixel_cell_indices(arr.shape, transform, s["epsg"], s["cell_size_m"])
    rows = compute_shares(arr.ravel(), cx, cy, cells, w)
    write_csv(rows, rel(cfg, o["csv"]), o["share_decimals"], w["cropland_threshold"])
    make_png(rows, poly, rel(cfg, o["png"]), s["cell_size_m"])
    print(f"cells={len(rows)} -> {rel(cfg, o['csv'])}")


if __name__ == "__main__":
    main()
