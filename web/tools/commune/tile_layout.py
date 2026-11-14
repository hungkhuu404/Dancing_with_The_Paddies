"""layout.json for one 2 km tile of xa Tan Hoi (refactor of landing/scripts/layout/build_layout.py, tile centre as parameter).
Run: <blender python> -I tile_layout.py i j      -> out/t_i_j/layout.json
Coordinates: metres from the TILE centre, x = east, z = south. Water states are NOT computed here ("s": ""): the
engine takes them from the contract data. Radar is used only for the home-garden (built-up) mask.
Field strips come from one GLOBAL lattice (origin O), so neighbouring tiles agree; a parcel belongs to the tile
holding its centroid and may overhang the tile edge."""
import sys, json, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from common import *

I, J = int(POSITIONAL[0]), int(POSITIONAL[1])
CE, CN = tile_centre(I, J)
TID = f"t_{I}_{J}"
HALF, EXT = 1000.0, 700.0
HE = HALF + EXT                                     # mask grid half-size (context around the tile)
TX, TZ = CE - OE, -(CN - ON)                        # tile centre in O-based scene coords
RNG = np.random.default_rng([SEED, I, J])
GL = json.loads((WORK / "global.json").read_text(encoding="utf8"))

def to_xz(p): p = np.asarray(p, float); return np.c_[p[:, 0] - CE, -(p[:, 1] - CN)]
def inT(x, z): return -HALF <= x < HALF and -HALF <= z < HALF       # half-open: each point has exactly one tile

def clip_polyline(pts, lo, hi):
    """Clip polyline to the square [lo, hi]^2 (Liang-Barsky per segment); returns list of pieces."""
    pieces, cur = [], []
    for a, b in zip(pts[:-1], pts[1:]):
        d = b - a; t0, t1 = 0.0, 1.0; ok = True
        for p, q in ((-d[0], a[0]-lo), (d[0], hi-a[0]), (-d[1], a[1]-lo), (d[1], hi-a[1])):
            if p == 0:
                if q < 0: ok = False; break
            else:
                r = q / p
                if p < 0: t0 = max(t0, r)
                else: t1 = min(t1, r)
        if not ok or t0 > t1:
            if len(cur) > 1: pieces.append(np.array(cur))
            cur = []; continue
        A, B = a + d*t0, a + d*t1
        if not cur or np.hypot(*(cur[-1]-A)) > 1e-6:
            if len(cur) > 1: pieces.append(np.array(cur))
            cur = [A]
        cur.append(B)
        if t1 < 1.0:
            pieces.append(np.array(cur)); cur = []
    if len(cur) > 1: pieces.append(np.array(cur))
    return [p for p in pieces if np.hypot(*np.diff(p, axis=0).T).sum() > 1e-3]   # keep tiny pieces: seams must match

def resample(p, step):
    seg = np.hypot(*np.diff(p, axis=0).T); s = np.r_[0, np.cumsum(seg)]
    t = np.arange(0, s[-1], step)
    return np.c_[np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])], s[-1]

def tangents(q, k=8):
    n = len(q); i0 = np.clip(np.arange(n)-k, 0, n-1); i1 = np.clip(np.arange(n)+k, 0, n-1)
    t = q[i1] - q[i0]; return t / np.maximum(np.hypot(*t.T), 1e-9)[:, None]

# raster grid: 1 m cells over the tile + EXT context, row = z + HE, col = x + HE
G = int(2 * HE)
def stamp_line(mask, pts, r):
    for a, b in zip(pts[:-1], pts[1:]):
        x0, x1 = sorted((a[0], b[0])); z0, z1 = sorted((a[1], b[1]))
        c0, c1 = max(int(x0 - r + HE), 0), min(int(x1 + r + HE) + 2, G)
        r0, r1 = max(int(z0 - r + HE), 0), min(int(z1 + r + HE) + 2, G)
        if c0 >= c1 or r0 >= r1: continue
        X, Z = np.meshgrid(np.arange(c0, c1) - HE + .5, np.arange(r0, r1) - HE + .5)
        d = b - a; L2 = max(d @ d, 1e-9)
        t = np.clip(((X - a[0]) * d[0] + (Z - a[1]) * d[1]) / L2, 0, 1)
        mask[r0:r1, c0:c1] |= (X - a[0] - t*d[0])**2 + (Z - a[1] - t*d[1])**2 <= r*r

