# Shared kit for the "built" asset set (structures, boats, props). Blender 5.3, -b --factory-startup.
# Convention inside Blender: Z up, glTF front (+Z) == Blender -Y. Units metres.
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from common import *
import numpy as np


# ============================================================ tileable procedural textures (numpy)
def _uv(n):
    g = (np.arange(n) + 0.5) / n
    return g[None, :], g[:, None]          # u = columns, v = rows (row 0 = v 0 = bottom)


def _lerp(a, b, t):
    t = np.asarray(t, np.float32)[..., None]
    return np.asarray(a, np.float32) * (1 - t) + np.asarray(b, np.float32) * t


def _c(x):
    return np.clip(x, 0, 1).astype(np.float32)


def t_bamboo(n=256):
    u, v = _uv(n)
    fib = tile_noise(n, n, (40, 1.5), seed=11)
    blot = tile_noise(n, n, (30, 8), seed=12)
    dv = np.minimum(v % 0.5, 0.5 - v % 0.5)
    ring = np.repeat(np.exp(-(dv / 0.014) ** 2), n, 1)
    c = _lerp((0.64, 0.54, 0.34), (0.50, 0.48, 0.42), _c((blot - 0.45) * 3))
    c = c * (0.84 + 0.3 * fib)[..., None]
    c = _lerp(c, (0.30, 0.24, 0.15), ring * 0.7)
    hgt = fib * 0.35 + ring * 0.9
    return c, normal_from_height(hgt, 3.0)


def t_wood(n=256):
    grain = tile_noise(n, n, (1.5, 30), seed=21)
    fine = tile_noise(n, n, (1, 6), seed=22)
    blot = tile_noise(n, n, (20, 40), seed=23)
    c = _lerp((0.28, 0.20, 0.13), (0.50, 0.40, 0.29), grain ** 1.2)
    c = _lerp(c, (0.48, 0.46, 0.43), _c((blot - 0.5) * 3) * 0.7)
    c = c * (0.9 + 0.2 * fine)[..., None]
    return c, normal_from_height(grain * 0.6 + fine * 0.4, 2.0)


def t_planks(n=256):
    c, _ = t_wood(n)
    u, v = _uv(n)
    rng = np.random.default_rng(5)
    k = np.floor(v * 5).astype(int)[:, 0]
    tint = (0.8 + 0.35 * rng.random(5))[k]
    for b in range(5):
        rows = k == b
        c[rows] = np.roll(c[rows], int(rng.integers(0, n)), 1)
    c = c * tint[:, None, None]
    fr = (v * 5) % 1
    seam = np.repeat(_c(1 - np.minimum(fr, 1 - fr) / 0.035), n, 1)
    c = _lerp(c, (0.06, 0.05, 0.04), seam * 0.9)
    gr = tile_noise(n, n, (1.5, 30), seed=21)
    return c, normal_from_height(gr * 0.5 - seam * 1.5, 2.5)


def t_concrete(n=256):
    n1 = tile_noise(n, n, 6, seed=31); n2 = tile_noise(n, n, 40, seed=32); p = tile_noise(n, n, 1.0, seed=33, octaves=1)
    pores = (p > 0.8).astype(np.float32)
    c = _lerp((0.44, 0.44, 0.42), (0.64, 0.63, 0.60), n1)
    c = c * (0.85 + 0.3 * n2)[..., None] * (1 - 0.3 * pores)[..., None]
    return c, normal_from_height(n1 * 0.4 - pores * 0.6, 1.2)


def t_plaster(n=256):
    b = tile_noise(n, n, 25, seed=41); f = tile_noise(n, n, 2, seed=42); s = tile_noise(n, n, (50, 2), seed=43)
    c = np.ones((n, n, 3), np.float32) * np.array([0.93, 0.92, 0.89], np.float32)
    c = c * (0.84 + 0.14 * b + 0.04 * f)[..., None] * (0.92 + 0.1 * s)[..., None]
    return c, normal_from_height(f, 0.8)


