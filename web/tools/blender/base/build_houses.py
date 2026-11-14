# Rural Mekong houses house_0 (plaster + veranda), house_1 (wood planks), house_2 (stilts + landing).
# Blender: front = -Y (glTF +Z). Origin = base centre on the ground.
import bpy, math, random, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

# mat slot ids inside the "solid" builder (baked later)
PLASTER, PLANK, PAINT, CONC, WOOD, JAR, PAINT2 = range(7)


# ---------------------------------------------------------------- procedural bake materials
def m_plaster(col, zw):
    p = PM('plaster')
    n = p.noise(3.0, detail=5); big = p.noise(0.35, detail=2)
    c = p.mix(p.band(n, 0.3, 0.75), lin(col), lin(tuple(x * 0.86 for x in col)))
    c = p.mix(p.band(big, 0.45, 0.7), c, lin(tuple(x * 0.9 + 0.03 for x in col)))
    grime = p.math('SUBTRACT', 1.0, p.band(p.z, 0.3, 1.1))
    gn = p.noise(6.0, detail=4)
    c = p.mix(p.math('MULTIPLY', grime, p.math('ADD', 0.35, p.math('MULTIPLY', gn, 0.5))), c, lin((0.22, 0.24, 0.18)))
    streak = p.noise(1.0, detail=3, vec=p.vmul((18, 18, 0.6)))
    top = p.band(p.z, zw - 1.6, zw)
    c = p.mix(p.math('MULTIPLY', top, p.band(streak, 0.5, 0.75)), c, lin((0.35, 0.33, 0.28)))
    return p.out(c, 0.9)


def m_plank(col, horiz=True):
    p = PM('plank')
    h = 0.17
    coord = p.z if horiz else p.x
    idx = p.math('FLOOR', p.math('DIVIDE', coord, h))
    rnd = p.white(idx)
    fr = p.math('FRACT', p.math('DIVIDE', coord, h))
    seam = p.math("SUBTRACT", 1.0, p.band(fr, 0.0, 0.1))
    grain = p.noise(3.0, detail=6, vec=p.vmul((1.2, 1.2, 25) if horiz else (25, 1.2, 1.2)))
    c = p.ramp(grain, [(0.3, lin(tuple(x * 0.75 for x in col))), (0.75, lin(col))])
    c = p.mix(p.math("MULTIPLY", rnd, 0.6), c, lin((0.42, 0.40, 0.37)))
    c = p.mix(p.math('MULTIPLY', seam, 0.85), c, lin((0.05, 0.04, 0.03)))
    bot = p.math('SUBTRACT', 1.0, p.band(p.z, 0.1, 0.9))
    c = p.mix(p.math('MULTIPLY', bot, 0.5), c, lin((0.12, 0.11, 0.09)))
    return p.out(c, 0.9)


def m_paint(col):
    p = PM('paint')
    fr = p.math('FRACT', p.math('DIVIDE', p.math('ADD', p.x, p.y), 0.13))
    seam = p.math('SUBTRACT', 1.0, p.band(fr, 0.0, 0.08))
    wear = p.band(p.noise(5.0, detail=6), 0.62, 0.7)
    c = p.mix(wear, lin(col), lin((0.3, 0.24, 0.17)))
    c = p.mix(p.math('MULTIPLY', seam, 0.6), c, lin((0.04, 0.04, 0.04)))
    return p.out(c, 0.7)


def m_conc():
    p = PM('concrete')
    n = p.noise(4.0, detail=6)
    c = p.ramp(n, [(0.3, lin((0.33, 0.32, 0.3))), (0.7, lin((0.5, 0.49, 0.46)))])
    c = p.mix(p.math('SUBTRACT', 1.0, p.band(p.z, 0.0, 0.35)), c, lin((0.16, 0.17, 0.13)))
    return p.out(c, 0.95)


def m_wood():
    p = PM('wood')
    grain = p.noise(2.5, detail=6, vec=p.vmul((15, 15, 0.8)))
    c = p.ramp(grain, [(0.3, lin((0.2, 0.15, 0.1))), (0.75, lin((0.38, 0.3, 0.22)))])
    c = p.mix(p.band(p.noise(0.8), 0.5, 0.7), c, lin((0.4, 0.38, 0.34)))
    return p.out(c, 0.9)