def poly_cells(poly):
    c0, c1 = max(int(poly[:, 0].min() + HE), 0), min(int(poly[:, 0].max() + HE) + 2, G)
    r0, r1 = max(int(poly[:, 1].min() + HE), 0), min(int(poly[:, 1].max() + HE) + 2, G)
    if c0 >= c1 or r0 >= r1: return np.zeros(0, int), np.zeros(0, int)
    X, Z = np.meshgrid(np.arange(c0, c1) - HE + .5, np.arange(r0, r1) - HE + .5)
    m = inside(np.vstack([poly, poly[:1]]), X, Z); rr, cc = np.nonzero(m); return rr + r0, cc + c0

def at(mask, x, z):
    c = np.clip(np.floor(np.asarray(x) + HE).astype(int), 0, G-1); r = np.clip(np.floor(np.asarray(z) + HE).astype(int), 0, G-1)
    return mask[r, c]

def seg_dist(pts, polylines):
    best = np.full(len(pts), np.inf)
    for pl in polylines:
        a = pl[:-1]; d = pl[1:] - a; L2 = np.maximum((d*d).sum(1), 1e-9)
        t = np.clip(((pts[:, None, :] - a[None]) * d[None]).sum(2) / L2[None], 0, 1)
        q = a[None] + t[..., None] * d[None]
        best = np.minimum(best, np.hypot(*(pts[:, None, :] - q).transpose(2, 0, 1)).min(1))
    return best

lon0, lat0 = (float(v) for v in inverse_utm(CE, CN))
commune = poly_mask(commune_utm(), CE - HE, CN + HE, 1.0, G, G)          # same orientation: row = z (south down)

# ---------------------------------------------------------------- canals / roads (global commune-clipped lines)
canals, cmask, roads, rmask = [], [], [], []
for c in GL["canals"]:
    l = to_xz(c["pts"])
    for piece in clip_polyline(l, -HALF, HALF):
        canals.append({"id": c["id"], "kind": c["kind"], "name": c["name"], "width_m": c["width_m"], "pts": piece})
    for piece in clip_polyline(l, -HE - 600, HE + 600):
        cmask.append({"kind": c["kind"], "width_m": c["width_m"], "pts": piece})
for r in GL["roads"]:
    l = to_xz(r["pts"])
    for piece in clip_polyline(l, -HALF, HALF): roads.append({"kind": r["kind"], "width_m": r["width_m"], "pts": piece})
    for piece in clip_polyline(l, -HE - 600, HE + 600): rmask.append({"kind": r["kind"], "width_m": r["width_m"], "pts": piece})
canals.sort(key=lambda c: -c["width_m"])
water_polys = [to_xz(pl) for pl in GL["water"]]
water_polys = [w for w in water_polys if (np.abs(w) < HE + 200).all(axis=1).any()]

# ---------------------------------------------------------------- masks (1 m, tile + context)
water = np.zeros((G, G), bool)
for c in cmask: stamp_line(water, c["pts"], c["width_m"] / 2)
for wp in water_polys: rr, cc = poly_cells(wp); water[rr, cc] = True
roadm = np.zeros((G, G), bool)
for r in rmask: stamp_line(roadm, r["pts"], r["width_m"] / 2)
bank = np.zeros((G, G), bool)
for c in cmask: stamp_line(bank, c["pts"], c["width_m"] / 2 + 8)
for wp in water_polys: stamp_line(bank, wp, 8)
roadbuf = np.zeros((G, G), bool)
for r in rmask: stamp_line(roadbuf, r["pts"], r["width_m"] / 2 + 3)