def t_rooftile(n=256):
    u, v = _uv(n)
    ch = 0.5 + 0.5 * np.cos(2 * np.pi * 5 * u)                    # 5 channels / tile
    fv = (v * 4) % 1                                              # 4 courses / tile
    hgt = np.repeat(ch, n, 0) * 0.8 + np.repeat(fv, n, 1) * 0.6
    edge = np.repeat(_c((fv - 0.9) / 0.1), n, 1)
    cell = tile_noise(n, n, 8, seed=51, octaves=1)
    lich = tile_noise(n, n, 18, seed=52)
    c = _lerp((0.55, 0.27, 0.16), (0.70, 0.40, 0.24), cell)
    c = _lerp(c, (0.30, 0.29, 0.24), _c((lich - 0.55) * 4) * 0.8)
    c = c * (0.7 + 0.3 * np.repeat(ch, n, 0))[..., None]
    c = _lerp(c, (0.12, 0.07, 0.05), edge * 0.7)
    return c, normal_from_height(hgt, 5.0)


def t_tin(n=256):
    u, v = _uv(n)
    hgt = np.repeat((0.5 - 0.5 * np.cos(2 * np.pi * 10 * u)), n, 0).astype(np.float32)
    streak = tile_noise(n, n, (60, 2), seed=61); blot = tile_noise(n, n, 40, seed=62)
    r = _c((streak - 0.5) * 4 + (blot - 0.5) * 2)
    c = _lerp((0.62, 0.63, 0.64), (0.52, 0.30, 0.17), r)
    c = c * (0.85 + 0.15 * hgt)[..., None] * (0.92 + 0.16 * tile_noise(n, n, 4, seed=63))[..., None]
    return c, normal_from_height(hgt, 6.0)


def t_net(n=256):
    u, v = _uv(n); k = 5
    a = ((u + v) * k) % 1; b = ((u - v) * k) % 1
    d = np.minimum(np.minimum(a, 1 - a), np.minimum(b, 1 - b))
    line = _c((0.1 - d) / 0.03)
    c = np.ones((n, n, 4), np.float32); c[..., :3] = (0.30, 0.36, 0.31); c[..., 3] = 0.12 + 0.83 * line
    return c, None


def t_fabric(n=128):
    u, v = _uv(n)
    w = 0.5 + 0.25 * np.sin(2 * np.pi * u * 32) * np.sin(2 * np.pi * v * 32)
    f = tile_noise(n, n, 3, seed=71)
    c = np.ones((n, n, 3), np.float32) * 0.9 * (0.88 + 0.12 * w + 0.08 * (f - 0.5))[..., None]
    return c, None


def t_sack(n=128):
    u, v = _uv(n)
    w = np.abs(np.sin(np.pi * u * 24)) * 0.5 + np.abs(np.sin(np.pi * v * 24)) * 0.5
    f = tile_noise(n, n, 6, seed=72)
    c = _lerp((0.70, 0.67, 0.58), (0.95, 0.93, 0.86), _c(w * 0.7 + f * 0.4))
    return c, normal_from_height(w, 1.5)


def t_paint(n=256):
    ch = tile_noise(n, n, 6, seed=81, octaves=5); br = tile_noise(n, n, (1.5, 25), seed=82)
    chip = _c((ch - 0.88) / 0.03)
    c = np.ones((n, n, 3), np.float32) * 0.92 * (0.94 + 0.08 * br)[..., None]
    c = _lerp(c, (0.33, 0.28, 0.22), chip)
    return c, normal_from_height(-chip * 0.5 + br * 0.2, 1.5)


def t_metal(n=256):
    sp = tile_noise(n, n, 3, seed=91); st = tile_noise(n, n, (40, 2), seed=92); bl = tile_noise(n, n, 30, seed=93)
    c = np.ones((n, n, 3), np.float32) * (0.55 + 0.12 * sp)[..., None]
    c = _lerp(c, (0.42, 0.26, 0.15), _c((st - 0.6) * 4 + (bl - 0.55) * 2) * 0.7)
    return c, None


def t_ceramic(n=256):
    u, v = _uv(n)
    fu = (u * 3) % 1; fv = (v * 3) % 1
    g = ((np.minimum(fu, 1 - fu) < 0.02) | (np.minimum(fv, 1 - fv) < 0.02)).astype(np.float32)
    cell = tile_noise(n, n, 10, seed=101, octaves=1)
    c = np.ones((n, n, 3), np.float32) * (0.9 + 0.08 * cell)[..., None]
    c = _lerp(c, (0.5, 0.5, 0.47), g)
    return c, normal_from_height(-g, 2.0)


