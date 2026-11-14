# Re-import each final life .glb, assert budgets / clips / skins / nodes / sizes, write models/life.json.
import bpy, json, os, struct, sys
from mathutils import Vector

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from recovery_paths import build_dir, models_dir, source_dir
DIR = str(models_dir())
# file: kind, max tris, required clips {name: seconds}, measure clip, (h_min, h_max), (len_min, len_max), required nodes, notes
SPEC = {
    'duck': ('duck', 900, {'swim': 1.0, 'walk': 0.6, 'dabble': 2.0}, 'walk', (0.25, 0.4), (0.38, 0.52), [],
             'Mottled white/brown domestic duck, 10 bones. Origin = ground/water contact: "walk" stands on y=0; "swim" and "dabble" float with the waterline at y=0 (body bottom ~-0.07). Default pose = swim.'),
    'wader': ('person', 3500, {'work': 3.0, 'walk': 1.4}, 'work', (1.5, 1.85), None, [],
              'Farmer in faded-brown ao ba ba, trousers rolled above knee (darkened wet below 0.42 m), non la, round bamboo basket (ro) on its own bone. Origin at feet; sink ~0.4 m into water. "work": bend, scoop basket under water (to y~0.3), lift and shake. "walk": in-place high-knee wade, basket at left hip.'),
    'fisher': ('person', 4500, {'cast': 3.5, 'pull': 3.0}, 'cast', (1.5, 1.85), None, [],
               'Fisherman with round throw net (chai). Net = separate disc mesh (alpha-BLEND netting texture) skinned to bones net/net_rim (radial scale + rim drop), hand-line rope stretches hand->net. "cast": hold, wind-up, throw; net opens to a 3.2 m disc landing ~4.2 m forward at y=0, then sinks to y=-0.35. "pull": hand-over-hand haul back to the held bundle (ends = cast frame 0). Origin at feet on bank.'),
    'washer': ('person', 3500, {'wash': 2.5}, 'wash', (0.8, 1.2), None, [],
               'Woman squatting in purple ao ba ba, black trousers, checked khan ran head scarf; aluminium basin with water in front (static bone), cloth on its own bone: scrub x3 then lift and rinse. Origin at feet (place on a canal step).'),
    'dog': ('dog', 1500, {'walk': 0.8, 'idle': 3.0, 'sit': 1.0}, 'idle', (0.55, 0.75), (0.75, 1.05), [],
            'Local yellow dog (cho vang), 19 bones. "walk" in place, lateral-sequence gait. "idle": tail wag + sniff the ground. "sit": held sitting pose with breathing (loopable).'),
    'motorbike': ('motorbike', 5000, {'ride': 2.0}, 'ride', (1.35, 1.8), (1.75, 2.0), ['wheel_f', 'wheel_r'],
                  'Generic red underbone scooter (no logo), rice sack on rear rack, rider in red half-helmet seated with hands on grips. Nodes wheel_f / wheel_r: origin at hub, spin about local X (radius 0.29 m -> omega = v/0.29). "ride": subtle rider sway / head look (2 s loop). Bike parts are rigid, rider skinned.'),
    'buffalo': ('buffalo', 3000, {'walk': 1.6, 'idle': 4.0}, 'idle', (1.3, 1.6), (2.2, 2.7), [],
                'Swamp water buffalo, dark slate skin, swept-back horns, 19 bones. "walk" in place (1.6 s). "idle": head swing / chew, tail flicks.'),
}


def glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + ln])


out, ok = [], True
print('\n%-10s %5s %7s %5s %5s %-34s %s' % ('model', 'tris', 'bytes', 'h_m', 'len_m', 'clips', 'check'))
for name, (kind, mt, clips_req, mclip, hr, lr, nodes_req, notes) in SPEC.items():
    path = os.path.join(DIR, name + '.glb')
    if not os.path.exists(path):
        print(name, 'MISSING'); ok = False; continue
    js = glb_json(path); acc = js['accessors']
    tris = sum(acc[p['indices']]['count'] // 3 for m in js['meshes'] for p in m['primitives'])
    clips = []
    for a in js.get('animations', []):
        dur = max(acc[s['input']]['max'][0] for s in a['samplers'])
        clips.append({'name': a.get('name', ''), 'seconds': round(dur, 3)})
    cn = {c['name']: c['seconds'] for c in clips}
    node_names = [n.get('name', '') for n in js['nodes']]
    joints = [len(s['joints']) for s in js.get('skins', [])]
    size = os.path.getsize(path)
    # measure default pose (= measure clip frame 0) after import
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=path)
    for o in bpy.context.scene.objects:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks:
                tr.mute = True
            act = next((a for a in bpy.data.actions if a.name == mclip or a.name.startswith(mclip + '_')), None)
            o.animation_data.action = act
            if act and act.slots:
                o.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(0)
    dg = bpy.context.evaluated_depsgraph_get(); pts = []
    for o in bpy.context.scene.objects:
        if o.type == 'MESH' and o.visible_get():
            e = o.evaluated_get(dg); me = e.to_mesh()
            pts += [e.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear()
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    h, L = mx.z, mx.y - mn.y
    errs = []
    if tris > mt: errs.append(f'tris {tris}>{mt}')
    if size > 350_000: errs.append(f'bytes {size}>350000')
    for c, sec in clips_req.items():
        if c not in cn: errs.append('missing clip ' + c)
        elif abs(cn[c] - sec) > 0.05: errs.append(f'clip {c} {cn[c]}s != {sec}s')
    if not joints: errs.append('no skin')
    if any(j > 20 for j in joints): errs.append(f'bones {joints}>20')
    for n in nodes_req:
        if n not in node_names: errs.append('missing node ' + n)
    if 'EXT_meshopt_compression' not in js.get('extensionsUsed', []): errs.append('not meshopt')
    if not (hr[0] <= h <= hr[1]): errs.append(f'height {h:.2f} not in {hr}')
    if lr and not (lr[0] <= L <= lr[1]): errs.append(f'length {L:.2f} not in {lr}')
    if abs(mn.z) > 0.03 and name not in ('duck',): errs.append(f'base y {mn.z:.2f} != 0')
    ok &= not errs
    print('%-10s %5d %7d %5.2f %5.2f %-34s %s' % (name, tris, size, h, L, ','.join(f"{c['name']}:{c['seconds']}" for c in clips), 'OK' if not errs else '; '.join(errs)))
    out.append({'file': name + '.glb', 'kind': kind, 'height_m': round(h, 2), 'length_m': round(L, 2), 'width_m': round(mx.x - mn.x, 2),
                'tris': tris, 'bytes': size, 'bones': joints[0] if joints else 0, 'clips': clips,
                'nodes': [n for n in node_names if n in nodes_req] or None, 'default_pose': f'{mclip} frame 0', 'notes': notes})
meta = {'generated_by': 'web/tools/blender/life/*.py (Blender 5.3) + @gltf-transform/cli 4.5.1 optimize --compress meshopt --texture-compress webp --texture-size 512 --simplify false',
        'units': 'metres, glTF +Y up, origin at ground/water contact base centre, forward = +Z', 'fps_authored': 30,
        'decoder': 'EXT_meshopt_compression -> GLTFLoader.setMeshoptDecoder(MeshoptDecoder)',
        'license': 'Original procedural work generated by script in Blender (procedural textures only, no third-party assets).',
        'models': out}
with open(os.path.join(DIR, 'life.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, indent=2)
print('SELFCHECK', 'PASS' if ok else 'FAIL')
