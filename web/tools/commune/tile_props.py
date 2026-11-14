"""props.json for one 2 km tile (refactor of world/scripts/props/make_props.py; tile = parameter).
Run: blender-python -I tile_props.py i j      (reads out/t_i_j/layout.json, writes out/t_i_j/props.json)
Deterministic (seeded per tile). Objects are kept only inside the tile (half-open) AND inside the commune polygon.
No prop depends on water states (those come from the contract data at runtime)."""
import json, math, random, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT as OUTROOT, source_dir, SP, SEED as GSEED, commune_utm, poly_mask, utm, PROFILE, POSITIONAL

TI, TJ = int(POSITIONAL[0]), int(POSITIONAL[1])
TID = f"t_{TI}_{TJ}"
LAYOUT, ASSETS, OUT = str(OUTROOT / TID / "layout.json"), str(source_dir()), str(OUTROOT / TID)
SEED = GSEED * 100 + TI * 10 + TJ
R = random.Random(SEED)
L = json.load(open(LAYOUT, encoding="utf-8"))
LIM = 1000.0
E0, N0 = L["origin"]["utm_e"], L["origin"]["utm_n"]
def to_xz(lon, lat):
    e, n = utm(lon, lat); return float(e) - E0, -(float(n) - N0)
COMM = poly_mask(commune_utm(), E0 - LIM, N0 + LIM, 1.0, 2000, 2000)   # row = z + 1000, col = x + 1000

def inwin(x, z, m=0.0):
    """inside this tile (half-open, so each point has one owner tile) and inside the commune; m kept for call compatibility"""
    if not (-LIM <= x < LIM and -LIM <= z < LIM): return False
    return bool(COMM[int(z + LIM), int(x + LIM)])
def rot_z(dx, dz): return math.atan2(dx, dz)      # rot so local +Z points along (dx,dz)
def rot_x(dx, dz): return math.atan2(-dz, dx)     # rot so local +X points along (dx,dz)

# ---------------- line sets (canals, roads) ----------------
class Lines:
    def __init__(self, items):
        A, B, HW, ID = [], [], [], []
        for i, it in enumerate(items):
            p = it["points"]
            for a, b in zip(p, p[1:]):
                A.append(a); B.append(b); HW.append(it["width_m"] / 2); ID.append(i)
        if not A: A, B, HW, ID = [[1e7, 1e7]], [[1e7 + 1, 1e7]], [0.0], [-1]   # tile without lines: far dummy segment
        self.A, self.B = np.array(A, float), np.array(B, float)
        self.HW, self.ID = np.array(HW), np.array(ID)
        self.D = self.B - self.A
        self.L2 = np.maximum((self.D ** 2).sum(1), 1e-9)
    def near(self, x, z):
        """nearest segment: (edge_dist = dist - hw, line id, closest pt, unit tangent, unit normal toward query)"""
        P = np.array([x, z])
        t = np.clip(((P - self.A) * self.D).sum(1) / self.L2, 0, 1)
        C = self.A + self.D * t[:, None]
        d = np.hypot(*(P - C).T)
        e = d - self.HW
        k = int(np.argmin(e))
        tan = self.D[k] / math.sqrt(self.L2[k])
        nv = P - C[k]
        nn = float(np.hypot(*nv))
        nrm = nv / nn if nn > 1e-6 else np.array([-tan[1], tan[0]])
        return float(e[k]), int(self.ID[k]), C[k], tan, nrm

canals, roads = L["canals"], L["roads"]
CN, RD = Lines(canals), Lines(roads)
houses = L["houses"]
HX = np.array([[h["x"], h["z"]] for h in houses] or [[1e7, 1e7]])
TR = np.array([[t["x"], t["z"]] for t in L["trees"]]).reshape(-1, 2)