def t_glaze(n=256):
    d = tile_noise(n, n, (60, 3), seed=111); s = tile_noise(n, n, 1, seed=112, octaves=1)
    c = _lerp((0.24, 0.12, 0.05), (0.36, 0.2, 0.08), _c(d ** 1.6 * 1.3))
    c = c * (1 - 0.25 * (s > 0.82))[..., None]
    return c, normal_from_height(d * 0.3, 0.8)


# key: (texture fn or None, metres per tile, roughness, metallic, flags)
MATDEF = {
    'Bamboo': (t_bamboo, 0.8, 0.55, 0.0, ''),
    'Wood': (t_wood, 1.0, 0.85, 0.0, ''),
    'Planks': (t_planks, 1.0, 0.85, 0.0, ''),
    'Concrete': (t_concrete, 2.0, 0.92, 0.0, ''),
    'Plaster': (t_plaster, 3.0, 0.9, 0.0, ''),
    'RoofTile': (t_rooftile, 1.0, 0.75, 0.0, ''),
    'Tin': (t_tin, 0.76, 0.5, 0.5, ''),
    'Net': (t_net, 0.25, 0.8, 0.0, 'blend'),
    'Fabric': (t_fabric, 0.3, 0.9, 0.0, 'double'),
    'Sack': (t_sack, 0.25, 0.85, 0.0, ''),
    'Paint': (t_paint, 1.0, 0.6, 0.0, ''),
    'Metal': (t_metal, 1.0, 0.45, 0.6, ''),
    'Ceramic': (t_ceramic, 0.6, 0.3, 0.0, ''),
    'Glaze': (t_glaze, 0.5, 0.22, 0.0, ''),
    'Window_Glass': (None, 1.0, 0.08, 0.0, 'glass'),
    'Figure': (None, 1.0, 0.8, 0.0, ''),
    'Rope': (None, 1.0, 0.9, 0.0, ''),
    'Porcelain': (None, 1.0, 0.25, 0.0, ''),
    'Rubber': (None, 1.0, 0.45, 0.0, ''),
    'Dark': (None, 1.0, 0.9, 0.0, ''),
}


def tile(key):
    return MATDEF[key][1]


def get_mat(key):
    m = bpy.data.materials.get(key)
    if m:
        return m
    fn, t, rough, metal, fl = MATDEF[key]
    if 'glass' in fl:
        m = mat_basic(key, color=(0.015, 0.02, 0.025, 1), rough=rough, vcol=False, spec=0.6)
    elif fn is None:
        m = mat_basic(key, rough=rough, metal=metal, vcol=True, double='double' in fl)
    else:
        col, nrm = fn()
        img = np_image('tx_' + key, col)
        ni = np_image('tn_' + key, nrm, noncolor=True) if nrm is not None else None
        m = mat_basic(key, img=img, nrm=ni, rough=rough, metal=metal, vcol=True,
                      alpha_clip='mask' in fl, double=('double' in fl or 'mask' in fl or 'blend' in fl))
        if 'blend' in fl:
            tn = [x for x in m.node_tree.nodes if x.type == 'TEX_IMAGE' and x.image == img][0]
            m.node_tree.links.new(tn.outputs['Alpha'], m.node_tree.nodes['Principled BSDF'].inputs['Alpha'])
            m.surface_render_method = 'BLENDED'
    m.name = key
    return m


