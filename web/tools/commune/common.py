"""Shared constants/helpers for the whole-commune tiling. Reuses landing/scripts/layout/geo.py (UTM, loaders, radar, S2)."""
import sys, json
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
SP = HERE.parent
sys.path.insert(0, str(SP))
sys.path.insert(0, str(SP / "geo"))
from recovery_paths import build_dir, source_dir, aoi_file
from site_config import PROFILE, POSITIONAL, frame_polygon
from geo import utm, inverse_utm, lines_utm, polys_utm, inside, optical, radar_db, radar, merc
OUT = build_dir() / PROFILE["scene"]["base"].rstrip("/").split("/")[-1] / "out"
WORK = OUT.parent / "work"
AOI = aoi_file() if PROFILE["boundary"]["mode"] == "polygon" else None
OE, ON = PROFILE["origin"]["utm_e"], PROFILE["origin"]["utm_n"]                           # global origin = frame centre
FE0, FE1, FN0, FN1 = [PROFILE["frame"][k] for k in ("e0", "e1", "n0", "n1")]
TILE = 2000.0
SEED = 20261113

def tile_centre(i, j): return PROFILE["tile_grid"]["first_e"] + TILE * i, PROFILE["tile_grid"]["first_n"] + TILE * j

def commune_utm():
    if PROFILE["boundary"]["mode"] == "frame": return np.array(frame_polygon(), float)
    g = json.loads(AOI.read_text(encoding="utf8"))
    g = g["features"][0]["geometry"] if g.get("type") == "FeatureCollection" else g.get("geometry", g)
    assert g["type"] == "Polygon", g["type"]
    c = np.array(g["coordinates"][0], float)
    p = np.stack(utm(c[:, 0], c[:, 1]), 1)
    return p if np.allclose(p[0], p[-1]) else np.vstack([p, p[:1]])

def poly_mask(poly, e0, n_top, res, W, H):
    """Scanline raster: cell (r, c) centre = (e0 + (c+.5)res, n_top - (r+.5)res) inside the closed UTM ring."""
    m = np.zeros((H, W), bool)
    x0, y0, x1, y1 = poly[:-1, 0], poly[:-1, 1], poly[1:, 0], poly[1:, 1]
    for r in range(H):
        y = n_top - (r + .5) * res
        k = (y0 > y) != (y1 > y)
        if not k.any(): continue
        xi = np.sort(x0[k] + (y - y0[k]) * (x1[k] - x0[k]) / (y1[k] - y0[k]))
        for a, b in zip(xi[::2], xi[1::2]):
            c0 = max(int(np.ceil((a - e0) / res - .5)), 0); c1 = min(int(np.floor((b - e0) / res - .5)), W - 1)
            if c1 >= c0: m[r, c0:c1 + 1] = True
    return m

def write_rgb(path, rgb, q=85):
    import OpenImageIO as oiio
    H, W = rgb.shape[:2]
    spec = oiio.ImageSpec(W, H, 3, "uint8"); spec.attribute("compression", f"webp:{q}")
    o = oiio.ImageOutput.create(str(path)); assert o.open(str(path), spec), o.geterror()
    o.write_image(np.ascontiguousarray(np.clip(rgb, 0, 1).astype(np.float32))); o.close()
    chk = oiio.ImageBuf(str(path)).spec(); assert (chk.width, chk.height) == (W, H)

def rdp(p, eps=0.5):
    if len(p) < 3: return p
    a, b = p[0], p[-1]; d = b - a; L = np.hypot(*d)
    dist = np.abs(d[0]*(p[:, 1]-a[1]) - d[1]*(p[:, 0]-a[0])) / L if L > 0 else np.hypot(*(p - a).T)
    i = int(np.argmax(dist))
    if dist[i] <= eps: return np.array([a, b])
    return np.vstack([rdp(p[:i+1], eps)[:-1], rdp(p[i:], eps)])

_POLY = None
def in_commune(E, N):
    """exact point-in-polygon (UTM) against the commune ring"""
    global _POLY
    if _POLY is None: _POLY = commune_utm()
    return inside(_POLY, E, N)
