# shrine, church, pagoda, grave, stilt_toilet.  Blender Z-up; glTF front +Z == Blender -Y.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *

RED = L(0.62, 0.12, 0.08); YEL = L(0.88, 0.66, 0.22)


def circle(r, n=16, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * i / n - math.pi / 2), cy + r * math.sin(2 * math.pi * i / n - math.pi / 2)) for i in range(n)]


def rect(w, h):
    return [(-w / 2, 0), (w / 2, 0), (w / 2, h), (-w / 2, h)]


def curl(k, p, sx, s=1.0, key='RoofTile', col=(1, 1, 1), r=0.1):
    p = Vector(p)
    pts = [p, p + Vector((sx * 0.3, 0, 0.18)) * s, p + Vector((sx * 0.5, 0, 0.55)) * s, p + Vector((sx * 0.42, 0, 0.85)) * s, p + Vector((sx * 0.25, 0, 0.92)) * s]
    k.tube(pts, [r, r * 0.95, r * 0.85, r * 0.7, r * 0.5], key, col, sides=6, cap1=True)


# ------------------------------------------------------------------ miếu (roadside shrine)
def shrine():
    reset(); k = Kit()
    k.box((0, 0, 0.05), (0.72, 0.72, 0.1), 'Concrete', L(0.8, 0.78, 0.74), skip=('-Z',))
    k.box((0, 0, 0.55), (0.3, 0.3, 0.9), 'Plaster', L(0.95, 0.88, 0.7), skip=('-Z', '+Z'))
    k.box((0, 0, 0.98), (0.44, 0.44, 0.06), 'Plaster', L(0.95, 0.88, 0.7))
    k.box((0, 0, 1.04), (0.82, 0.64, 0.08), 'Paint', RED)
    z0, z1 = 1.08, 1.6
    k.box((0, 0.24, (z0 + z1) / 2), (0.7, 0.05, z1 - z0), 'Paint', YEL)                     # back wall (ochre inside)
    for sx in (-1, 1):
        k.box((sx * 0.325, 0.0, (z0 + z1) / 2), (0.05, 0.5, z1 - z0), 'Paint', RED)
        k.box((sx * 0.29, -0.25, (z0 + z1) / 2), (0.07, 0.07, z1 - z0), 'Paint', RED)          # front columns
    k.box((0, -0.25, z1 - 0.05), (0.7, 0.07, 0.1), 'Paint', YEL)                            # lintel
    k.box((0, -0.25, z1 - 0.12), (0.5, 0.04, 0.04), 'Paint', RED)
    k.box((0, 0.0, z0 + 0.01), (0.6, 0.46, 0.02), 'Paint', L(0.7, 0.55, 0.25))
    k.box((0, 0, z1 + 0.01), (0.74, 0.54, 0.03), 'Paint', RED)                              # ceiling slab
    k.tube([Vector((0, 0.08, z0)), Vector((0, 0.08, z0 + 0.03)), Vector((0, 0.08, z0 + 0.09)), Vector((0, 0.08, z0 + 0.1))],
           [0.05, 0.065, 0.06, 0.055], 'Glaze', L(0.9, 0.75, 0.5), sides=10, cap0=True, cap1=True)   # incense bowl
    for sx in (-1, 1):
        k.tube([Vector((sx * 0.17, 0.1, z0)), Vector((sx * 0.17, 0.1, z0 + 0.06)), Vector((sx * 0.17, 0.1, z0 + 0.14)), Vector((sx * 0.17, 0.1, z0 + 0.17))],
               [0.025, 0.04, 0.018, 0.026], 'Porcelain', L(0.85, 0.85, 0.9), sides=8, cap0=True)
        for j in range(3):
            k.tube([Vector((sx * 0.17 + 0.02 * (j - 1), 0.1, z0 + 0.15)), Vector((sx * 0.17 + 0.05 * (j - 1), 0.1 + 0.02 * j, z0 + 0.3))], 0.008,
                   'Figure', L(0.25, 0.45, 0.2), sides=3)
        for j in range(4):
            k.tube([Vector((0.012 * (j - 1.5), 0.08, z0 + 0.09)), Vector((0.015 * (j - 1.5), 0.08, z0 + 0.25))], 0.003, 'Figure', L(0.6, 0.15, 0.1), sides=3)
    k.box((0, -0.38, 1.0), (0.46, 0.14, 0.04), 'Paint', RED)                                # offering ledge
    rings, tops = hip_roof(k, 0, 0, z1 + 0.03, 0.52, 0.42, 0.3, RX=0.22, lift=0.09, nt=3, ns=(4, 3), col=L(0.85, 0.55, 0.45),
                           thick=0.04, ridge_r=0.025, corner_frac=0.35)
    for p, sx in zip(tops, (-1, 1)):
        curl(k, p, sx, 0.13, col=L(0.85, 0.55, 0.45), r=0.025)
    obs = finish([(k, 'shrine_mesh')], 'shrine', ao_dist=0.3, ao_samples=20)
    root = root_empty('shrine', obs)
    done('shrine', root, obs)