# home gardens: radar-bright belts (both real passes) near a road/canal. Radar is the built-up mask ONLY.
# Where neither pass has data (commune edge outside the read frame): fallback = belts along main roads / canals.
cx5 = np.arange(0, G, 5) - HE + .5
EE, NN = np.meshgrid(CE + cx5, CN - cx5)
with np.errstate(all="ignore"):
    lin = np.nanmean(np.stack([10 ** (radar_db(t, EE, NN) / 10) for t in (list(PROFILE["scene"]["radar_tracks"]) or [None])]), 0)
nodata5 = ~np.isfinite(lin)
k = 3; pad = np.pad(np.nan_to_num(lin), k, mode="edge")
box = sum(pad[i:i + lin.shape[0], j:j + lin.shape[1]] for i in range(2*k+1) for j in range(2*k+1)) / (2*k+1)**2
garden5 = 10 * np.log10(np.maximum(box, 1e-6)) > -8.0
up = lambda m5: np.repeat(np.repeat(m5, 5, 0), 5, 1)[:G, :G]
garden = up(garden5); nodata = up(nodata5)
fallback = np.zeros((G, G), bool)
for c in cmask:
    if c["kind"] in ("canal", "river"): stamp_line(fallback, c["pts"], c["width_m"] / 2 + 35)
for r in rmask:
    if r["kind"] in ("secondary", "tertiary", "unclassified", "residential"): stamp_line(fallback, r["pts"], r["width_m"] / 2 + 40)
garden = np.where(nodata, fallback, garden)
near = np.zeros((G, G), bool)
for c in cmask: stamp_line(near, c["pts"], c["width_m"] / 2 + 130)
for r in rmask:
    if r["kind"] not in ("path", "footway"): stamp_line(near, r["pts"], 130)
garden &= near & commune

blocked = water | bank | roadbuf | garden | ~commune
blocked[:2, :] = blocked[-2:, :] = blocked[:, :2] = blocked[:, -2:] = True

# ---------------------------------------------------------------- parcels: global strip lattice, perpendicular to canal family
thA = (-GL["thA"]) % math.pi                         # UTM angle -> xz (z south) angle
fam_lines = {0: [], 1: []}
for pts in [c["pts"] for c in cmask] + [r["pts"] for r in rmask if r["kind"] in
                                        ("secondary", "tertiary", "unclassified", "residential", "track")]:
    for a, b2 in zip(pts[:-1], pts[1:]):
        if np.hypot(*(b2 - a)) < 3: continue
        dth = (math.atan2(*(b2 - a)[::-1]) - thA) % math.pi
        dev = min(dth, math.pi - dth)
        if dev < math.radians(25): fam_lines[0].append(np.array([a, b2]))
        elif dev > math.radians(65): fam_lines[1].append(np.array([a, b2]))
def famdist(pts, f):
    if not fam_lines[f]: return np.full(len(pts), np.inf)
    A = np.array([s[0] for s in fam_lines[f]]); B = np.array([s[1] for s in fam_lines[f]])
    out = np.empty(len(pts))
    for s in range(0, len(pts), 2000):
        p = pts[s:s + 2000]; d = B - A; L2 = np.maximum((d*d).sum(1), 1e-9)
        t = np.clip(((p[:, None, :] - A[None]) * d[None]).sum(2) / L2[None], 0, 1)
        q = A[None] + t[..., None] * d[None]
        out[s:s + 2000] = np.hypot(*(p[:, None, :] - q).transpose(2, 0, 1)).min(1)
    return out
