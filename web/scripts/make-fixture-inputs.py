"""One-off: build the real (non-water) inputs of the web fixture from the H0 package.

Outputs (committed under web/fixtures/tan_hoi/):
  aoi.geojson, places.geojson  - commune boundary and hamlet points from OSM, contract format
  backdrop/*.webp              - raw NISAR HH, fixed scale -25..-5 dB, 20 m grid, nodata transparent
  backdrop.json                - the four corners (lon, lat): top-left, top-right, bottom-right, bottom-left
No water classification of any kind is computed here.

Run with Blender's bundled Python (numpy + OpenImageIO):
  python -I make-fixture-inputs.py <H0 dir> <out dir>
"""
import json, math, os, sys
import numpy as np
import OpenImageIO as oiio

H0, OUT = sys.argv[1:3]
os.makedirs(f"{OUT}/backdrop", exist_ok=True)

A, F, K0 = 6378137.0, 1 / 298.257223563, 0.9996
E2 = F * (2 - F); EP2 = E2 / (1 - E2)

def utm_fwd(lon, lat, lon0=105.0):
    phi, lam = math.radians(lat), math.radians(lon - lon0)
    n = A / math.sqrt(1 - E2 * math.sin(phi) ** 2)
    t, c = math.tan(phi) ** 2, EP2 * math.cos(phi) ** 2
    a = math.cos(phi) * lam
    m = A * ((1 - E2/4 - 3*E2**2/64) * phi - (3*E2/8 + 3*E2**2/32) * math.sin(2*phi) + (15*E2**2/256) * math.sin(4*phi))
    x = K0 * n * (a + (1-t+c) * a**3/6 + (5-18*t+t*t+72*c-58*EP2) * a**5/120) + 500000
    y = K0 * (m + n * math.tan(phi) * (a*a/2 + (5-t+9*c+4*c*c) * a**4/24 + (61-58*t+t*t+600*c-330*EP2) * a**6/720))
    return x, y

def utm_inv(x, y, lon0=105.0):
    # Snyder inverse; good to well under a metre at this latitude
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    m = y / K0
    mu = m / (A * (1 - E2/4 - 3*E2**2/64))
    p = mu + (3*e1/2 - 27*e1**3/32) * math.sin(2*mu) + (21*e1**2/16) * math.sin(4*mu) + (151*e1**3/96) * math.sin(6*mu)
    n1 = A / math.sqrt(1 - E2 * math.sin(p) ** 2)
    t1, c1 = math.tan(p) ** 2, EP2 * math.cos(p) ** 2
    r1 = A * (1 - E2) / (1 - E2 * math.sin(p) ** 2) ** 1.5
    d = (x - 500000) / (n1 * K0)
    lat = p - (n1 * math.tan(p) / r1) * (d*d/2 - (5+3*t1+10*c1-4*c1*c1-9*EP2) * d**4/24 + (61+90*t1+298*c1+45*t1*t1-252*EP2-3*c1*c1) * d**6/720)
    lon = (d - (1+2*t1+c1) * d**3/6 + (5-2*c1+28*t1-3*c1*c1+8*EP2+24*t1*t1) * d**5/120) / math.cos(p)
    return lon0 + math.degrees(lon), math.degrees(lat)

for lo, la in [(105.1, 10.1), (105.27, 10.22)]:  # self-check: round trip < 0.5 m
    x, y = utm_fwd(lo, la); lo2, la2 = utm_inv(x, y)
    assert abs(lo2 - lo) < 5e-6 and abs(la2 - la) < 5e-6, (lo, la, lo2, la2)

def inside(px, py, ring):
    c = False; j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c

# ---- aoi + places (OSM, ODbL)
src = json.load(open(f"{H0}/1_ranh_xa/xa_tan_hoi_osm.geojson", encoding="utf-8"))
ring = src["geometry"]["coordinates"][0]
xy = [utm_fwd(*p) for p in ring]
area_ha = abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(xy, xy[1:]))) / 2 / 1e4
aoi = {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": src["geometry"],
       "properties": {"site": "tan_hoi", "name": "Tân Hội", "osm_relation": 15449921, "area_ha": round(area_ha, 1)}}]}
json.dump(aoi, open(f"{OUT}/aoi.geojson", "w", encoding="utf-8"), ensure_ascii=False)

adm = json.load(open(f"{H0}/1_ranh_xa/osm_admin.json", encoding="utf-8"))
places = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [e["lon"], e["lat"]]},
           "properties": {"name": e["tags"]["name"], "osm_id": f"node/{e['id']}"}}
          for e in adm["elements"]
          if e.get("type") == "node" and e.get("tags", {}).get("place") in ("village", "quarter")
          and "name" in e.get("tags", {}) and inside(e["lon"], e["lat"], ring)]
assert len(places) == 24, len(places)  # DOC_TRUOC: exactly 24 hamlets inside the commune
json.dump({"type": "FeatureCollection", "features": places}, open(f"{OUT}/places.geojson", "w", encoding="utf-8"), ensure_ascii=False)

# ---- backdrops: raw HH, 10 m -> 20 m (mean of linear power), fixed -25..-5 dB grey, NaN -> transparent
corners = None
for fn, name in [("047_20261027_P05036.npz", "20261027_047d_hh.webp"), ("148_20261022_P05036.npz", "20261022_148d_hh.webp")]:
    d = np.load(f"{H0}/3_cua_so_anh_mau/{fn}", allow_pickle=False)
    hh, xs, ys = d["hh"].astype(np.float64), d["xs"], d["ys"]
    h, w = (hh.shape[0] // 2) * 2, (hh.shape[1] // 2) * 2
    blk = hh[:h, :w].reshape(h // 2, 2, w // 2, 2)
    with np.errstate(invalid="ignore", divide="ignore"):
        lin = np.nanmean(np.where(blk > 0, blk, np.nan), axis=(1, 3))
        db = 10 * np.log10(lin)
    valid = np.isfinite(db)
    g = np.where(valid, np.clip((db + 25) / 20, 0, 1), 0)
    if ys[0] < ys[-1]:  # make row 0 = north
        g, valid = g[::-1], valid[::-1]
    rgba = np.dstack([g, g, g, valid.astype(np.float64)]).astype(np.float32)
    spec = oiio.ImageSpec(rgba.shape[1], rgba.shape[0], 4, "uint8")
    spec.attribute("compression", "webp:75")
    out = oiio.ImageOutput.create(f"{OUT}/backdrop/{name}")
    out.open(f"{OUT}/backdrop/{name}", spec); out.write_image(rgba); out.close()
    x0, x1 = xs.min() - 5, xs[: w].max() + 5
    y0, y1 = ys.max() + 5, ys.max() + 5 - h * 10  # top edge, bottom edge
    c = [utm_inv(x0, y0), utm_inv(x1, y0), utm_inv(x1, y1), utm_inv(x0, y1)]
    c = [[round(lo, 6), round(la, 6)] for lo, la in c]
    assert corners in (None, c), "both sample windows must share one frame"
    corners = c
    print(name, rgba.shape[1], "x", rgba.shape[0], os.path.getsize(f"{OUT}/backdrop/{name}"), "bytes")

json.dump({"db_min": -25.0, "db_max": -5.0, "corners": corners}, open(f"{OUT}/backdrop.json", "w"))
print("aoi area_ha", round(area_ha, 1), "| places", len(places), "| corners", corners)
