# Shared helpers for the Tan Hoi asset scripts (run inside Blender 5.3, -b --factory-startup).
import bpy, bmesh, math, random, os, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from recovery_paths import build_dir, models_dir, source_dir
LAND = str(build_dir())
WORLD = str(build_dir())
RAW = str(build_dir() / 'raw' / 'base')
TEX = os.path.join(RAW, 'tex')
os.makedirs(TEX, exist_ok=True)
UP = Vector((0, 0, 1))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.render.fps = 24
    return sc


# ---------------------------------------------------------------- mesh building
class MB:
    """Accumulates geometry: verts, faces, per-vertex uv/colour, per-face material + smooth."""
    def __init__(self):
        self.v, self.f, self.uv, self.col, self.fm, self.fs = [], [], [], [], [], []
        self.tag = []  # per-vertex int tag (used for skin weights etc.)

    def add(self, verts, faces, uvs=None, col=(1, 1, 1), mat=0, smooth=True, tag=0):
        o = len(self.v)
        self.v += [Vector(p) for p in verts]
        self.uv += list(uvs) if uvs is not None else [(0.0, 0.0)] * len(verts)
        if callable(col):
            self.col += [tuple(col(i, Vector(p))) for i, p in enumerate(verts)]
        elif len(col) and hasattr(col[0], '__len__'):
            self.col += [tuple(c) for c in col]
        else:
            self.col += [tuple(col)] * len(verts)
        self.tag += list(tag) if hasattr(tag, '__len__') else [tag] * len(verts)
        for fc in faces:
            self.f.append([i + o for i in fc])
            self.fm.append(mat)
            self.fs.append(smooth)
        return o

    def build(self, name, mats, sharp_angle=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.v], [], self.f)
        me.validate(clean_customdata=False)
        uvl = me.uv_layers.new(name='UVMap')
        lv = np.zeros(len(me.loops), dtype=np.int32)
        me.loops.foreach_get('vertex_index', lv)
        uva = np.array(self.uv, dtype=np.float32)[lv]
        uvl.data.foreach_set('uv', uva.ravel())
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        cols = np.ones((len(self.v), 4), dtype=np.float32)
        cols[:, :3] = np.array([c[:3] for c in self.col], dtype=np.float32)
        ca.data.foreach_set('color', cols.ravel())
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = 0
        for m in mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.fm)
        me.polygons.foreach_set('use_smooth', self.fs)
        if sharp_angle is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp_angle))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob['tags'] = list(self.tag)
        return ob


def frames_along(pts, up_hint=UP):
    """Parallel-transport frames (T, N, B) along a polyline."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    T = []
    for i in range(n):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, n - 1)]
        T.append((b - a).normalized())
    N0 = up_hint.cross(T[0])
    if N0.length < 1e-4:
        N0 = Vector((1, 0, 0)).cross(T[0])
    N0.normalize()
    Ns = [N0]
    for i in range(1, n):
        q = T[i - 1].rotation_difference(T[i])
        Ns.append((q @ Ns[-1]).normalized())
    Bs = [T[i].cross(Ns[i]).normalized() for i in range(n)]
    return T, Ns, Bs


def loft(pts, radii, sides=8, cap0=False, cap1=False, vscale=1.0, up_hint=UP, phase=0.0, ry=None):
    """Tube along pts. radii: list (or rx list); ry optional list. Returns verts, faces, uvs (u around, v = metres*vscale)."""
    pts = [Vector(p) for p in pts]
    T, N, B = frames_along(pts, up_hint)
    verts, uvs, faces = [], [], []
    L = 0.0
    for i, p in enumerate(pts):
        if i:
            L += (p - pts[i - 1]).length
        rx = radii[i]; r2 = ry[i] if ry is not None else rx
        for j in range(sides + 1):
            a = 2 * math.pi * j / sides + phase
            verts.append(p + N[i] * math.cos(a) * rx + B[i] * math.sin(a) * r2)
            uvs.append((j / sides, L * vscale))
    S = sides + 1
    for i in range(len(pts) - 1):
        for j in range(sides):
            a = i * S + j
            faces.append([a, a + 1, a + S + 1, a + S])
    if cap0:
        c = len(verts); verts.append(pts[0]); uvs.append((0.5, 0))
        for j in range(sides):
            faces.append([c, j + 1, j])
    if cap1:
        c = len(verts); verts.append(pts[-1]); uvs.append((0.5, L * vscale))
        o = (len(pts) - 1) * S
        for j in range(sides):
            faces.append([c, o + j, o + j + 1])
    return verts, faces, uvs


def box(c, size, uv_scale=1.0):
    """Axis-aligned box: 6 separate quads (flat shading friendly), uv in metres."""
    cx, cy, cz = c; sx, sy, sz = [s / 2 for s in size]
    P = lambda x, y, z: (cx + x * sx, cy + y * sy, cz + z * sz)
    quads = [
        [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)],  # -Y
        [P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1)],      # +Y
        [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)],      # +X
        [P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1)],  # -X
        [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)],      # +Z
        [P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1)],  # -Z
    ]
    V, F, U = [], [], []
    for q in quads:
        o = len(V); V += q
        e1 = (Vector(q[1]) - Vector(q[0])).length; e2 = (Vector(q[3]) - Vector(q[0])).length
        U += [(0, 0), (e1 * uv_scale, 0), (e1 * uv_scale, e2 * uv_scale), (0, e2 * uv_scale)]
        F.append([o, o + 1, o + 2, o + 3])
    return V, F, U


def oriented_box(p0, p1, w, h, up=UP):
    """Beam from p0 to p1 with width w (side) and height h (up)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0); L = d.length; t = d / L
    s = t.cross(up)
    if s.length < 1e-4:
        s = t.cross(Vector((1, 0, 0)))
    s.normalize(); u = s.cross(t).normalized()
    V, F, U = box((0, 0, 0), (w, L, h))
    M = Matrix((s, t, u)).transposed()
    c = (p0 + p1) / 2
    return [c + M @ Vector(v) for v in V], F, U


