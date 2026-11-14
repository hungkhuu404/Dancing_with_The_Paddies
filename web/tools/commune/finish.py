"""Cross-tile checks, index.json and preview_all.png for the whole-commune tile set."""
import sys, json, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from collections import Counter
from common import *

from recovery_paths import reference_scene
REF = reference_scene()
refL = json.loads((REF / "layout.json").read_text(encoding="utf8"))
refP = json.loads((REF / "props.json").read_text(encoding="utf8"))
GL = json.loads((WORK / "global.json").read_text(encoding="utf8"))
tiles = GL["tiles"]
poly = commune_utm()
INFO = {"src", "road", "house", "parcel", "orient", "where", "osm_id"}

# ---------------------------------------------------------------- schema keys (same schema as the single-window files)
L_TOP = set(refL) - {"passes"}                      # passes now come from the contract data
P_TOP = set(refP)
def item_keys(ref, k): return set().union(*(set(o) for o in ref[k])) if ref[k] and isinstance(ref[k][0], dict) else None
data, sizes = {}, []
for t in tiles:
    tid = f"t_{t['i']}_{t['j']}"; d = OUT / tid
    Lt = json.loads((d / "layout.json").read_text(encoding="utf8")); Pt = json.loads((d / "props.json").read_text(encoding="utf8"))
    assert L_TOP <= set(Lt), (tid, L_TOP - set(Lt)); assert P_TOP <= set(Pt), (tid, P_TOP - set(Pt))
    assert Lt["origin"]["utm_e"] == t["utm_e"] and Lt["origin"]["utm_n"] == t["utm_n"]
    for k in ("canals", "roads", "parcels", "houses", "trees", "boats"):
        rk = item_keys(refL, k) - {"src"}
        for o in Lt[k]: assert set(o) == rk, (tid, k, set(o) ^ rk)
    for k in P_TOP - {"version", "origin", "attribution", "notes"}:
        rk = item_keys(refP, k)
        for o in Pt[k]: assert rk is None or set(o) <= rk and (rk - INFO) <= set(o) | {"tx"}, (tid, k, set(o), rk)
    assert all(p["s"] == "" for p in Lt["parcels"])
    sl, sp = (d / "layout.json").stat().st_size, (d / "props.json").stat().st_size
    assert sl <= 450_000 and sp <= 150_000, (tid, sl, sp)
    sizes.append((tid, sl, sp)); data[(t["i"], t["j"])] = (Lt, Pt)

