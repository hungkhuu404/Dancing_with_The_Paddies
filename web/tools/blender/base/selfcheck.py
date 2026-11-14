# Re-import every final .glb in a fresh scene, assert budgets/sizes/clips, print a table, write models.json.
import bpy, json, os, struct, sys
from mathutils import Vector

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from recovery_paths import build_dir, models_dir, source_dir
DIR = str(models_dir())
# name: (kind, max_tris, max_bytes, (min_h, max_h), required clips, notes)
SPEC = {
    'palm_a': ('palm', 6000, 500_000, (8, 14), [], 'Coconut palm, gentle lean. Fronds: alpha-MASK cards (Palm_Frond), trunk tiled colour+normal map.'),
    'palm_b': ('palm', 6000, 500_000, (8, 14), [], 'Coconut palm, strong canal-bank lean then curving up; 3 dry hanging fronds.'),
    'banana': ('banana', 4000, 300_000, (3, 4.2), [], 'Banana clump (4 pseudostems), torn alpha-MASK leaves, dry hanging leaves, fruit bunch + bud.'),
    'bush': ('bush', 2000, 200_000, (1.6, 2.4), [], 'Dense tropical shrub: alpha-MASK leaf cards with outward (spherical) normals around a dark core.'),
    'house_0': ('house', 4000, 300_000, (3.5, 6.5), [], 'Pastel plaster house, gable roof parallel to front, front veranda on 4 posts, 2 water jars. Front = +Z.'),
    'house_1': ('house', 4000, 300_000, (3.5, 6.5), [], 'Weathered wooden plank house, gable to front, open kitchen lean-to on +X. Front = +Z.'),
    'house_2': ('house', 4000, 300_000, (4.0, 7.0), [], 'Stilt house (nha san), floor +1.35 m; porch + steps down to a wooden landing at y=-0.35 on piles to y=-1.7, landing extends to z=+9.4 (front = +Z). Put canal water at about y=-0.5..-0.8.'),
    'boat': ('boat', 4000, 300_000, (1.0, 1.6), ['row'], 'Xuong ba la ~5.6 m, bow = +Z, origin at waterline centre (hull bottom y=-0.05). Seated rower with non la + paddle; clip "row" (2 s loop) animates nodes rower_hips / rower_shoulders.'),
    'egret': ('egret', 1500, 150_000, (0.8, 1.0), ['fly', 'idle'], 'White egret, skinned (11 bones). Rest/idle: standing, feet at origin, bill = +Z. "fly": 0.67 s flap loop, neck folded, legs trailing. "idle": 3 s, wings scaled to 0 (folded into body), neck/head motion.'),
    'rice_tuft': ('rice_tuft', 800, 50_000, (0.3, 0.6), [], 'Post-harvest stubble clump + green regrowth blades, vertex colours only, for instancing.'),
}


def glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + ln])


rows, out, ok = [], [], True
for name, (kind, mt, mb, (h0, h1), clips_req, notes) in SPEC.items():
    path = os.path.join(DIR, name + '.glb')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in bpy.context.scene.objects:
        if o.type == 'ARMATURE':
            o.data.pose_position = 'REST'   # measure the rest (standing) pose
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0; pts = []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or not o.visible_get():
            continue
        e = o.evaluated_get(dg); me = e.to_mesh()
        me.calc_loop_triangles(); tris += len(me.loop_triangles)
        pts += [e.matrix_world @ v.co for v in me.vertices]
        e.to_mesh_clear()
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    # Blender Z-up -> glTF: height = z, footprint = x (glTF X) by y (glTF Z)
    h = mx.z; fx = mx.x - mn.x; fz = mx.y - mn.y
    js = glb_json(path)
    clips = [a.get('name', '') for a in js.get('animations', [])]
    mats = [m.get('name', '') for m in js.get('materials', [])]
    masks = [m.get('name') for m in js.get('materials', []) if m.get('alphaMode') == 'MASK']
    size = os.path.getsize(path)
    errs = []
    if tris > mt: errs.append(f'tris {tris}>{mt}')
    if size > mb: errs.append(f'bytes {size}>{mb}')
    if not (h0 <= h <= h1): errs.append(f'height {h:.2f} not in [{h0},{h1}]')
    for c in clips_req:
        if c not in clips: errs.append('missing clip ' + c)
    if kind == 'house' and not any('Window' in m for m in mats): errs.append('no Window material')
    if 'EXT_meshopt_compression' not in js.get('extensionsUsed', []): errs.append('not meshopt')
    if abs(mn.z) > 0.05 and kind not in ('house', 'boat'): errs.append(f'origin not at base (min y {mn.z:.2f})')
    ok &= not errs
    rows.append((name, tris, size, h, fx, fz, ','.join(clips), ','.join(masks), 'OK' if not errs else '; '.join(errs)))
    out.append({'file': name + '.glb', 'kind': kind, 'height_m': round(h, 2), 'footprint_m': [round(fx, 2), round(fz, 2)],
                'bbox_min_m': [round(mn.x, 2), round(mn.z, 2), round(-mx.y, 2)], 'bbox_max_m': [round(mx.x, 2), round(mx.z, 2), round(-mn.y, 2)],
                'tris': tris, 'bytes': size, 'clips': clips, 'materials': mats, 'alpha_mask_materials': masks, 'notes': notes,
                'license': 'Original procedural work generated in Blender 5.3 by script (textures painted procedurally, no third-party textures).'})

total = sum(r[2] for r in rows)
print('\n%-10s %6s %8s %6s %13s %-9s %-26s %s' % ('model', 'tris', 'bytes', 'h_m', 'footprint_m', 'clips', 'mask mats', 'check'))
for r in rows:
    print('%-10s %6d %8d %6.2f %6.2f x %-5.2f %-9s %-26s %s' % (r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]))
print('TOTAL bytes', total, 'OK' if total <= 3_000_000 else 'OVER 3 MB')
ok &= total <= 3_000_000
meta = {'generated_by': 'web/tools/blender/base/build_*.py (Blender 5.3) + @gltf-transform/cli 4.5.1 optimize --compress meshopt --texture-compress webp',
        'units': 'metres, +Y up, origin at base centre (boat: waterline centre)', 'front_axis': '+Z (houses front/door, boat bow, egret bill)',
        'decoder': 'EXT_meshopt_compression -> GLTFLoader.setMeshoptDecoder(MeshoptDecoder)', 'total_bytes': total, 'models': out}
with open(os.path.join(DIR, 'models.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, indent=2)
print('SELFCHECK', 'PASS' if ok else 'FAIL')
