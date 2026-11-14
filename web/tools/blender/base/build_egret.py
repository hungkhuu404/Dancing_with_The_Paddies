# White egret with armature + actions "fly" and "idle". Blender: forward = -Y (glTF +Z), feet at origin.
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

reset()
WHITE = lin((0.93, 0.93, 0.9)); BILL = lin((0.85, 0.66, 0.12)); LEG = lin((0.06, 0.055, 0.05)); EYE = lin((0.75, 0.6, 0.1))


def wing_texture():
    n = 256
    v, u = np.mgrid[0:n, 0:n] / (n - 1.0)   # rows=v (leading 0 -> trailing 1), cols=u (root 0 -> tip 1)
    a = np.ones((n, n), np.float32)
    col = np.ones((n, n, 3), np.float32) * np.array([0.94, 0.94, 0.92])
    sec = u < 0.5
    p = (u / 0.5 * 11) % 1.0
    vt = 0.84 + 0.12 * np.sqrt(np.clip(1 - (2 * p - 1) ** 2, 0, 1))
    a[sec & (v > vt)] = 0
    pu = (u - 0.5) / 0.5
    pp = (pu * 9) % 1.0
    vtp = 0.86 + 0.12 * np.sqrt(np.clip(1 - (2 * pp - 1) ** 2, 0, 1)) - 0.25 * np.clip(pu - 0.6, 0, 1)
    prim = ~sec
    a[prim & (v > vtp)] = 0
    slot = prim & (pu > 0.55) & (v > 0.45 - 0.2 * pu) & (np.abs(pp - 0.5) > 0.41)
    a[slot] = 0
    edge = np.where(sec, np.minimum(p, 1 - p), np.minimum(pp, 1 - pp))
    line = (edge < 0.06) & (v > 0.42)
    col[line] *= 0.9
    cov = (v > 0.36) & (v < 0.42)
    col[cov] *= 0.9
    shaft = (np.abs(np.where(sec, p, pp) - 0.5) < 0.03) & (v > 0.45)
    col[shaft] *= 0.95
    col *= (0.94 + 0.06 * tile_noise(n, n, 8, seed=2))[..., None]
    col[v < 0.1] *= 0.97
    return np_image('egret_wing', np.concatenate([col, a[..., None]], -1))