class Grid:
    def __init__(s, cell=8.0): s.c, s.d = cell, {}
    def add(s, x, z, r=0.0, tag=None):
        s.d.setdefault((int(x // s.c), int(z // s.c)), []).append((x, z, r, tag))
    def clear_of(s, x, z, r, reach=12.0):
        n = int(math.ceil((r + reach) / s.c))
        cx, cz = int(x // s.c), int(z // s.c)
        for i in range(cx - n, cx + n + 1):
            for j in range(cz - n, cz + n + 1):
                for (px, pz, pr, _) in s.d.get((i, j), ()):
                    if (px - x) ** 2 + (pz - z) ** 2 < (r + pr) ** 2: return False
        return True

TREES = Grid(6.0)
for x, z in TR: TREES.add(x, z, 0.0)
OCC = Grid(8.0)   # solid props placed so far

def house_clear(x, z, margin):
    """False if (x,z) is within `margin` of any house footprint (largest variant 6 x 11 m, rotated)."""
    d = HX - (x, z)
    idx = np.nonzero((d ** 2).sum(1) < (8 + margin) ** 2)[0]
    for i in idx:
        h = houses[i]; s, c = math.sin(h["rot"]), math.cos(h["rot"])
        dx, dz = x - h["x"], z - h["z"]
        lx, lz = dx * c - dz * s, dx * s + dz * c   # local x = (cos,-sin), local z = (sin,cos)
        if abs(lx) < 3.2 + margin and abs(lz) < 5.7 + margin: return False
    return True

def land_ok(x, z, r=1.0, tree=2.0, house=1.5, road=0.8, canal=0.8, occ=True):
    if not inwin(x, z, r): return False
    if CN.near(x, z)[0] < canal + r: return False
    if road is not None and RD.near(x, z)[0] < road + r: return False
    if tree and not TREES.clear_of(x, z, tree): return False
    if house is not None and not house_clear(x, z, house + r): return False
    if occ and not OCC.clear_of(x, z, r): return False
    return True

def water_ok(x, z, r=1.0, edge=0.5, occ=True):
    if not inwin(x, z, r): return False
    if CN.near(x, z)[0] > -(edge + r): return False
    return (not occ) or OCC.clear_of(x, z, r)

def put(lst, obj, r):
    lst.append(obj); OCC.add(obj["x"], obj["z"], r)

def rd(v): return round(float(v), 1)
def rr(v): return round((float(v) + math.pi) % (2 * math.pi) - math.pi, 3)

def samples_along(pts, step):
    """(point, tangent) every `step` m along a polyline"""
    out = []; carry = 0.0
    for a, b in zip(pts, pts[1:]):
        a, b = np.array(a, float), np.array(b, float)
        seg = float(np.hypot(*(b - a)))
        if seg < 1e-6: continue
        t = (b - a) / seg; s = carry
        while s < seg:
            out.append((a + t * s, t)); s += step
        carry = s - seg
    return out

def clip_poly(pts, lim=LIM):
    """keep the longest run of the polyline inside the box (segments clipped at the border)"""
    runs, cur = [], []
    def clip_seg(a, b):
        t0, t1 = 0.0, 1.0; d = (b[0] - a[0], b[1] - a[1])
        for p, q in ((-d[0], a[0] + lim), (d[0], lim - a[0]), (-d[1], a[1] + lim), (d[1], lim - a[1])):
            if abs(p) < 1e-12:
                if q < 0: return None
            else:
                r = q / p
                if p < 0: t0 = max(t0, r)
                else: t1 = min(t1, r)
        if t0 > t1: return None
        return [a[0] + d[0] * t0, a[1] + d[1] * t0], [a[0] + d[0] * t1, a[1] + d[1] * t1], t1 < 1.0
    for a, b in zip(pts, pts[1:]):
        c = clip_seg(a, b)
        if c is None:
            if cur: runs.append(cur); cur = []
            continue
        p0, p1, cut = c
        if not cur: cur = [p0]
        cur.append(p1)
        if cut: runs.append(cur); cur = []
    if cur: runs.append(cur)
    runs = [r for r in runs if len(r) >= 2]
    return max(runs, key=lambda r: sum(math.dist(p, q) for p, q in zip(r, r[1:]))) if runs else []

def offset_poly(pts, off):
    """offset polyline to the right (looking along travel direction; right = (-tz, tx) for x east / z south)"""
    P = np.array(pts, float); out = []
    for i in range(len(P)):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]); t /= np.hypot(*t)
        out.append(P[i] + off * np.array([-t[1], t[0]]))
    return out

def fmt_pts(pts): return [[rd(p[0]), rd(p[1])] for p in pts]
def plen(pts): return sum(math.dist(p, q) for p, q in zip(pts, pts[1:]))

# ---------------- parcels ----------------
parcels = L["parcels"]
def pip(x, z, poly):
    c = False; j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > z) != (yj > z) and x < (xj - xi) * (z - yi) / (yj - yi) + xi: c = not c
        j = i
    return c
def edge_dist(x, z, poly):
    best = 1e9
    for a, b in zip(poly, poly[1:] + poly[:1]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        t = max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / max(dx * dx + dz * dz, 1e-9)))
        best = min(best, math.hypot(x - a[0] - dx * t, z - a[1] - dz * t))
    return best
def rand_in(poly, margin, tries=60):
    xs, zs = [p[0] for p in poly], [p[1] for p in poly]
    for _ in range(tries):
        x, z = R.uniform(min(xs), max(xs)), R.uniform(min(zs), max(zs))
        if pip(x, z, poly) and edge_dist(x, z, poly) >= margin and inwin(x, z, margin): return x, z
    return None
# no water states here: field props pick parcels by geometry (canal gap) with the seeded RNG
FLOOD = parcels[:]; R.shuffle(FLOOD)
DRY = parcels[:]; R.shuffle(DRY)
DRAINED = []
def parcel_canal_gap(p):
    return min(CN.near(x, z)[0] for x, z in p["poly"])

P = {k: [] for k in ["bridges", "power_lines", "lift_nets", "fish_stakes", "pumps", "shrines", "religious", "graves",
                     "washing_steps", "moored_boats", "cargo_routes", "longtail_routes", "motorbike_routes",
                     "duck_flocks", "people", "dogs", "smoke", "straw_piles", "veg", "hyacinth_lanes", "fish_jump_zones"]}

