# Xuong ba la (three-plank sampan) ~5.6 m + seated rower with non la + paddle, clip "row".
# Blender: bow -> -Y (glTF +Z), waterline z=0 at origin.
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

reset()
LEN = 5.6


def sec(s):
    a = abs(s)
    g = 0.47 * max(0.0, 1 - a ** 2.0) ** 0.85 + 0.006
    b = 0.27 * max(0.0, 1 - a ** 1.7) ** 1.0 + 0.004
    zb = -0.045 + 0.17 * a ** 3.2 + 0.12 * max(0, -s) ** 3
    zg = 0.24 + 0.10 * a ** 2.4 + 0.2 * max(0, -s) ** 3
    return g, b, zb, zg


hull = MB()
NS = 34
outer, inner = [], []
for i in range(NS + 1):
    s = -1 + 2 * i / NS
    s = math.copysign(abs(s) ** 0.85, s)          # denser near the ends
    y = s * LEN / 2
    g, b, zb, zg = sec(s)
    zm = zb + (zg - zb) * 0.5; xm = b + (g - b) * 0.52
    prof = [(-g, zg), (-xm, zm), (-b, zb), (0, zb - 0.004), (b, zb), (xm, zm), (g, zg)]
    outer.append([Vector((x, y, z)) for x, z in prof])
    t = 0.022
    k = max(0.0, 1 - abs(s) ** 6)
    iprof = [(-g + t * k, zg), (-xm + t * k, zm), (-b + t * k, zb + t * k), (0, zb + t * k), (b - t * k, zb + t * k), (xm - t * k, zm), (g - t * k, zg)]
    inner.append([Vector((x, y, z)) for x, z in iprof])
NP = 7


def grid(rows, flip=False):
    V = [p for r in rows for p in r]; F = []
    for i in range(len(rows) - 1):
        for j in range(NP - 1):
            a = i * NP + j
            q = [a, a + 1, a + NP + 1, a + NP]
            F.append(q[::-1] if flip else q)
    return V, F
V, F = grid(outer, flip=True); hull.add(V, F, mat=0, smooth=False)
V, F = grid(inner); hull.add(V, F, mat=0, smooth=False)
# gunwale caps (outer top -> inner top), both sides, plus a rub rail
for side in (0, NP - 1):
    V, F = [], []
    for i in range(NS + 1):
        o = outer[i][side]; n_ = inner[i][side]
        V += [o, n_]
    for i in range(NS):
        a = i * 2
        q = [a, a + 2, a + 3, a + 1]
        F.append(q if side == 0 else q[::-1])
    hull.add(V, F, mat=0, smooth=False)
    rp = [outer[i][side] + Vector((0.012 * (1 if side else -1), 0, -0.03)) for i in range(2, NS - 1)]
    V, F, U = loft(rp, [0.022] * len(rp), sides=4, phase=math.pi / 4, up_hint=Vector((1, 0, 0)))
    hull.add(V, F, mat=0, smooth=False)
# thwarts + floor boards + ribs
for ys in (-1.45, 0.25, 1.55):
    s = ys / (LEN / 2); g, b, zb, zg = sec(s)
    V, F, U = box((0, ys, zg - 0.06), (2 * g - 0.03, 0.2, 0.03)); hull.add(V, F, mat=0, smooth=False)
for k in range(-6, 7):
    ys = k * 0.36; s = ys / (LEN / 2); g, b, zb, zg = sec(s)
    if abs(s) > 0.8:
        continue
    for sx in (-1, 1):
        p0 = Vector((sx * (b - 0.03), ys, zb + 0.03)); p1 = Vector((sx * (g - 0.03), ys, zg - 0.03))
        V, F, U = oriented_box(p0, p1, 0.035, 0.03, up=Vector((0, 1, 0))); hull.add(V, F, mat=0, smooth=False)
V, F, U = box((0, 0.1, sec(0)[2] + 0.055), (0.56, 3.4, 0.015)); hull.add(V, F, mat=0, smooth=False)

