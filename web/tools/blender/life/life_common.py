# Rig / skin / pose toolkit for the animated "life" assets (Blender 5.3, -b --factory-startup).
# Blender space: forward = -Y (glTF +Z), up = +Z, character's LEFT = +X (.L bones).
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, np_image, mat_basic, vertex_ao, tile_noise, lin, tri_count, args, RAW, TEX

FPS = 30
XA, YA, ZA = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
UP = ZA


def V(*a):
    return Vector(a[0] if len(a) == 1 else a)


def q(axis, deg):
    return Quaternion(Vector(axis), math.radians(deg))


def sm(x):
    x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)


def tilt(fwd=0.0, side=0.0, yaw=0.0, base=UP):
    """Direction = base tilted forward (toward -Y) by fwd deg, toward +X by side deg, then yawed (+ = turn left)."""
    return q(ZA, yaw) @ q(YA, side) @ q(XA, fwd) @ Vector(base)


def track(t, keys, loop=False):
    """Smooth key interpolation. keys = [(t, value), ...] sorted; value float/Vector/tuple."""
    if loop:
        t = t % 1.0
    if t <= keys[0][0]:
        v = keys[0][1]
    elif t >= keys[-1][0]:
        v = keys[-1][1]
    else:
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if t0 <= t <= t1:
                u = sm((t - t0) / (t1 - t0))
                if isinstance(a, (int, float)):
                    return a + (b - a) * u
                return Vector(a).lerp(Vector(b), u)
    return v if isinstance(v, (int, float)) else Vector(v)


def hashn(p, f=23.0, seed=0.0):
    """cheap smooth-ish pseudo noise in [-1, 1] from a position."""
    return (math.sin(p.x * f * 1.7 + seed + math.sin(p.y * f * 1.3) * 2.0 + p.z * f * 0.7) *
            math.cos(p.y * f * 0.9 - p.z * f * 1.9 + seed * 1.3 + math.sin(p.x * f * 2.3)))


def col_noise(c, amt=0.08, f=23.0, seed=0.0):
    c = Vector(c[:3])
    return lambda p: tuple(x * (1 + amt * hashn(p, f, seed)) for x in c)


# ------------------------------------------------------------------ geometry
def tube(pts, rx, ry=None, side=XA, sides=8, cap0=False, cap1=False, nexp=2.0):
    """Closed-ring tube. rx along `side` (orthogonalised), ry along T x side. Outward winding."""
    pts = [Vector(p) for p in pts]; n = len(pts)
    ry = ry or rx
    sides_v = side if isinstance(side, list) else [Vector(side)] * n
    verts, faces = [], []
    for i, p in enumerate(pts):
        T = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        sv = Vector(sides_v[i])
        X = (sv - T * sv.dot(T))
        if X.length < 1e-5:
            X = Vector((0, 1, 0)) - T * T.y
        X.normalize(); Y = T.cross(X)
        for j in range(sides):
            a = 2 * math.pi * j / sides; c, s = math.cos(a), math.sin(a)
            if nexp != 2.0:
                c = math.copysign(abs(c) ** (2 / nexp), c); s = math.copysign(abs(s) ** (2 / nexp), s)
            verts.append(p + X * c * rx[i] + Y * s * ry[i])
    for i in range(n - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append([a, b, b + sides, a + sides])
    if cap0:
        c = len(verts); verts.append(pts[0])
        for j in range(sides):
            faces.append([c, (j + 1) % sides, j])
    if cap1:
        c = len(verts); verts.append(pts[-1]); o = (n - 1) * sides
        for j in range(sides):
            faces.append([c, o + j, o + (j + 1) % sides])
    return verts, faces


def sphere(c, r, rings=6, segs=10, sc=(1, 1, 1)):
    pts = []; rx = []; ry = []
    for i in range(rings + 1):
        th = -math.pi / 2 + math.pi * i / rings
        pts.append(Vector(c) + Vector((0, 0, r * math.sin(th) * sc[2])))
        rx.append(max(1e-4, r * math.cos(th) * sc[0])); ry.append(max(1e-4, r * math.cos(th) * sc[1]))
    return tube(pts[1:-1], rx[1:-1], ry[1:-1], XA, segs, cap0=True, cap1=True)


class Geo:
    """verts + faces + per-vertex colour/uv/candidate-bones (or explicit weights) + per-face material."""
    def __init__(self):
        self.V, self.F, self.C, self.UV, self.M, self.S, self.B, self.W = [], [], [], [], [], [], [], []

    def add(self, verts, faces, col, bones, mat=0, uv=None, smooth=True, weights=None):
        o = len(self.V)
        for i, p in enumerate(verts):
            p = Vector(p); self.V.append(p)
            c = col(p) if callable(col) else col
            self.C.append(tuple(c[:3]))
            self.UV.append(tuple(uv[i]) if uv is not None else (0.5, 0.5))
            self.B.append(list(bones) if not isinstance(bones, str) else [bones])
            self.W.append(weights(p) if callable(weights) else weights)
        for f in faces:
            self.F.append([i + o for i in f]); self.M.append(mat); self.S.append(smooth)
        return o

    def build(self, name, mats):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.V], [], self.F)
        uvl = me.uv_layers.new(name='UVMap')
        lv = np.zeros(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
        uvl.data.foreach_set('uv', np.array(self.UV, np.float32)[lv].ravel())
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        cols = np.ones((len(self.V), 4), np.float32); cols[:, :3] = np.array(self.C, np.float32)
        ca.data.foreach_set('color', cols.ravel())
        me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0
        for m in mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.M)
        me.polygons.foreach_set('use_smooth', self.S)
        me.validate(clean_customdata=False)
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        return ob