# ------------------------------------------------------------------ nhà thờ (rural Catholic church)
def church():
    reset(); k = Kit()
    WALL = L(0.94, 0.86, 0.66); TRIM = L(0.97, 0.96, 0.93); ROOF = L(0.8, 0.74, 0.72); BASE = L(0.62, 0.6, 0.55)
    X, y0, y1, H = 6.0, -12.0, 13.0, 7.5
    tp = math.tan(math.radians(35)); zr = H + X * tp
    k.grid((X, y0, 0), (0, y1 - y0, 0), (0, 0, H), 'Plaster', WALL, seg=1.7)
    k.grid((-X, y1, 0), (0, y0 - y1, 0), (0, 0, H), 'Plaster', WALL, seg=1.7)
    k.grid((X, y1, 0), (-2 * X, 0, 0), (0, 0, H), 'Plaster', WALL, seg=2.0)
    k.grid((-X, y0, 0), (2 * X, 0, 0), (0, 0, H), 'Plaster', WALL, seg=2.0)
    k.poly([(-X, y0, H), (X, y0, H), (0, y0, zr)], 'Plaster', WALL)
    k.poly([(X, y1, H), (-X, y1, H), (0, y1, zr)], 'Plaster', WALL)
    k.box((0, (y0 + y1) / 2, 0.3), (2 * X + 0.16, y1 - y0 + 0.16, 0.6), 'Concrete', BASE, skip=('-Z',))
    k.box((0, (y0 + y1) / 2, H - 0.15), (2 * X + 0.3, y1 - y0 + 0.3, 0.3), 'Plaster', TRIM, skip=('+Z', '-Z'))
    o, ze = 0.7, H - 0.7 * tp
    gable_slope(k, (X + o, y0 - 0.4, ze), (X + o, y1 + 0.4, ze), (0, y0 - 0.4, zr + 0.05), (0, y1 + 0.4, zr + 0.05), 'RoofTile', ROOF, thick=0.15, nu=6, nv=3)
    gable_slope(k, (-X - o, y1 + 0.4, ze), (-X - o, y0 - 0.4, ze), (0, y1 + 0.4, zr + 0.05), (0, y0 - 0.4, zr + 0.05), 'RoofTile', ROOF, thick=0.15, nu=6, nv=3)
    k.tube([Vector((0, y0 - 0.45, zr + 0.1)), Vector((0, y1 + 0.45, zr + 0.1))], 0.12, 'RoofTile', tuple(c * 0.8 for c in ROOF), sides=6, cap0=True, cap1=True)
    for y in (y0 - 0.4, y1 + 0.4):
        for sx in (-1, 1):
            k.beam((sx * (X + o), y, ze - 0.05), (0, y, zr), 0.12, 0.3, 'Plaster', TRIM)       # verge boards
    # buttresses + side windows
    for y in (-11.3, -6.0, -1.0, 4.0, 9.0, 12.6):
        for sx in (-1, 1):
            k.box((sx * (X + 0.32), y, 2.0), (0.64, 0.7, 4.0), 'Plaster', TRIM, skip=('-Z',))
            k.box((sx * (X + 0.2), y, 4.9), (0.4, 0.55, 1.8), 'Plaster', TRIM, skip=('-Z',))
    for yc in (-8.65, -3.5, 1.5, 6.5, 10.8):
        for sx in (-1, 1):
            wall_opening(k, (sx * X, yc, 2.3), (0, 1, 0), (sx, 0, 0), pointed_arch(1.3, 3.8), frame_w=0.14, frame_col=TRIM)
    # facade flank windows
    for sx in (-1, 1):
        wall_opening(k, (sx * 4.3, y0, 2.6), (1, 0, 0), (0, -1, 0), pointed_arch(1.1, 3.2), frame_w=0.14, frame_col=TRIM)
    # tower
    TX, ty0, ty1, TH = 2.6, -15.2, -10.2, 16.0
    tc = (ty0 + ty1) / 2
    k.box((0, tc, TH / 2), (2 * TX, ty1 - ty0, TH), 'Plaster', WALL, seg=1.7, skip=('-Z', '+Z'))
    k.box((0, tc, 0.3), (2 * TX + 0.16, ty1 - ty0 + 0.16, 0.6), 'Concrete', BASE, skip=('-Z',))
    for z in (7.6, 12.0):
        k.box((0, tc, z), (2 * TX + 0.3, ty1 - ty0 + 0.3, 0.28), 'Plaster', TRIM, skip=('-Z',))
    k.box((0, tc, TH), (2 * TX + 0.5, ty1 - ty0 + 0.5, 0.4), 'Plaster', TRIM, skip=('-Z',))
    for sx in (-1, 1):                                                                     # corner pilasters
        for sy in (ty0, ty1):
            if sy == ty1:
                continue
            k.box((sx * (TX + 0.06), sy + 0.06, TH / 2), (0.36, 0.36, TH), 'Plaster', TRIM, skip=('-Z', '+Z'))
    wall_opening(k, (0, ty0, 0.0), (1, 0, 0), (0, -1, 0), pointed_arch(2.0, 4.0), frame_w=0.25, frame_d=0.15, glass_key='Paint',
                 glass_col=L(0.36, 0.2, 0.12), frame_col=TRIM, recess=0.2)
    k.box((0, ty0 - 0.6, 0.06), (2.6, 1.2, 0.12), 'Concrete', BASE)
    for i in range(2):
        k.box((0, ty0 - 1.25 - i * 0.3, 0.06 + 0.0), (2.4 - i * 0.2, 0.3, 0.12 - i * 0.06), 'Concrete', BASE)
    wall_opening(k, (0, ty0, 8.6), (1, 0, 0), (0, -1, 0), [(x, y + 0.9) for x, y in circle(0.9, 18)], frame_w=0.18, frame_col=TRIM)
    for d, (o_, du, dn) in enumerate((((0, ty0, 12.6), (1, 0, 0), (0, -1, 0)), ((0, ty1, 12.6), (-1, 0, 0), (0, 1, 0)),
                                      ((TX, tc, 12.6), (0, 1, 0), (1, 0, 0)), ((-TX, tc, 12.6), (0, -1, 0), (-1, 0, 0)))):
        wall_opening(k, o_, du, dn, pointed_arch(1.5, 2.9), frame_w=0.16, glass_key='Dark', glass_col=(0.05, 0.05, 0.05), frame_col=TRIM)
        if d >= 2:
            wall_opening(k, (o_[0], o_[1], 8.2), du, dn, pointed_arch(0.8, 2.0), frame_w=0.12, frame_col=TRIM)
    sp = [Vector((0, tc, TH + 0.2)), Vector((0, tc, TH + 0.6)), Vector((0, tc, TH + 5.6))]
    k.tube(sp, [2.35, 2.2, 0.03], 'RoofTile', L(0.6, 0.58, 0.6), sides=8, cap1=False, phase=math.pi / 8)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b = Vector((sx * (TX - 0.05), tc + sy * 2.45, TH + 0.2))
            k.tube([b, b + Vector((0, 0, 0.25)), b + Vector((0, 0, 1.5))], [0.22, 0.2, 0.01], 'Plaster', TRIM, sides=4, phase=math.pi / 4)
    ct = TH + 5.5
    k.box((0, tc, ct + 0.65), (0.1, 0.1, 1.3), 'Metal', L(0.3, 0.3, 0.3))
    k.box((0, tc, ct + 0.9), (0.62, 0.1, 0.1), 'Metal', L(0.3, 0.3, 0.3))
    # apse (half-octagon behind the altar)
    A, B, C, D = Vector((-4, y1, 0)), Vector((-2.8, y1 + 2.2, 0)), Vector((2.8, y1 + 2.2, 0)), Vector((4, y1, 0))
    AH = 6.0
    for p, q in ((A, B), (B, C), (C, D)):
        k.grid(q, p - q, (0, 0, AH), 'Plaster', WALL, seg=1.7)
    k.box((0, y1 + 1.0, AH - 0.1), (8.3, 2.6, 0.2), 'Plaster', TRIM, skip=('+Z', '-Z'))
    wall_opening(k, (0, y1 + 2.2, 2.2), (-1, 0, 0), (0, 1, 0), pointed_arch(1.0, 2.6), frame_w=0.12, frame_col=TRIM)
    P = Vector((0, y1, 9.2)); ov = [Vector((-4.5, y1 - 0.05, 5.7)), Vector((-3.1, y1 + 2.65, 5.7)), Vector((3.1, y1 + 2.65, 5.7)), Vector((4.5, y1 - 0.05, 5.7))]
    for i in range(3):
        k.poly([ov[i + 1], ov[i], P], 'RoofTile', ROOF)
        k.poly([ov[i], ov[i + 1], P - Vector((0, 0, 0.12))], 'Wood', (0.3, 0.28, 0.25))
    grime = lambda p: 1.0 - 0.3 * max(0.0, 1 - p.z / 1.5)
    obs = finish([(k, 'church_mesh')], 'church', ao_dist=2.5, ao_samples=16, grime=grime)
    root = root_empty('church', obs)
    done('church', root, obs)