c4 = np.arange(0, G, 8) - HE + 4                      # 8 m family cells (grid aligned across tiles)
X4, Z4 = np.meshgrid(c4, c4); p4 = np.c_[X4.ravel(), Z4.ravel()]
famB = np.repeat(np.repeat((famdist(p4, 1) < famdist(p4, 0)).reshape(X4.shape), 8, 0), 8, 1)[:G, :G]

SPAN = 13000.0
def strip_edges(f):
    r = np.random.default_rng([SEED, f]); return -SPAN + r.uniform(0, 20) + np.r_[0, np.cumsum(r.uniform(PROFILE["fields"]["strip_min"], PROFILE["fields"]["strip_max"], 1200))]
def strip_cuts(f, k):
    r = np.random.default_rng([SEED, f, k]); return -SPAN + np.r_[0, np.cumsum(r.uniform(PROFILE["fields"]["cross_min"], PROFILE["fields"]["cross_max"], 110))]
def split_run(a, e, cuts):
    """global cut lattice inside [a, e]; fragments < 100 m join a neighbour; pieces < 60 m dropped."""
    bounds = [a, *cuts[(cuts > a) & (cuts < e)], e]; pieces = []; start = None
    for s, t in zip(bounds[:-1], bounds[1:]):
        if start is None: start = s
        if t - start < 100 and t != e: continue
        if t - start < 100 and pieces: pieces[-1][1] = t; start = None; continue
        pieces.append([start, t]); start = None
    return [p for p in pieces if p[1] - p[0] >= 60]

corners = np.array([[sx * HE + TX, sz * HE + TZ] for sx in (-1, 1) for sz in (-1, 1)])
allp, parcels = [], []
for f in (0, 1):
    th = thA + f * math.pi / 2
    wdir = np.array([math.cos(th), math.sin(th)]); ldir = np.array([-wdir[1], wdir[0]])
    free = ~blocked & (famB if f else ~famB)
    E_ = strip_edges(f); uc, lc = corners @ wdir, corners @ ldir
    l = np.arange(math.floor(lc.min() / 2) * 2, lc.max() + 2, 2.0)
    for k in np.flatnonzero((E_[1:] > uc.min()) & (E_[:-1] < uc.max())):
        w0, w1 = E_[k], E_[k + 1]
        u = np.arange(w0, w1 + 1e-6, 2.0)
        X = u[None, :] * wdir[0] + l[:, None] * ldir[0] - TX; Z = u[None, :] * wdir[1] + l[:, None] * ldir[1] - TZ
        inwin = (np.abs(X) < HE - 2) & (np.abs(Z) < HE - 2)
        ok = (inwin & at(free, X, Z)).all(1)
        edges = np.flatnonzero(np.diff(np.r_[0, ok.astype(np.int8), 0]))
        cuts = None
        for s0, s1 in zip(edges[::2], edges[1::2]):
            a, e = l[s0], l[s1 - 1]
            if e - a < 60: continue
            if cuts is None: cuts = strip_cuts(f, int(k))
            for pa, pb in split_run(a, e, cuts):
                cor = lambda uu, ll: uu * wdir + ll * ldir - (TX, TZ)
                poly = np.array([cor(w0 + .75, pa + .75), cor(w1 - .75, pa + .75), cor(w1 - .75, pb - .75), cor(w0 + .75, pb - .75)])
                allp.append(poly)
                cx, cz = poly.mean(0)
                if inT(cx, cz): parcels.append({"poly": poly})
occ = np.zeros((G, G), bool)
for poly in allp: rr, cc = poly_cells(poly); occ[rr, cc] = True
for k_, p in enumerate(parcels): p["id"] = k_
cent = np.array([p["poly"].mean(0) for p in parcels]).reshape(-1, 2)

# ---------------------------------------------------------------- houses
hpos, houses = [], []
def ok_spacing(x, z, pts, dmin):
    return all((x - a)**2 + (z - b)**2 >= dmin * dmin for a, b in pts[-400:]) if pts else True