# ---------------------------------------------------------------- coordinates, NaN, commune
def walk(o, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("origin", "notes", "conventions", "tile"): continue
            walk(v, out)
    elif isinstance(o, list):
        if len(o) in (2, 3) and all(isinstance(v, (int, float)) for v in o): out.append(o[:2])
        else:
            for v in o: walk(v, out)
    elif isinstance(o, float): assert math.isfinite(o)
def pts_of(objs, keys=("x", "z")): return np.array([[o[keys[0]], o[keys[1]]] for o in objs], float).reshape(-1, 2)
outside = Counter()
for (i, j), (Lt, Pt) in data.items():
    ce, cn = tile_centre(i, j); tid = f"t_{i}_{j}"
    lines = []; walk({k: Lt[k] for k in ("canals", "roads", "boats")}, lines)
    lines = np.array(lines).reshape(-1, 2); assert (np.abs(lines) <= 1000.05).all(), tid
    parc = np.array([v for p in Lt["parcels"] for v in p["poly"]]).reshape(-1, 2)
    assert (np.abs(parc) <= 1000 + 600).all(), tid
    pc = np.array([np.mean(p["poly"], 0) for p in Lt["parcels"]]).reshape(-1, 2)
    assert ((pc >= -1000) & (pc < 1000)).all(), tid
    pts = [pts_of(Lt["houses"]), pts_of(Lt["trees"]), np.array([e[:2] for e in Lt["egret_zones"]]).reshape(-1, 2), parc]
    for k, v in Pt.items():
        if isinstance(v, list) and v and isinstance(v[0], dict) and "x" in v[0]: pts.append(pts_of(v))
        if isinstance(v, list) and v and isinstance(v[0], dict) and k == "power_lines": pts.append(np.array([q for o in v for q in o["points"]]))
    allp = np.vstack(pts); pp = []; walk({k: v for k, v in Pt.items() if isinstance(v, list)}, pp)
    assert np.isfinite(allp).all() and (np.abs(np.array(pp).reshape(-1, 2)) <= 1000.05).all(), tid
    ins = inside(poly, ce + allp[:, 0], cn - allp[:, 1])
    outside[tid] = int((~ins).sum())
assert sum(outside.values()) == 0, {k: v for k, v in outside.items() if v}

# ---------------------------------------------------------------- seams: clipped canal/road ends on shared edges
def edge_ends(Lt, ce, cn, axis, val):
    out = []
    for k in ("canals", "roads"):
        for c in Lt[k]:
            for p in (c["points"][0], c["points"][-1]):
                if abs(p[axis] - val) < 0.051: out.append((ce + p[0], cn - p[1]))
    return np.array(out).reshape(-1, 2)
pairs = unmatched = 0; worst = 0.0; missing = 0
for (i, j), (Lt, _) in data.items():
    ce, cn = tile_centre(i, j)
    for (di, dj, axis, va, vb) in ((1, 0, 0, 1000, -1000), (0, 1, 1, -1000, 1000)):
        a = edge_ends(Lt, ce, cn, axis, va)
        if (i + di, j + dj) not in data: missing += len(a); continue
        Lb = data[(i + di, j + dj)][0]; b = edge_ends(Lb, *tile_centre(i + di, j + dj), axis, vb)
        pairs += 1
        assert len(a) == len(b), ((i, j), (i + di, j + dj), len(a), len(b))
        for p in a:
            dd = np.hypot(*(b - p).T).min() if len(b) else np.inf
            worst = max(worst, dd); assert dd <= 0.5, ((i, j), p, dd)

# ---------------------------------------------------------------- global parcel overlap (2 m raster)
R2 = 2.0; W2, H2 = int((FE1 - FE0) / R2), int((FN1 - FN0) / R2)
cnt = np.zeros((H2, W2), np.uint8)
for (i, j), (Lt, _) in data.items():
    ce, cn = tile_centre(i, j)
    for p in Lt["parcels"]:
        q = np.array(p["poly"]); E, N = ce + q[:, 0], cn - q[:, 1]
        c0, c1 = int((E.min() - FE0) / R2), int((E.max() - FE0) / R2) + 1; r0, r1 = int((FN1 - N.max()) / R2), int((FN1 - N.min()) / R2) + 1
        X, Y = np.meshgrid(FE0 + (np.arange(c0, c1) + .5) * R2, FN1 - (np.arange(r0, r1) + .5) * R2)
        cnt[r0:r1, c0:c1] += inside(np.c_[np.r_[E, E[:1]], np.r_[N, N[:1]]], X, Y)
assert cnt.max() <= 1, "parcels overlap across tiles"

# ---------------------------------------------------------------- index.json
idx_tiles, tot = [], Counter()
for t in tiles:
    Lt, Pt = data[(t["i"], t["j"])]; tid = f"t_{t['i']}_{t['j']}"
    c = {k: len(Lt[k]) for k in ("parcels", "houses", "trees", "canals", "roads", "boats", "egret_zones")}
    c.update({k: len(v) for k, v in Pt.items() if isinstance(v, list) and k != "attribution"})
    tot.update(c)
    idx_tiles.append({"id": tid, "i": t["i"], "j": t["j"], "utm_e": t["utm_e"], "utm_n": t["utm_n"],
                      "x": t["utm_e"] - OE, "z": -(t["utm_n"] - ON), "inside_share": t["inside_share"],
                      "layout": f"{tid}/layout.json", "props": f"{tid}/props.json", "counts": c})
index = {"version": 1, "origin": {"utm_e": OE, "utm_n": ON, "epsg": PROFILE["epsg"]}, "tile_m": 2000,
         "frame": {"e0": FE0, "e1": FE1, "n0": FN0, "n1": FN1},
         "textures": {"ground": "commune_ground.webp", "radar": "commune_radar.webp" if PROFILE["scene"]["reference_track"] else None, "mask": "commune_mask.webp"},
         "tiles": idx_tiles,
         "attribution": ["(c) OpenStreetMap contributors, ODbL",
                         "EOxCloudless 2016 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), CC BY 4.0",
                         "Configured NISAR HH reference raster, if available"],
         "notes": {"tiles": f"Tile centres start at E {PROFILE['tile_grid']['first_e']}, N {PROFILE['tile_grid']['first_n']}; step {TILE}; clipped to the site boundary mode",
                   "tile_coords": "each tile file: metres from the tile centre, x = east, z = south; tile x/z here = centre relative to origin",
                   "ownership": "point objects belong to the tile containing them (half-open [-1000, 1000)); parcels to the tile containing "
                                "their centroid and may overhang the edge; canals/roads are the same global polylines clipped per tile",
                   "water_states": "parcels carry s = '' and there are no passes: states come from the contract data (250 m cells)",
                   "real_vs_placed": "canals/roads/water/churches/cemeteries = OSM (clipped to the commune + 60 m); home-garden mask = NISAR HH "
                                     "brightness (fallback to road/canal belts where the radar window has no data); parcels, houses, trees, "
                                     "boats, egret zones and all other props = seeded rules",
                   "textures": "north-up over frame; ground = EOxCloudless S2 2016 resampled UTM->lon/lat->3857 (2048 px); "
                               "radar = configured HH reference when available; mask = configured boundary or full frame"}}
(OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf8")

# ---------------------------------------------------------------- preview_all.png
import OpenImageIO as oiio
PW = 1600; S = PW / (FE1 - FE0); PH = int(round((FN1 - FN0) * S))
mask = np.load(WORK / "mask10.npy")
my = (np.arange(PH) / S / 10).astype(int).clip(0, mask.shape[0] - 1); mx = (np.arange(PW) / S / 10).astype(int).clip(0, mask.shape[1] - 1)
img = np.where(mask[my][:, mx][..., None], np.array([0.30, 0.34, 0.26]), np.array([0.12, 0.12, 0.13])).astype(np.float32)
def pix(E, N): return ((np.asarray(E) - FE0) * S).astype(int), ((FN1 - np.asarray(N)) * S).astype(int)
def put(c, r, col, rad=0):
    for dr in range(-rad, rad + 1):
        for dc in range(-rad, rad + 1):
            ok = (c + dc >= 0) & (c + dc < PW) & (r + dr >= 0) & (r + dr < PH); img[(r + dr)[ok], (c + dc)[ok]] = col
def line(E, N, col, rad=0):
    E, N = np.asarray(E), np.asarray(N); seg = np.hypot(np.diff(E), np.diff(N)); out_e, out_n = [E[:1]], [N[:1]]
    for k in range(len(seg)):
        n = max(int(seg[k] * S * 2), 1); t = np.arange(1, n + 1) / n
        out_e.append(E[k] + (E[k + 1] - E[k]) * t); out_n.append(N[k] + (N[k + 1] - N[k]) * t)
    put(*pix(np.concatenate(out_e), np.concatenate(out_n)), col, rad)
for (i, j), (Lt, Pt) in data.items():                 # parcels (filled), roads, canals, houses
    ce, cn = tile_centre(i, j)
    for p in Lt["parcels"]:
        q = np.array(p["poly"]); c, r = pix(ce + q[:, 0], cn - q[:, 1])
        c0, c1, r0, r1 = c.min(), c.max() + 1, r.min(), r.max() + 1
        X, Y = np.meshgrid(np.arange(c0, c1) + .5, np.arange(r0, r1) + .5)
        m = inside(np.c_[np.r_[c, c[:1]], np.r_[r, r[:1]]].astype(float), X, Y)
        rr, cc = np.nonzero(m); col = np.array([0.80, 0.72, 0.40]) if (p["id"] % 2) else np.array([0.70, 0.62, 0.33])
        ok = (rr + r0 < PH) & (cc + c0 < PW); img[rr[ok] + r0, cc[ok] + c0] = col
for (i, j), (Lt, Pt) in data.items():
    ce, cn = tile_centre(i, j)
    for r in Lt["roads"]:
        q = np.array(r["points"]); line(ce + q[:, 0], cn - q[:, 1], (0.62, 0.62, 0.62))
    for c in Lt["canals"]:
        q = np.array(c["points"]); line(ce + q[:, 0], cn - q[:, 1], (0.1, 0.35, 1.0), 1 if c["width_m"] >= 20 else 0)
    h = pts_of(Lt["houses"]); put(*pix(ce + h[:, 0], cn - h[:, 1]), (1.0, 0.15, 0.1))
b = poly; line(b[:, 0], b[:, 1], (1, 1, 1), 1)          # commune outline
FONT = {"0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
        "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111",
        ",": "000000000010100"}
def text(s, c0, r0, sc=2, col=(1, 1, 0.3)):
    for k, ch in enumerate(s):
        bits = FONT[ch]
        for q in range(15):
            if bits[q] == "1":
                rr, cc = r0 + (q // 3) * sc, c0 + k * 4 * sc + (q % 3) * sc
                img[rr:rr + sc, cc:cc + sc] = col
for t in tiles:                                        # tile grid + ids "i,j"
    ce, cn = t["utm_e"], t["utm_n"]
    line([ce - 1000, ce + 1000, ce + 1000, ce - 1000, ce - 1000], [cn - 1000, cn - 1000, cn + 1000, cn + 1000, cn - 1000], (1, 1, 0.3))
    c, r = pix(ce - 1000, cn + 1000); text(f"{t['i']},{t['j']}", int(c) + 4, int(r) + 4)
oiio.ImageBuf(np.ascontiguousarray(img)).write(str(OUT / "preview_all.png"), "uint8")

# ---------------------------------------------------------------- summary
ls = [s[1] for s in sizes]; ps = [s[2] for s in sizes]
tex = {f: (OUT / f).stat().st_size for f in ("commune_ground.webp", "commune_radar.webp", "commune_mask.webp") if (OUT / f).exists()}
print(f"tiles {len(tiles)}  layout total {sum(ls)} ({min(ls)}..{max(ls)})  props total {sum(ps)} ({min(ps)}..{max(ps)})  textures {tex}")
print("index.json", (OUT / "index.json").stat().st_size, "seam pairs", pairs, "worst seam", round(worst, 3), "edge ends into missing tiles", missing)
print("counts", dict(tot))
print("CHECKS OK")