# ============================================================ mesh kit
class Kit:
    """One mesh with several library materials. All add_* produce metric UVs scaled by the material tile."""
    def __init__(self):
        self.mb = MB(); self.keys = []

    def mi(self, key):
        if key not in self.keys:
            self.keys.append(key)
        return self.keys.index(key)

    def add(self, V, F, U=None, key='Wood', col=(1, 1, 1), smooth=False):
        return self.mb.add(V, F, U, col=col, mat=self.mi(key), smooth=smooth)

    def grid(self, o, du, dv, key, col=(1, 1, 1), seg=None, nu=1, nv=1, R=None, c=None, smooth=False):
        o, du, dv = Vector(o), Vector(du), Vector(dv); t = tile(key)
        Lu, Lv = du.length, dv.length
        if seg:
            nu = max(1, math.ceil(Lu / seg)); nv = max(1, math.ceil(Lv / seg))
        swap = Lv > Lu
        V, U, F = [], [], []
        for j in range(nv + 1):
            for i in range(nu + 1):
                a, b = i / nu, j / nv
                p = o + du * a + dv * b
                if R is not None:
                    p = R @ p
                if c is not None:
                    p = p + Vector(c)
                V.append(p)
                uu, vv = a * Lu / t, b * Lv / t
                U.append((vv, uu) if swap else (uu, vv))
        for j in range(nv):
            for i in range(nu):
                k = j * (nu + 1) + i
                F.append([k, k + 1, k + nu + 2, k + nu + 1])
        return self.add(V, F, U, key, col, smooth)

    def box(self, c, s, key, col=(1, 1, 1), R=None, seg=None, skip=()):
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        R = R if R is not None else Matrix.Identity(3)
        if isinstance(R, (int, float)):
            R = Matrix.Rotation(R, 3, 'Z')
        faces = {
            '+X': ((hx, -hy, -hz), (0, 2 * hy, 0), (0, 0, 2 * hz)),
            '-X': ((-hx, hy, -hz), (0, -2 * hy, 0), (0, 0, 2 * hz)),
            '+Y': ((hx, hy, -hz), (-2 * hx, 0, 0), (0, 0, 2 * hz)),
            '-Y': ((-hx, -hy, -hz), (2 * hx, 0, 0), (0, 0, 2 * hz)),
            '+Z': ((-hx, -hy, hz), (2 * hx, 0, 0), (0, 2 * hy, 0)),
            '-Z': ((-hx, hy, -hz), (2 * hx, 0, 0), (0, -2 * hy, 0)),
        }
        for k, (o, du, dv) in faces.items():
            if k not in skip:
                self.grid(o, du, dv, key, col, seg=seg, R=R, c=c)

    def beam(self, p0, p1, w, h, key, col=(1, 1, 1), up=UP, skip=()):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0; L = d.length; t = d / L
        s = t.cross(up)
        if s.length < 1e-4:
            s = t.cross(Vector((1, 0, 0)))
        s.normalize(); u = s.cross(t).normalized()
        R = Matrix((s, t, u)).transposed()
        self.box((p0 + p1) / 2, (w, L, h), key, col, R=R, skip=skip)

    def tube(self, pts, radii, key, col=(1, 1, 1), sides=8, cap0=False, cap1=False, up_hint=UP, smooth=True, ry=None, phase=0.0, inside=False):
        if isinstance(radii, (int, float)):
            radii = [radii] * len(pts)
        t = tile(key)
        V, F, U = loft(pts, radii, sides=sides, cap0=cap0, cap1=cap1, vscale=1.0 / t, up_hint=up_hint, ry=ry, phase=phase)
        rep = max(1, round(2 * math.pi * (sum(radii) / len(radii)) / t))
        U = [(a * rep, b) for a, b in U]
        if inside:
            F = [f[::-1] for f in F]
        return self.add(V, F, U, key, col, smooth)

    def poly(self, pts, key, col=(1, 1, 1), flip=False):
        pts = [Vector(p) for p in pts]
        if flip:
            pts = pts[::-1]
        a = (pts[1] - pts[0]).normalized()
        n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        for i in range(2, len(pts)):
            if n.length > 1e-6:
                break
            n = (pts[1] - pts[0]).cross(pts[i] - pts[0])
        b = n.normalized().cross(a); t = tile(key)
        U = [((p - pts[0]).dot(a) / t, (p - pts[0]).dot(b) / t) for p in pts]
        return self.add(pts, [list(range(len(pts)))], U, key, col)

    def mark(self):
        return len(self.mb.v)

    def xform(self, start, M, pivot=(0, 0, 0)):
        """Apply 3x3 matrix M about pivot to every vertex added since mark() == start."""
        pv = Vector(pivot)
        for i in range(start, len(self.mb.v)):
            self.mb.v[i] = pv + M @ (self.mb.v[i] - pv)

    def build(self, name):
        return self.mb.build(name, [get_mat(k) for k in self.keys])


def tint_by(ob, fn):
    """Multiply vertex colours by fn(world_pos) -> float or (r,g,b)."""
    me = ob.data; ca = me.color_attributes['Col']; mw = ob.matrix_world
    cols = np.zeros(len(me.vertices) * 4, np.float32); ca.data.foreach_get('color', cols); cols = cols.reshape(-1, 4)
    for i, v in enumerate(me.vertices):
        f = fn(mw @ v.co)
        cols[i, :3] *= f if isinstance(f, (int, float)) else np.array(f[:3], np.float32)
    ca.data.foreach_set('color', cols.ravel())