# ------------------------------------------------------------------ chùa (village pagoda)
def pagoda():
    reset(); k = Kit()
    WALL = L(0.88, 0.7, 0.34); COL = L(0.55, 0.12, 0.08); ROOF = L(0.78, 0.66, 0.6); STONE = L(0.72, 0.7, 0.66); TRIM = L(0.93, 0.88, 0.75)
    k.box((0, 0, 0.4), (18, 12, 0.8), 'Concrete', STONE, seg=3, skip=('-Z',))
    for i in range(3):
        k.box((0, -6.0 - 0.33 * (i + 0.5), 0.8 - 0.27 * (i + 1) + 0.135), (4.4, 0.33, 0.27), 'Concrete', STONE, skip=('-Z',))
    for sx in (-1, 1):
        k.box((sx * 2.4, -6.5, 0.45), (0.4, 1.0, 0.9), 'Concrete', STONE, skip=('-Z',))
    k.box((0, 0, 0.8 + 2.1), (15, 7.4, 4.2), 'Plaster', WALL, seg=1.6, skip=('-Z', '+Z'))
    k.box((0, 0, 5.0 + 1.15), (12.8, 7.4, 2.3), 'Plaster', WALL, seg=1.6, skip=('-Z', '+Z'))
    k.box((0, 0, 0.95), (15.1, 7.5, 0.3), 'Plaster', TRIM, skip=('-Z', '+Z'))
    xs = (-8.2, -4.9, -1.6, 1.6, 4.9, 8.2)
    cols = [(x, y) for x in xs for y in (-5.0, 5.0)] + [(x, y) for x in (-8.2, 8.2) for y in (-1.7, 1.7)]
    for x, y in cols:
        k.tube([Vector((x, y, 0.8)), Vector((x, y, 4.45))], 0.17, 'Paint', COL, sides=10, smooth=True)
        k.box((x, y, 0.9), (0.46, 0.46, 0.2), 'Concrete', STONE, skip=('-Z',))
    for y in (-5.0, 5.0):
        k.box((0, y, 4.3), (16.8, 0.2, 0.28), 'Paint', COL, skip=())
    for x in (-8.2, 8.2):
        k.box((x, 0, 4.3), (0.2, 10.2, 0.28), 'Paint', COL)
    for x in (-3.2, 0, 3.2):                                                                 # front doors
        k.box((x, -3.72, 0.8 + 1.45), (1.9, 0.1, 2.9), 'Wood', L(0.5, 0.35, 0.25))
        for dx in (-0.42, 0.42):
            k.box((x + dx, -3.79, 0.8 + 1.4), (0.8, 0.06, 2.6), 'Paint', L(0.45, 0.13, 0.07))
    for (o_, du, dn) in [((sx * 5.6, -3.7, 2.1), (1, 0, 0), (0, -1, 0)) for sx in (-1, 1)] + \
                        [((sx * 7.5, y, 2.1), (0, sx, 0), (sx, 0, 0)) for sx in (-1, 1) for y in (-1.8, 1.8)] + \
                        [((x, 3.7, 2.1), (-1, 0, 0), (0, 1, 0)) for x in (-3.0, 3.0)]:
        wall_opening(k, o_, du, dn, rect(1.1, 1.2), frame_w=0.14, frame_key='Paint', frame_col=COL, recess=0.1)
        o_ = Vector(o_); du = Vector(du); dn = Vector(dn)
        for j in (-0.3, 0.0, 0.3):
            k.box(o_ + du * j + Vector((0, 0, 0.6)) + dn * 0.0, (0.06, 0.06, 1.2), 'Paint', COL, R=math.atan2(du.y, du.x))
    for sx in (-1, 1):                                                                      # clerestory vents
        for x in (-3.5, 0.0, 3.5):
            wall_opening(k, (x, sx * 3.7, 5.9), (-sx, 0, 0), (0, sx, 0), circle(0.32, 12, 0, 0.32), frame_w=0.1, glass_key='Dark',
                         glass_col=(0.05, 0.04, 0.03), frame_key='Paint', frame_col=COL)
    hip_roof(k, 0, 0, 4.45, 9.8, 6.8, 4.2, RX=2.24, lift=0.55, nt=3, ns=(8, 5), col=ROOF, thick=0.15, t_max=0.45, ridge=False, ridge_r=0.09)
    _, tops = hip_roof(k, 0, 0, 7.3, 8.0, 5.0, 3.0, RX=4.6, lift=0.7, nt=5, ns=(8, 5), col=ROOF, thick=0.15, ridge_r=0.12)
    for p, sx in zip(tops, (-1, 1)):
        curl(k, p, sx, 1.1, col=ROOF, r=0.13)
    zt = tops[0].z
    k.tube([Vector((0, 0, zt)), Vector((0, 0, zt + 0.25)), Vector((0, 0, zt + 0.55)), Vector((0, 0, zt + 0.9)), Vector((0, 0, zt + 1.2))],
           [0.32, 0.42, 0.36, 0.18, 0.02], 'RoofTile', ROOF, sides=8, cap0=True)
    grime = lambda p: 1.0 - 0.3 * max(0.0, 1 - (p.z - 0.8) / 1.2) if p.z > 0.8 else 0.85
    obs = finish([(k, 'pagoda_mesh')], 'pagoda', ao_dist=2.0, ao_samples=16, grime=grime)
    root = root_empty('pagoda', obs)
    done('pagoda', root, obs)


