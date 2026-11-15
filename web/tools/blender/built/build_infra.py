# bridge_monkey, bridge_concrete, pole, pole_tx, fish_stakes, lift_net, pump.
# Blender Z-up; glTF front +Z == Blender -Y. Water level = z 0 unless noted.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *


def bvar(rng, k=0.12):
    a = rng.uniform(1 - k, 1 + k * 0.4)
    g = rng.uniform(-0.05, 0.05)
    return (a, a * (1 + g), a * (1 - g))


def tie(kit, p, axis, r=0.07):
    p = Vector(p); a = Vector(axis).normalized()
    b = a.cross(UP if abs(a.z) < 0.9 else Vector((1, 0, 0))).normalized(); c = a.cross(b)
    pts = [p + (b * math.cos(t) + c * math.sin(t)) * r for t in [2 * math.pi * i / 6 for i in range(7)]]
    kit.tube(pts, 0.012, 'Rope', L(0.35, 0.28, 0.18), sides=4)


# ------------------------------------------------------------------ cầu khỉ
def bridge_monkey():
    reset(); rng = random.Random(3); k = Kit()
    xs = [-6.0, -4.4, -1.5, 1.5, 4.4, 6.0]
    def zd(x):
        for a, b in zip(xs, xs[1:]):
            if a <= x <= b:
                return 1.2 - 0.06 * math.sin(math.pi * (x - a) / (b - a))
        return 1.2
    for x0, x1, y in ((-6.3, 1.9, -0.02), (-1.3, 6.3, 0.05)):        # two overlapping deck logs
        pts = [Vector((x, y, zd(x) + 0.06)) for x in np.linspace(x0, x1, 18)]
        rr = list(np.linspace(0.065, 0.05, 18))
        k.tube(pts, rr, 'Bamboo', bvar(rng), sides=8, cap0=True, cap1=True)
    for x in xs[1:-1]:
        for sy in (-1, 1):                                            # crossed stakes, deck rests in the crotch
            lean = rng.uniform(-0.06, 0.06)
            p0 = Vector((x + lean, sy * 0.55, -2.0)); pc = Vector((x, 0, 1.12)); p1 = pc + (pc - p0).normalized() * 0.8
            k.tube([p0, p1], [0.05, 0.04], 'Bamboo', bvar(rng), sides=7, cap1=True)
        tie(k, (x, 0, 1.12), (1, 0, 0), 0.08)
        hp0 = Vector((x + 0.15, 0.42, -2.0)); hp1 = Vector((x + 0.12, 0.36, 2.15))   # handrail stake
        k.tube([hp0, hp1], [0.045, 0.035], 'Bamboo', bvar(rng), sides=7, cap1=True)
        tie(k, (x + 0.12, 0.36, 2.0), (0, 0, 1), 0.055)
    for x in (-6.0, 6.0):                                              # bank end stakes
        k.tube([Vector((x, 0.42, 0.6)), Vector((x, 0.38, 2.1))], [0.045, 0.035], 'Bamboo', bvar(rng), sides=7, cap1=True)
    hx = np.linspace(-6.1, 6.1, 26)
    def zh(x):
        for a, b in zip(xs, xs[1:]):
            if a <= x <= b:
                return 2.0 - 0.07 * math.sin(math.pi * (x - a) / (b - a))
        return 2.0
    k.tube([Vector((x, 0.36, zh(x) + 0.02)) for x in hx], list(np.linspace(0.04, 0.032, 26)), 'Bamboo', bvar(rng), sides=7, cap0=True, cap1=True)
    obs = finish([(k, 'bridge_monkey_mesh')], 'bridge_monkey', ao_dist=0.5, ground=False,
                 grime=lambda p: (0.55, 0.58, 0.5) if p.z < 0.25 else 1.0)
    root = root_empty('bridge_monkey', obs)
    done('bridge_monkey', root, obs)