def flood_stain(z_line, band=0.5, dark=0.55):
    """Dirty band from the flood high-water line downward (very typical in the delta)."""
    def f(p):
        if p.z > z_line:
            return 1.0
        k = min(1.0, (z_line - p.z) / band)
        return 1.0 - (1.0 - dark) * k
    return f


def L(*c):
    """sRGB-ish colour tuple -> linear (vertex colours are linear)."""
    return lin(c)[:3]


# ============================================================ roofs
def hip_roof(kit, cx, cy, ze, HX, HY, rise, RX=None, lift=0.35, curve=1.5, nt=4, ns=(6, 3), key='RoofTile',
             col=(1, 1, 1), thick=0.12, under_col=None, t_max=1.0, ridge=True, ridge_r=0.07, hips=True, corner_frac=0.3):
    """Asian hip roof with concave profile and upturned corners. Eave rectangle half-sizes HX>=HY at height ze,
    ridge half-length RX at ze+rise. t_max<1 makes a skirt (lower tier) that stops part-way up."""
    RX = HX - HY if RX is None else RX
    m = ns
    rings = []
    for it in range(nt + 1):
        t = t_max * it / nt
        hx = HX + (RX - HX) * t; hy = HY * (1 - t) + 1e-3
        z = ze + rise * t ** curve
        corners = [Vector((cx - hx, cy - hy, z)), Vector((cx + hx, cy - hy, z)), Vector((cx + hx, cy + hy, z)), Vector((cx - hx, cy + hy, z))]
        ring = []; per = []
        for k in range(4):
            a, b = corners[k], corners[(k + 1) % 4]
            mk = m[0] if k % 2 == 0 else m[1]
            for i in range(mk):
                f = i / mk
                p = a.lerp(b, f)
                dc = min(f, 1 - f) * (a - b).length          # distance to nearest corner (m)
                cl = max(0.0, 1 - dc / (corner_frac * (HX + HY))) ** 2
                out = Vector((p.x - cx, p.y - cy, 0))
                out = Vector((math.copysign(1, out.x) if abs(out.x) > 1e-6 else 0, math.copysign(1, out.y) if abs(out.y) > 1e-6 else 0, 0))
                p = p + Vector((0, 0, lift * cl * (1 - t) ** 2)) + out * (lift * 0.6 * cl * (1 - t))
                ring.append(p)
        rings.append(ring)
    for r in rings:
        r.append(r[0].copy())                                 # seam column (own UVs)
    N = len(rings[0])
    V = [p for r in rings for p in r]
    F = []
    for i in range(nt):
        for j in range(N - 1):
            a = i * N + j
            F.append([a, a + 1, a + 1 + N, a + N])
    U = []                                                    # u = perimeter metres at the eave, v = slope metres
    for i, r in enumerate(rings):
        acc = 0.0
        for j, p in enumerate(r):
            if j:
                acc += (rings[0][j] - rings[0][j - 1]).length
            sl = sum((rings[k + 1][j] - rings[k][j]).length for k in range(i))
            U.append((acc / tile(key), sl / tile(key)))
    kit.add(V, F, U, key, col, smooth=False)
    uc = under_col or tuple(x * 0.35 for x in col)
    d = Vector((0, 0, -thick))
    if thick > 0:
        edges = [rings[0]] + ([rings[-1][::-1]] if t_max < 1 else [])
        for e in edges:
            Ve = list(e) + [p + d for p in e]; n_ = len(e)
            kit.add(Ve, [[j, j + n_, j + 1 + n_, j + 1] for j in range(n_ - 1)], key='Wood', col=uc)
        kit.add([p + d for p in V], [f[::-1] for f in F], key='Wood', col=uc)
    tops = []
    if hips:
        idx = [0, m[0], m[0] + m[1], 2 * m[0] + m[1]]
        for k in idx:
            pts = [rings[i][k] + Vector((0, 0, ridge_r * 0.7)) for i in range(nt + 1)]
            kit.tube(pts, [ridge_r * 0.8] * len(pts), key, col=tuple(x * 0.8 for x in col), sides=5, cap0=True)
    if ridge and t_max >= 1:
        a = Vector((cx - RX, cy, ze + rise + ridge_r * 0.6)); b = Vector((cx + RX, cy, ze + rise + ridge_r * 0.6))
        kit.tube([a, b], ridge_r * 1.4, key, col=tuple(x * 0.8 for x in col), sides=6, cap0=True, cap1=True)
        tops = [a, b]
    return rings, tops