# ---------------------------------------------------------------- images / materials
def np_image(name, arr, noncolor=False):
    """arr: HxWx(3|4) float 0..1 (sRGB-encoded for colour). Saved as PNG and loaded (packed)."""
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], 2)
    path = os.path.join(TEX, name + '.png')
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    img.pack()
    return img


def normal_from_height(hgt, strength=2.0):
    """Tileable tangent-space normal map (OpenGL / glTF convention) from a height field (rows = v going up)."""
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5 * strength
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5 * strength
    n = np.stack([-gx, -gy, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return (n * 0.5 + 0.5).astype(np.float32)


def tile_noise(h, w, scale, seed=0, octaves=4):
    """Periodic value noise in [0,1] via FFT-filtered white noise (tileable)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        wn = rng.standard_normal((h, w))
        fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
        sy, sx = scale if hasattr(scale, '__len__') else (scale, scale)
        f2 = (fx * sx) ** 2 + (fy * sy) ** 2
        filt = np.exp(-f2 / (2 ** o) ** 2)
        n = np.real(np.fft.ifft2(np.fft.fft2(wn) * filt))
        n = (n - n.mean()) / (n.std() + 1e-9)
        out += n * amp; tot += amp; amp *= 0.5
    out /= tot
    return np.clip(out * 0.25 + 0.5, 0, 1).astype(np.float32)


def mat_basic(name, img=None, nrm=None, color=(1, 1, 1, 1), rough=0.8, metal=0.0, vcol=True,
              alpha_clip=False, double=False, nrm_strength=1.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; Lk = nt.links
    bsdf = N['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = spec
    src = None
    if img is not None:
        t = N.new('ShaderNodeTexImage'); t.image = img; t.location = (-700, 200)
        src = t.outputs['Color']
        if alpha_clip:
            r = N.new('ShaderNodeMath'); r.operation = 'ROUND'; r.location = (-300, -100)
            Lk.new(t.outputs['Alpha'], r.inputs[0]); Lk.new(r.outputs[0], bsdf.inputs['Alpha'])
    else:
        bsdf.inputs['Base Color'].default_value = color
    if vcol:
        ca = N.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'; ca.location = (-700, -200)
        if src is None:
            src = ca.outputs['Color']
        else:
            mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
            mx.inputs['Factor'].default_value = 1.0; mx.location = (-350, 200)
            Lk.new(src, mx.inputs[6]); Lk.new(ca.outputs['Color'], mx.inputs[7])
            src = mx.outputs[2]
    if src is not None:
        Lk.new(src, bsdf.inputs['Base Color'])
    if nrm is not None:
        tn = N.new('ShaderNodeTexImage'); tn.image = nrm; tn.location = (-700, -500)
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nrm_strength; nm.location = (-350, -500)
        Lk.new(tn.outputs['Color'], nm.inputs['Color']); Lk.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    m.use_backface_culling = not double
    return m


# ---------------------------------------------------------------- vertex AO
def _world_tris(objs):
    V, F = [], []
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in objs:
        e = ob.evaluated_get(dg); me = e.to_mesh()
        o = len(V); mw = ob.matrix_world
        V += [mw @ v.co for v in me.vertices]
        F += [[o + i for i in p.vertices] for p in me.polygons]
        e.to_mesh_clear()
    return BVHTree.FromPolygons(V, F, epsilon=0.0)


def hemi_dirs(n, seed=1):
    rng = random.Random(seed); out = []
    for i in range(n):
        u1 = (i + rng.random()) / n; u2 = rng.random()
        r = math.sqrt(u1); th = 2 * math.pi * u2
        out.append(Vector((r * math.cos(th), r * math.sin(th), math.sqrt(max(0, 1 - u1)))))
    return out


def vertex_ao(targets, occluders, samples=24, dist=1.5, strength=1.0, floor=0.25, ground=True, both_sides=False):
    """Multiply per-vertex AO into the 'Col' attribute of each target (cosine-weighted ray casting)."""
    bvh = _world_tris(occluders)
    dirs = hemi_dirs(samples)
    for ob in targets:
        me = ob.data; mw = ob.matrix_world; nm = mw.to_3x3().inverted().transposed()
        ca = me.color_attributes['Col']
        cols = np.zeros(len(me.vertices) * 4, np.float32); ca.data.foreach_get('color', cols); cols = cols.reshape(-1, 4)
        for vi, v in enumerate(me.vertices):
            p = mw @ v.co; n = (nm @ v.normal).normalized()
            if n.length < 0.5:
                n = UP.copy()
            sides = (n, -n) if both_sides else (n,)
            occ_tot = 0.0
            for nn in sides:
                q = nn.to_track_quat('Z', 'X')
                occ = 0
                for d in dirs:
                    dw = q @ d
                    o = p + nn * 0.01
                    hit = bvh.ray_cast(o, dw, dist)
                    if hit[0] is not None:
                        occ += 1.0 - (hit[3] / dist) * 0.5
                    elif ground and dw.z < 0 and o.z > 0:
                        t = -o.z / dw.z
                        if t < dist:
                            occ += 1.0 - (t / dist) * 0.5
                occ_tot += occ / len(dirs)
            occ_tot /= len(sides)
            ao = max(floor, 1.0 - strength * occ_tot)
            cols[vi, :3] *= ao
        ca.data.foreach_set('color', cols.ravel())


# ---------------------------------------------------------------- atlas baking (procedural -> texture)
def setup_cycles(samples=32):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        pr = bpy.context.preferences.addons['cycles'].preferences
        pr.compute_device_type = 'OPTIX'; pr.get_devices()
        for d in pr.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('GPU setup failed', e)
    sc.cycles.samples = samples
    return sc


def smart_uv(ob, margin=0.01, angle=60):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_atlas(ob, size, name, ao_dist=1.5, ao_power=1.0, samples=48, keep_mats=()):
    """Bake every non-kept material of ob (procedural, object coords) to one diffuse-colour x AO texture.
    Replaces those materials by a single textured material. Returns the new material."""
    sc = setup_cycles(samples)
    if sc.world is None:
        sc.world = bpy.data.worlds.new('W')
    sc.world.light_settings.distance = ao_dist
    smart_uv(ob)
    col = bpy.data.images.new(name + '_col', size, size, alpha=False)
    ao = bpy.data.images.new(name + '_ao', size, size, alpha=False)
    ao.colorspace_settings.name = 'Non-Color'
    bake_mats = [m for m in ob.data.materials if m.name not in keep_mats]

    def target(img):
        for m in bake_mats:
            nt = m.node_tree
            n = nt.nodes.get('__bake') or nt.nodes.new('ShaderNodeTexImage')
            n.name = '__bake'; n.image = img
            for x in nt.nodes:
                x.select = False
            n.select = True; nt.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bs = sc.render.bake; bs.margin = 6; bs.use_clear = True
    target(col)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=6)
    target(ao)
    bpy.ops.object.bake(type='AO', margin=6)
    c = np.zeros(size * size * 4, np.float32); col.pixels.foreach_get(c); c = c.reshape(size, size, 4)
    a = np.zeros(size * size * 4, np.float32); ao.pixels.foreach_get(a); a = a.reshape(size, size, 4)
    aov = np.clip(a[..., :1], 0, 1) ** ao_power
    # col pixels are sRGB-encoded bytes; AO is linear -> convert AO to sRGB-ish multiplier
    out = c[..., :3] * (aov ** (1 / 2.2))
    img = np_image(name, out)
    m = mat_basic(name, img=img, vcol=False, rough=0.85)
    for i, s in enumerate(ob.data.materials):
        if s in bake_mats:
            ob.data.materials[i] = m
    # merge duplicate slots
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.material_slot_remove_unused()
    return m


# procedural node helpers for bake materials ------------------------------
class PM:
    """Tiny procedural material builder (object-space coords)."""
    def __init__(self, name):
        self.m = bpy.data.materials.new(name); self.m.use_nodes = True
        self.nt = self.m.node_tree; self.N = self.nt.nodes; self.L = self.nt.links
        self.bsdf = self.N['Principled BSDF']
        tc = self.N.new('ShaderNodeTexCoord')
        self.co = tc.outputs['Object']
        sep = self.N.new('ShaderNodeSeparateXYZ'); self.L.new(self.co, sep.inputs[0])
        self.x, self.y, self.z = sep.outputs

    def node(self, t, **kw):
        n = self.N.new(t)
        for k, v in kw.items():
            setattr(n, k, v)
        return n

    def noise(self, scale, detail=4, rough=0.6, vec=None, dist=0.0):
        n = self.node('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough; n.inputs['Distortion'].default_value = dist
        self.L.new(vec or self.co, n.inputs['Vector'])
        return n.outputs['Fac']

    def math(self, op, a, b=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op); n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.L.new(v, n.inputs[i])
        return n.outputs[0]

    def mix(self, fac, a, b, blend='MIX'):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        for sock, v in ((n.inputs['Factor'], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = v
            else:
                self.L.new(v, sock)
        return n.outputs[2]

    def ramp(self, fac, stops):
        n = self.node('ShaderNodeValToRGB'); cr = n.color_ramp
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for e, (p, c) in zip(cr.elements, stops):
            e.position = p; e.color = c
        self.L.new(fac, n.inputs[0])
        return n.outputs[0]

    def white(self, v):
        n = self.node('ShaderNodeTexWhiteNoise'); n.noise_dimensions = '1D'
        self.L.new(v, n.inputs['W']); return n.outputs['Value']

    def out(self, color, rough=0.8):
        self.L.new(color, self.bsdf.inputs['Base Color'])
        self.bsdf.inputs['Roughness'].default_value = rough
        return self.m


def srgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c[:3]) + (1.0,)


# ---------------------------------------------------------------- export
def export_glb(objs, name, anim=False):
    if name in ("kid", "child"):
        raise ValueError("Only adult person assets are permitted")
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    path = os.path.join(RAW, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_image_format='WEBP', export_image_quality=88,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_yup=True, export_apply=True, export_animations=anim,
                              export_animation_mode='ACTIONS', export_force_sampling=True,
                              export_extras=False, export_cameras=False, export_lights=False)
    print('EXPORTED', path, os.path.getsize(path))
    return path


def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get(); t = 0
    for o in objs:
        if o.type != 'MESH':
            continue
        e = o.evaluated_get(dg); me = e.to_mesh()
        t += sum(len(p.vertices) - 2 for p in me.polygons); e.to_mesh_clear()
    return t


def args():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def _pm_vmul(self, s, vec=None):
    n = self.node('ShaderNodeVectorMath', operation='MULTIPLY')
    self.L.new(vec or self.co, n.inputs[0]); n.inputs[1].default_value = s
    return n.outputs[0]


def _pm_band(self, val, a, b):
    """smooth 0..1 as val goes a->b"""
    n = self.node('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP'
    self.L.new(val, n.inputs['Value']); n.inputs['From Min'].default_value = a; n.inputs['From Max'].default_value = b
    return n.outputs['Result']
PM.vmul = _pm_vmul
PM.band = _pm_band
