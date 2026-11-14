"""Once per run: commune masks, tile list, global commune-clipped canal/road polylines, family angle, far-field textures.
Writes work/global.json, work/mask10.npy and out/commune_*.webp."""
import sys, json, math
sys.setrecursionlimit(20000)
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from common import *

WORK.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
poly = commune_utm()
W, H = int((FE1 - FE0) / 10), int((FN1 - FN0) / 10)          # 1775 x 1625, 10 m
mask = poly_mask(poly, FE0, FN1, 10.0, W, H)
np.save(WORK / "mask10.npy", mask)
dil = mask.copy()
for _ in range(6):                                            # 60 m (Chebyshev) buffer for line features
    d = dil.copy(); d[1:] |= dil[:-1]; d[:-1] |= dil[1:]; d[:, 1:] |= d[:, :-1].copy(); d[:, :-1] |= d[:, 1:].copy(); dil = d
print("commune area km2", mask.sum() * 100 / 1e6)

def in_dil(p):
    c = np.floor((p[:, 0] - FE0) / 10).astype(int); r = np.floor((FN1 - p[:, 1]) / 10).astype(int)
    ok = (c >= 0) & (c < W) & (r >= 0) & (r < H)
    out = np.zeros(len(p), bool); out[ok] = dil[r[ok], c[ok]]; return out

def clip_to_commune(l):
    """densify to <= 5 m, keep runs inside the 60 m commune buffer, simplify. Global, so every tile cuts identically."""
    seg = np.hypot(*np.diff(l, axis=0).T); keep = seg > 1e-6
    l = np.vstack([l[:1], l[1:][keep]]); seg = seg[keep]
    if len(l) < 2: return []
    pts = [l[:1]]
    for a, b, s in zip(l[:-1], l[1:], seg):
        n = max(int(math.ceil(s / 5.0)), 1); t = np.arange(1, n + 1)[:, None] / n
        pts.append(a + (b - a) * t)
    q = np.vstack(pts); ins = in_dil(q)
    e = np.flatnonzero(np.diff(np.r_[0, ins.astype(np.int8), 0]))
    return [rdp(q[s0:s1], 0.5) for s0, s1 in zip(e[::2], e[1::2]) if s1 - s0 >= 2]

def canal_width(p):
    try: return float(str(p.get("width")).replace("m", "").strip())   # OSM width tag wins
    except ValueError: pass
    return {"river": 40.0, "ditch": 4.0, "drain": 4.0}.get(p.get("waterway"), 20.0 if p.get("name") else 12.0)
ROAD_W = {"motorway": 12, "motorway_link": 6, "trunk_link": 6, "primary": 8, "primary_link": 5, "secondary_link": 5, "tertiary_link": 4, "trunk": 9, "secondary": 7, "tertiary": 6, "unclassified": 5, "residential": 4, "service": 3,
          "track": 3, "path": 1.5, "footway": 1.5, "pedestrian": 3}
canals, roads = [], []
for p, l in lines_utm("osm_waterways.geojson"):
    if p.get("waterway") not in ("canal", "river", "ditch", "drain"): continue
    for piece in clip_to_commune(l):
        canals.append({"id": p.get("osm_id"), "kind": p["waterway"], "name": p.get("name"), "width_m": canal_width(p), "pts": piece.tolist()})
for p, l in lines_utm("osm_roads.geojson"):
    if p.get("highway") not in ROAD_W: continue
    for piece in clip_to_commune(l):
        roads.append({"kind": p["highway"], "width_m": float(ROAD_W[p["highway"]]), "pts": piece.tolist()})
water = [pl.tolist() for _, pl in polys_utm("osm_water.geojson") if in_dil(pl).any()]

# dominant canal direction (length-weighted, mod 90 deg): family A axis for field strips, B = A + 90
ang, wt = [], []
for c in canals:
    if c["kind"] not in ("canal", "river"): continue
    a = np.array(c["pts"]); d = np.diff(a, axis=0)
    ang += list(np.arctan2(d[:, 1], d[:, 0]) % (math.pi / 2)); wt += list(np.hypot(*d.T))
h, edges = np.histogram(ang, bins=90, range=(0, math.pi / 2), weights=wt)
h = h + np.roll(h, 1) + np.roll(h, -1)
thA = float((edges[np.argmax(h)] + math.pi / 180 * 0.5))
print("canals", len(canals), "roads", len(roads), "water polys", len(water), "thA deg (UTM, ccw from east)", math.degrees(thA))

# tiles
tiles = []
for i in range(PROFILE["tile_grid"]["cols"]):
    for j in range(PROFILE["tile_grid"]["rows"]):
        ce, cn = tile_centre(i, j)
        c0, c1 = int((ce - 1000 - FE0) / 10), int((ce + 1000 - FE0) / 10)
        r0, r1 = int((FN1 - cn - 1000) / 10), int((FN1 - cn + 1000) / 10)
        sub = np.zeros((200, 200), bool)
        rr0, cc0 = max(r0, 0), max(c0, 0)
        part = mask[rr0:min(r1, H), cc0:min(c1, W)]
        sub[rr0 - r0:rr0 - r0 + part.shape[0], cc0 - c0:cc0 - c0 + part.shape[1]] = part
        if sub.any(): tiles.append({"i": i, "j": j, "utm_e": ce, "utm_n": cn, "inside_share": round(float(sub.mean()), 4)})
print("tiles", len(tiles))
(WORK / "global.json").write_text(json.dumps({"thA": thA, "canals": canals, "roads": roads, "water": water, "tiles": tiles}), encoding="utf8")

# far-field textures, north up, exactly the frame
if "--no-tex" not in sys.argv:
    GW = 2048; GH = int(round(GW * (FN1 - FN0) / (FE1 - FE0)))
    ex = FE0 + (np.arange(GW) + .5) * (FE1 - FE0) / GW; ny = FN1 - (np.arange(GH) + .5) * (FN1 - FN0) / GH
    E, N = np.meshgrid(ex, ny)
    write_rgb(OUT / "commune_ground.webp", optical(E, N), 85)
    ex = FE0 + 5 + 10 * np.arange(W); ny = FN1 - 5 - 10 * np.arange(H)
    E, N = np.meshgrid(ex, ny)
    if PROFILE["scene"]["reference_track"]:
        g = np.nan_to_num(np.clip((radar_db(PROFILE["scene"]["reference_track"], E, N) + 25) / 20, 0, 1), nan=0.0)
        write_rgb(OUT / "commune_radar.webp", np.repeat(g[..., None], 3, 2), 85)
    write_rgb(OUT / "commune_mask.webp", np.repeat(mask[..., None].astype(np.float32), 3, 2), 90)
    print("ground", GW, GH, "radar/mask", W, H)