def gable_slope(kit, E0, E1, T0, T1, key, col=(1, 1, 1), thick=0.1, nu=1, nv=1, under_col=(0.3, 0.28, 0.25)):
    """Roof plane with eave E0-E1 and top T0-T1 (CCW seen from above/outside), plus underside and eave edge."""
    E0, E1, T0, T1 = map(Vector, (E0, E1, T0, T1))
    kit.grid(E0, E1 - E0, T0 - E0, key, col, nu=nu, nv=nv)
    d = Vector((0, 0, -thick))
    kit.grid(T0 + d, E1 - E0, E0 - T0, 'Wood', under_col, nu=nu, nv=nv)
    kit.grid(E0 + d, E1 - E0, Vector((0, 0, thick)), 'Wood', under_col)


# ============================================================ openings
def pointed_arch(w, h, n=5):
    """Outline (u,v) of an equilateral pointed-arch opening, base at v=0, centred at u=0, CCW."""
    r = w; sp = h - w * 0.866
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2, sp)]
    for i in range(1, n):            # right arc, centre at left springing point
        a = math.radians(60 * i / n)
        pts.append((-w / 2 + r * math.cos(a), sp + r * math.sin(a)))
    pts.append((0, sp + w * 0.866))
    for i in range(n - 1, 0, -1):    # left arc, centre at right springing point
        a = math.radians(60 * i / n)
        pts.append((w / 2 - r * math.cos(a), sp + r * math.sin(a)))
    pts.append((-w / 2, sp))
    return pts


def offset2d(pts, d):
    out = []; n = len(pts)
    for i in range(n):
        p0 = Vector(pts[i - 1]); p1 = Vector(pts[i]); p2 = Vector(pts[(i + 1) % n])
        e1 = (p1 - p0).normalized(); e2 = (p2 - p1).normalized()
        n1 = Vector((e1.y, -e1.x)); n2 = Vector((e2.y, -e2.x))
        nn = (n1 + n2); nn = nn.normalized() if nn.length > 1e-6 else n1
        k = 1.0 / max(0.3, nn.dot(n1))
        out.append(tuple(p1 + nn * d * k))
    return out


def wall_opening(kit, origin, du, dn, outline, frame_w=0.12, frame_d=0.08, glass_key='Window_Glass', frame_key='Plaster',
                 frame_col=(1, 1, 1), glass_col=(1, 1, 1), recess=0.0):
    """Applied window: glass polygon on the wall plane + protruding frame ring. origin = (u=0,v=0) on wall surface,
    du = unit along wall, dn = outward normal. outline from pointed_arch etc."""
    origin, du, dn = Vector(origin), Vector(du).normalized(), Vector(dn).normalized()
    dv = dn.cross(du).normalized()
    if dv.z < 0:
        dv = -dv
    P = lambda q, k: origin + du * q[0] + dv * q[1] + dn * k
    kit.poly([P(q, 0.012 - recess) for q in outline], glass_key, glass_col, flip=(du.cross(dv).dot(dn) < 0))
    outer = offset2d(outline, frame_w)
    n = len(outline); V = []; F = []
    for q in outline:
        V.append(P(q, frame_d))
    for q in outer:
        V.append(P(q, frame_d))
    for q in outer:
        V.append(P(q, 0.0))
    for q in outline:
        V.append(P(q, -recess if recess else 0.0))
    for i in range(n):
        j = (i + 1) % n
        F.append([i, j, n + j, n + i])                       # front face
        F.append([n + i, n + j, 2 * n + j, 2 * n + i])       # outer side
        F.append([3 * n + i, 3 * n + j, j, i])               # inner reveal
    if du.cross(dv).dot(dn) > 0:     # ring faces are wound clockwise in (u,v)
        F = [f[::-1] for f in F]
    kit.add(V, F, key=frame_key, col=frame_col)