house_free = ~(water | roadm | occ) & commune; road_occ = roadm | occ | ~commune; tree_block = water | roadm | occ | ~commune
for r in roads:
    if r["kind"] not in ("secondary", "tertiary", "unclassified", "residential", "service"): continue
    q, L = resample(r["pts"], 1.0)
    if L < 20: continue
    T = tangents(q, 4); s = RNG.uniform(0, 15)
    while s < L:
        i = min(int(s), len(q) - 1); t = T[i]; n = np.array([-t[1], t[0]])
        for side in (1, -1):
            if RNG.random() < 0.3: continue
            off = r["width_m"] / 2 + RNG.uniform(3, 8)
            x, z = q[i] + side * n * off
            if not inT(x, z): continue
            if not at(garden, x, z) or not at(house_free, x, z): continue
            fx = x + side*n[0]*np.array([0, 4, 8]); fz = z + side*n[1]*np.array([0, 4, 8])
            if not (at(house_free, fx, fz).all()) or at(water, fx, fz).any(): continue
            if not ok_spacing(x, z, hpos, 11): continue
            hpos.append((x, z))
            houses.append({"x": x, "z": z, "rot": math.atan2(-side*n[0], -side*n[1]), "variant": int(RNG.integers(0, 2))})
        s += RNG.uniform(15, 40)
for c in canals:                                     # stilt houses on canal edges in settled stretches
    if c["kind"] in ("ditch", "drain"): continue
    q, L = resample(c["pts"], 1.0)
    if L < 40: continue
    T = tangents(q, 4); s = RNG.uniform(0, 30)
    while s < L:
        i = min(int(s), len(q) - 1); t = T[i]; n = np.array([-t[1], t[0]]); side = 1 if RNG.random() < .5 else -1
        x, z = q[i] + side * n * (c["width_m"] / 2 + 1.0)
        if inT(x, z) and at(garden, x, z) and not at(road_occ, x, z) and ok_spacing(x, z, hpos, 14):
            hpos.append((x, z))
            houses.append({"x": x, "z": z, "rot": math.atan2(-side*n[0], -side*n[1]), "variant": 2})
        s += RNG.uniform(40, 110)