# ------------------------------------------------------------------ lăng mộ (family graves)
def tomb(k, c, rot, col, aged=False):
    m = k.mark(); c = Vector(c)
    key = 'Concrete' if aged else 'Ceramic'
    k.box((0, 0, 0.12), (1.45, 2.3, 0.24), key, col, skip=('-Z',))
    k.box((0, -0.05, 0.38), (1.05, 1.75, 0.28), key, col, skip=('-Z',))
    m2 = k.mark()
    hip_roof(k, 0, 0, 0.52, 0.9, 0.55, 0.22, RX=0.55, lift=0.0, nt=2, ns=(2, 1), key=key, col=col, thick=0.0, ridge=False, hips=False)
    k.xform(m2, Matrix.Rotation(math.pi / 2, 3, 'Z'), (0, 0, 0))
    for i in range(m2, k.mark()):
        k.mb.v[i] = k.mb.v[i] + Vector((0, -0.05, 0))
    sc = L(0.25, 0.25, 0.26) if not aged else L(0.4, 0.4, 0.38)
    k.box((0, 1.05, 0.75), (0.75, 0.16, 1.0), key, col)                                      # stele back
    k.box((0, 0.96, 0.72), (0.5, 0.03, 0.62), 'Concrete', sc)                                  # dark stone plaque
    for sx in (-1, 1):
        k.box((sx * 0.5, 1.02, 0.6), (0.16, 0.16, 0.95), key, col)
        k.box((sx * 0.5, 1.02, 1.1), (0.22, 0.22, 0.06), key, col)
    hip_roof(k, 0, 1.05, 1.27, 0.55, 0.22, 0.16, RX=0.3, lift=0.05, nt=2, ns=(2, 1), col=L(0.8, 0.45, 0.35) if not aged else L(0.5, 0.45, 0.4),
             thick=0.03, ridge_r=0.025)
    k.tube([Vector((0, 0.72, 0.24)), Vector((0, 0.72, 0.3)), Vector((0, 0.72, 0.36))], [0.07, 0.09, 0.08], 'Glaze', L(0.8, 0.7, 0.55), sides=8, cap0=True, cap1=True)
    k.xform(m, Matrix.Rotation(rot, 3, 'Z'), (0, 0, 0))
    for i in range(m, k.mark()):
        k.mb.v[i] = k.mb.v[i] + c