def m_jar():
    p = PM('jar')
    n = p.noise(8.0, detail=3)
    c = p.ramp(n, [(0.3, lin((0.2, 0.1, 0.05))), (0.7, lin((0.33, 0.17, 0.07)))])
    c = p.mix(p.band(p.z, 0.45, 0.6), c, lin((0.42, 0.3, 0.12)))
    return p.out(c, 0.35)


# ---------------------------------------------------------------- geometry helpers
def wall(mb, p0, p1, z0, z1, holes=(), depth=0.14, mat=PLASTER, reveal_mat=None):
    """Outer face of a wall p0->p1 (CCW from above => outward normal right of d) with rectangular holes
    (u0,u1,v0,v1), plus reveal faces. Returns (d, n) for placing details."""
    p0 = Vector((p0[0], p0[1], 0)); p1 = Vector((p1[0], p1[1], 0))
    d = p1 - p0; L = d.length; d /= L; n = Vector((d.y, -d.x, 0))
    us = sorted({0.0, L} | {h[0] for h in holes} | {h[1] for h in holes})
    vs = sorted({z0, z1} | {h[2] for h in holes} | {h[3] for h in holes})
    P = lambda u, v, k=0.0: p0 + d * u - n * k + Vector((0, 0, v))
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            um = (us[i] + us[i + 1]) / 2; vm = (vs[j] + vs[j + 1]) / 2
            if any(h[0] < um < h[1] and h[2] < vm < h[3] for h in holes):
                continue
            mb.add([P(us[i], vs[j]), P(us[i + 1], vs[j]), P(us[i + 1], vs[j + 1]), P(us[i], vs[j + 1])], [[0, 1, 2, 3]], mat=mat, smooth=False)
    rm = mat if reveal_mat is None else reveal_mat
    for (u0, u1, v0, v1) in holes:
        q = [  # left, right, top, bottom reveals (facing into the opening)
            [P(u0, v0), P(u0, v0, depth), P(u0, v1, depth), P(u0, v1)],
            [P(u1, v0, depth), P(u1, v0), P(u1, v1), P(u1, v1, depth)],
            [P(u0, v1), P(u0, v1, depth), P(u1, v1, depth), P(u1, v1)],
        ]
        if v0 > z0 + 0.01:
            q.append([P(u0, v0, depth), P(u0, v0), P(u1, v0), P(u1, v0, depth)])
        for qq in q:
            mb.add(qq, [[0, 1, 2, 3]], mat=rm, smooth=False)
    return p0, d, n


def add_box(mb, c, s, mat, rotz=0.0):
    V, F, U = box((0, 0, 0), s)
    R = Matrix.Rotation(rotz, 3, 'Z')
    mb.add([Vector(c) + R @ Vector(v) for v in V], F, mat=mat, smooth=False)


def window(mb, glass, frame_info, u0, u1, v0, v1, shutter_mat=PAINT, bars=True, depth=0.14):
    p0, d, n = frame_info
    P = lambda u, v, k=0.0: p0 + d * u - n * k + Vector((0, 0, v))
    rot = math.atan2(d.y, d.x)
    w = u1 - u0; h = v1 - v0
    gk = depth * 0.6
    glass.add([P(u0, v0, gk), P(u1, v0, gk), P(u1, v1, gk), P(u0, v1, gk)], [[0, 1, 2, 3]], mat=0, smooth=False)
    fk = gk - 0.025; t = 0.05
    for (cu, cv, su, sv) in ((u0 + t / 2, (v0 + v1) / 2, t, h), (u1 - t / 2, (v0 + v1) / 2, t, h),
                             ((u0 + u1) / 2, v0 + t / 2, w, t), ((u0 + u1) / 2, v1 - t / 2, w, t),
                             ((u0 + u1) / 2, (v0 + v1) / 2, 0.04, h), ((u0 + u1) / 2, v0 + h * 0.62, w, 0.035)):
        add_box(mb, P(cu, cv, fk), (su, 0.04, sv), shutter_mat, rot)
    if bars:
        for k in range(1, 5):
            c = P(u0 + w * k / 5, (v0 + v1) / 2, 0.03)
            V, F, U = loft([c - Vector((0, 0, h / 2)), c + Vector((0, 0, h / 2))], [0.008, 0.008], sides=4)
            mb.add(V, F, mat=CONC, smooth=False)
    # open shutters flat on the wall + sill
    for side in (-1, 1):
        cu = (u0 - w / 4 - 0.02) if side < 0 else (u1 + w / 4 + 0.02)
        add_box(mb, P(cu, (v0 + v1) / 2, -0.025), (w / 2, 0.03, h * 0.98), shutter_mat, rot)
    add_box(mb, P((u0 + u1) / 2, v0 - 0.03, -0.03), (w + 0.16, 0.08, 0.05), CONC, rot)


