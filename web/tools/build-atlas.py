"""Build a physical regional overview; never infer administrative or maritime borders."""
import argparse, hashlib, json
from pathlib import Path
from shapely.geometry import shape, box
from shapely.ops import unary_union

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
revision = 'ca96624a56bd078437bca8184e78163e5039ad19'
bounds = [91, 2, 123, 27]
frame = box(*bounds)
files = ['ne_10m_land.geojson', 'ne_10m_minor_islands.geojson',
         'ne_10m_geography_regions_polys.geojson', 'ne_50m_rivers_lake_centerlines.geojson']
sources = {name: json.loads((args.source / name).read_text(encoding='utf8')) for name in files}
def parts(geometry, kind):
    if geometry.is_empty:
        return []
    if geometry.geom_type == kind:
        return [geometry]
    return [part for child in getattr(geometry, 'geoms', []) for part in parts(child, kind)]
def coords(ring):
    return [[round(x, 5), round(y, 5)] for x, y, *_ in ring.coords]
# Intersect before union so global source complexity never enters the regional union.
polygons = []
for name in files[:2]:
    for feature in sources[name]['features']:
        geometry = shape(feature['geometry'])
        if geometry.intersects(frame):
            polygons.extend(parts(geometry.intersection(frame), 'Polygon'))
land = unary_union(polygons)
# Do not engrave crop edges as coastlines. Simplification preserves small island rings.
coasts = land.boundary.difference(frame.boundary.buffer(0.000001)).simplify(0.003, preserve_topology=True)
land = land.simplify(0.003, preserve_topology=True)
rivers = []
for feature in sources[files[3]]['features']:
    geometry = shape(feature['geometry'])
    if geometry.intersects(frame):
        rivers.extend(coords(line) for line in parts(geometry.intersection(frame).simplify(0.003), 'LineString'))
labels = []
for name, local in [('Paracel Islands', 'Hoàng Sa'), ('Spratly Islands', 'Trường Sa')]:
    feature = next(f for f in sources[files[2]]['features'] if f['properties']['NAME'] == name)
    region = shape(feature['geometry'])
    point = region.centroid
    labels.append({'name': local, 'international_name': name, 'center': [round(point.x, 5), round(point.y, 5)],
                   'source_id': feature['properties']['NE_ID'],
                   'land_polygons': sum(p.intersects(region) for p in parts(land, 'Polygon'))})
data = {'bounds': bounds, 'land': [[coords(p.exterior), *[coords(r) for r in p.interiors]] for p in parts(land, 'Polygon')],
        'coasts': [coords(line) for line in parts(coasts, 'LineString')], 'rivers': rivers, 'island_labels': labels}
manifest = {'source': 'Natural Earth 1:10 million physical land, minor islands and geographic labels; 1:50 million river centre lines',
            'license': 'Public domain', 'terms': 'https://www.naturalearthdata.com/about/terms-of-use/',
            'revision': revision, 'bounds': bounds, 'simplification_degrees': 0.003,
            'sources': [{'file': name, 'url': f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{revision}/geojson/{name}',
                         'sha256': hashlib.sha256((args.source / name).read_bytes()).hexdigest()} for name in files],
            'processing': 'Physical geometry only. Clipped and topology-preserving simplified; 5 decimal coordinate storage is not positional accuracy. Crop edges omitted from coastlines. No political or maritime boundaries.',
            'label_placement': 'Island-group label anchors are centroids of Natural Earth physical label regions, not island locations or territorial outlines. Small islands retain their source geometry; no minimum-sized synthetic islands.',
            'generator': 'web/tools/build-atlas.mjs and build-atlas.py'}
args.out.mkdir(parents=True, exist_ok=True)
(args.out / 'region.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
(args.out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'polygons': len(data['land']), 'bytes': (args.out / 'region.json').stat().st_size, 'labels': labels}, ensure_ascii=True))