body_mb, wing_mb = MB(), MB()
# body (tag 0)
bp = [(0, 0.31, 0.455), (0, 0.24, 0.47), (0, 0.16, 0.49), (0, 0.06, 0.515), (0, -0.04, 0.54), (0, -0.11, 0.56), (0, -0.155, 0.585)]
brx = [0.012, 0.035, 0.06, 0.072, 0.07, 0.056, 0.032]
bry = [0.006, 0.02, 0.05, 0.075, 0.08, 0.07, 0.04]
V, F, U = loft(bp, brx, sides=10, cap0=True, ry=bry, up_hint=Vector((1, 0, 0)))
body_mb.add(V, F, U, col=WHITE, tag=0)
# neck (tags 100..200 by param)
npth = [Vector(p) for p in [(0, -0.135, 0.575), (0, -0.165, 0.64), (0, -0.155, 0.70), (0, -0.12, 0.75), (0, -0.115, 0.80), (0, -0.14, 0.845), (0, -0.175, 0.87), (0, -0.2, 0.877)]]
nr = [0.034, 0.026, 0.021, 0.019, 0.018, 0.018, 0.019, 0.02]
V, F, U = loft(npth, nr, sides=8, up_hint=Vector((1, 0, 0)))
tags = [100 + int(100 * (i // 9) / (len(npth) - 1)) for i in range(len(V))]
body_mb.add(V, F, U, col=WHITE, tag=tags)
# head (tag 2)
hp = [(0, -0.175, 0.872), (0, -0.2, 0.88), (0, -0.225, 0.882), (0, -0.245, 0.878), (0, -0.258, 0.872)]
V, F, U = loft(hp, [0.018, 0.024, 0.022, 0.016, 0.01], sides=8, cap0=True, up_hint=Vector((1, 0, 0)),
               ry=[0.02, 0.026, 0.024, 0.017, 0.01])
body_mb.add(V, F, U, col=lambda i, p: EYE if (abs(abs(p.x) - 0.02) < 0.006 and abs(p.y + 0.226) < 0.008 and p.z > 0.884) else WHITE, tag=2)
# bill
blp = [(0, -0.255, 0.872), (0, -0.3, 0.868), (0, -0.34, 0.864), (0, -0.375, 0.858)]
V, F, U = loft(blp, [0.009, 0.006, 0.004, 0.0008], sides=5, up_hint=Vector((1, 0, 0)), ry=[0.011, 0.007, 0.004, 0.0008])
body_mb.add(V, F, U, col=BILL, tag=2)
# legs + toes (tags 5 / 6)
for sx, tg in ((1, 5), (-1, 6)):
    x = 0.04 * sx
    lp = [(x, 0.03, 0.49), (x, 0.03, 0.40), (x * 0.9, 0.045, 0.27), (x * 0.8, 0.02, 0.14), (x * 0.75, 0.005, 0.012)]
    V, F, U = loft(lp, [0.03, 0.012, 0.0085, 0.0065, 0.006], sides=5)
    body_mb.add(V, F, U, col=lambda i, p: WHITE if p.z > 0.42 else LEG, tag=tg)
    fx, fy = x * 0.75, 0.005
    for ang in (-28, 0, 28, 180):
        a = math.radians(ang); L = 0.065 if ang != 180 else 0.035
        d = Vector((math.sin(a), -math.cos(a), 0))
        tp = [Vector((fx, fy, 0.008)), Vector((fx, fy, 0.004)) + d * L * 0.5, Vector((fx, fy, 0.003)) + d * L]
        V, F, U = loft(tp, [0.004, 0.003, 0.0015], sides=3)
        body_mb.add(V, F, U, col=LEG, tag=tg)

# wings (tags 3 L / 4 R) -- spread pose
xs = [0.05, 0.13, 0.22, 0.31, 0.39, 0.48, 0.57, 0.66, 0.75]
yle = lambda x: -0.055 - 0.04 * math.sin(math.pi * min(1, x / 0.66)) + 0.10 * max(0, (x - 0.5) / 0.25) ** 2
yte = lambda x: 0.19 + 0.02 * math.sin(math.pi * x / 0.5) - 0.13 * max(0, (x - 0.45) / 0.3) ** 1.6
for sx, tg in ((1, 3), (-1, 4)):
    V, U, F = [], [], []
    nv = 4
    for i, x in enumerate(xs):
        for j in range(nv):
            t = j / (nv - 1)
            y = yle(x) + (yte(x) - yle(x)) * t
            z = 0.575 + 0.018 * math.sin(math.pi * t) * (1 - x) + 0.04 * (x - 0.05)
            V.append((x * sx, y, z)); U.append(((x - 0.05) / 0.7, t))
    for i in range(len(xs) - 1):
        for j in range(nv - 1):
            a_ = i * nv + j
            q = [a_, a_ + nv, a_ + nv + 1, a_ + 1]
            F.append(q if sx > 0 else q[::-1])
    wing_mb.add(V, F, U, col=WHITE, tag=tg)

wtex = wing_texture()
m_body = mat_basic('Egret_Body', rough=0.7)
m_wing = mat_basic('Egret_Wing', img=wtex, rough=0.75, alpha_clip=True, double=True)
ob = body_mb.build('egret_body', [m_body]); ow = wing_mb.build('egret_wings', [m_wing])
vertex_ao([ob, ow], [ob, ow], samples=24, dist=0.15, ground=False, strength=0.8)
# image v is flipped (np rows go up): fix by flipping uv v for wings is already handled by U (1 - t)

# --------------------------------------------------------------- armature
arm_d = bpy.data.armatures.new('EgretRig'); arm = bpy.data.objects.new('egret', arm_d)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
E = arm_d.edit_bones
def bone(n, h, t, parent=None, roll=0.0):
    b = E.new(n); b.head = h; b.tail = t; b.roll = roll
    if parent:
        b.parent = E[parent]; b.use_connect = False
    return b
bone('body', (0, 0.06, 0.5), (0, -0.12, 0.56))
bone('neck1', (0, -0.135, 0.575), (0, -0.12, 0.75), 'body')
bone('neck2', (0, -0.12, 0.75), (0, -0.175, 0.87), 'neck1')
bone('head', (0, -0.175, 0.872), (0, -0.30, 0.875), 'neck2')
for s, n in ((1, 'L'), (-1, 'R')):
    bone('wing1.' + n, (0.05 * s, 0.0, 0.575), (0.36 * s, 0.0, 0.585), 'body')
    bone('wing2.' + n, (0.36 * s, 0.0, 0.585), (0.75 * s, 0.0, 0.6), 'wing1.' + n)
    bone('leg.' + n, (0.04 * s, 0.03, 0.47), (0.03 * s, 0.005, 0.01), 'body')
bpy.ops.object.mode_set(mode='OBJECT')


def weights(o):
    tags = o['tags']; me = o.data
    G = {n: o.vertex_groups.new(name=n) for n in [b.name for b in arm_d.bones]}
    for i, v in enumerate(me.vertices):
        tg = tags[i]; p = v.co
        if tg == 0:
            G['body'].add([i], 1.0, 'REPLACE')
        elif tg >= 100:
            t = (tg - 100) / 100.0
            w2 = min(1, max(0, (t - 0.3) / 0.4)); w0 = max(0, 1 - t / 0.15)
            G['body'].add([i], w0, 'REPLACE'); G['neck1'].add([i], (1 - w2) * (1 - w0), 'REPLACE')
            G['neck2'].add([i], w2 * (1 - w0) * (1 if t < 0.95 else 0.5), 'REPLACE')
            if t >= 0.95:
                G['head'].add([i], 0.5, 'REPLACE')
        elif tg == 2:
            G['head'].add([i], 1.0, 'REPLACE')
        elif tg in (3, 4):
            n = 'L' if tg == 3 else 'R'; x = abs(p.x)
            w2 = min(1, max(0, (x - 0.31) / 0.12)); wb = max(0, 1 - (x - 0.05) / 0.06) * 0.5
            G['wing2.' + n].add([i], w2, 'REPLACE'); G['wing1.' + n].add([i], (1 - w2) * (1 - wb), 'REPLACE')
            if wb > 0:
                G['body'].add([i], wb, 'REPLACE')
        elif tg in (5, 6):
            n = 'L' if tg == 5 else 'R'
            if p.z > 0.44:
                G['body'].add([i], 0.6, 'REPLACE'); G['leg.' + n].add([i], 0.4, 'REPLACE')
            else:
                G['leg.' + n].add([i], 1.0, 'REPLACE')
    o.parent = arm
    md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm
for o in (ob, ow):
    weights(o)

# --------------------------------------------------------------- actions
P = arm.pose.bones
for pb in P:
    pb.rotation_mode = 'QUATERNION'


def setrot(pb, axis, deg):
    B = arm_d.bones[pb.name].matrix_local.to_3x3()
    qw = Quaternion(Vector(axis), math.radians(deg)).to_matrix()
    pb.rotation_quaternion = (B.inverted() @ qw @ B).to_quaternion()


def key(f, rots, scales=None):
    for pb in P:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    for n, (ax, d) in rots.items():
        setrot(P[n], ax, d)
    for n, s in (scales or {}).items():
        P[n].scale = (s, s, s)
    for pb in P:
        pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('scale', frame=f)

X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
ad = arm.animation_data_create()


def make_action(name, frames, fn):
    act = bpy.data.actions.new(name); ad.action = act
    for f in frames:
        fn(f)
    tr = ad.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(frames[0]), act)
    ad.action = None
    return act

# fly: 16-frame flap loop; neck folded, legs trailing
def fly(f):
    ph = 2 * math.pi * (f - 1) / 16
    w1 = 28 * math.sin(ph) + 4; w2 = 22 * math.sin(ph - 0.9) + 2
    key(f, {'wing1.L': (Y, -w1), 'wing2.L': (Y, -w2), 'wing1.R': (Y, w1), 'wing2.R': (Y, w2),
            'body': (X, -10), 'neck1': (X, -35), 'neck2': (X, 115), 'head': (X, -75),
            'leg.L': (X, 98), 'leg.R': (X, 98)})
make_action('fly', list(range(1, 18, 2)), fly)

def idle(f):
    ph = 2 * math.pi * (f - 1) / 72
    key(f, {'neck1': (X, 4 * math.sin(ph)), 'neck2': (X, -5 * math.sin(ph)),
            'head': (Z, 18 * math.sin(2 * ph) * (1 if f < 40 else 0.4))},
        {'wing1.L': 0.02, 'wing1.R': 0.02})
make_action('idle', list(range(1, 74, 6)), idle)

print('TRIS egret', tri_count([ob, ow]))
export_glb([arm], 'egret', anim=True)