def door(mb, frame_info, u0, u1, v0, v1, mat=PAINT, depth=0.14, ajar=False):
    p0, d, n = frame_info
    P = lambda u, v, k=0.0: p0 + d * u - n * k + Vector((0, 0, v))
    rot = math.atan2(d.y, d.x); w = u1 - u0; h = v1 - v0
    k = depth * 0.55
    add_box(mb, P(u0 + w / 4, (v0 + v1) / 2, k), (w / 2 - 0.01, 0.04, h - 0.01), mat, rot)
    add_box(mb, P(u1 - w / 4, (v0 + v1) / 2, k), (w / 2 - 0.01, 0.04, h - 0.01), mat, rot)
    for (cu, cv, su, sv) in ((u0 + 0.03, (v0 + v1) / 2, 0.06, h), (u1 - 0.03, (v0 + v1) / 2, 0.06, h), ((u0 + u1) / 2, v1 - 0.03, w, 0.06)):
        add_box(mb, P(cu, cv, 0.02), (su, depth * 0.8, sv), WOOD, rot)


def slope(roof, E0, E1, T0, T1, rng, ncol=None, rows=3, under=True, sheet=0.9):
    """Corrugated sheet roof patch: eave edge E0-E1, top edge T0-T1. UV in metres (u across corrugations / 0.76)."""
    E0, E1, T0, T1 = map(Vector, (E0, E1, T0, T1))
    W = (E1 - E0).length; S = (T0 - E0).length
    ncol = ncol or max(1, round(W / sheet))
    palette = [(0.95, 0.95, 0.97), (0.8, 0.8, 0.82), (0.95, 0.72, 0.55), (0.75, 0.55, 0.42), (0.88, 0.86, 0.84)]
    for c in range(ncol):
        a0 = c / ncol; a1 = (c + 1) / ncol
        tint = Vector(rng.choice(palette)) * rng.uniform(0.9, 1.05)
        V, U, C = [], [], []
        for r in range(rows + 1):
            t = r / rows
            for a in (a0, a1):
                e = E0.lerp(E1, a); tp = T0.lerp(T1, a)
                p = e.lerp(tp, t)
                if 0 < r < rows:
                    p.z += rng.uniform(-0.012, 0.012)
                V.append(p); U.append((a * W / 0.76, t * S))
                rust = 0.85 + 0.15 * rng.random() - 0.15 * (1 - t) * rng.random()
                C.append(tuple(lin(tuple(tint * rust))[:3]))
        F = [[2 * r, 2 * r + 1, 2 * r + 3, 2 * r + 2] for r in range(rows)]
        roof.add(V, F, U, col=C, mat=0, smooth=False)
        if under:
            Vu = [v - Vector((0, 0, 0.025)) for v in V]
            roof.add(Vu, [f[::-1] for f in F], U, col=lin((0.22, 0.21, 0.2)), mat=0, smooth=False)


