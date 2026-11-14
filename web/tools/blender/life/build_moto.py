# Underbone scooter (Wave/Dream type, generic, no logo) + helmeted rider + rice sack. Front = -Y (glTF +Z).
import os, sys; sys.path.insert(0, os.path.dirname(__file__))
from humans import *

reset(); bpy.context.scene.render.fps = FPS
PAINT = lin((0.55, 0.07, 0.06)); BLACK = lin((0.05, 0.05, 0.05)); SILV = lin((0.72, 0.72, 0.70)); GREY = lin((0.32, 0.32, 0.31))
WR = 0.29
m_paint = mat_basic('moto_paint', rough=0.3, spec=0.6)
m_metal = mat_basic('moto_metal', rough=0.28, metal=0.9)
m_rub = mat_basic('moto_rubber', rough=0.85, double=True)
MATS = [m_paint, m_metal, m_rub]


def ring_path(c, r, a0=0, a1=360, n=20):
    return [Vector(c) + Vector((0, -math.cos(math.radians(a)) * r, math.sin(math.radians(a)) * r)) for a in np.linspace(a0, a1, n + 1)]


def wheel(name, c):
    g = Geo()
    o = Vector((0, 0, 0))
    vv, ff = tube(ring_path(o, 0.25, n=22), [0.043] * 23, [0.040] * 23, XA, 6)
    g.add(vv, ff, lambda p: tuple(Vector(BLACK) * (1.6 if abs(p.x) > 0.03 else 1)), [], mat=2)
    vv, ff = tube(ring_path(o, 0.212, n=22), [0.022] * 23, [0.012] * 23, XA, 4)
    g.add(vv, ff, SILV, [], mat=1)
    for k in range(5):
        a = math.radians(72 * k + 10)
        d = Vector((0, -math.cos(a), math.sin(a)))
        vv, ff = tube([o + d * 0.05, o + d * 0.205], [0.012, 0.008], [0.006, 0.005], XA, 4)
        g.add(vv, ff, SILV, [], mat=1)
    vv, ff = tube([Vector((-0.055, 0, 0)), Vector((0.055, 0, 0))], [0.065, 0.065], None, YA, 10, True, True)
    g.add(vv, ff, GREY, [], mat=1)
    ob = g.build(name, MATS); ob.location = c
    return ob


g = Geo()


def part(pts, rx, ry, col, mat=0, side=XA, sides=10, caps=(True, True), nexp=2.0):
    vv, ff = tube(pts, rx, ry, side, sides, caps[0], caps[1], nexp)
    g.add(vv, ff, col_noise(col, 0.03, 30) if mat != 1 else col, [], mat=mat)


FH, RH = Vector((0, -0.62, WR)), Vector((0, 0.61, WR))
SH = Vector((0, -0.45, 0.86))   # steering head
for sx in (1, -1):
    part([FH + Vector((0.075 * sx, 0, 0)), SH + Vector((0.075 * sx, 0.02, -0.02))], [0.024, 0.022], None, SILV, 1, YA, 8)
    part([FH + Vector((0.075 * sx, 0, 0)), FH.lerp(SH, 0.4) + Vector((0.075 * sx, 0, 0))], [0.03, 0.03], None, BLACK, 2, YA, 8)
# front fender
fp = ring_path(FH, 0.325, -10, 120, 9)
part(fp, [0.07] * 10, [0.012] * 10, PAINT, 0, XA, 8)
# head cowl + headlight + handlebar + mirrors
part([Vector((0, -0.34, 0.99)), Vector((0, -0.46, 1.0)), Vector((0, -0.58, 0.97)), Vector((0, -0.62, 0.95))], [0.13, 0.16, 0.12, 0.08], [0.06, 0.07, 0.06, 0.04], PAINT, 0, XA, 12, nexp=2.6)
part([Vector((0, -0.60, 0.955)), Vector((0, -0.635, 0.95))], [0.075, 0.07], [0.04, 0.035], lin((0.9, 0.9, 0.85)), 1, XA, 10)
for sx in (1, -1):
    part([Vector((0.12 * sx, -0.41, 1.02)), Vector((0.33 * sx, -0.40, 1.01))], [0.016, 0.019], None, BLACK, 2, YA, 6)
    part([Vector((0.21 * sx, -0.43, 1.03)), Vector((0.26 * sx, -0.41, 1.24))], [0.007, 0.006], None, SILV, 1, YA, 4, (False, False))
    vv, ff = sphere(Vector((0.27 * sx, -0.41, 1.27)), 0.045, 3, 8, (1.0, 0.35, 0.75))
    g.add(vv, ff, BLACK, [], mat=0)
