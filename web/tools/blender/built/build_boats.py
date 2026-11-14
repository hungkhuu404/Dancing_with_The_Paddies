# longtail (vỏ lãi, clip "spin" on node "prop") and cargo_boat (ghe chở lúa). Bow = Blender -Y (glTF +Z), origin at waterline centre.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *


class Hull:
    def __init__(self, Lh, B, draft, free, sheer_b, sheer_s, stern_w, flat=0.65):
        self.__dict__.update(locals())

    def sec(self, s):
        a = abs(s)
        f = (max(0.0, 1 - a ** 2.2)) ** 0.6
        fb = (max(0.0, 1 - a ** 1.6)) ** 0.9
        g = self.B * (fb if s < 0 else self.stern_w + (1 - self.stern_w) * f) + 0.006
        b = g * self.flat
        zb = -self.draft + 0.5 * self.draft * a ** 3 + 0.35 * self.draft * max(0, -s) ** 3
        zg = self.free + self.sheer_b * max(0, -s) ** 2.5 + self.sheer_s * max(0, s) ** 2.5
        return g, b, zb, zg

    def prof(self, s):
        g, b, zb, zg = self.sec(s)
        zm = zb + (zg - zb) * 0.45; xm = b + (g - b) * 0.55
        return [(-g, zg), (-xm, zm), (-b, zb), (0, zb - 0.01), (b, zb), (xm, zm), (g, zg)]

    def surf(self, y, z, side):
        """outer side-surface point (upper panel xm..g) at length y, height z."""
        s = y / (self.Lh / 2); p = self.prof(s)
        (xm, zm), (g, zg) = p[5], p[6]
        w = (z - zm) / (zg - zm)
        return Vector((side * (xm + (g - xm) * w), y, z)), Vector((side * (zg - zm), 0, -(g - xm))).normalized()

    def build(self, k, outer_key, outer_col, inner_key, inner_col, NS=28, t=0.035):
        rows_o, rows_i = [], []
        for i in range(NS + 1):
            s = -1 + 2 * i / NS
            s = math.copysign(abs(s) ** 0.8, s)
            y = s * self.Lh / 2; p = self.prof(s)
            rows_o.append([Vector((x, y, z)) for x, z in p])
            kk = max(0.0, 1 - abs(s) ** 6) if s < 0 else 1.0
            rows_i.append([Vector((x - math.copysign(t * kk, x) if x else 0, y, z + (t * kk if j in (2, 3, 4) else 0))) for j, (x, z) in enumerate(p)])
        NP = 7
        def grid(rows, flip):
            V = [p for r in rows for p in r]; F = []; U = []
            for r in rows:
                acc = 0
                for j, p in enumerate(r):
                    if j:
                        acc += (p - r[j - 1]).length
                    U.append((p.y / tile(outer_key), acc / tile(outer_key)))
            for i in range(len(rows) - 1):
                for j in range(NP - 1):
                    a = i * NP + j; q = [a, a + 1, a + NP + 1, a + NP]
                    F.append(q[::-1] if flip else q)
            return V, F, U
        V, F, U = grid(rows_o, True); k.add(V, F, U, outer_key, outer_col)
        V, F, U = grid(rows_i, False); k.add(V, F, U, inner_key, inner_col)
        for side in (0, NP - 1):                                             # gunwale caps + rub rail
            V = []
            for i in range(NS + 1):
                V += [rows_o[i][side], rows_i[i][side]]
            F = [[2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2] if side == 0 else [2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1] for i in range(NS)]
            k.add(V, F, None, inner_key, inner_col)
            rp = [rows_o[i][side] + Vector((0.02 * (1 if side else -1), 0, -0.04)) for i in range(1, NS)]
            k.tube(rp, 0.03, inner_key, tuple(c * 0.7 for c in inner_col), sides=4, phase=math.pi / 4, up_hint=Vector((1, 0, 0)))
        if self.stern_w > 0:
            k.poly(rows_o[-1], outer_key, outer_col, flip=True)
        return rows_o, rows_i


def hull_paint(hull, top, mid, bottom, band=0.08):
    def f(i, p):
        g, b, zb, zg = hull.sec(max(-1, min(1, p.y / (hull.Lh / 2))))
        if p.z < 0.03:
            return bottom
        if p.z > zg - band:
            return top
        return mid
    return f