# ---------------- bridges: road x canal intersections ----------------
def seg_x(a, b, c, d):
    r, s = b - a, d - c; den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9: return None
    t = ((c - a)[0] * s[1] - (c - a)[1] * s[0]) / den
    u = ((c - a)[0] * r[1] - (c - a)[1] * r[0]) / den
    return a + r * t if 0 <= t <= 1 and 0 <= u <= 1 else None
for i in range(len(RD.A)):
    if RD.ID[i] < 0: continue
    rk = roads[RD.ID[i]]["kind"]
    for j in range(len(CN.A)):
        p = seg_x(RD.A[i], RD.B[i], CN.A[j], CN.B[j])
        if p is None or not inwin(*p, 3): continue
        if any(math.dist(p, (b["x"], b["z"])) < 20 for b in P["bridges"]): continue
        w = canals[CN.ID[j]]["width_m"]
        tan = CN.D[j] / math.sqrt(CN.L2[j])
        kind = "monkey" if rk in ("path", "footway", "track") and w < 20 else "concrete"
        put(P["bridges"], {"x": rd(p[0]), "z": rd(p[1]), "rot": rr(rot_x(-tan[1], tan[0])), "len": rd(w + 6), "kind": kind,
                           "src": "osm_road_x_canal", "road": rk}, w / 2 + 3)
N_ROAD_BRIDGES = len(P["bridges"])

# extra monkey bridges between houses facing each other across a canal
cands = []
for i, h in enumerate(houses):
    e, cid, c, tan, nrm = CN.near(h["x"], h["z"])
    if e > 25 or canals[cid]["width_m"] >= 20: continue
    for k, g in enumerate(houses[i + 1:], i + 1):
        e2, cid2, c2, _, nrm2 = CN.near(g["x"], g["z"])
        if cid2 != cid or e2 > 25 or float(np.dot(nrm, nrm2)) > -0.5: continue
        if math.dist(c, c2) < 25: cands.append(((c + c2) / 2, tan, cid))
R.shuffle(cands)
for m, tan, cid in cands:
    if sum(1 for b in P["bridges"] if b["kind"] == "monkey") >= 8: break
    if not inwin(*m, 4) or any(math.dist(m, (b["x"], b["z"])) < 120 for b in P["bridges"]): continue
    w = canals[cid]["width_m"]
    put(P["bridges"], {"x": rd(m[0]), "z": rd(m[1]), "rot": rr(rot_x(-tan[1], tan[0])), "len": rd(w + 6), "kind": "monkey",
                       "src": "placed_between_houses"}, w / 2 + 3)

# ---------------- power lines along merged main-road chains ----------------
def key(p): return (round(p[0], 1), round(p[1], 1))
main = [r for r in roads if r["kind"] in ("residential", "tertiary", "secondary")]
deg = {}
for r in main:
    for p in (r["points"][0], r["points"][-1]): deg[key(p)] = deg.get(key(p), 0) + 1
chains, used = [], set()
for i, r in enumerate(main):
    if i in used: continue
    used.add(i); pts = [tuple(p) for p in r["points"]]; hw = r["width_m"] / 2
    grown = True
    while grown:
        grown = False
        for j, q in enumerate(main):
            if j in used: continue
            qp = [tuple(p) for p in q["points"]]
            for end in (0, -1):
                k = key(pts[end])
                if deg.get(k, 0) != 2: continue
                if key(qp[0]) == k: add = qp
                elif key(qp[-1]) == k: add = qp[::-1]
                else: continue
                pts = pts + add[1:] if end == -1 else add[::-1][:-1] + pts
                used.add(j); hw = max(hw, q["width_m"] / 2); grown = True; break
            if grown: break
    chains.append((pts, hw))