def gable_roof(roof, solid, cx, cy, W, D, zw, pitch_deg, oh, ohg, along_x, rng):
    """Two slopes. along_x: ridge parallel to X. W along X, D along Y (house footprint)."""
    tp = math.tan(math.radians(pitch_deg))
    if along_x:
        half = D / 2; zr = zw + half * tp; ze = zw - oh * tp
        x0, x1 = cx - W / 2 - ohg, cx + W / 2 + ohg
        for s in (-1, 1):
            ye = cy + s * (half + oh)
            E0, E1 = (x0, ye, ze), (x1, ye, ze)
            if s < 0:
                slope(roof, E0, E1, (x0, cy, zr), (x1, cy, zr), rng)
            else:
                slope(roof, E1, E0, (x1, cy, zr), (x0, cy, zr), rng)
            add_box(solid, (cx, ye, ze - 0.08), (W + 2 * ohg, 0.03, 0.16), WOOD)     # fascia
        cap = [(x0, cy - 0.16, zr - 0.16 * tp + 0.02), (x1, cy - 0.16, zr - 0.16 * tp + 0.02), (x1, cy, zr + 0.04), (x0, cy, zr + 0.04),
               (x0, cy + 0.16, zr - 0.16 * tp + 0.02), (x1, cy + 0.16, zr - 0.16 * tp + 0.02)]
        roof.add(cap, [[0, 1, 2, 3], [3, 2, 5, 4]], [(0, 0), (W / 0.76, 0), (W / 0.76, 0.2), (0, 0.2), (0, 0), (W / 0.76, 0)], col=lin((0.6, 0.55, 0.5)), mat=0, smooth=False)
    else:
        half = W / 2; zr = zw + half * tp; ze = zw - oh * tp
        y0, y1 = cy - D / 2 - ohg, cy + D / 2 + ohg
        for s in (-1, 1):
            xe = cx + s * (half + oh)
            E0, E1 = (xe, y0, ze), (xe, y1, ze)
            if s > 0:
                slope(roof, E0, E1, (cx, y0, zr), (cx, y1, zr), rng)
            else:
                slope(roof, E1, E0, (cx, y1, zr), (cx, y0, zr), rng)
            add_box(solid, (xe, cy, ze - 0.08), (0.03, D + 2 * ohg, 0.16), WOOD)
        cap = [(cx - 0.16, y1, zr - 0.16 * tp + 0.02), (cx - 0.16, y0, zr - 0.16 * tp + 0.02), (cx, y0, zr + 0.04), (cx, y1, zr + 0.04),
               (cx + 0.16, y1, zr - 0.16 * tp + 0.02), (cx + 0.16, y0, zr - 0.16 * tp + 0.02)]
        roof.add(cap, [[0, 1, 2, 3], [3, 2, 5, 4]], [(0, 0), (D / 0.76, 0), (D / 0.76, 0.2), (0, 0.2), (0, 0), (D / 0.76, 0)], col=lin((0.6, 0.55, 0.5)), mat=0, smooth=False)
    return zr


def gable_tri(mb, a, b, zw, zr, mat):
    a = Vector((a[0], a[1], zw)); b = Vector((b[0], b[1], zw)); m = (a + b) / 2; m.z = zr
    mb.add([a, b, m], [[0, 1, 2]], mat=mat, smooth=False)


def jar(mb, c, h=0.75, r=0.33):
    zs = [0, 0.04, 0.25, 0.5, 0.7, 0.8, 0.86, 0.9, 0.92]
    rs = [0.5, 0.62, 0.92, 1.0, 0.82, 0.55, 0.42, 0.45, 0.4]
    pts = [Vector(c) + Vector((0, 0, h * z)) for z in zs]
    V, F, U = loft(pts, [r * x for x in rs], sides=12, cap0=True, cap1=True)
    mb.add(V, F, mat=JAR, smooth=True)


def roof_textures():
    n = 256
    u = np.arange(n)[None, :] / n; v = np.arange(n)[:, None] / n
    hgt = np.repeat((0.5 - 0.5 * np.cos(2 * np.pi * 10 * u)), n, 0).astype(np.float32)
    nrm = normal_from_height(hgt, 6.0)
    streak = tile_noise(n, n, (60, 2), seed=31)
    blot = tile_noise(n, n, 40, seed=32)
    base = np.array([0.62, 0.63, 0.64])
    rust = np.array([0.52, 0.30, 0.17])
    r = np.clip((streak - 0.5) * 4 + (blot - 0.5) * 2, 0, 1)[..., None]
    c = base * (1 - r) + rust * r
    c *= (0.85 + 0.15 * hgt[..., None])
    c *= (0.92 + 0.16 * tile_noise(n, n, 4, seed=33))[..., None]
    return np_image('tin_col', c.astype(np.float32)), np_image('tin_nrm', nrm, noncolor=True)