# ------------------------------------------------------------------ cầu bê tông
def bridge_concrete():
    reset(); rng = random.Random(4); k = Kit()
    zt = lambda x: 1.0 + 1.5 * (1 - (x / 7.0) ** 2)
    xs = list(np.linspace(-7, 7, 17))
    prof = [(-1.5, -0.38), (1.5, -0.38), (1.5, 0.2), (1.28, 0.2), (1.28, 0.0), (-1.28, 0.0), (-1.28, 0.2), (-1.5, 0.2)]
    C = L(0.95, 0.94, 0.9)
    for e in range(len(prof)):
        (y0, d0), (y1, d1) = prof[e], prof[(e + 1) % len(prof)]
        V, U = [], []
        el = math.hypot(y1 - y0, d1 - d0)
        acc = 0.0
        for i, x in enumerate(xs):
            if i:
                acc += math.hypot(x - xs[i - 1], zt(x) - zt(xs[i - 1]))
            V += [Vector((x, y0, zt(x) + d0)), Vector((x, y1, zt(x) + d1))]
            U += [(acc / 2, 0), (acc / 2, el / 2)]
        F = [[2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2] for i in range(len(xs) - 1)]
        k.add(V, F, U, 'Concrete', C, smooth=True)
    for x, s in ((-7, -1), (7, 1)):                                         # end caps (deck + curbs)
        z = zt(x)
        q = [Vector((x, -1.5, z - 0.38)), Vector((x, 1.5, z - 0.38)), Vector((x, 1.5, z)), Vector((x, -1.5, z))]
        k.poly(q, 'Concrete', C, flip=s < 0)
        for y0, y1 in ((-1.5, -1.28), (1.28, 1.5)):
            k.poly([Vector((x, y0, z)), Vector((x, y1, z)), Vector((x, y1, z + 0.2)), Vector((x, y0, z + 0.2))], 'Concrete', C, flip=s < 0)
    for xb in (-3.6, 3.6):                                                  # pier bents
        zc = zt(xb) - 0.38
        k.box((xb, 0, zc - 0.2), (0.45, 3.3, 0.4), 'Concrete', C)
        for y in (-1.0, 1.0):
            k.tube([Vector((xb, y, -2.0)), Vector((xb, y, zc - 0.4))], 0.2, 'Concrete', C, sides=10, smooth=True)
    for xa in (-7.05, 7.05):                                                # abutments
        k.box((xa, 0, (-2.0 + 0.62) / 2), (0.6, 3.6, 2.62), 'Concrete', C)
    posts = list(np.linspace(-6.85, 6.85, 11))
    for y in (-1.39, 1.39):
        for x in posts:
            k.box((x, y, zt(x) + 0.2 + 0.45), (0.15, 0.15, 0.9), 'Concrete', C, skip=('-Z',))
        for h in (0.5, 0.88):
            pts = [Vector((x, y, zt(x) + 0.2 + h)) for x in np.linspace(-6.85, 6.85, 15)]
            k.tube(pts, 0.03, 'Paint', L(0.62, 0.66, 0.68), sides=6, cap0=True, cap1=True)
    grime = lambda p: (0.48, 0.5, 0.42) if p.z < 0.15 else ((0.75, 0.75, 0.68) if p.z < 0.9 else 1.0)
    obs = finish([(k, 'bridge_concrete_mesh')], 'bridge_concrete', ao_dist=1.2, ground=False, grime=grime)
    root = root_empty('bridge_concrete', obs)
    done('bridge_concrete', root, obs)


# ------------------------------------------------------------------ electric pole
def insulator(k, base):
    b = Vector(base)
    k.tube([b, b + Vector((0, 0, 0.06))], 0.012, 'Metal', (0.8, 0.8, 0.8), sides=4)
    zs = [0.05, 0.075, 0.1, 0.15, 0.19]
    rs = [0.03, 0.075, 0.06, 0.034, 0.025]
    k.tube([b + Vector((0, 0, z)) for z in zs], rs, 'Porcelain', L(0.86, 0.86, 0.82), sides=6, cap1=True)
    return b + Vector((0, 0, 0.18))


