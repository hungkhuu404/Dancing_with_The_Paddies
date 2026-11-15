"""Blender -b --factory-startup -t 2 --python render_tree_impostors.py -- --source RAW_GLB_DIR
Eight azimuths at two elevations, rendered from the original uncompressed GLBs.
No downloaded/AI imagery. Source models must have the same provenance as public/models.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument('--source', type=Path, required=True)
args.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[2] / 'public' / 'impostors')
args.add_argument('--names', nargs='+', default=['palm_a', 'palm_b', 'banana', 'bush'],
                  choices=['palm_a','palm_b','banana','bush','bamboo','tram','areca','mango','nipa','reeds','thai_borassus','thai_tamarind'])
opt = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
opt.source=opt.source.resolve();opt.out=opt.out.resolve()
opt.out.mkdir(parents=True, exist_ok=True)
index_file = opt.out / 'index.json'
metadata = json.loads(index_file.read_text(encoding='utf8')) if index_file.exists() else {}
for name in opt.names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(opt.source / (name + '.glb')))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    points = [o.matrix_world @ Vector(v) for o in objects for v in o.bound_box]
    lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (lo + hi) / 2
    span = max(hi.x-lo.x, hi.y-lo.y, hi.z-lo.z) * 1.18
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 8
    sc.render.resolution_x = sc.render.resolution_y = 128
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.world = bpy.data.worlds.new('Ambient')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.65,.72,.8,1)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .85
    bpy.ops.object.light_add(type='SUN', location=(10,-10,20))
    bpy.context.object.data.energy = 1.7
    bpy.context.object.rotation_euler = (.35,-.4,-.5)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = span
    sc.camera = cam
    atlas = np.zeros((256,1024,4), dtype=np.float32)
    for row, elevation in enumerate((20,65)):
        for col in range(8):
            az = col * math.tau / 8
            cam.location = center + Vector((math.sin(az), -math.cos(az), math.tan(math.radians(elevation)))) * span * 2
            cam.rotation_euler = (center-cam.location).to_track_quat('-Z','Y').to_euler()
            # Loading an explicit saved render is reliable in background Blender.
            frame = opt.out / '_view.png'
            sc.render.filepath = str(frame)
            bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(str(frame), check_existing=False)
            atlas[row*128:(row+1)*128,col*128:(col+1)*128] = np.asarray(im.pixels[:]).reshape(128,128,4)
            bpy.data.images.remove(im)
    image = bpy.data.images.new(name, width=1024, height=256, alpha=True)
    image.pixels.foreach_set(atlas.ravel())
    image.filepath_raw = str(opt.out / (name+'.png')); image.file_format = 'PNG'; image.save()
    if (opt.out / (name+'.png')).stat().st_size > 400000:
        raise RuntimeError(f'{name}: impostor exceeds the 400 KB asset budget; review before publishing')
    metadata[name] = {'span': span, 'center': center.z, 'azimuths':8, 'elevations':[20,65]}
    (opt.out / '_view.png').unlink(missing_ok=True)
index_file.write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf8')