# ---------------------------------------------------------------- houses
def finish(name, solid, roof, glass, mats, extra_objs=()):
    TIN = roof_textures()
    m_roof = mat_basic('Roof_Tin', img=TIN[0], nrm=TIN[1], rough=0.5, metal=0.55, double=False, nrm_strength=1.0)
    m_glass = mat_basic('Window_Glass', color=(0.02, 0.025, 0.03, 1), rough=0.12, vcol=False)
    os_ = solid.build(name + '_body', mats)
    orf = roof.build(name + '_roof', [m_roof])
    og = glass.build(name + '_windows', [m_glass])
    vertex_ao([orf], [os_, orf], samples=16, dist=1.0, strength=0.8, ground=True)
    bake_atlas(os_, 512, name + '_atlas', ao_dist=1.2)
    root = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(root)
    for o in (os_, orf, og):
        o.parent = root
    print('TRIS', name, tri_count([os_, orf, og]))
    export_glb([root], name)


def house0():
    """Pastel plaster house, ridge parallel to front, front veranda on posts, water jars."""
    reset(); rng = random.Random(5)
    solid, roof, glass = MB(), MB(), MB()
    W, D, zf, zw = 8.0, 7.0, 0.35, 3.3
    col = (0.62, 0.78, 0.74)
    add_box(solid, (0, -0.9, zf / 2), (W + 0.2, D + 1.8 + 0.2, zf), CONC)           # plinth incl. veranda slab
    fy, by, lx, rx = -D / 2, D / 2, -W / 2, W / 2
    f = wall(solid, (lx, fy), (rx, fy), zf, zw, holes=[(1.0, 2.2, 1.2, 2.5), (3.2, 4.8, zf, 2.55), (5.8, 7.0, 1.2, 2.5)])
    window(solid, glass, f, 1.0, 2.2, 1.2, 2.5); window(solid, glass, f, 5.8, 7.0, 1.2, 2.5); door(solid, f, 3.2, 4.8, zf, 2.55)
    r = wall(solid, (rx, fy), (rx, by), zf, zw, holes=[(2.0, 3.1, 1.2, 2.4), (4.6, 5.7, 1.2, 2.4)])
    window(solid, glass, r, 2.0, 3.1, 1.2, 2.4); window(solid, glass, r, 4.6, 5.7, 1.2, 2.4)
    b = wall(solid, (rx, by), (lx, by), zf, zw, holes=[(3.4, 4.4, zf, 2.3)])
    door(solid, b, 3.4, 4.4, zf, 2.3, mat=PAINT2)
    l = wall(solid, (lx, by), (lx, fy), zf, zw, holes=[(2.8, 3.9, 1.2, 2.4)])
    window(solid, glass, l, 2.8, 3.9, 1.2, 2.4)
    zr = gable_roof(roof, solid, 0, 0, W, D, zw, 24, 0.6, 0.4, True, rng)
    gable_tri(solid, (rx, fy), (rx, by), zw, zr, PLASTER); gable_tri(solid, (lx, by), (lx, fy), zw, zr, PLASTER)
    # veranda: lean-to from front wall down to posts
    vy = fy - 1.9; vz = 2.6
    slope(roof, (lx - 0.3, vy - 0.3, vz - 0.07), (rx + 0.3, vy - 0.3, vz - 0.07), (lx - 0.3, fy, zw - 0.45), (rx + 0.3, fy, zw - 0.45), rng)
    for x in (-3.6, -1.2, 1.2, 3.6):
        add_box(solid, (x, vy, (zf + vz) / 2), (0.14, 0.14, vz - zf), WOOD)
    add_box(solid, (0, vy, vz - 0.16), (W + 0.4, 0.12, 0.12), WOOD)
    for i in range(3):
        add_box(solid, (0, fy - 0.12, 0.08 + i * 0.1), (1.9 - i * 0.25, 0.3 - i * 0.0, 0.1), CONC)  # front steps
    add_box(solid, (0, vy - 0.4, 0.08), (1.6, 0.6, 0.16), CONC)
    jar(solid, (rx + 0.55, fy + 0.8, 0)); jar(solid, (rx + 0.6, fy + 1.6, 0), 0.65, 0.29)
    mats = [m_plaster(col, zw), m_plank((0.5, 0.42, 0.33)), m_paint((0.2, 0.42, 0.55)), m_conc(), m_wood(), m_jar(), m_paint((0.55, 0.32, 0.2))]
    finish('house_0', solid, roof, glass, mats)