def pole(tx=False):
    name = 'pole_tx' if tx else 'pole'
    reset(); k = Kit()
    C = L(0.88, 0.87, 0.84)
    k.tube([Vector((0, 0, -0.05)), Vector((0, 0, 1.8)), Vector((0, 0, 8.25))], [0.165, 0.152, 0.1], 'Concrete', C, sides=10, cap1=True)
    za = 7.85
    k.box((0, -0.14, za), (1.9, 0.08, 0.09), 'Metal', (0.8, 0.8, 0.8))                       # cross-arm (front face)
    for sx in (-1, 1):
        k.beam((sx * 0.62, -0.14, za - 0.04), (sx * 0.05, -0.12, za - 0.55), 0.04, 0.012, 'Metal', (0.8, 0.8, 0.8))
    k.box((0, -0.14, za - 0.18), (0.32, 0.06, 0.06), 'Metal', (0.7, 0.7, 0.7))               # clamp band
    tips = [insulator(k, (-0.82, -0.14, za + 0.045)), insulator(k, (0.82, -0.14, za + 0.045))]
    k.box((0, 0, 8.28), (0.07, 0.07, 0.06), 'Metal', (0.8, 0.8, 0.8))
    tips.append(insulator(k, (0, 0, 8.3)))
    k.box((0, -0.2, 2.6), (0.22, 0.012, 0.32), 'Paint', L(0.85, 0.85, 0.82))                 # blank number plate
    if tx:
        G = L(0.6, 0.62, 0.62); zt0, zt1 = 5.1, 5.95; cy = -0.55
        for z in (5.25, 5.8):
            k.box((0, -0.3, z), (0.5, 0.36, 0.06), 'Metal', (0.6, 0.6, 0.6))
        k.tube([Vector((0, cy, zt0)), Vector((0, cy, zt1))], 0.3, 'Metal', G, sides=8, cap0=True)
        k.tube([Vector((0, cy, zt1)), Vector((0, cy, zt1 + 0.06)), Vector((0, cy, zt1 + 0.08))], [0.31, 0.3, 0.1], 'Metal', G, sides=8, cap1=True)
        for a in range(4):
            ang = math.radians(45 + 90 * a)
            d = Vector((math.cos(ang), math.sin(ang), 0))
            k.box(Vector((0, cy, (zt0 + zt1) / 2)) + d * 0.33, (0.1, 0.02, 0.6), 'Metal', G, R=ang)
        for x in (-0.15, 0.0, 0.15):
            b = insulator(k, (x, cy - 0.05, zt1 + 0.02))
            k.tube([b, b + Vector((0, 0, 0.6)), Vector((x * 4.5 if x else 0, -0.14, za + 0.1))], 0.008, 'Rubber', (0.05, 0.05, 0.05), sides=3)
    obs = finish([(k, name + '_mesh')], name, ao_dist=0.6)
    root = root_empty(name, obs)
    for n, p in zip(('wire_a', 'wire_b', 'wire_c'), tips):
        empty(n, p, root)
    done(name, root, obs)


# ------------------------------------------------------------------ đáy / fish fence
def fish_stakes():
    reset(); rng = random.Random(7); k = Kit()
    xs = np.linspace(-5, 5, 11)
    tops = []
    for x in xs:
        top = Vector((x + rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 1.2 + rng.uniform(-0.12, 0.05)))
        k.tube([Vector((x, 0, -2.0)), top], [0.05, 0.04], 'Bamboo', bvar(rng), sides=6, cap1=True)
        tops.append(top)
    for i in range(len(xs) - 1):                                                     # net panels, slight belly
        x0, x1 = xs[i] + 0.04, xs[i + 1] - 0.04
        V, F, U = [], [], []
        nu, nv = 3, 4
        for j in range(nv + 1):
            z = -2.0 + 2.9 * j / nv
            for ii in range(nu + 1):
                f = ii / nu
                V.append(Vector((x0 + (x1 - x0) * f, 0.06 + 0.12 * math.sin(math.pi * f) * (1 - j / nv * 0.6), z)))
                U.append(((x1 - x0) * f / 0.25, (z + 2) / 0.25))
        for j in range(nv):
            for ii in range(nu):
                a = j * (nu + 1) + ii
                F.append([a, a + 1, a + nu + 2, a + nu + 1])
        k.add(V, F, U, 'Net', (1, 1, 1))
    pts = [Vector((x, -0.06, 0.95)) for x in np.linspace(-5.1, 5.1, 12)]
    k.tube(pts, 0.03, 'Bamboo', bvar(rng), sides=6, cap0=True, cap1=True)
    for x in xs:
        tie(k, (x, 0, 0.95), (0, 0, 1), 0.06)
    obs = finish([(k, 'fish_stakes_mesh')], 'fish_stakes', ao_dist=0.4, ground=False,
                 grime=lambda p: (0.5, 0.55, 0.45) if p.z < 0.15 else 1.0)
    root = root_empty('fish_stakes', obs)
    done('fish_stakes', root, obs)