# leg shield + underbone tunnel + floor
part([Vector((0, -0.38, 0.34)), Vector((0, -0.42, 0.58)), Vector((0, -0.45, 0.82))], [0.12, 0.19, 0.14], [0.05, 0.045, 0.06], PAINT, 0, XA, 12, nexp=3)
part([Vector((0, -0.40, 0.50)), Vector((0, -0.22, 0.42)), Vector((0, -0.02, 0.42)), Vector((0, 0.12, 0.52))], [0.075, 0.08, 0.085, 0.09], [0.07, 0.07, 0.07, 0.08], BLACK, 0, XA, 10, nexp=2.5)
for sx in (1, -1):
    part([Vector((0.08 * sx, 0.0, 0.29)), Vector((0.21 * sx, 0.0, 0.29))], [0.014, 0.016], None, BLACK, 2, YA, 6)
# engine + cylinder
part([Vector((0, -0.12, 0.30)), Vector((0, 0.04, 0.31)), Vector((0, 0.20, 0.33))], [0.10, 0.12, 0.10], [0.11, 0.13, 0.11], GREY, 1, XA, 12, nexp=3.5)
part([Vector((0, -0.12, 0.33)), Vector((0, -0.30, 0.38))], [0.07, 0.065], [0.065, 0.06], GREY, 1, XA, 10, nexp=3)
# exhaust + muffler (right = -X)
part([Vector((-0.02, -0.30, 0.33)), Vector((-0.06, -0.30, 0.20)), Vector((-0.12, -0.05, 0.19)), Vector((-0.15, 0.25, 0.26))], [0.018] * 4, None, GREY, 1, XA, 6, (False, False))
part([Vector((-0.15, 0.22, 0.27)), Vector((-0.16, 0.45, 0.32)), Vector((-0.165, 0.72, 0.39)), Vector((-0.165, 0.80, 0.41))], [0.05, 0.058, 0.055, 0.03], None, SILV, 1, YA, 10)
# swingarm, chain case, shocks
for sx in (1, -1):
    part([Vector((0.10 * sx, 0.15, 0.30)), RH + Vector((0.10 * sx, 0, 0))], [0.02, 0.018], [0.03, 0.025], BLACK, 2, ZA, 6)
    part([RH + Vector((0.11 * sx, -0.02, 0.02)), Vector((0.11 * sx, 0.45, 0.70))], [0.022, 0.022], None, SILV, 1, YA, 6)
part([Vector((0.135, 0.12, 0.31)), Vector((0.135, 0.62, 0.30))], [0.025, 0.025], [0.07, 0.065], BLACK, 0, ZA, 8)
# rear body + seat + tail light + plate + rack
part([Vector((0, 0.02, 0.60)), Vector((0, 0.30, 0.64)), Vector((0, 0.62, 0.70)), Vector((0, 0.86, 0.76))], [0.12, 0.15, 0.13, 0.07], [0.12, 0.12, 0.10, 0.05], PAINT, 0, XA, 12, nexp=2.8)
part([Vector((0, -0.07, 0.74)), Vector((0, 0.05, 0.77)), Vector((0, 0.40, 0.79)), Vector((0, 0.66, 0.80))], [0.11, 0.13, 0.13, 0.11], [0.03, 0.045, 0.045, 0.035], BLACK, 2, XA, 12, nexp=3.5)
part([Vector((0, 0.85, 0.75)), Vector((0, 0.90, 0.75))], [0.07, 0.065], [0.035, 0.03], lin((0.7, 0.05, 0.03)), 0, XA, 8)
part([Vector((0, 0.86, 0.58)), Vector((0, 0.95, 0.62))], [0.11, 0.11], [0.06, 0.06], lin((0.85, 0.85, 0.8)), 0, XA, 4, nexp=6)
for sx in (1, -1):
    part([Vector((0.11 * sx, 0.50, 0.81)), Vector((0.11 * sx, 0.70, 0.84)), Vector((0.10 * sx, 0.93, 0.84))], [0.009] * 3, None, SILV, 1, YA, 4, (False, False))
