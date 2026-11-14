"""Shared geo helpers: configured northern UTM fwd/inv (numpy), Web Mercator, input loaders. Inputs are untrusted data."""
import json, math, numpy as np
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from recovery_paths import build_dir, source_dir, h0_dir
from site_config import PROFILE, frame_polygon
LANDING = build_dir()
ASSETS = source_dir()
INPUT = h0_dir() if PROFILE["inputs"]["aoi_h0"] else ASSETS
BOUNDARY = INPUT / PROFILE["inputs"]["aoi_h0"] if PROFILE["inputs"]["aoi_h0"] else None
NPZ = {key: INPUT / value for key, value in PROFILE["scene"]["radar_tracks"].items()}

def utm(lon, lat, zone=None):
    """Forward northern UTM, vectorised; defaults to the selected profile zone."""
    lon = np.asarray(lon, float); lat = np.asarray(lat, float)
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    phi, lam = np.radians(lat), np.radians(lon - (6 * (PROFILE["zone"] if zone is None else zone) - 183))
    N = a / np.sqrt(1 - e2 * np.sin(phi) ** 2)
    T, C = np.tan(phi) ** 2, ep2 * np.cos(phi) ** 2
    A = np.cos(phi) * lam
    M = a * ((1 - e2/4 - 3*e2**2/64) * phi - (3*e2/8 + 3*e2**2/32) * np.sin(2*phi)
             + (15*e2**2/256) * np.sin(4*phi))
    x = k0 * N * (A + (1-T+C) * A**3/6 + (5-18*T+T*T+72*C-58*ep2) * A**5/120) + 500000
    y = k0 * (M + N * np.tan(phi) * (A*A/2 + (5-T+9*C+4*C*C) * A**4/24
                                     + (61-58*T+T*T+600*C-330*ep2) * A**6/720))
    return x, y

def inverse_utm(e, n, zone=None):
    """Inverse by Newton on the forward series (numeric Jacobian); < 1 mm after 4 iterations here."""
    e = np.asarray(e, float); n = np.asarray(n, float)
    zone = PROFILE["zone"] if zone is None else zone
    lon = (6 * zone - 183) + (e - 500000) / 109600.0; lat = n / 110600.0
    d = 1e-6
    for _ in range(5):
        x, y = utm(lon, lat, zone)
        xa, ya = utm(lon + d, lat, zone); xb, yb = utm(lon, lat + d, zone)
        j11, j12, j21, j22 = (xa-x)/d, (xb-x)/d, (ya-y)/d, (yb-y)/d
        rx, ry = e - x, n - y
        det = j11*j22 - j12*j21
        lon = lon + (j22*rx - j12*ry)/det; lat = lat + (-j21*rx + j11*ry)/det
    return lon, lat

def merc(lon, lat):
    lon = np.asarray(lon, float); lat = np.asarray(lat, float)
    return np.radians(lon) * 6378137.0, np.log(np.tan(np.pi/4 + np.radians(lat)/2)) * 6378137.0

def load_json(p):
    return json.loads(Path(p).read_text(encoding="utf8"))

def boundary_utm():
    if PROFILE["boundary"]["mode"] == "frame": return np.array(frame_polygon(), float)
    g = load_json(BOUNDARY)["geometry"]
    assert g["type"] == "Polygon", g["type"]
    c = np.array(g["coordinates"][0], float)
    return np.stack(utm(c[:, 0], c[:, 1]), 1)

def lines_utm(name):
    """[(props, Nx2 utm array)] for LineString/MultiLineString features."""
    out = []
    for ft in load_json(ASSETS / name)["features"]:
        g = ft["geometry"]
        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"] if g["type"] == "MultiLineString" else []
        for p in parts:
            c = np.array(p, float)
            if len(c) >= 2:
                out.append((ft["properties"], np.stack(utm(c[:, 0], c[:, 1]), 1)))
    return out

def polys_utm(name):
    out = []
    for ft in load_json(ASSETS / name)["features"]:
        g = ft["geometry"]
        rings = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
        for r in rings:
            c = np.array(r[0], float)
            out.append((ft["properties"], np.stack(utm(c[:, 0], c[:, 1]), 1)))
    return out

def inside(poly, px, py):
    """Even-odd point in polygon, vectorised over points."""
    px = np.asarray(px, float); py = np.asarray(py, float)
    res = np.zeros(px.shape, bool)
    x0, y0 = poly[:-1, 0], poly[:-1, 1]; x1, y1 = poly[1:, 0], poly[1:, 1]
    for a, b, c, d in zip(x0, y0, x1, y1):
        m = (b > py) != (d > py)
        with np.errstate(divide="ignore", invalid="ignore"):
            xi = a + (py - b) * (c - a) / (d - b)
        res ^= m & (px < xi)
    return res

def radar(track):
    z = np.load(NPZ[track], allow_pickle=False)
    assert int(z["epsg"]) == PROFILE["epsg"]
    return z["hh"].astype(np.float32), z["xs"].astype(float), z["ys"].astype(float), str(z["utc"])

def bilinear(img, fx, fy):
    """Sample img (H,W[,C]) at float pixel coords (pixel centres at integer+0.5 convention handled by caller)."""
    H, W = img.shape[:2]
    fx = np.clip(fx, 0, W-1.001); fy = np.clip(fy, 0, H-1.001)
    x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int); tx = fx-x0; ty = fy-y0
    if img.ndim == 3: tx = tx[..., None]; ty = ty[..., None]
    return (img[y0, x0]*(1-tx)*(1-ty) + img[y0, x0+1]*tx*(1-ty) + img[y0+1, x0]*(1-tx)*ty + img[y0+1, x0+1]*tx*ty)

def optical(E, N):
    """RGB float [0,1] of the EOxCloudless mosaic at UTM points (via lon/lat -> EPSG:3857)."""
    import OpenImageIO as oiio
    meta = load_json(ASSETS / (PROFILE["scene"]["optical"] + ".json")); assert meta["crs"] == "EPSG:3857"
    img = oiio.ImageBuf(str(ASSETS / (PROFILE["scene"]["optical"] + ".png"))).get_pixels(oiio.FLOAT)[..., :3]
    assert img.shape[:2] == (meta["height"], meta["width"])
    x0, y0, x1, y1 = meta["bounds_3857"]
    mx, my = merc(*inverse_utm(E, N))
    fx = (mx - x0) / (x1 - x0) * meta["width"] - 0.5; fy = (y1 - my) / (y1 - y0) * meta["height"] - 0.5
    return bilinear(img, fx, fy)

def radar_db(track, E, N):
    """HH dB bilinear-sampled at UTM points; NaN where no data / outside."""
    if track not in NPZ: return np.full(np.broadcast_shapes(np.shape(E), np.shape(N)), np.nan)
    hh, xs, ys, _ = radar(track)
    fx = (E - xs[0]) / (xs[1]-xs[0]); fy = (N - ys[0]) / (ys[1]-ys[0])
    out = bilinear(hh, fx, fy)  # NaN propagates -> NaN near gaps (acceptable)
    out[(fx < 0) | (fx > len(xs)-1) | (fy < 0) | (fy > len(ys)-1)] = np.nan
    with np.errstate(divide="ignore", invalid="ignore"):
        return 10*np.log10(out)