# ============================================================ figure (seated)
def person_seated(kit, hip, fwd, hands, shirt=(0.25, 0.3, 0.38), pants=(0.07, 0.07, 0.08), hat=True, lean=0.08, knee_up=0.13):
    """Seated adult on a thwart at `hip` (seat contact), facing unit vector fwd (horizontal); hands = two world targets."""
    SKIN = L(0.55, 0.38, 0.27); SH = L(*shirt); PA = L(*pants); STRAW = L(0.82, 0.74, 0.55); HAIR = L(0.05, 0.04, 0.035)
    hip = Vector(hip); f = Vector(fwd).normalized(); s = f.cross(UP).normalized(); u = UP
    H = lambda a, b, c: hip + s * a + f * b + u * c
    h0 = H(0, 0, 0.08)
    for sx in (-1, 1):
        k = H(sx * 0.13, 0.42, 0.08 + knee_up); a = H(sx * 0.14, 0.5, -0.32); ft = a + f * 0.12 + u * -0.04
        kit.tube([H(sx * 0.09, 0, 0.08), k], [0.085, 0.065], 'Figure', PA, sides=7)
        kit.tube([k, a + u * 0.04], [0.06, 0.045], 'Figure', PA, sides=7, cap1=True)
        kit.tube([a - f * 0.04, ft], [0.04, 0.035], 'Figure', SKIN, sides=6, cap0=True, cap1=True, ry=[0.03, 0.022])
    sp = [h0, h0 + f * lean * 0.2 + u * 0.15, h0 + f * lean * 0.5 + u * 0.32, h0 + f * lean + u * 0.48, h0 + f * lean * 1.1 + u * 0.55]
    kit.tube(sp, [0.17, 0.16, 0.17, 0.19, 0.08], 'Figure', SH, sides=10, cap0=True, ry=[0.12, 0.11, 0.11, 0.1, 0.06], up_hint=-f)
    kit.tube([h0 + f * lean * 1.05 + u * 0.53, h0 + f * lean * 1.15 + u * 0.62], [0.05, 0.045], 'Figure', SKIN, sides=7)
    hc = h0 + f * (lean * 1.2 + 0.01) + u * 0.71
    hp = [hc - u * 0.11 + f * 0.01, hc - u * 0.07, hc, hc + u * 0.07, hc + u * 0.11]
    kit.tube(hp, [0.04, 0.075, 0.085, 0.07, 0.02], 'Figure', lambda i, p: SKIN if p.z < hc.z + 0.03 else HAIR, sides=9, cap0=True, cap1=True,
             ry=[0.05, 0.09, 0.1, 0.085, 0.03], up_hint=s)
    if hat:
        ap = hc + u * 0.30; NR = 5
        rings = [ap + (hc + u * 0.06 - ap) * (k / NR) for k in range(NR + 1)]
        rad = [0.004 + 0.215 * k / NR for k in range(NR + 1)]
        V, F, U = loft(rings, rad, sides=14, up_hint=s)
        kit.add(V, F, U, 'Figure', STRAW, smooth=True)
        kit.add([Vector(v) - u * 0.012 for v in V], [f_[::-1] for f_ in F], U, 'Figure', tuple(c * 0.7 for c in STRAW))
    sh = h0 + f * lean + u * 0.48
    for sx, hand in zip((-1, 1), hands):
        hand = Vector(hand)
        s0 = sh + s * sx * 0.18
        el = (s0 + hand) / 2 + s * sx * 0.08 - u * 0.1
        kit.tube([s0, el, hand], [0.055, 0.042, 0.035], 'Figure', SH, sides=6, cap1=True)
        kit.tube([hand - (hand - el).normalized() * 0.02, hand + (hand - el).normalized() * 0.08], 0.032, 'Figure', SKIN, sides=5, cap0=True, cap1=True)


# ============================================================ finishing
def finish(kits, name, ao_dist=0.8, ao_samples=16, ao_strength=0.85, ground=True, grime=None, extra_occ=()):
    """kits: list of (Kit, object name). Builds meshes, applies grime + vertex AO. Returns objects."""
    obs = [k.build(n) for k, n in kits]
    if grime:
        for o in obs:
            tint_by(o, grime)
    vertex_ao(obs, list(obs) + list(extra_occ), samples=ao_samples, dist=ao_dist, strength=ao_strength, ground=ground, floor=0.3)
    return obs


def root_empty(name, children=()):
    r = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(r)
    for c in children:
        c.parent = r
    return r


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.location = loc; e.empty_display_size = 0.1
    if parent is not None:
        e.parent = parent
    return e


def done(name, root, objs, anim=False):
    print('TRIS', name, tri_count([o for o in objs if o.type == 'MESH']))
    return export_glb([root], name, anim=anim)