# rear fender over wheel
part(ring_path(RH, 0.33, 170, 250, 5), [0.07] * 6, [0.01] * 6, BLACK, 2, XA, 8)
# rice sack on the rack
SACK = lin((0.83, 0.81, 0.73))
sp = [Vector((x, 0.76, 0.95)) for x in (-0.26, -0.2, -0.1, 0.0, 0.1, 0.2, 0.26)]
vv, ff = tube(sp, [0.05, 0.10, 0.12, 0.125, 0.12, 0.10, 0.05], [0.07, 0.15, 0.17, 0.175, 0.17, 0.15, 0.07], ZA, 12, True, True, 2.6)
vv = [p + Vector((0, 0, 0.012 * hashn(p, 25))) for p in vv]
g.add(vv, ff, col_noise(SACK, 0.07, 60), [], mat=2)
body = g.build('bike_body', MATS)
vertex_ao([body], [body], samples=16, dist=0.2, strength=0.7, floor=0.4, ground=True)
wf, wr = wheel('wheel_f', FH), wheel('wheel_r', RH)

# --------------------------------------------------------------- rider
arm, hg, J, s, hc, _ = build_human('rider', H=1.65, skin=(0.62, 0.44, 0.32), hair=(0.05, 0.045, 0.04), shirt=(0.55, 0.60, 0.66),
                                   trousers=(0.12, 0.12, 0.13), sleeves='long', legs='long', hat='helmet', foot_col=(0.15, 0.1, 0.07), seed=4.0)
rob = finish_human('rider', arm, hg, (0.62, 0.44, 0.32), (0.05, 0.045, 0.04), ao_occ=())
rig = Rig(arm)


def ride(t):
    ph = 2 * math.pi * t
    hips = Vector((0.006 * math.sin(ph), 0.14, 0.90 + 0.004 * math.sin(2 * ph)))
    an = J['an'].z
    return hpose(rig, hips, hrot=q(YA, 1.5 * math.sin(ph)) @ q(XA, 12), spine=tilt(18, 1.5 * math.sin(ph)), chest=tilt(24, 2 * math.sin(ph)),
                 neck=tilt(8), head=tilt(-4, 0, 9 * math.sin(ph + 0.6)),
                 hands={'L': Vector((0.27, -0.40, 1.005)), 'R': Vector((-0.27, -0.40, 1.005))},
                 elbows={'L': Vector((1, 0.4, -0.6)), 'R': Vector((-1, 0.4, -0.6))},
                 hdirs={'L': Vector((0.9, -0.2, -0.3)), 'R': Vector((-0.9, -0.2, -0.3))},
                 feet={'L': Vector((0.17, 0.0, 0.29 + an)), 'R': Vector((-0.17, 0.0, 0.29 + an))},
                 knees={'L': Vector((0.4, -1, 0.5)), 'R': Vector((-0.4, -1, 0.5))},
                 fdirs={'L': Vector((0.15, -1, -0.25)), 'R': Vector((-0.15, -1, -0.25))})
rig.clip('ride', 2.0, ride)
rig.default_pose(ride(0))

root = bpy.data.objects.new('motorbike', None); bpy.context.scene.collection.objects.link(root)
for o in (body, wf, wr, arm):
    o.parent = root
print('TRIS motorbike', tri_count([body, wf, wr, rob]), 'bike', tri_count([body, wf, wr]), 'BONES', len(arm.data.bones))
export_glb([root], 'motorbike')