# ------------------------------------------------------------------ vỏ lãi
def longtail():
    reset(); k = Kit(); fig = Kit(); prop = Kit()
    h = Hull(7.0, 0.56, 0.12, 0.36, 0.38, 0.08, 0.5, flat=0.7)
    h.build(k, 'Paint', hull_paint(h, L(0.92, 0.92, 0.88), L(0.22, 0.48, 0.52), L(0.3, 0.14, 0.1)), 'Wood', L(0.8, 0.75, 0.68))
    for y in (-2.0, -0.6, 0.9, 2.3):                                                     # thwarts
        g, b, zb, zg = h.sec(y / 3.5)
        k.box((0, y, zg - 0.08), (2 * g - 0.04, 0.22, 0.03), 'Wood', L(0.75, 0.7, 0.62))
    k.box((0, 0.3, -0.06), (0.62, 4.6, 0.02), 'Planks', L(0.75, 0.7, 0.62))
    g, b, zb, zg = h.sec(1.0)
    k.box((0, 3.25, zg - 0.04), (2 * g, 0.5, 0.05), 'Wood', L(0.75, 0.7, 0.62))          # stern deck
    # engine on a swivel post at the transom
    E = Vector((0, 3.45, zg + 0.3))
    k.tube([Vector((0, 3.4, zg - 0.05)), E - Vector((0, 0, 0.12))], 0.035, 'Metal', (0.5, 0.5, 0.5), sides=6)
    k.box(E, (0.38, 0.42, 0.3), 'Paint', L(0.6, 0.12, 0.08))
    k.box(E + Vector((0, -0.05, 0.22)), (0.26, 0.24, 0.14), 'Paint', L(0.6, 0.12, 0.08))
    k.tube([E + Vector((0.2, 0, 0)), E + Vector((0.26, 0, 0))], 0.13, 'Metal', (0.3, 0.3, 0.3), sides=10, cap1=True)
    k.tube([E + Vector((-0.1, 0.1, 0.15)), E + Vector((-0.15, 0.25, 0.4))], 0.025, 'Metal', (0.2, 0.18, 0.16), sides=5, cap1=True)
    th = math.radians(-15); d = Vector((0, math.cos(th), math.sin(th)))
    s0 = E + Vector((0, 0.2, -0.05)); hub = s0 + d * 2.6
    k.tube([s0, hub], [0.03, 0.022], 'Metal', (0.55, 0.55, 0.55), sides=6)
    k.tube([s0 - d * 0.02, s0 + d * 0.35], 0.045, 'Metal', (0.35, 0.35, 0.35), sides=6)
    tl = Vector((0.36, 2.55, 0.66))
    k.tube([E + Vector((0.1, -0.2, 0.0)), tl], 0.022, 'Metal', (0.4, 0.4, 0.4), sides=6)
    k.tube([tl - (tl - E).normalized() * 0.0, tl + (tl - E - Vector((0.1, -0.2, 0))).normalized() * 0.15], 0.03, 'Rubber', (0.04, 0.04, 0.04), sides=6, cap1=True)
    person_seated(fig, (0, 2.8, zg - 0.04), (0, -1, 0), [tl, Vector((-0.2, 2.35, 0.42))], shirt=(0.55, 0.52, 0.45), pants=(0.12, 0.12, 0.14))
    # propeller (prop-local: hub at origin, axis +Y)
    for j in range(3):
        a = 2 * math.pi * j / 3
        r = Vector((math.cos(a), 0, math.sin(a))); tg = Vector((-math.sin(a), 0, math.cos(a)))
        q = [r * 0.03 - tg * 0.03 + Vector((0, -0.02, 0)), r * 0.03 + tg * 0.03 + Vector((0, 0.02, 0)),
             r * 0.14 + tg * 0.03 + Vector((0, 0.025, 0)), r * 0.14 - tg * 0.035 + Vector((0, -0.025, 0))]
        prop.add(q, [[0, 1, 2, 3], [3, 2, 1, 0]], None, 'Metal', (0.75, 0.72, 0.6))
    prop.tube([Vector((0, -0.05, 0)), Vector((0, 0.06, 0))], [0.032, 0.02], 'Metal', (0.7, 0.68, 0.6), sides=6, cap1=True)
    oh, of, op = finish([(k, 'longtail_hull'), (fig, 'longtail_driver'), (prop, 'longtail_prop_mesh')], 'longtail', ao_dist=0.35, ground=False)
    root = root_empty('longtail', [oh, of])
    pn = empty('prop', hub, root); pn.rotation_mode = 'YXZ'; op.parent = pn
    act = bpy.data.actions.new('spin'); pn.animation_data_create(); pn.animation_data.action = act
    for f, a in ((1, 0.0), (13, 2 * math.pi)):
        pn.rotation_euler = (th, a, 0); pn.keyframe_insert('rotation_euler', frame=f)
    try:
        for fc in act.layers[0].strips[0].channelbags[0].fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
    except Exception as e:
        print('interp', e)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 13
    bpy.context.scene.frame_set(1)
    done('longtail', root, [oh, of, op], anim=True)