# ------------------------------------------------------------------ armature + skin
def make_arm(name, bones):
    """bones: [(name, head, tail, parent)]"""
    ad = bpy.data.armatures.new(name + '_rig'); arm = bpy.data.objects.new(name, ad)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    E = ad.edit_bones
    for n, h, t, p in bones:
        b = E.new(n); b.head = Vector(h); b.tail = Vector(t); b.roll = 0.0
        if p:
            b.parent = E[p]; b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def _seg(p, h, t):
    d = t - h; L = d.length
    s = max(0.0, min(L, (p - h).dot(d) / L))
    return (p - (h + d * (s / L))).length, s, L


def auto_w(p, cands, R, blend):
    best = min(cands, key=lambda b: _seg(p, R[b][0], R[b][1])[0])
    h, t, par, kids = R[best]
    dist, s, L = _seg(p, h, t)
    B = min(blend, L * 0.45)
    w = {best: 1.0}
    if s < B and par in cands:
        a = 0.5 + 0.5 * sm(s / B); w = {best: a, par: 1 - a}
    else:
        kc = [k for k in kids if k in cands]
        if kc and L - s < B:
            k = min(kc, key=lambda k: (R[k][0] - p).length)
            a = 0.5 + 0.5 * sm((L - s) / B); w = {best: a, k: 1 - a}
    return w


def skin(ob, arm, geo, blend=0.07, post=None):
    R = {b.name: (b.head_local.copy(), b.tail_local.copy(), b.parent.name if b.parent else None,
                  [c.name for c in b.children]) for b in arm.data.bones}
    G = {n: ob.vertex_groups.new(name=n) for n in R}
    for i, p in enumerate(geo.V):
        w = geo.W[i] or auto_w(p, geo.B[i], R, blend)
        if post:
            w = post(p, geo.B[i], w)
        tot = sum(w.values())
        for n, v in w.items():
            if v / tot > 1e-4:
                G[n].add([i], v / tot, 'REPLACE')
    ob.parent = arm
    md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    return ob