# ---------------------------------------------------------------- rower
SKIN = lin((0.55, 0.38, 0.27)); SHIRT = lin((0.22, 0.26, 0.33)); PANTS = lin((0.06, 0.06, 0.065)); STRAW = lin((0.82, 0.74, 0.55))
seat = Vector((0, 1.55, sec(1.55 / 2.8)[3] - 0.045))
legs, torso, arms = MB(), MB(), MB()
hip = seat + Vector((0, 0, 0.07))
for sx in (-1, 1):
    k = hip + Vector((sx * 0.13, -0.42, 0.13)); a = hip + Vector((sx * 0.14, -0.50, -0.30)); f = a + Vector((0, -0.12, -0.04))
    V, F, U = loft([hip + Vector((sx * 0.09, 0, 0)), k], [0.085, 0.065], sides=8); legs.add(V, F, U, col=PANTS)
    V, F, U = loft([k, a + Vector((0, 0, 0.04))], [0.06, 0.045], sides=8, cap1=True); legs.add(V, F, U, col=PANTS)
    V, F, U = loft([a + Vector((0, 0.04, 0)), f], [0.04, 0.035], sides=6, cap0=True, cap1=True, ry=[0.03, 0.022]); legs.add(V, F, U, col=SKIN)
# torso (relative to hip pivot), leaning slightly forward
sp = [hip + Vector((0, 0.0, 0.0)), hip + Vector((0, -0.01, 0.15)), hip + Vector((0, -0.03, 0.32)), hip + Vector((0, -0.05, 0.48)), hip + Vector((0, -0.06, 0.55))]
V, F, U = loft(sp, [0.17, 0.16, 0.17, 0.19, 0.08], sides=12, cap0=True, ry=[0.12, 0.11, 0.11, 0.1, 0.06], up_hint=Vector((0, -1, 0)))
torso.add(V, F, U, col=SHIRT)
neck = [hip + Vector((0, -0.06, 0.53)), hip + Vector((0, -0.07, 0.62))]
V, F, U = loft(neck, [0.05, 0.045], sides=8); torso.add(V, F, U, col=SKIN)
hc = hip + Vector((0, -0.08, 0.71))
hp = [hc + Vector((0, 0.01, -0.11)), hc + Vector((0, 0, -0.07)), hc, hc + Vector((0, 0, 0.07)), hc + Vector((0, 0.005, 0.11))]
V, F, U = loft(hp, [0.04, 0.075, 0.085, 0.07, 0.02], sides=10, cap0=True, cap1=True, ry=[0.05, 0.09, 0.1, 0.085, 0.03])
torso.add(V, F, U, col=lambda i, p: SKIN if p.z < hc.z + 0.03 else lin((0.05, 0.04, 0.035)))
# non la (conical hat), straw rings, slight tilt
ap = hc + Vector((0, -0.01, 0.30)); NR = 6
rings = [ap + (hc + Vector((0, -0.02, 0.06)) - ap) * (k / NR) for k in range(NR + 1)]
rad = [0.004 + 0.215 * k / NR for k in range(NR + 1)]
V, F, U = loft(rings, rad, sides=16, up_hint=Vector((1, 0, 0)))
hat_c = [STRAW if (j // 17) % 2 == 0 else tuple(c * 0.85 for c in STRAW) for j in range(len(V))]
torso.add(V, F, U, col=hat_c, smooth=True)
V2 = [Vector(v) - Vector((0, 0, 0.012)) for v in V]
torso.add(V2, [f[::-1] for f in F], U, col=tuple(c * 0.7 for c in STRAW))
# arms + paddle (relative to shoulder pivot)
sh = hip + Vector((0, -0.05, 0.48))
grip = sh + Vector((-0.05, -0.32, 0.15))
low = Vector((-0.62, sh.y - 0.30, 0.0))
d = (low - grip).normalized()
blade_top = grip + d * 1.05; tip = grip + d * 1.55
lowhand = grip + d * 0.55
for sx, hand in ((1, grip), (-1, lowhand)):
    s0 = sh + Vector((sx * 0.18, 0.0, 0.0))
    el = (s0 + hand) / 2 + Vector((sx * 0.1, 0.06, -0.12))
    V, F, U = loft([s0, el, hand], [0.055, 0.042, 0.035], sides=7, cap1=True); arms.add(V, F, U, col=SHIRT)
    V, F, U = loft([hand - d * 0.04, hand + d * 0.06], [0.03, 0.03], sides=6, cap0=True, cap1=True); arms.add(V, F, U, col=SKIN)
V, F, U = loft([grip - d * 0.08, blade_top], [0.016, 0.018], sides=6, cap0=True); arms.add(V, F, U, col=lin((0.42, 0.3, 0.18)))
side = d.cross(Vector((0, 1, 0))).normalized()
bw = 0.075
bl = [blade_top, blade_top + d * 0.15, blade_top + d * 0.4, tip]
V = []
for k, p in enumerate(bl):
    w = bw * (0.4, 1.0, 1.0, 0.7)[k]
    V += [p - side * w, p + side * w]
F = [[2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2] for k in range(3)]
nrm = side.cross(d).normalized() * 0.008
Vb = [v + nrm for v in V] + [v - nrm for v in V]
Fb = F + [[i + 8 for i in f[::-1]] for f in F]
arms.add(Vb, Fb, col=lin((0.38, 0.27, 0.16)), smooth=False)

# ---------------------------------------------------------------- materials, AO, bake
pm = PM('Boat_Wood_proc')
grain = pm.noise(4.0, detail=6, rough=0.65, vec=pm.vmul((14, 0.7, 14)))
blot = pm.noise(1.2, detail=3)
c = pm.ramp(grain, [(0.3, lin((0.20, 0.14, 0.09))), (0.7, lin((0.36, 0.27, 0.18)))])
c = pm.mix(pm.band(blot, 0.45, 0.75), c, lin((0.42, 0.38, 0.33)), 'MIX')
wet = pm.math('SUBTRACT', 1.0, pm.band(pm.z, -0.02, 0.06))
c = pm.mix(pm.math('MULTIPLY', wet, 0.8), c, lin((0.05, 0.04, 0.03)), 'MIX')
m_proc = pm.out(c, 0.85)
m_r = mat_basic('Rower', rough=0.8)
oh = hull.build('boat_hull', [m_proc], sharp_angle=35)
ol = legs.build('rower_legs', [m_r]); ot = torso.build('rower_torso', [m_r]); oa = arms.build('rower_arms', [m_r])
allm = [oh, ol, ot, oa]
vertex_ao([ol, ot, oa], allm, samples=24, dist=0.35, ground=False, strength=0.9)
bake_atlas(oh, 512, 'Boat_Wood', ao_dist=0.5)

root = bpy.data.objects.new('boat', None); bpy.context.scene.collection.objects.link(root)
pt = bpy.data.objects.new('rower_hips', None); bpy.context.scene.collection.objects.link(pt); pt.location = hip
pa = bpy.data.objects.new('rower_shoulders', None); bpy.context.scene.collection.objects.link(pa); pa.location = sh - hip
for o in (oh, ol):
    o.parent = root
pt.parent = root; pa.parent = pt
ot.parent = pt; ot.location = -hip
oa.parent = pa; oa.location = -sh

# ---------------------------------------------------------------- row clip (48 frames, loop)
act = bpy.data.actions.new('row')
for o in (pt, pa):
    o.rotation_mode = 'XYZ'
    o.animation_data_create(); o.animation_data.action = act
for f in range(1, 50, 4):
    ph = (f - 1) / 48.0
    if ph <= 0.5:   # pull: catch forward -> finish back, blade in water
        t = ph / 0.5; pitch = -30 + 55 * (0.5 - 0.5 * math.cos(math.pi * t)); lift = 0; lean = 12 - 16 * t
    else:           # recovery: blade out, swing forward
        t = (ph - 0.5) / 0.5; pitch = 25 - 55 * (0.5 - 0.5 * math.cos(math.pi * t)); lift = 22 * math.sin(math.pi * t); lean = -4 + 16 * t
    pt.rotation_euler = (math.radians(-lean), 0, math.radians(4 * math.sin(2 * math.pi * ph)))
    pa.rotation_euler = (math.radians(pitch), math.radians(lift), 0)
    pt.keyframe_insert('rotation_euler', frame=f); pa.keyframe_insert('rotation_euler', frame=f)
print('TRIS boat', tri_count([oh, ol, ot, oa]))
export_glb([root], 'boat', anim=True)