# ------------------------------------------------------------------ ghe chở lúa
def eye(k, h, y, z, side):
    def P(dy, dz, off):
        p, n = h.surf(y + dy, z + dz, side)
        return p + n * off
    for sc, off, col, n_ in ((1.3, 0.008, L(0.65, 0.1, 0.08), 16), (1.0, 0.016, L(0.92, 0.9, 0.85), 16), (0.0, 0.024, L(0.03, 0.03, 0.03), 10)):
        if sc:
            pts = [P(0.34 * sc * math.cos(t), 0.15 * sc * math.sin(t) * (1 - 0.35 * math.cos(t)), off) for t in [2 * math.pi * i / n_ for i in range(n_)]]
        else:
            pts = [P(0.04 + 0.1 * math.cos(t), 0.1 * math.sin(t), off) for t in [2 * math.pi * i / n_ for i in range(n_)]]
        nn = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        k.poly(pts, 'Paint', col, flip=nn.x * side < 0)


def cargo_boat():
    reset(); k = Kit(); sacks = Kit(); rng = random.Random(12)
    h = Hull(16.0, 1.85, 0.55, 0.42, 1.0, 0.55, 0.35, flat=0.75)
    WOOD = L(0.62, 0.5, 0.4)
    def paint(i, p):
        g, b, zb, zg = h.sec(max(-1, min(1, p.y / 8)))
        if p.z < 0.02:
            return L(0.18, 0.15, 0.12)
        if p.z > zg - 0.16:
            return L(0.62, 0.16, 0.1)
        if p.y < -6.2 and p.z > zg - 0.5:
            return L(0.25, 0.5, 0.35)
        return WOOD
    rows_o, rows_i = h.build(k, 'Planks', paint, 'Wood', L(0.7, 0.62, 0.52), NS=32, t=0.05)
    def deck(s0, s1, n, dz=0.1):
        V, F = [], []
        for i in range(n + 1):
            s = s0 + (s1 - s0) * i / n; g, b, zb, zg = h.sec(s); y = s * 8
            V += [Vector((-g + 0.05, y, zg - dz)), Vector((g - 0.05, y, zg - dz))]
        for i in range(n):
            F.append([2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2])
        U = [(v.x / 1.0, v.y / 1.0) for v in V]
        k.add(V, F, U, 'Planks', L(0.75, 0.66, 0.55))
    deck(-0.99, -0.62, 6); deck(0.5, 0.99, 6)
    for s in (-0.62, 0.5):
        g, b, zb, zg = h.sec(s)
        k.box((0, s * 8, zg - 0.1), (2 * g - 0.1, 0.12, 0.3), 'Wood', WOOD)               # hatch coamings
    eye(k, h, -6.7, h.sec(-6.7 / 8)[3] - 0.38, 1); eye(k, h, -6.7, h.sec(-6.7 / 8)[3] - 0.38, -1)
    # rice sacks (mound in the hold)
    SK = [L(0.95, 0.94, 0.9), L(0.9, 0.88, 0.8), L(0.85, 0.82, 0.72)]
    for layer in range(4):
        z = -0.15 + layer * 0.26
        for y in np.arange(-4.6 + layer * 0.3, 3.7 - layer * 0.3, 0.55):
            g = h.sec(y / 8)[0] - 0.15 - layer * 0.32
            nx = int((2 * g) / 0.82)
            for i in range(nx):
                x = -g + 0.41 + i * 0.82 + rng.uniform(-0.04, 0.04)
                sz = rng.uniform(0.9, 1.05)
                R = Matrix.Rotation(rng.uniform(-0.18, 0.18), 3, 'Z') @ Matrix.Rotation(rng.uniform(-0.08, 0.08), 3, 'Y')
                sacks.box((x, y + rng.uniform(-0.04, 0.04), z + 0.12), (0.78 * sz, 0.48 * sz, 0.25), 'Sack', rng.choice(SK), R=R, skip=('-Z',))
    # cabin at the stern
    g, b, zb, zg = h.sec(0.6); zc = zg - 0.1; cy0, cy1, cw, ch = 4.4, 6.6, 1.25, 1.6
    WB = L(0.7, 0.62, 0.55)
    k.box((0, (cy0 + cy1) / 2, zc + ch / 2), (2 * cw, cy1 - cy0, ch), 'Planks', WB, skip=('-Z', '+Z'))
    for sx in (-1, 1):
        for yc in (4.95, 6.05):
            wall_opening(k, (sx * cw, yc, zc + 0.75), (0, sx, 0), (sx, 0, 0), [(-0.3, 0), (0.3, 0), (0.3, 0.45), (-0.3, 0.45)],
                         frame_w=0.06, frame_d=0.04, frame_key='Paint', frame_col=L(0.25, 0.45, 0.4))
    wall_opening(k, (0, cy0, zc), (1, 0, 0), (0, -1, 0), [(-0.35, 0), (0.35, 0), (0.35, 1.35), (-0.35, 1.35)], frame_w=0.07, frame_d=0.04,
                 glass_key='Dark', glass_col=(0.04, 0.04, 0.04), frame_key='Paint', frame_col=L(0.25, 0.45, 0.4), recess=0.05)
    rz = zc + ch
    gable_slope(k, (cw + 0.25, cy0 - 0.45, rz), (cw + 0.25, cy1 + 0.35, rz), (0, cy0 - 0.45, rz + 0.3), (0, cy1 + 0.35, rz + 0.3), 'Tin', (1, 1, 1), thick=0.04, nu=2)
    gable_slope(k, (-cw - 0.25, cy1 + 0.35, rz), (-cw - 0.25, cy0 - 0.45, rz), (0, cy1 + 0.35, rz + 0.3), (0, cy0 - 0.45, rz + 0.3), 'Tin', (1, 1, 1), thick=0.04, nu=2)
    k.poly([(cw, cy0, rz), (-cw, cy0, rz), (0, cy0, rz + 0.28)], 'Planks', WB, flip=True)
    k.poly([(-cw, cy1, rz), (cw, cy1, rz), (0, cy1, rz + 0.28)], 'Planks', WB, flip=True)
    k.tube([Vector((0.6, 6.3, rz + 0.2)), Vector((0.6, 6.3, rz + 0.9))], 0.05, 'Metal', (0.15, 0.13, 0.12), sides=6, cap1=True)
    k.box((0, 7.95, -0.15), (0.05, 0.5, 0.7), 'Wood', WOOD)                                 # rudder
    k.tube([Vector((0, 7.8, h.sec(1)[3])), Vector((0, 7.2, h.sec(1)[3] + 0.5))], 0.03, 'Wood', WOOD, sides=5, cap1=True)
    k.tube([Vector((-0.8, -6.6, h.sec(-0.82)[3] - 0.08)), Vector((-0.8, -6.6, h.sec(-0.82)[3] + 0.25))], 0.08, 'Wood', WOOD, sides=6, cap1=True)  # mooring bitt
    oh, osk = finish([(k, 'cargo_hull'), (sacks, 'cargo_sacks')], 'cargo_boat', ao_dist=0.6, ground=False)
    root = root_empty('cargo_boat', [oh, osk])
    done('cargo_boat', root, [oh, osk])


FN = {'longtail': longtail, 'cargo_boat': cargo_boat}
for n in (args() or list(FN)):
    FN[n]()