# ------------------------------------------------------------------ pose solver
class Rig:
    def __init__(self, arm):
        self.arm = arm; B = arm.data.bones
        self.order = []; todo = [b for b in B if b.parent is None]
        while todo:
            b = todo.pop(0); self.order.append(b.name); todo += list(b.children)
        self.rest = {b.name: b.matrix_local.copy() for b in B}
        self.par = {b.name: (b.parent.name if b.parent else None) for b in B}
        self.len = {b.name: b.length for b in B}
        self.H = {b.name: b.head_local.copy() for b in B}
        self.T = {b.name: b.tail_local.copy() for b in B}
        self.ad = arm.animation_data_create()
        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        self.clips = []

    def solve(self, spec):
        """spec[bone] = {'loc': world head, 'rot': world Quaternion (pre-multiplied), 'dir': Vector or fn(W, head),
        'scale': local scale}. Unspecified bones follow their parent."""
        W, basis = {}, {}
        for n in self.order:
            Br = self.rest[n]; p = self.par[n]; s = spec.get(n, {})
            F = W[p] @ self.rest[p].inverted() @ Br if p else Br.copy()
            M3 = F.to_3x3(); head = F.translation.copy()
            if 'loc' in s:
                head = Vector(s['loc'])
            if 'rot' in s:
                M3 = s['rot'].to_matrix() @ M3
            if 'dir' in s:
                d = s['dir'](W, head) if callable(s['dir']) else Vector(s['dir'])
                M3 = M3.col[1].rotation_difference(d.normalized()).to_matrix() @ M3
            M = Matrix.Translation(head) @ M3.to_4x4()
            W[n] = M
            b = (Br.inverted() @ self.rest[p] @ W[p].inverted() @ M) if p else Br.inverted() @ M
            if 'scale' in s:
                b = b @ Matrix.Diagonal(Vector(s['scale'])).to_4x4()
            basis[n] = b
        return W, basis

    def apply(self, basis, frame=None, prev=None):
        for n in self.order:
            pb = self.arm.pose.bones[n]
            loc, rot, sc = basis[n].decompose()
            if prev is not None:
                if n in prev and prev[n].dot(rot) < 0:
                    rot.negate()
                prev[n] = rot.copy()
            pb.location = loc; pb.rotation_quaternion = rot; pb.scale = sc
            if frame is not None:
                for k in ('location', 'rotation_quaternion', 'scale'):
                    pb.keyframe_insert(k, frame=frame)

    def clip(self, name, seconds, fn):
        N = round(seconds * FPS)
        act = bpy.data.actions.new(name); self.ad.action = act
        prev = {}
        for f in range(N + 1):
            W, basis = self.solve(fn(f / N))
            self.apply(basis, f, prev)
        tr = self.ad.nla_tracks.new(); tr.name = name
        tr.strips.new(name, 0, act)
        self.ad.action = None
        self.clips.append((name, N / FPS))
        return act

    def default_pose(self, spec):
        """pose shown when no clip plays (exported as node TRS with export_rest_position_armature=False)."""
        for tr in self.ad.nla_tracks:
            tr.mute = True
        self.apply(self.solve(spec)[1])


def ik2(rig, upper, lower, target, pole, end=None, end_dir=None):
    """2-bone IK spec. target: world point or fn(head)->point; pole: world direction for the middle joint."""
    L1, L2 = rig.len[upper], rig.len[lower]
    st = {}

    def fu(W, head):
        t = target(head) if callable(target) else Vector(target)
        st['t'] = t
        d = t - head; D = max(1e-4, min(d.length, (L1 + L2) * 0.999)); dn = d.normalized()
        a = max(-1.0, min(1.0, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)))
        pv = Vector(pole); pv = pv - dn * pv.dot(dn)
        if pv.length < 1e-5:
            pv = Vector((0, -1, 0))
        pv.normalize()
        e = head + dn * (L1 * a) + pv * (L1 * math.sqrt(1 - a * a))
        return e - head

    def fl(W, head):
        return st['t'] - head
    sp = {upper: {'dir': fu}, lower: {'dir': fl}}
    if end and end_dir is not None:
        sp[end] = {'dir': end_dir}
    return sp


def merge(*specs):
    out = {}
    for s in specs:
        for k, v in s.items():
            out.setdefault(k, {}).update(v)
    return out


# ------------------------------------------------------------------ export
def export_glb(objs, name, rest_pose=False):
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
                              export_yup=True, export_apply=False, export_animations=True,
                              export_animation_mode='ACTIONS', export_force_sampling=True,
                              export_rest_position_armature=rest_pose, export_def_bones=False,
                              export_extras=False, export_cameras=False, export_lights=False)
    print('EXPORTED', path, os.path.getsize(path))
    return path


# ------------------------------------------------------------------ textures
def straw_tex(n=256):
    v, u = (np.mgrid[0:n, 0:n] + 0.5) / n
    x, y = u - 0.5, v - 0.5
    r = np.sqrt(x * x + y * y) * 2; a = np.arctan2(y, x)
    base = np.array([0.80, 0.69, 0.47])
    nz = tile_noise(n, n, 24, seed=5)
    col = base[None, None, :] * (0.88 + 0.24 * nz[..., None])
    rings = np.abs(((r * 16) % 1.0) - 0.5) < 0.07
    col[rings] *= 0.78
    ribs = np.abs(((a / (2 * np.pi) * 64) % 1.0) - 0.5) < 0.12
    col[ribs] *= 0.93
    col[r > 0.985] *= 0.7
    return np_image('straw', col.astype(np.float32))