def grave():
    reset(); k = Kit(); rng = random.Random(10)
    F = L(0.86, 0.85, 0.8)
    k.box((0, 0, 0.04), (6.0, 6.0, 0.08), 'Concrete', L(0.7, 0.68, 0.62), seg=1.5, skip=('-Z',))
    posts = []
    for t in np.linspace(-2.9, 2.9, 5):
        posts += [(t, -2.9), (t, 2.9), (-2.9, t), (2.9, t)]
    posts = sorted(set((round(x, 2), round(y, 2)) for x, y in posts))
    for x, y in posts:
        if y < -2.8 and abs(x) < 1.0:
            continue
        k.box((x, y, 0.45), (0.16, 0.16, 0.9), 'Concrete', F, skip=('-Z', '+Z'))
        k.box((x, y, 0.92), (0.22, 0.22, 0.05), 'Concrete', F)
    for (a, b) in (((-2.9, 2.9), (2.9, 2.9)), ((-2.9, -2.9), (-2.9, 2.9)), ((2.9, -2.9), (2.9, 2.9)), ((-2.9, -2.9), (-1.45, -2.9)), ((1.45, -2.9), (2.9, -2.9))):
        for z in (0.3, 0.75):
            k.beam((a[0], a[1], z), (b[0], b[1], z), 0.07, 0.07, 'Concrete', F)
    tomb(k, (-1.35, -0.6, 0.08), 0.0, L(0.82, 0.9, 0.95))
    tomb(k, (1.35, -0.6, 0.08), 0.0, L(0.8, 0.92, 0.82))
    tomb(k, (-1.35, 1.75, 0.08), 0.0, L(0.95, 0.88, 0.84))
    tomb(k, (1.35, 1.75, 0.08), 0.0, L(0.62, 0.62, 0.58), aged=True)
    grime = lambda p: (0.8, 0.85, 0.72) if p.z < 0.25 else 1.0
    obs = finish([(k, 'grave_mesh')], 'grave', ao_dist=0.6, ao_samples=16, grime=grime)
    root = root_empty('grave', obs)
    done('grave', root, obs)