# ------------------------------------------------------------------ vó / lift net (clip "lift")
def lift_net():
    reset(); rng = random.Random(8)
    frame, lever, net = Kit(), Kit(), Kit()
    piv = Vector((0, -0.3, 2.4))
    for sx in (-1, 1):
        frame.tube([Vector((sx * 0.9, 0.15, -0.3)), piv + Vector((sx * 0.12, 0, 0.12))], [0.055, 0.045], 'Bamboo', bvar(rng), sides=7, cap1=True)
        frame.tube([Vector((sx * 0.7, 1.9, -0.3)), piv + Vector((sx * 0.1, 0.05, 0.05))], [0.045, 0.04], 'Bamboo', bvar(rng), sides=6, cap1=True)
    frame.tube([Vector((-0.55, 0.0, 1.1)), Vector((0.55, 0.0, 1.1))], 0.035, 'Bamboo', bvar(rng), sides=6, cap0=True, cap1=True)
    frame.tube([piv + Vector((-0.3, 0, 0)), piv + Vector((0.3, 0, 0))], 0.03, 'Bamboo', bvar(rng), sides=6, cap0=True, cap1=True)
    tie(frame, piv + Vector((0, 0, 0.08)), (1, 0, 0), 0.09)
    frame.box((0, 0.6, 0.03), (2.2, 2.6, 0.06), 'Planks', L(0.75, 0.72, 0.65), skip=('-Z',))   # small plank stand on the bank
    # lever in pivot-local coords (pivot at origin), tip at -Y 6.5 m
    lever.tube([Vector((0, 3.1, 0)), Vector((0, 0, 0)), Vector((0, -6.6, 0))], [0.065, 0.06, 0.035], 'Bamboo', bvar(rng), sides=7, cap0=True, cap1=True)
    lever.tube([Vector((0, 3.0, 0)), Vector((0, 3.0, -0.55))], 0.01, 'Rope', L(0.35, 0.28, 0.18), sides=3)
    lever.tube([Vector((0, 3.0, -0.55)), Vector((0, 3.0, -0.65)), Vector((0, 3.0, -0.95)), Vector((0, 3.0, -1.0))], [0.08, 0.2, 0.22, 0.1],
               'Sack', L(0.62, 0.55, 0.45), sides=8, cap0=True, cap1=True)                            # counterweight bag
    # net assembly in tip-local coords (tip at origin)
    net.tube([Vector((0, 0, 0)), Vector((0, 0, -1.0))], 0.01, 'Rope', L(0.35, 0.28, 0.18), sides=3)
    for d in ((1, 1), (1, -1)):
        pts = []
        for i in range(11):
            s = -1 + 2 * i / 10
            pts.append(Vector((2.0 * s * d[0], 2.0 * s * d[1], -1.7 + 0.7 * (1 - s * s))))
        net.tube(pts, [0.03] * 11, 'Bamboo', bvar(rng), sides=5, cap0=True, cap1=True)
    n = 8; V, F, U = [], [], []
    for j in range(n + 1):
        for i in range(n + 1):
            x = -2 + 4 * i / n; y = -2 + 4 * j / n
            V.append(Vector((x, y, -1.7 - 0.65 * (1 - x * x / 4) * (1 - y * y / 4))))
            U.append((x / 0.25, y / 0.25))
    for j in range(n):
        for i in range(n):
            a = j * (n + 1) + i
            F.append([a, a + 1, a + n + 2, a + n + 1])
    net.add(V, F, U, 'Net', (1, 1, 1))
    of, ol, on = finish([(frame, 'lift_frame'), (lever, 'lift_lever_mesh'), (net, 'lift_net_mesh')], 'lift_net', ao_dist=0.4)
    root = root_empty('lift_net', [of])
    pl = empty('lever', piv, root); ol.parent = pl
    pn = empty('net', (0, -6.6, 0), pl); on.parent = pn
    act = bpy.data.actions.new('lift')
    for o in (pl, pn):
        o.rotation_mode = 'XYZ'; o.animation_data_create(); o.animation_data.action = act
    keys = [(1, 12.0), (37, 12.0), (85, -16.0), (109, -16.0), (145, 12.0)]
    for f, a in keys:
        pl.rotation_euler = (math.radians(a), 0, 0); pn.rotation_euler = (math.radians(-a), 0, 0)
        pl.keyframe_insert('rotation_euler', frame=f); pn.keyframe_insert('rotation_euler', frame=f)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 145
    bpy.context.scene.frame_set(1)
    done('lift_net', root, [of, ol, on], anim=True)


