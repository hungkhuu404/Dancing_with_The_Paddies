# Re-import each final vegetation .glb in a fresh scene; assert budgets / heights / origin / materials; write models/veg.json.
import bpy, json, os, struct, sys
from mathutils import Vector

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from recovery_paths import build_dir, models_dir, source_dir
DIR = str(models_dir())
LIC = 'Original work: procedural Blender 5.3 Python script (scratchpad world/scripts/veg), procedurally painted textures; no third-party models or textures.'
# name: (kind, max_tris, (min_h, max_h), min_y_allowed, notes)
SPEC = {
    'bamboo': ('bamboo_clump', 7000, (8, 12), -0.05, 'Bui tre: ~32 arching culms (5-sided, culm colour+normal map) with hanging alpha-MASK spray cards and a dense twiggy base. Foliage custom normals blended outward.'),
    'tram': ('melaleuca', 5000, (8, 12), -0.05, 'Cay tram: slender pale papery trunk (colour+normal), narrow open crown of grey-green alpha-MASK twig cards; faint flood mark at ~0.85 m.'),
    'areca': ('areca_palm', 3000, (10, 15), -0.05, 'Cay cau: straight ringed trunk, green crownshaft, 11 pinnate fronds + 1 dry, two nut bunches.'),
    'mango': ('mango', 5000, (6, 9), -0.08, 'Mango: short thick trunk, 4 limbs, dense dark lobed crown of alpha-MASK leaf-cluster cards around a dark inner core mesh.'),
    'nipa': ('nipa_palm', 3000, (4, 6.2), -0.55, 'Dua nuoc clump: 4 plants of stiff pinnate fronds rising from below water. Origin = water level; frond bases extend to y=-0.35 (sink into the water plane).'),
    'hyacinth': ('water_hyacinth', 2000, (0.3, 0.8), -0.05, 'Luc binh floating mat ~3x2 m: rosettes of glossy round leaf cards with bulbous petioles, 5 lilac flower spikes. Origin at water surface (y=0).'),
    'straw_pile': ('straw_stack', 1500, (2.6, 3.5), -0.05, 'Dong rom: lumpy dome ~3.8 m wide with pole, tiled straw colour+normal, hanging alpha-MASK wisps and loose straw on the ground; greyer weathered top.'),
    'reeds': ('reeds', 800, (0.9, 1.5), -0.05, 'Canal-edge reed clump: vertex-coloured double-sided blades (some dry tips) + 6 stems with alpha-MASK plume cards.'),
}
MAXB = 400_000


def glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    return json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])


rows, out, ok = [], [], True
for name, (kind, mt, (h0, h1), ymin, notes) in SPEC.items():
    path = os.path.join(DIR, name + '.glb')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0; pts = []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        e = o.evaluated_get(dg); me = e.to_mesh()
        me.calc_loop_triangles(); tris += len(me.loop_triangles)
        pts += [e.matrix_world @ v.co for v in me.vertices]
        e.to_mesh_clear()
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    h = mx.z; fx = mx.x - mn.x; fz = mx.y - mn.y
    js = glb_json(path); size = os.path.getsize(path)
    mats = js.get('materials', [])
    masks = [m['name'] for m in mats if m.get('alphaMode') == 'MASK']
    errs = []
    if tris > mt: errs.append(f'tris {tris}>{mt}')
    if size > MAXB: errs.append(f'bytes {size}>{MAXB}')
    if not (h0 <= h <= h1): errs.append(f'height {h:.2f} not in [{h0},{h1}]')
    if mn.z < ymin: errs.append(f'min y {mn.z:.2f} < {ymin}')
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    if max(abs(cx), abs(cy)) > 0.25 * max(fx, fz, 1): errs.append(f'origin off-centre ({cx:.2f},{cy:.2f})')
    if 'EXT_meshopt_compression' not in js.get('extensionsUsed', []): errs.append('not meshopt')
    if 'KHR_draco_mesh_compression' in js.get('extensionsUsed', []): errs.append('draco used')
    for m in mats:
        if m.get('alphaMode') == 'MASK' and (abs(m.get('alphaCutoff', 0.5) - 0.5) > 1e-6 or not m.get('doubleSided')):
            errs.append('bad mask mat ' + m['name'])
    if not masks: errs.append('no MASK material')
    if not all('COLOR_0' in p['attributes'] for me in js['meshes'] for p in me['primitives']): errs.append('missing COLOR_0')
    for im in js.get('images', []):
        pass
    ok &= not errs
    rows.append((name, tris, size, h, fx, fz, ','.join(masks), 'OK' if not errs else '; '.join(errs)))
    out.append({'file': name + '.glb', 'kind': kind, 'height_m': round(h, 2), 'footprint_m': [round(fx, 2), round(fz, 2)],
                'min_y_m': round(mn.z, 2), 'tris': tris, 'bytes': size, 'clips': [], 'alpha_mask_materials': masks,
                'notes': notes, 'license': LIC})

print('\n%-11s %6s %8s %6s %13s %-36s %s' % ('model', 'tris', 'bytes', 'h_m', 'footprint_m', 'mask mats', 'check'))
for r in rows:
    print('%-11s %6d %8d %6.2f %6.2f x %-5.2f %-36s %s' % r)
with open(os.path.join(DIR, 'veg.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=2)
print('SELFCHECK', 'PASS' if ok else 'FAIL')