# ---------------------------------------------------------------- trees (hashed min spacing), capped
TREE_CAP = 9000
CELL = 4.0
grid, trees = {}, []
def place_tree(x, z, kind, dmin=3.0):
    if len(trees) >= TREE_CAP or not inT(x, z): return False
    if at(tree_block, x, z): return False
    gi, gj = int(x // CELL), int(z // CELL)
    for a in (-1, 0, 1):
        for b2 in (-1, 0, 1):
            for (tx, tz) in grid.get((gi + a, gj + b2), ()):
                if (tx - x)**2 + (tz - z)**2 < dmin * dmin: return False
    grid.setdefault((gi, gj), []).append((x, z))
    sc = {"palm": (0.8, 1.25), "banana": (0.7, 1.2), "bush": (0.6, 1.4)}[kind]
    trees.append({"x": x, "z": z, "kind": kind, "scale": RNG.uniform(*sc), "rot": RNG.uniform(0, 2*math.pi)})
    return True
for hx, hz in hpos: grid.setdefault((int(hx // CELL), int(hz // CELL)), []).append((hx, hz))
hset = set(hpos)
def near_house(x, z, r=6.0):
    gi, gj = int(x // CELL), int(z // CELL)
    return any((hx - x)**2 + (hz - z)**2 < r*r for a in (-2, -1, 0, 1, 2) for b2 in (-2, -1, 0, 1, 2)
               for (hx, hz) in grid.get((gi + a, gj + b2), ()) if (hx, hz) in hset)
for c in canals:                                     # palms along both banks
    q, L = resample(c["pts"], 1.0)
    if L < 10: continue
    T = tangents(q, 4); s = RNG.uniform(0, 6)
    while s < L:
        i = min(int(s), len(q) - 1); t = T[i]; n = np.array([-t[1], t[0]])
        for side in (1, -1):
            x, z = q[i] + side * n * (c["width_m"] / 2 + RNG.uniform(1.5, 6.5))
            if not near_house(x, z): place_tree(x, z, "palm")
        s += RNG.uniform(5, 11) if c["kind"] in ("canal", "river") else RNG.uniform(9, 18)
for hx, hz in hpos:                                  # bananas / bushes around houses
    for _ in range(RNG.integers(3, 7)):
        a = RNG.uniform(0, 2*math.pi); rr_ = RNG.uniform(7, 16)
        x, z = hx + rr_*math.cos(a), hz + rr_*math.sin(a)
        if not near_house(x, z): place_tree(x, z, "banana" if RNG.random() < .6 else "bush")
o = int(EXT)
gtile = garden[o:o + int(2 * HALF), o:o + int(2 * HALF)]
gr, gc = np.nonzero(gtile[::3, ::3])                 # orchard fill inside the garden mask
for j_ in RNG.permutation(len(gr))[: int(len(gr) * 0.22)]:
    if len(trees) >= TREE_CAP: break
    x = gc[j_]*3 - HALF + RNG.uniform(0, 3); z = gr[j_]*3 - HALF + RNG.uniform(0, 3)
    if at(roadbuf, x, z) or near_house(x, z): continue
    u = RNG.random(); place_tree(x, z, "palm" if u < .35 else "banana" if u < .7 else "bush", 3.5)

# ---------------------------------------------------------------- boats
boats = []
cand = sorted([c for c in canals if c["kind"] in ("river", "canal")], key=lambda c: -(c["width_m"] * 1000 + np.hypot(*np.diff(c["pts"], axis=0).T).sum()))
for c in cand:
    if len(boats) >= 5: break
    q, L = resample(c["pts"], 10.0)
    if L < 300: continue
    T = tangents(q, 1); n = np.c_[-T[:, 1], T[:, 0]]; lane = c["width_m"] / 4
    fwd, back = np.clip(q + n * lane, -HALF, HALF), np.clip((q - n * lane)[::-1], -HALF, HALF)
    boats.append({"path": np.vstack([fwd, back, fwd[:1]]), "speed_mps": 3.5 if c["kind"] == "river" else 2.0})
    if c["kind"] == "river" and len(boats) < 5:
        boats.append({"path": np.vstack([back, fwd, back[:1]]), "speed_mps": 4.5})

# ---------------------------------------------------------------- egret zones: by geometry (fields near canals), seeded
egret = []
if len(parcels):
    dcan = seg_dist(cent, [c["pts"] for c in canals]) if canals else np.full(len(parcels), np.inf)
    for k_ in RNG.permutation(len(parcels)):
        if len(egret) >= 6: break
        if dcan[k_] > 200 or any(math.dist(cent[k_], e[:2]) < 300 for e in egret): continue
        egret.append([*cent[k_], float(RNG.uniform(40, 80))])

# exact polygon test on the rounded output coords (the 1 m raster can let a point sit < 1 m outside)
def keep_in(objs, xz):
    if not objs: return objs
    p = np.round(np.array([xz(o) for o in objs], float), 1)
    ok = in_commune(CE + p[:, 0], CN - p[:, 1]); return [o for o, k in zip(objs, ok) if k]
houses = keep_in(houses, lambda h: (h["x"], h["z"])); trees = keep_in(trees, lambda t: (t["x"], t["z"]))
egret = keep_in(egret, lambda e: e[:2])
if parcels:
    v = np.round(np.vstack([p["poly"] for p in parcels]), 1); okv = in_commune(CE + v[:, 0], CN - v[:, 1]).reshape(-1, 4).all(1)
    parcels = [p for p, k in zip(parcels, okv) if k]
    for k_, p in enumerate(parcels): p["id"] = k_

# ---------------------------------------------------------------- self-checks
area = lambda poly: 0.5 * abs(np.dot(poly[:, 0], np.roll(poly[:, 1], -1)) - np.dot(poly[:, 1], np.roll(poly[:, 0], -1)))
cnt = np.zeros((G, G), np.uint8)
for p in parcels:
    poly = p["poly"]; e = np.roll(poly, -1, 0) - poly
    cr = e[:, 0] * np.roll(e, -1, 0)[:, 1] - e[:, 1] * np.roll(e, -1, 0)[:, 0]
    assert (cr > 0).all() or (cr < 0).all(), "parcel not convex/valid"
    assert area(poly) > 25 * 60 * 0.5
    assert in_commune(CE + poly[:, 0], CN - poly[:, 1]).all(), "parcel corner outside commune"
    rr, cc = poly_cells(poly); cnt[rr, cc] += 1
assert cnt.max() <= 1, "parcels overlap"
assert not (cnt.astype(bool) & water).any(), "parcel on water"
for o_ in houses + trees: assert inT(o_["x"], o_["z"]) and at(commune, o_["x"], o_["z"]), o_
for e_ in egret: assert inT(e_[0], e_[1]) and at(commune, e_[0], e_[1])

# ---------------------------------------------------------------- write (budget 450 KB: drop orchard-fill trees from the end)
def r1(v): return round(float(v), 1)
def pl(a): return [[r1(x), r1(z)] for x, z in a]
def doc(nt):
    return {
        "version": 1,
        "origin": {"utm_e": CE, "utm_n": CN, "lon": round(lon0, 7), "lat": round(lat0, 7), "epsg": PROFILE["epsg"]},
        "size_m": [2000, 2000],
        "tile": {"id": TID, "i": I, "j": J, "x": CE - OE, "z": -(CN - ON)},
        "conventions": {"xz": "metres from tile centre; x=east, z=south; +Y up",
                        "rot": "radians about +Y; local +Z faces the road/canal (direction = (sin rot, cos rot))",
                        "s": "empty: water states come from the contract data (250 m cells)"},
        "attribution": ["(c) OpenStreetMap contributors, ODbL",
                        "Configured HH references (if supplied) for illustrative garden placement; not field water states"],
        "canals": [{"id": c["id"], "kind": c["kind"], "name": c["name"], "width_m": c["width_m"], "points": pl(c["pts"])} for c in canals],
        "roads": [{"kind": r["kind"], "width_m": r["width_m"], "points": pl(r["pts"])} for r in roads],
        "parcels": [{"id": p["id"], "poly": pl(p["poly"]), "s": ""} for p in parcels],
        "houses": [{"x": r1(h["x"]), "z": r1(h["z"]), "rot": round(h["rot"], 2), "variant": h["variant"]} for h in houses],
        "trees": [{"x": r1(t["x"]), "z": r1(t["z"]), "kind": t["kind"], "scale": round(t["scale"], 2), "rot": round(t["rot"], 1)} for t in trees[:nt]],
        "boats": [{"path": pl(rdp(b_["path"], 0.5)), "speed_mps": b_["speed_mps"]} for b_ in boats],
        "egret_zones": [[r1(a), r1(b2), r1(c)] for a, b2, c in egret],
    }
nt = len(trees)
while True:
    txt = json.dumps(doc(nt), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if len(txt.encode()) <= 450_000: break
    nt = int(nt * 0.95)
(OUT / TID).mkdir(parents=True, exist_ok=True)
(OUT / TID / "layout.json").write_text(txt, encoding="utf8")
from collections import Counter
print(TID, f"parcels {len(parcels)} houses {len(houses)} trees {nt}/{len(trees)} canals {len(canals)} roads {len(roads)} "
      f"boats {len(boats)} egrets {len(egret)} bytes {len(txt.encode())} radar_nodata {nodata.mean():.2f}")
