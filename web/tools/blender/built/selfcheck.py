# Re-import every final "built" .glb, assert budgets / nodes / clips / bbox / textures / COLOR_0, write models/built.json.
import bpy, json, os, struct
from mathutils import Vector

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from recovery_paths import build_dir, models_dir, source_dir
DIR = str(models_dir())
MAXB = 350_000
# name: (kind, max_tris, (min, max) of [x, y, z] glTF size, clips, nodes, needs Window mat, notes)
SPEC = {
    'bridge_monkey': ('bridge', 3000, ((11, 13.5), (3.5, 4.5), (0.6, 1.5)), [], [], False,
                      'Cau khi along X (12 m). Deck logs top ~y=1.26 (sag to 1.14 between X-stakes); handrail ~y=2.0 on the -Z side; stakes to y=-2. Water at y=0.'),
    'bridge_concrete': ('bridge', 3000, ((13.5, 15), (5.2, 6.0), (3, 4)), [], [], False,
                        'Rural slab bridge along X, 14 m, 3 m wide. Deck top y = 1.0 + 1.5*(1-(x/7)^2) (2.5 mid, 1.0 at ends); 2 pier bents + end abutments to y=-2; galvanised pipe railings.'),
    'pole': ('pole', 600, ((1.7, 2.1), (8.3, 8.7), (0.25, 0.5)), [], ['wire_a', 'wire_b', 'wire_c'], False,
             'Spun-concrete pole 8.5 m; cross-arm along X on the +Z face. wire_a (x=-0.82) / wire_b (x=+0.82) on the arm at y~8.07, wire_c on the pole top y~8.48. Run wires along +-Z.'),
    'pole_tx': ('pole', 700, ((1.7, 2.1), (8.3, 8.7), (0.5, 1.1)), [], ['wire_a', 'wire_b', 'wire_c'], False,
                'pole + grey pole-mounted transformer can (y 5.1-6.0) on the +Z side with drop leads to the arm.'),
    'lift_net': ('lift_net', 2000, ((3.5, 4.6), (2.5, 5.5), (8, 13)), ['lift'], ['lever', 'net'], False,
                 'Vo: A-frame on the bank (origin = bank base), lever pivots at (0,2.4,0.3), 4x4 m net hangs in front (+Z, centre z~6.5). Clip "lift" 6 s loop (net lowered 0-1.5 s, rises to ~y 2.5, held, lowers). Net = alpha-BLEND material "Net". Lowered net sinks to y~-1.3, so put water ~y -0.3.'),
    'fish_stakes': ('fish_stakes', 1500, ((9.5, 10.6), (3.0, 3.4), (0.1, 0.5)), [], [], False,
                    'Row of 11 bamboo stakes along X, y -2..+1.2, alpha-BLEND net panels between them, tied top rail. Water at y=0.'),
    'pump': ('pump', 1500, ((1.3, 1.9), (1.2, 1.6), (6, 7)), ['vibrate'], ['engine'], False,
             'Diesel pump set on a wooden stand at origin; blue flexible discharge hose ~6 m toward +Z lying on the ground. Clip "vibrate" (1 s loop) shakes node "engine" by ~3 mm.'),
    'shrine': ('shrine', 1500, ((0.9, 1.4), (1.9, 2.3), (0.8, 1.3)), [], [], False, 'Mieu roadside shrine ~2.1 m, red/yellow, tiled mini hip roof, open front (+Z) with bowl/vases inside.'),
    'church': ('church', 6000, ((12, 15), (21.5, 23.5), (29, 33)), [], [], True,
               'Rural church: nave 12x25 m, front bell tower to ~22.7 m (incl. plain cross) at +Z, rear apse. Pointed windows = Window_Glass (glows at night).'),
    'pagoda': ('pagoda', 6000, ((19, 21.5), (11, 12.5), (13, 15)), [], [], True,
               'Village pagoda hall on 18x12 m platform, double-tier curved hip roof with upturned corners, red columns, front steps at +Z. Windows = Window_Glass.'),
    'grave': ('grave', 2000, ((5.9, 6.3), (1.3, 1.6), (5.9, 6.3)), [], [], False,
              'Family grave plot 6x6 m, low concrete fence (gap at +Z front), 4 tiled tombs with steles + tiny tile roofs (one aged grey).'),
    'longtail': ('boat', 3000, ((1.0, 1.4), (1.2, 1.8), (8, 10.5)), ['spin'], ['prop'], False,
                 'Vo lai ~7 m hull, bow +Z, origin at waterline centre; engine on stern swivel, long shaft down-aft, seated driver with non la holding the tiller. Node "prop" = propeller hub; spin axis = prop local -Z(glTF) (Blender local Y); clip "spin" = one turn per 0.5 s (linear).'),
    'cargo_boat': ('boat', 5000, ((3.5, 4.2), (2.5, 3.6), (16, 17)), [], [], True,
                   'Ghe cho lua ~16 m, bow +Z, origin waterline centre (keel y~-0.55, deep-laden), mound of ~100 rice sacks, painted eyes at the bow, plank cabin + tin roof aft (Window_Glass windows).'),
    'jars': ('prop', 1000, ((1.4, 1.8), (0.9, 1.1), (1.2, 1.6)), [], [], False, '3 brown-glazed lu (0.92/0.86/0.72 m), one with an aluminium lid, others with dark water surface.'),
    'clothesline': ('prop', 1000, ((4.0, 4.3), (1.85, 2.0), (0.1, 0.4)), [], [], False, 'Two posts 4 m apart along X, sagging line, 5 hanging garments (double-sided Fabric) with pegs.'),
    'hammock': ('prop', 1000, ((3.2, 3.5), (1.8, 2.0), (0.8, 1.2)), [], [], False, 'Striped fabric hammock between two posts 3.2 m apart along X, lowest point ~y 0.52.'),
    'stilt_toilet': ('stilt', 1000, ((1.5, 1.9), (4.6, 5.1), (4.0, 4.6)), [], [], False,
                     'Over-water plank outhouse on stilts (floor y=1.0, stilts to -2), cloth door curtain and plank walkway toward +Z (bank side), tin roof. Water at y=0.'),
}


def glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + ln])


rows, out, ok = [], [], True
for name, (kind, mt, rng_, clips_req, nodes_req, needwin, notes) in SPEC.items():
    path = os.path.join(DIR, name + '.glb')
    errs = []
    if not os.path.exists(path):
        rows.append((name, 0, 0, '', 'MISSING')); ok = False; continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
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
    size = [mx.x - mn.x, mx.z - mn.z, mx.y - mn.y]          # glTF x, y(up), z
    js = glb_json(path)
    clips = [a.get('name', '') for a in js.get('animations', [])]
    nodes = [n.get('name', '') for n in js.get('nodes', [])]
    mats = [m.get('name', '') for m in js.get('materials', [])]
    nbytes = os.path.getsize(path)
    texmax = max([max(im.size) for im in bpy.data.images if im.size[0]] or [0])
    no_col = [m.get('name') for m in js['meshes'] for p in m['primitives'] if 'COLOR_0' not in p['attributes']]
    if tris > mt: errs.append(f'tris {tris}>{mt}')
    if nbytes > MAXB: errs.append(f'bytes {nbytes}>{MAXB}')
    for i, (a, b) in enumerate(rng_):
        if not (a <= size[i] <= b): errs.append(f'size[{i}] {size[i]:.2f} not in [{a},{b}]')
    for c in clips_req:
        if c not in clips: errs.append('missing clip ' + c)
    for n in nodes_req:
        if n not in nodes: errs.append('missing node ' + n)
    if needwin and not any('Window' in m for m in mats): errs.append('no Window material')
    if texmax > 512: errs.append(f'texture {texmax}px')
    if no_col: errs.append('no COLOR_0 on ' + ','.join(no_col))
    if 'EXT_meshopt_compression' not in js.get('extensionsUsed', []): errs.append('not meshopt')
    ok &= not errs
    rows.append((name, tris, nbytes, ','.join(clips), 'OK' if not errs else '; '.join(errs)))
    out.append({'file': name + '.glb', 'kind': kind, 'size_m': [round(x, 2) for x in size],
                'bbox_min_m': [round(mn.x, 2), round(mn.z, 2), round(-mx.y, 2)], 'bbox_max_m': [round(mx.x, 2), round(mx.z, 2), round(-mn.y, 2)],
                'tris': tris, 'bytes': nbytes, 'clips': clips,
                'nodes': [n for n in nodes if n in ('wire_a', 'wire_b', 'wire_c', 'prop', 'engine', 'lever', 'net')],
                'materials': mats, 'max_texture_px': texmax, 'notes': notes})

print('\n%-16s %6s %8s %-10s %s' % ('model', 'tris', 'bytes', 'clips', 'check'))
for r in rows:
    print('%-16s %6d %8d %-10s %s' % r)
print('TOTAL bytes', sum(r[2] for r in rows))
with open(os.path.join(DIR, 'built.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=2)
print('SELFCHECK', 'PASS' if ok else 'FAIL')