for pts, hw in chains:
    pts = clip_poly(pts)
    if not pts or plen(pts) < 150: continue
    # house side: side of the chain with more houses within 40 m
    score = 0
    for (q, t) in samples_along(pts, 20):
        right = np.array([-t[1], t[0]])
        d = HX - q; near = (d ** 2).sum(1) < 40 ** 2
        score += int(np.sign(d[near] @ right).sum())
    side = 1 if score >= 0 else -1
    poles, hcount = [], []
    for (q, t) in samples_along(pts, 35):
        right = np.array([-t[1], t[0]]) * side
        for shift in (0, 4, -4, 8, -8):
            p = q + right * (hw + 3) + t * shift
            if inwin(*p, 2) and CN.near(*p)[0] > 1.0 and RD.near(*p)[0] > 1.0 and house_clear(*p, 1.0) \
                    and TREES.clear_of(*p, 1.2) and OCC.clear_of(*p, 0.5):
                poles.append(p); hcount.append(int(((HX - p) ** 2).sum(1).__lt__(45 ** 2).sum())); break
    if len(poles) < 4: continue
    # break the line where a gap (skipped pole) would make a span > 75 m
    runs, cur = [], [0]
    for k in range(1, len(poles)):
        if math.dist(poles[k], poles[k - 1]) > 75: runs.append(cur); cur = []
        cur.append(k)
    runs.append(cur)
    for run in runs:
        if len(run) < 4: continue
        ntx = max(1, len(run) // 10)
        order = sorted(range(len(run)), key=lambda k: -hcount[run[k]])
        tx = []
        for k in order:
            if len(tx) >= ntx: break
            if hcount[run[k]] >= 3 and all(abs(k - o) >= 5 for o in tx): tx.append(k)
        for k in run: OCC.add(*poles[k], 0.6)
        P["power_lines"].append({"points": fmt_pts([poles[k] for k in run]), "tx": sorted(tx)})

# ---------------- bank sample helper ----------------
def bank_candidates(step, min_w=0):
    """(canal id, centre point, tangent, normal) samples on both banks of every canal"""
    out = []
    for cid, c in enumerate(canals):
        if c["width_m"] < min_w: continue
        for q, t in samples_along(c["points"], step):
            for s in (1, -1):
                out.append((cid, q, t, np.array([-t[1], t[0]]) * s))
    R.shuffle(out); return out

# ---------------- washing steps + moored boats (houses near canals) ----------------
canal_houses = []
for i, h in enumerate(houses):
    e, cid, c, tan, nrm = CN.near(h["x"], h["z"])
    if 2 < e <= 25: canal_houses.append((i, e, cid, c, tan, nrm))
R.shuffle(canal_houses)
for i, e, cid, c, tan, nrm in canal_houses:
    hw = canals[cid]["width_m"] / 2
    if len(P["washing_steps"]) < round(0.25 * len(canal_houses)):
        p = c + nrm * (hw - 0.3)
        if inwin(*p, 2) and OCC.clear_of(*p, 2.0) and RD.near(*p)[0] > 0 and TREES.clear_of(*p, 1.0):
            put(P["washing_steps"], {"x": rd(p[0]), "z": rd(p[1]), "rot": rr(rot_z(-nrm[0], -nrm[1])), "house": i}, 2.0)
            continue
for i, e, cid, c, tan, nrm in canal_houses:
    if len(P["moored_boats"]) >= 45 or R.random() > 0.4: continue
    hw = canals[cid]["width_m"] / 2
    p = c + nrm * (hw - 1.8) + tan * R.uniform(-4, 4)
    if water_ok(*p, 1.2, 0.3) and OCC.clear_of(*p, 3.5):
        t = tan if R.random() < 0.5 else -tan
        put(P["moored_boats"], {"x": rd(p[0]), "z": rd(p[1]), "rot": rr(rot_z(*t)),
                                "kind": "xuong" if R.random() < 0.6 else "longtail"}, 3.5)

# ---------------- lift nets (vó) ----------------
for cid, q, t, n in bank_candidates(9):
    if len(P["lift_nets"]) >= 32: break
    hw = canals[cid]["width_m"] / 2
    p = q + n * (hw + 1.5)
    if land_ok(*p, 1.2, tree=1.5, road=0.3, canal=0.3) and all(math.dist(p, (o["x"], o["z"])) > 40 for o in P["lift_nets"]):
        put(P["lift_nets"], {"x": rd(p[0]), "z": rd(p[1]), "rot": rr(rot_z(-n[0], -n[1]))}, 2.5)

# ---------------- fish stakes (đáy rows) ----------------
stake_c = [(cid, q, t) for cid, c in enumerate(canals) for q, t in samples_along(c["points"], 30)]
R.shuffle(stake_c); stake_c.sort(key=lambda s: -canals[s[0]]["width_m"])   # widest water first
for cid, q, t in stake_c:
    if len(P["fish_stakes"]) >= 12: break
    w = canals[cid]["width_m"]
    if any(math.dist(q, (o["x"], o["z"])) < 120 for o in P["fish_stakes"]) or not inwin(*q, 20): continue
    if any(math.dist(q, (b["x"], b["z"])) < 40 for b in P["bridges"]): continue
    if CN.near(*q)[1] != cid: continue  # skip junction areas
    across = R.random() < 0.6
    if across:   # row spans 60-70 % of the width, leaving a boat channel
        L_ = w * R.uniform(0.6, 0.7); n = np.array([-t[1], t[0]]); p = q + n * (w / 2 - L_ / 2 - 0.5) * R.choice((1, -1))
        rot = rot_x(*n)
    else:        # row along the bank
        L_ = R.uniform(12, 25); n = np.array([-t[1], t[0]]) * R.choice((1, -1)); p = q + n * (w / 2 - 2.0); rot = rot_x(*t)
    if not water_ok(*p, 0.2, 0.0, occ=False) or not OCC.clear_of(*p, L_ / 2): continue
    put(P["fish_stakes"], {"x": rd(p[0]), "z": rd(p[1]), "rot": rr(rot), "len": rd(L_), "orient": "across" if across else "along"}, L_ / 2)

# ---------------- pumps ----------------
pc = [p for p in FLOOD if parcel_canal_gap(p) < 40]
R.shuffle(pc)
for par in pc:
    if len(P["pumps"]) >= 12: break
    vx = min(par["poly"], key=lambda v: CN.near(*v)[0])
    e, cid, c, t, n = CN.near(*vx)
    hw = canals[cid]["width_m"] / 2
    for shift in (0, 5, -5, 10, -10):
        p = c + n * (hw + 2.0) + t * shift
        if land_ok(*p, 1.0, tree=1.5, road=0.3, canal=0.5) and all(math.dist(p, (o["x"], o["z"])) > 80 for o in P["pumps"]):
            put(P["pumps"], {"x": rd(p[0]), "z": rd(p[1]), "rot": rr(rot_z(*n)), "parcel": par["id"]}, 1.5); break

# ---------------- shrines near road junctions ----------------
vcount = {}
for r in roads:
    for p in r["points"]: vcount[key(p)] = vcount.get(key(p), 0) + 1
junctions = [k for k, v in vcount.items() if v >= 2 and inwin(*k, 10)]
R.shuffle(junctions)
for jx, jz in junctions if PROFILE["architecture"]["junction_shrines"] else []:
    if len(P["shrines"]) >= 10: break
    if any(math.dist((jx, jz), (o["x"], o["z"])) < 120 for o in P["shrines"]): continue
    for _ in range(12):
        a = R.uniform(0, 2 * math.pi); d = R.uniform(5, 9)
        p = np.array([jx + math.cos(a) * d, jz + math.sin(a) * d])
        e, rid, c, t, n = RD.near(*p)
        if 0.8 < e < 3.0 and land_ok(*p, 0.8, tree=1.5, road=0.8):
            put(P["shrines"], {"x": rd(p[0]), "z": rd(p[1]), "rot": rr(rot_z(-n[0], -n[1]))}, 1.2); break

# ---------------- religious + cemeteries: REAL OSM only ----------------
def feats(name):
    g = json.load(open(os.path.join(ASSETS, name), encoding="utf-8"))
    for f in g["features"]:
        rings = f["geometry"]["coordinates"]
        if f["geometry"]["type"] == "MultiPolygon": rings = [r for poly in rings for r in poly]
        if f["geometry"]["type"] in ("Polygon", "MultiPolygon"):
            yield f["properties"], [[to_xz(*p) for p in r] for r in rings]
nearest_real = []
for props, rings in list(feats("osm_buildings.geojson")) + list(feats("osm_landuse.geojson")):
    kind = props.get("building") or props.get("landuse") or props.get("amenity")
    if kind not in PROFILE["architecture"]["source_religious"]: continue
    ring = rings[0]; cx = sum(p[0] for p in ring) / len(ring); cz = sum(p[1] for p in ring) / len(ring)
    if inwin(cx, cz, 5):
        # long axis from the ring's longest edge
        a, b = max(zip(ring, ring[1:]), key=lambda s: math.dist(*s))
        if kind in ("church", "temple"):
            e, rid, c, t, n = RD.near(cx, cz)
            P["religious"].append({"x": rd(cx), "z": rd(cz), "rot": rr(rot_z(-n[0], -n[1])),
                                   "kind": "church" if kind == "church" else "pagoda", "osm_id": props.get("osm_id")})
        elif kind == "cemetery":
            pts = []
            for _ in range(200):
                q = rand_in(ring, 1.5)
                if q and all(math.dist(q, o) > 2.5 for o in pts): pts.append(q)
                if len(pts) >= 40: break
            for q in pts:
                P["graves"].append({"x": rd(q[0]), "z": rd(q[1]), "rot": rr(rot_x(b[0] - a[0], b[1] - a[1])), "count": 1, "osm_id": props.get("osm_id")})
    else:
        nearest_real.append({"kind": kind, "name": props.get("name"), "osm_id": props.get("osm_id"),
                             "x": rd(cx), "z": rd(cz), "dist_m": round(math.hypot(cx, cz))})
nearest_real.sort(key=lambda r: r["dist_m"])
N_REAL_GRAVES = len(P["graves"])

# family tombs in gardens behind houses (procedural)
hs = list(range(len(houses))); R.shuffle(hs)
for i in hs:
    if len(P["graves"]) - N_REAL_GRAVES >= 16: break
    h = houses[i]; f = np.array([math.sin(h["rot"]), math.cos(h["rot"])]); rt = np.array([f[1], -f[0]])
    p = np.array([h["x"], h["z"]]) - f * R.uniform(11, 18) + rt * R.choice((-1, 1)) * R.uniform(4, 9)
    if land_ok(*p, 1.5, tree=1.5, road=1.0) and all(math.dist(p, (g["x"], g["z"])) > 60 for g in P["graves"]):
        put(P["graves"], {"x": rd(p[0]), "z": rd(p[1]), "rot": rr(h["rot"]), "count": R.choice((1, 1, 2, 2, 3)), "house": i}, 2.5)

# ---------------- routes ----------------
def route(pts, **kw):
    pts = clip_poly(pts)
    if len(pts) >= 2 and plen(pts) >= 50: return {"points": fmt_pts(pts), **kw}
river = max(range(len(canals)), key=lambda i: canals[i]["width_m"]) if canals else None
if river is not None and plen(clip_poly(canals[river]["points"])) >= 150:
    rp = clip_poly(canals[river]["points"])
    hwr = canals[river]["width_m"] / 2
    for pts in (rp, rp[::-1]):
        r_ = route(offset_poly(pts, hwr * 0.35), speed_mps=3)
        if r_: P["cargo_routes"].append(r_)
lt = ([river] if river is not None else []) + sorted((i for i in range(len(canals)) if i != river), key=lambda i: -plen(canals[i]["points"]))[:4]
for i in lt:
    pts = clip_poly(canals[i]["points"])
    if plen(pts) < 150: continue
    r_ = route(offset_poly(pts, canals[i]["width_m"] * 0.2), speed_mps=7, mode="pingpong")
    if r_: P["longtail_routes"].append(r_)
for i, c in enumerate(canals):
    pts = clip_poly(c["points"])
    if plen(pts) < 100: continue
    r_ = route(offset_poly(pts, R.uniform(-0.2, 0.2) * c["width_m"]), speed_mps=0.15, density=round(R.uniform(0.25, 0.8), 2))
    if r_: P["hyacinth_lanes"].append(r_)

# motorbike routes: random walks on the road graph (vehicle roads only)
G = {}
for r in roads:
    if r["kind"] not in ("residential", "secondary", "tertiary", "service", "unclassified"): continue
    pts = [key(p) for p in r["points"]]
    for a, b in zip(pts, pts[1:]):
        if a == b: continue
        G.setdefault(a, set()).add(b); G.setdefault(b, set()).add(a)
nodes = sorted(G)
for _ in range(400 if nodes else 0):
    if len(P["motorbike_routes"]) >= 10: break
    cur = R.choice(nodes); path = [cur]; prev = None
    while plen(path) < 1400:
        nxt = [n for n in G[cur] if n != prev and n not in path]
        if not nxt: break
        prev, cur = cur, R.choice(nxt); path.append(cur)
    path = clip_poly([list(p) for p in path])
    if not path or plen(path) < 450: continue
    if any(math.dist(path[len(path) // 2], r["points"][len(r["points"]) // 2]) < 150 for r in P["motorbike_routes"]): continue
    P["motorbike_routes"].append({"points": fmt_pts(path), "speed_mps": 9, "mode": "pingpong"})

# ---------------- ducks, people, dogs ----------------
fc = [p for p in FLOOD if parcel_canal_gap(p) < 60]
R.shuffle(fc)
for par in fc:
    if len(P["duck_flocks"]) >= 5: break
    r = R.uniform(8, 16); q = rand_in(par["poly"], r + 2)
    if not q or any(math.dist(q, (o["x"], o["z"])) < 200 for o in P["duck_flocks"]): continue
    a = R.uniform(0, 2 * math.pi); hd = (q[0] + math.cos(a) * (r + 3), q[1] + math.sin(a) * (r + 3))
    if not (pip(*hd, par["poly"]) and inwin(*hd)): continue
    P["duck_flocks"].append({"x": rd(q[0]), "z": rd(q[1]), "r": rd(r), "n": R.randint(40, 120), "herder": [rd(hd[0]), rd(hd[1])],
                             "parcel": par["id"]})
    OCC.add(q[0], q[1], r)

def person(x, z, rot, kind, r=0.5):
    put(P["people"], {"x": rd(x), "z": rd(z), "rot": rr(rot), "kind": kind}, r)
fl = FLOOD[:]; R.shuffle(fl)
for par in fl:
    if sum(1 for p in P["people"] if p["kind"] == "wader") >= 16: break
    q = rand_in(par["poly"], 4)
    if q and OCC.clear_of(*q, 6): person(*q, R.uniform(-math.pi, math.pi), "wader")
for o in P["lift_nets"]:
    if R.random() < 0.6:
        f = (math.sin(o["rot"]), math.cos(o["rot"]))
        x, z = o["x"] - f[0] * 2.5 + f[1] * 1.5, o["z"] - f[1] * 2.5 - f[0] * 1.5
        if land_ok(x, z, 0.4, tree=0.8, road=-0.5, canal=0.0, occ=False): person(x, z, o["rot"], "fisher")
for b in P["moored_boats"][:6]:
    person(b["x"], b["z"], b["rot"] + math.pi / 2, "fisher", 0)
for s in P["washing_steps"]:
    if R.random() < 0.6 and sum(p["kind"] == "washer" for p in P["people"]) < 12:
        f = (math.sin(s["rot"]), math.cos(s["rot"]))
        person(s["x"] - f[0] * 0.4, s["z"] - f[1] * 0.4, s["rot"], "washer", 0)
for i in hs:
    if len(P["dogs"]) >= 24: break
    h = houses[i]; f = np.array([math.sin(h["rot"]), math.cos(h["rot"])])
    p = np.array([h["x"], h["z"]]) + f * R.uniform(7, 10) + np.array([f[1], -f[0]]) * R.uniform(-4, 4)
    if land_ok(*p, 0.5, tree=0.8, house=0.3, road=-1.0, canal=0.3):
        put(P["dogs"], {"x": rd(p[0]), "z": rd(p[1]), "rot": R.uniform(-3.14, 3.14)}, 0.5)
for d in P["dogs"]: d["rot"] = rr(d["rot"])

# ---------------- smoke, straw ----------------
for i, h in enumerate(houses):
    if R.random() < 0.3:
        f = (math.sin(h["rot"]), math.cos(h["rot"]))
        x, z = h["x"] - f[0] * 7.5 + f[1] * R.uniform(-1.5, 1.5), h["z"] - f[1] * 7.5 - f[0] * R.uniform(-1.5, 1.5)
        if inwin(x, z): P["smoke"].append({"x": rd(x), "z": rd(z), "kind": "kitchen", "house": i})
dr = DRY[:]; R.shuffle(dr)
for par in dr:
    if sum(1 for s in P["smoke"] if s["kind"] == "straw") >= 5: break
    q = rand_in(par["poly"], 8)
    if q and OCC.clear_of(*q, 5) and all(math.dist(q, (s["x"], s["z"])) > 150 for s in P["smoke"] if s["kind"] == "straw"):
        P["smoke"].append({"x": rd(q[0]), "z": rd(q[1]), "kind": "straw", "parcel": par["id"]}); OCC.add(*q, 4)
dr = DRAINED + DRY; R.shuffle(dr)
for par in dr:
    if len(P["straw_piles"]) >= 50: break
    for _ in range(R.randint(1, 3)):
        q = rand_in(par["poly"], 4)
        if q and OCC.clear_of(*q, 2.5) and TREES.clear_of(*q, 2):
            put(P["straw_piles"], {"x": rd(q[0]), "z": rd(q[1]), "scale": round(R.uniform(0.7, 1.4), 2)}, 2.5)

# ---------------- fish jumps ----------------
for par in fl[:12]:
    q = rand_in(par["poly"], 10)
    if q: P["fish_jump_zones"].append({"x": rd(q[0]), "z": rd(q[1]), "r": rd(R.uniform(8, 18)), "where": "parcel"})
for cid, q, t in stake_c[::7][:10]:
    if inwin(*q, 10): P["fish_jump_zones"].append({"x": rd(q[0]), "z": rd(q[1]), "r": rd(canals[cid]["width_m"] * 0.35), "where": "canal"})

# ---------------- vegetation ----------------
VEG = Grid(6.0)
def veg(x, z, kind, scale, water=False, gap=2.2):
    if kind not in PROFILE["ecology"]["generator_vegetation"]: return False
    if len(P["veg"]) >= 2500 or not inwin(x, z, 1): return False
    if water:
        if not water_ok(x, z, 0.3, 0.2, occ=False): return False
    else:
        if CN.near(x, z)[0] < 0.6 or RD.near(x, z)[0] < 0.8: return False
    if not TREES.clear_of(x, z, 3.0) or not house_clear(x, z, 1.0) or ((HX - (x, z)) ** 2).sum(1).min() < 36: return False
    if not OCC.clear_of(x, z, 1.5) or not VEG.clear_of(x, z, gap): return False
    P["veg"].append({"x": rd(x), "z": rd(z), "kind": kind, "scale": round(scale, 2), "rot": rr(R.uniform(-math.pi, math.pi))})
    VEG.add(x, z, 0); return True
for i in hs:
    h = houses[i]; f = np.array([math.sin(h["rot"]), math.cos(h["rot"])]); rt = np.array([f[1], -f[0]]); c = np.array([h["x"], h["z"]])
    if R.random() < 0.45:   # areca row beside the house, running front-to-back
        s = R.choice((-1, 1)); start = c + rt * s * R.uniform(7, 9) + f * 4
        for k in range(R.randint(4, 8)): veg(*(start - f * 2.6 * k), "areca", R.uniform(0.85, 1.2), gap=2.0)
    for _ in range(R.choice((0, 1, 1, 2))):
        veg(*(c - f * R.uniform(12, 22) + rt * R.uniform(-10, 10)), "mango", R.uniform(0.8, 1.3), gap=5)
    if R.random() < 0.5:    # bamboo clump at the garden edge
        p = c - f * R.uniform(20, 30) + rt * R.choice((-1, 1)) * R.uniform(8, 14)
        for _ in range(R.randint(1, 3)): veg(*(p + np.array([R.uniform(-3, 3), R.uniform(-3, 3)])), "bamboo", R.uniform(0.8, 1.3), gap=2.5)
# tram groves in a few dry parcels near canals
groves = [p for p in DRY if parcel_canal_gap(p) < 80]; R.shuffle(groves)
for par in groves[:4]:
    q = rand_in(par["poly"], 15)
    if not q: continue
    for _ in range(150): veg(q[0] + R.gauss(0, 12), q[1] + R.gauss(0, 12), "tram", R.uniform(0.8, 1.2), gap=3)
# nipa clumps in the water and reeds along the edges
for cid, c in enumerate(canals):
    hw = c["width_m"] / 2
    for q, t in samples_along(c["points"], 15 if c["width_m"] >= 20 else 25):
        if R.random() < 0.55:
            n = np.array([-t[1], t[0]]) * R.choice((1, -1))
            for _ in range(R.randint(4, 9)):
                veg(*(q + n * (hw - R.uniform(0.8, 2.8)) + t * R.uniform(-6, 6)), "nipa", R.uniform(0.7, 1.2), water=True, gap=2.2)
    for q, t in samples_along(c["points"], 2.2):
        for s in (1, -1):
            if R.random() < 0.75:
                n = np.array([-t[1], t[0]]) * s; d = R.uniform(-1.0, 0.0)
                p = q + n * (hw + d)
                if CN.near(*p)[0] < -0.2: veg(*p, "reeds", R.uniform(0.6, 1.2), water=True, gap=1.6)

# ---------------- output ----------------
from common import in_commune
for k, v in P.items():   # exact polygon test on rounded coords; drop the few raster-edge strays
    if v and isinstance(v[0], dict) and "x" in v[0]:
        p = np.array([[o["x"], o["z"]] for o in v], float)
        ok = in_commune(E0 + p[:, 0], N0 - p[:, 1]); P[k] = [o for o, g in zip(v, ok) if g]
    if k == "power_lines":
        P[k] = [o for o in v if in_commune(E0 + np.array(o["points"])[:, 0], N0 - np.array(o["points"])[:, 1]).all()]
INFO = ("src", "road", "house", "parcel", "orient", "where", "osm_id")   # informational only: dropped to fit the budget
for v in P.values():
    for o in v:
        for k in INFO: o.pop(k, None)
        if "scale" in o: o["scale"] = round(o["scale"], 1)
        if "rot" in o: o["rot"] = round(o["rot"], 2)
def make_doc():
    d = {"version": 1, "origin": L["origin"], "attribution": ["© OpenStreetMap contributors (ODbL)"],
         "notes": {"seed": SEED, "tile": TID,
                   "real_osm": "bridges = OSM road x OSM canal crossings; churches/temples/cemeteries = OSM features in this tile; "
                               "routes/power lines follow OSM canals/roads.",
                   "procedural": "everything else is placed by seeded rule, not observed; no prop depends on water states.",
                   "rot": "radians about +Y; local +Z = model front = (sin rot, cos rot); local +X = (cos rot, -sin rot)",
                   "route_mode": "pingpong = traverse back and forth along points"}}
    d.update(P); return d

# ---------------- self-checks ----------------
def allxz(o):
    if isinstance(o, dict):
        if "x" in o and "z" in o: yield o["x"], o["z"], True
        for k, v in o.items():
            if k in ("points",):
                for p in v: yield p[0], p[1], False
            elif k == "herder": yield v[0], v[1], True
            elif k not in ("notes", "origin"): yield from allxz(v)
    elif isinstance(o, list):
        for v in o: yield from allxz(v)
# Reject crossings whose decks would end in water; source-backed bridge overlays remain separate.
P["bridges"] = [b for b in P["bridges"] if all(CN.near(b["x"] + math.cos(b["rot"]) * side * b["len"] / 2, b["z"] - math.sin(b["rot"]) * side * b["len"] / 2)[0] > -1.0 for side in (-1, 1))]
if not PROFILE["architecture"].get("illustrative_graves", True): P["graves"] = []
cnt = 0
for x, z, point in allxz(P):
    assert math.isfinite(x) and math.isfinite(z) and abs(x) <= 1000 and abs(z) <= 1000, (x, z); cnt += 1
    if point: assert in_commune(np.array([E0 + x]), np.array([N0 - z]))[0], ("outside commune", x, z)
for o in P["lift_nets"] + P["pumps"] + P["shrines"] + P["dogs"] + P["straw_piles"]:
    assert CN.near(o["x"], o["z"])[0] > 0 and house_clear(o["x"], o["z"], 0.2), o
for o in P["moored_boats"] + P["fish_stakes"]:
    assert CN.near(o["x"], o["z"])[0] < 0, o
for o in P["veg"]:
    assert TREES.clear_of(o["x"], o["z"], 2.9) and ((HX - (o["x"], o["z"])) ** 2).sum(1).min() >= 5.9 ** 2, o
    if o["kind"] in ("nipa", "reeds"): assert CN.near(o["x"], o["z"])[0] < 0.1, o
for b in P["bridges"]:  # +X spans the canal: both ends land on dry ground
    xd = (math.cos(b["rot"]), -math.sin(b["rot"]))
    for s in (-1, 1):
        assert CN.near(b["x"] + xd[0] * s * b["len"] / 2, b["z"] + xd[1] * s * b["len"] / 2)[0] > -1.0, b
assert len(P["veg"]) <= 2500
while True:   # budget 150 KB: trim veg from the end (reeds/nipa were added last)
    s = json.dumps(make_doc(), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if len(s.encode()) <= 150_000 or not P["veg"]: break
    del P["veg"][int(len(P["veg"]) * 0.93):]
assert len(s.encode()) <= 150_000, len(s.encode())
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, "props.json"), "w", encoding="utf-8").write(s)
print(TID, "props bytes", len(s.encode()), {k: len(v) for k, v in P.items()})