def house1():
    """Weathered wooden plank house, gable to the front, side kitchen lean-to."""
    reset(); rng = random.Random(9)
    solid, roof, glass = MB(), MB(), MB()
    W, D, zf, zw = 6.0, 8.0, 0.25, 2.9
    add_box(solid, (0.6, 0, zf / 2), (W + 1.4, D + 0.2, zf), CONC)
    fy, by, lx, rx = -D / 2, D / 2, -W / 2, W / 2
    f = wall(solid, (lx, fy), (rx, fy), zf, zw, holes=[(0.7, 1.7, 1.1, 2.2), (2.4, 3.6, zf, 2.3), (4.3, 5.3, 1.1, 2.2)], mat=PLANK)
    window(solid, glass, f, 0.7, 1.7, 1.1, 2.2, shutter_mat=PAINT); window(solid, glass, f, 4.3, 5.3, 1.1, 2.2, shutter_mat=PAINT)
    door(solid, f, 2.4, 3.6, zf, 2.3, mat=PAINT)
    r = wall(solid, (rx, fy), (rx, by), zf, zw, holes=[(1.5, 2.5, 1.1, 2.2)], mat=PLANK)
    window(solid, glass, r, 1.5, 2.5, 1.1, 2.2)
    b = wall(solid, (rx, by), (lx, by), zf, zw, holes=[(2.0, 3.0, 1.1, 2.1)], mat=PLANK)
    window(solid, glass, b, 2.0, 3.0, 1.1, 2.1, bars=False)
    l = wall(solid, (lx, by), (lx, fy), zf, zw, holes=[(3.5, 4.5, 1.1, 2.2), (6.0, 7.0, 1.1, 2.2)], mat=PLANK)
    window(solid, glass, l, 3.5, 4.5, 1.1, 2.2); window(solid, glass, l, 6.0, 7.0, 1.1, 2.2)
    zr = gable_roof(roof, solid, 0, 0, W, D, zw, 26, 0.5, 0.5, False, rng)
    gable_tri(solid, (lx, fy), (rx, fy), zw, zr, PLANK); gable_tri(solid, (rx, by), (lx, by), zw, zr, PLANK)
    # kitchen lean-to on +X side (open, posts + low plank wall)
    kx = rx + 2.0; kz = 2.15
    slope(roof, (kx + 0.3, by - 0.5, kz - 0.05), (kx + 0.3, 0.5, kz - 0.05), (rx, by - 0.5, zw - 0.35), (rx, 0.5, zw - 0.35), rng)
    for y in (0.6, by - 0.6):
        add_box(solid, (kx, y, (zf + kz) / 2), (0.12, 0.12, kz - zf), WOOD)
    wall(solid, (kx, 0.6), (kx, by - 0.6), zf, 1.1, mat=PLANK)
    jar(solid, (kx - 0.5, 0.25, 0), 0.7, 0.3); jar(solid, (lx - 0.45, fy + 1.2, 0), 0.8, 0.34)
    mats = [m_plaster((0.8, 0.76, 0.66), zw), m_plank((0.36, 0.30, 0.24)), m_paint((0.28, 0.48, 0.36)), m_conc(), m_wood(), m_jar(), m_paint((0.5, 0.3, 0.2))]
    finish('house_1', solid, roof, glass, mats)