# ------------------------------------------------------------------ over-water outhouse
def stilt_toilet():
    reset(); k = Kit(); rng = random.Random(11)
    W = L(0.85, 0.82, 0.75); zf = 1.0
    for x in (-0.55, 0.55):
        for y in (-0.55, 0.55):
            k.tube([Vector((x + rng.uniform(-0.04, 0.04), y, -2.0)), Vector((x, y, zf + 1.65))], [0.05, 0.045], 'Wood', W, sides=6, cap1=True)
    k.box((0, 0, zf - 0.08), (1.25, 1.25, 0.08), 'Planks', W)
    for y in (-0.55, 0.55):
        k.box((0, y, zf - 0.17), (1.3, 0.08, 0.1), 'Wood', W)
    t = 0.03; z0, z1 = zf, zf + 1.6
    k.box((0, 0.6, (z0 + z1 + 0.15) / 2), (1.2, t, z1 - z0 + 0.15), 'Planks', W)                 # back wall (rising toward back)
    for sx in (-1, 1):
        k.box((sx * 0.6, 0.0, (z0 + z1) / 2 + 0.04), (t, 1.2, z1 - z0 + 0.08), 'Planks', W)
        k.box((sx * 0.42, -0.6, (z0 + z1) / 2), (0.36, t, z1 - z0), 'Planks', W)
    k.box((0, -0.6, z1 - 0.12), (0.5, t, 0.24), 'Planks', W)
    # cloth curtain over the door (folds)
    V, F, U = [], [], []
    nu, nv = 6, 3
    for j in range(nv + 1):
        z = z1 - 0.24 - (z1 - 0.24 - (z0 + 0.12)) * j / nv
        for i in range(nu + 1):
            x = -0.25 + 0.5 * i / nu
            V.append(Vector((x, -0.63 - 0.025 * math.sin(i * math.pi * 1.0) * (1 if i % 2 else -1) - 0.01 * j, z)))
            U.append((x / 0.3, z / 0.3))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            F.append([a + nu + 1, a + nu + 2, a + 1, a])
    k.add(V, F, U, 'Fabric', L(0.45, 0.55, 0.62))
    k.box((0, -0.62, z1 - 0.24), (0.56, 0.02, 0.02), 'Wood', W)
    gable_slope(k, (-0.8, -0.95, z1 + 0.05), (0.8, -0.95, z1 + 0.05), (-0.8, 0.85, z1 + 0.3), (0.8, 0.85, z1 + 0.3), 'Tin', (1, 1, 1), thick=0.03, nu=2)
    # walkway toward -Y (glTF +Z, the bank)
    for y in np.linspace(-1.2, -3.6, 3):
        for sx in (-1, 1):
            k.tube([Vector((sx * 0.3, y, -2.0)), Vector((sx * 0.3, y, zf - 0.05))], 0.04, 'Bamboo', (1, 1, 1), sides=6, cap1=True)
        k.box((0, y, zf - 0.12), (0.7, 0.06, 0.06), 'Wood', W)
    for x in (-0.13, 0.13):
        k.box((x, -2.35, zf - 0.06), (0.22, 2.7, 0.04), 'Planks', W)
    obs = finish([(k, 'stilt_toilet_mesh')], 'stilt_toilet', ao_dist=0.5, ao_samples=16, ground=False,
                 grime=lambda p: (0.5, 0.55, 0.45) if p.z < 0.2 else 1.0)
    root = root_empty('stilt_toilet', obs)
    done('stilt_toilet', root, obs)


FN = {'shrine': shrine, 'church': church, 'pagoda': pagoda, 'grave': grave, 'stilt_toilet': stilt_toilet}
for n in (args() or list(FN)):
    FN[n]()