# ------------------------------------------------------------------ diesel pump (clip "vibrate")
def pump():
    reset(); rng = random.Random(9)
    st, eng, pipe = Kit(), Kit(), Kit()
    W = L(0.8, 0.76, 0.7)
    for x in (-0.62, 0.62):
        for y in (-0.3, 0.3):
            st.box((x, y, 0.22), (0.08, 0.08, 0.44), 'Wood', W, skip=('-Z',))
        st.box((x, 0, 0.47), (0.1, 0.78, 0.07), 'Wood', W)
    for y in (-0.2, 0.0, 0.2):
        st.box((0, y, 0.53), (1.45, 0.17, 0.05), 'Planks', W)
    st.beam((-0.62, -0.3, 0.12), (0.62, -0.3, 0.12), 0.04, 0.06, 'Wood', W)
    # engine group (local coords = world; node origin at 0)
    G = L(0.24, 0.42, 0.33); R_ = L(0.55, 0.12, 0.08); DK = (0.06, 0.06, 0.06)
    eng.box((-0.28, 0.0, 0.76), (0.66, 0.34, 0.42), 'Paint', G)                       # crankcase / cylinder block
    eng.box((-0.62, 0.0, 0.8), (0.06, 0.3, 0.3), 'Paint', G)                          # head
    eng.box((-0.28, 0.0, 1.06), (0.3, 0.3, 0.18), 'Paint', G)                         # water hopper
    eng.tube([Vector((-0.28, 0, 1.15)), Vector((-0.28, 0, 1.19))], 0.06, 'Metal', (0.7, 0.7, 0.7), sides=8, cap1=True)
    eng.box((-0.12, 0.0, 1.07), (0.06, 0.32, 0.04), 'Metal', (0.6, 0.6, 0.6))
    eng.box((-0.48, 0.02, 1.12), (0.26, 0.24, 0.16), 'Paint', R_)                     # fuel tank
    eng.tube([Vector((-0.48, 0.02, 1.2)), Vector((-0.48, 0.02, 1.23))], 0.03, 'Metal', (0.6, 0.6, 0.6), sides=6, cap1=True)
    eng.tube([Vector((-0.1, 0.25, 0.75)), Vector((-0.1, 0.32, 0.75))], 0.24, 'Paint', R_, sides=16, cap0=True, cap1=True)   # flywheel
    eng.tube([Vector((-0.1, -0.17, 0.75)), Vector((-0.1, -0.26, 0.75))], 0.09, 'Metal', (0.4, 0.4, 0.4), sides=10, cap1=True)  # pulley
    eng.tube([Vector((-0.6, 0.1, 0.9)), Vector((-0.7, 0.1, 0.95)), Vector((-0.72, 0.1, 1.25))], 0.025, 'Metal', (0.25, 0.22, 0.2), sides=6)
    eng.tube([Vector((-0.72, 0.1, 1.2)), Vector((-0.72, 0.1, 1.38))], 0.05, 'Metal', (0.18, 0.15, 0.13), sides=8, cap0=True, cap1=True)  # muffler
    eng.box((-0.28, 0, 0.58), (0.7, 0.4, 0.04), 'Metal', (0.35, 0.35, 0.35))           # base plate
    # pump: volute with axis along Y, driven by a belt
    P = (0.38, 0.0, 0.76)
    eng.tube([Vector((P[0], -0.08, P[2])), Vector((P[0], 0.1, P[2]))], 0.17, 'Paint', L(0.3, 0.32, 0.34), sides=14, cap0=True, cap1=True)
    eng.tube([Vector((P[0], -0.08, P[2])), Vector((P[0], -0.26, P[2]))], 0.05, 'Metal', (0.45, 0.45, 0.45), sides=8, cap1=True)
    eng.tube([Vector((P[0], -0.26, P[2])), Vector((P[0], -0.29, P[2]))], 0.08, 'Metal', (0.35, 0.35, 0.35), sides=10, cap0=True, cap1=True)
    eng.tube([Vector((0.5, 0.0, 0.9)), Vector((0.62, 0.0, 0.98)), Vector((0.66, -0.12, 1.0)), Vector((0.66, -0.35, 1.0))], 0.08, 'Metal',
             (0.4, 0.4, 0.42), sides=10)                                              # discharge elbow toward -Y
    eng.tube([Vector((P[0], 0.1, P[2])), Vector((P[0], 0.3, P[2])), Vector((P[0], 0.42, 0.55))], 0.08, 'Metal', (0.4, 0.4, 0.42), sides=8)
    eng.box((P[0], 0, 0.6), (0.3, 0.3, 0.04), 'Metal', (0.35, 0.35, 0.35))
    for z0 in (0.84, 0.66):                                                            # belt (two straight runs)
        eng.box(((-0.1 + P[0]) / 2, -0.275, z0), (0.48, 0.02, 0.02), 'Rubber', DK)
    # flexible discharge pipe, ~6 m toward -Y (glTF +Z), sagging to the ground
    pts = [Vector((0.66, -0.34, 1.0)), Vector((0.66, -0.7, 0.95)), Vector((0.62, -1.2, 0.6)), Vector((0.55, -1.7, 0.18))]
    for i in range(1, 10):
        y = -1.7 - i * 0.45
        pts.append(Vector((0.55 + 0.18 * math.sin(i * 0.9), y, 0.1 + 0.02 * math.sin(i * 1.7))))
    pts.append(pts[-1] + Vector((0.0, -0.3, -0.03)))
    pipe.tube(pts, 0.075, 'Rubber', L(0.22, 0.34, 0.5), sides=10, cap0=False, cap1=True)
    os_, oe, op = finish([(st, 'pump_stand'), (eng, 'pump_engine_mesh'), (pipe, 'pump_pipe')], 'pump', ao_dist=0.35)
    root = root_empty('pump', [os_, op])
    en = empty('engine', (0, 0, 0), root); oe.parent = en
    act = bpy.data.actions.new('vibrate')
    en.animation_data_create(); en.animation_data.action = act
    rr = random.Random(2)
    vals = [(rr.uniform(-1, 1), rr.uniform(-1, 1), rr.uniform(-1, 1)) for _ in range(24)]
    for f in range(1, 26):
        a, b, c = vals[(f - 1) % 24]
        en.location = (a * 0.0025, b * 0.002, c * 0.003)
        en.rotation_euler = (math.radians(b * 0.25), math.radians(a * 0.35), 0)
        en.keyframe_insert('location', frame=f); en.keyframe_insert('rotation_euler', frame=f)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 25
    bpy.context.scene.frame_set(1)
    done('pump', root, [os_, oe, op], anim=True)


FN = {'bridge_monkey': bridge_monkey, 'bridge_concrete': bridge_concrete, 'pole': lambda: pole(False), 'pole_tx': lambda: pole(True),
      'fish_stakes': fish_stakes, 'lift_net': lift_net, 'pump': pump}
for n in (args() or list(FN)):
    FN[n]()