def house2():
    """Stilt house (nha san) at the canal edge, front porch + steps down to a small wooden landing (-Y / glTF +Z)."""
    reset(); rng = random.Random(13)
    solid, roof, glass = MB(), MB(), MB()
    W, D, zf, zw = 6.0, 6.5, 1.35, 1.35 + 2.55
    fy, by, lx, rx = -D / 2, D / 2, -W / 2, W / 2
    py = fy - 1.6   # porch edge
    for x in (-2.85, -0.95, 0.95, 2.85):
        for y in (py + 0.1, fy, -1.0, 1.1, by - 0.1):
            add_box(solid, (x, y, zf / 2 - 0.05), (0.14, 0.14, zf + 0.1), WOOD)
    add_box(solid, (0, (py + by) / 2, zf - 0.06), (W + 0.3, by - py + 0.1, 0.12), WOOD)      # floor deck
    for y in (fy, by - 0.1):
        add_box(solid, (0, y, zf - 0.2), (W + 0.2, 0.12, 0.16), WOOD)                      # bearers
    f = wall(solid, (lx, fy), (rx, fy), zf, zw, holes=[(0.6, 1.6, zf + 0.8, zf + 1.9), (2.5, 3.5, zf, zf + 2.05), (4.4, 5.4, zf + 0.8, zf + 1.9)], mat=PLANK)
    window(solid, glass, f, 0.6, 1.6, zf + 0.8, zf + 1.9, shutter_mat=WOOD); window(solid, glass, f, 4.4, 5.4, zf + 0.8, zf + 1.9, shutter_mat=WOOD)
    door(solid, f, 2.5, 3.5, zf, zf + 2.05, mat=WOOD)
    r = wall(solid, (rx, fy), (rx, by), zf, zw, holes=[(2.6, 3.6, zf + 0.8, zf + 1.8)], mat=PLANK)
    window(solid, glass, r, 2.6, 3.6, zf + 0.8, zf + 1.8, shutter_mat=WOOD)
    wall(solid, (rx, by), (lx, by), zf, zw, mat=PLANK)
    l = wall(solid, (lx, by), (lx, fy), zf, zw, holes=[(2.8, 3.8, zf + 0.8, zf + 1.8)], mat=PLANK)
    window(solid, glass, l, 2.8, 3.8, zf + 0.8, zf + 1.8, shutter_mat=WOOD)
    zr = gable_roof(roof, solid, 0, (py + by) / 2 + 0.2, W, by - py - 0.4, zw, 25, 0.5, 0.45, False, rng)
    gable_tri(solid, (lx, fy), (rx, fy), zw, zr - 0.0, PLANK); gable_tri(solid, (rx, by), (lx, by), zw, zr, PLANK)
    for x in (lx + 0.1, rx - 0.1):
        add_box(solid, (x, py + 0.12, zf + (zw - zf) / 2), (0.12, 0.12, zw - zf), WOOD)        # porch roof posts
    for x0, x1 in ((lx + 0.1, -0.5), (0.5, rx - 0.1)):                                         # porch railing
        add_box(solid, ((x0 + x1) / 2, py + 0.12, zf + 0.85), (x1 - x0, 0.08, 0.06), WOOD)
        for k in range(int((x1 - x0) / 0.35) + 1):
            add_box(solid, (x0 + k * 0.35, py + 0.12, zf + 0.42), (0.04, 0.04, 0.84), WOOD)
    # steps down from porch (z=zf) to landing deck (z=-0.35)
    zl = -0.35; nst = 8; run = 0.28
    for k in range(nst):
        z = zf - (k + 1) * (zf - zl) / (nst + 1); y = py - 0.15 - k * run
        add_box(solid, (0, y, z), (1.0, 0.3, 0.05), WOOD)
    for sx in (-0.52, 0.52):
        y0, y1 = py - 0.05, py - 0.15 - nst * run
        V, F, U = oriented_box((sx, y0, zf - 0.1), (sx, y1, zl + 0.05), 0.06, 0.18); solid.add(V, F, mat=WOOD, smooth=False)
    ly0 = py - 0.15 - nst * run; ly1 = ly0 - 2.2
    for k in range(9):                                                                          # landing deck boards
        y = ly0 - 0.12 - k * 0.245
        add_box(solid, (0, y, zl), (1.8, 0.22, 0.04), WOOD)
    for x in (-0.85, 0.85):
        for y in (ly0 - 0.1, ly1 + 0.1):
            add_box(solid, (x, y, (zl - 1.5) / 2 + 0.2), (0.12, 0.12, 1.5 + zl + 0.8), WOOD)  # piles down to -1.5
        add_box(solid, (x, (ly0 + ly1) / 2, zl - 0.1), (0.1, ly0 - ly1, 0.12), WOOD)
    jar(solid, (rx - 0.5, py + 0.5, zf), 0.7, 0.3)
    mats = [m_plaster((0.8, 0.76, 0.66), zw), m_plank((0.34, 0.28, 0.22)), m_paint((0.3, 0.45, 0.5)), m_conc(), m_wood(), m_jar(), m_paint((0.5, 0.3, 0.2))]
    finish('house_2', solid, roof, glass, mats)


which = args() or ['0', '1', '2']
for w in which:
    {'0': house0, '1': house1, '2': house2}[w]()
