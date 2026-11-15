# Animals: duck, dog, buffalo.  usage: blender -b --factory-startup --python build_animals.py -- duck [dog buffalo]
import os, sys; sys.path.insert(0, os.path.dirname(__file__))
from life_common import *


def foot_cycle(p, stride, lift, duty=0.6):
    p %= 1.0
    if p < duty:
        u = p / duty
        return -stride / 2 + stride * u, 0.0
    u = (p - duty) / (1 - duty)
    return stride / 2 - stride * sm(u), lift * math.sin(math.pi * u)


# ======================================================================== DUCK
def duck_tex(n=256):
    v, u = (np.mgrid[0:n, 0:n] + 0.5) / n
    a = tile_noise(n, n, 18, seed=21); b = tile_noise(n, n, 34, seed=22)
    white = np.array([0.86, 0.84, 0.78]); brown = np.array([0.42, 0.30, 0.18]); dark = np.array([0.16, 0.11, 0.07])
    m = np.clip((a - 0.52) * 9, 0, 1)[..., None]
    col = white * (1 - m) + brown * m
    sp = (b > 0.66)[..., None] & (m > 0.4)
    col = np.where(sp, dark, col)
    side = np.exp(-((np.abs(u - 0.5) - 0.25) / 0.08) ** 2)[..., None] * (v > 0.35)[..., None] * (v < 0.75)[..., None]
    col = col * (1 - 0.35 * side) + np.array([0.30, 0.22, 0.14]) * 0.35 * side
    col *= (0.92 + 0.16 * b)[..., None]
    col[:12, :12] = 1.0     # white texel block for vertex-coloured parts
    return np_image('duck_mottle', col.astype(np.float32))


def duck():
    reset(); bpy.context.scene.render.fps = FPS
    bones = [('body', (0, 0.08, 0.14), (0, -0.08, 0.15), None), ('neck', (0, -0.10, 0.17), (0, -0.115, 0.265), 'body'),
             ('head', (0, -0.115, 0.265), (0, -0.175, 0.285), 'neck'), ('tail', (0, 0.12, 0.155), (0, 0.21, 0.175), 'body')]
    for sx, sd in ((1, 'L'), (-1, 'R')):
        bones += [('thigh.' + sd, (0.04 * sx, 0.03, 0.12), (0.045 * sx, 0.0, 0.07), 'body'),
                  ('shank.' + sd, (0.045 * sx, 0.0, 0.07), (0.045 * sx, 0.012, 0.016), 'thigh.' + sd),
                  ('foot.' + sd, (0.045 * sx, 0.012, 0.016), (0.045 * sx, -0.045, 0.004), 'shank.' + sd)]
    arm = make_arm('duck', bones)
    g = Geo()
    uvf = lambda p: (0.5 + math.atan2(p.x, -(p.z - 0.13)) / (2 * math.pi), min(0.99, max(0.06, 0.5 - p.y * 2.2)))
    W1 = (0.01, 0.01)
    R = [(0.215, 0.175, 0.012, 0.008), (0.175, 0.167, 0.055, 0.042), (0.12, 0.155, 0.088, 0.068), (0.05, 0.143, 0.104, 0.084),
         (-0.03, 0.142, 0.100, 0.083), (-0.085, 0.15, 0.080, 0.072), (-0.12, 0.163, 0.050, 0.052), (-0.135, 0.172, 0.022, 0.028)]
    vv, ff = tube([(0, y, z) for y, z, _, _ in R], [w for *_, w, _ in R], [h for *_, h in R], XA, 12, True, True)
    g.add(vv, ff, (1, 1, 1), ['body', 'tail', 'neck'], uv=[uvf(p) for p in vv])
    vv, ff = tube([(0, -0.07, 0.15), (0, -0.098, 0.19), (0, -0.108, 0.225), (0, -0.118, 0.258)], [0.055, 0.036, 0.027, 0.024], [0.05, 0.034, 0.028, 0.025], XA, 8)
    g.add(vv, ff, col_noise(lin((0.50, 0.38, 0.25)), 0.12, 90), ['body', 'neck', 'head'], uv=[W1] * len(vv))
    vv, ff = sphere((0, -0.133, 0.278), 0.031, 5, 10, (0.82, 1.2, 0.92))
    eye = lambda p: (0.03, 0.025, 0.02) if (abs(abs(p.x) - 0.022) < 0.007 and abs(p.y + 0.145) < 0.009 and p.z > 0.28) else lin((0.47, 0.35, 0.23))
    g.add(vv, ff, lambda p: tuple(x * (0.75 if p.z > 0.295 else 1) for x in eye(p)), ['head'], uv=[W1] * len(vv), weights={'head': 1.0})
    vv, ff = tube([(0, -0.158, 0.279), (0, -0.19, 0.272), (0, -0.215, 0.268)], [0.017, 0.016, 0.013], [0.009, 0.006, 0.004], XA, 6, False, True)
    g.add(vv, ff, lin((0.78, 0.55, 0.25)), ['head'], uv=[W1] * len(vv), weights={'head': 1.0})
    ORANGE = lin((0.85, 0.50, 0.15))
    for sx, sd in ((1, 'L'), (-1, 'R')):
        vv, ff = tube([(0.045 * sx, 0.002, 0.075), (0.045 * sx, 0.006, 0.045), (0.045 * sx, 0.012, 0.016)], [0.008, 0.006, 0.005], None, YA, 5)
        g.add(vv, ff, ORANGE, ['shank.' + sd], uv=[W1] * len(vv), weights={'shank.' + sd: 1.0})
        fx = 0.045 * sx
        web = [(fx, 0.014, 0.008), (fx - 0.025, -0.040, 0.003), (fx, -0.052, 0.003), (fx + 0.025, -0.040, 0.003)]
        web2 = [(p[0], p[1], p[2] + 0.004) for p in web]
        g.add(web + web2, [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]],
              ORANGE, ['foot.' + sd], uv=[W1] * 8, weights={'foot.' + sd: 1.0}, smooth=False)
    m = mat_basic('duck', img=duck_tex(), rough=0.75)
    ob = g.build('duck_mesh', [m])
    vertex_ao([ob], [ob], samples=20, dist=0.06, strength=0.8, floor=0.4, ground=True)
    skin(ob, arm, g, blend=0.03)
    rig = Rig(arm)
    H = rig.H
    rest_foot = {sd: rig.T['foot.' + sd] - rig.H['foot.' + sd] for sd in 'LR'}

    def legs(body_loc, feet, fdirs=None):
        sp = []
        for sd, sx in (('L', 1), ('R', -1)):
            sp.append(ik2(rig, 'thigh.' + sd, 'shank.' + sd, feet[sd], Vector((0, -1, 0.3)), 'foot.' + sd,
                          (fdirs or {}).get(sd, rest_foot[sd])))
        return sp

    def walk(t):
        ph = 2 * math.pi * t
        b = Vector((0, 0, 0.14 + 0.006 * math.cos(2 * ph)))
        feet = {}
        for sd, sx, o in (('L', 1, 0), ('R', -1, 0.5)):
            dy, dz = foot_cycle(t + o, 0.075, 0.03, 0.55)
            feet[sd] = Vector((0.045 * sx, 0.012 + dy, 0.016 + dz))
        return merge({'body': {'loc': b, 'rot': q(ZA, 5 * math.sin(ph)) @ q(YA, 8 * math.sin(ph))},
                      'neck': {'dir': tilt(10 + 8 * math.cos(2 * ph))}, 'head': {'dir': Vector((0, -1, 0.25))},
                      'tail': {'dir': q(ZA, 12 * math.sin(ph)) @ Vector((0, 1, 0.25))}}, *legs(b, feet))

    def swim(t):
        ph = 2 * math.pi * t
        b = Vector((0, 0, 0.02 + 0.004 * math.sin(ph)))
        feet = {}; fd = {}
        for sd, sx, o in (('L', 1, 0), ('R', -1, math.pi)):
            feet[sd] = Vector((0.05 * sx, 0.09 + 0.035 * math.sin(ph + o), -0.075 + 0.012 * math.cos(ph + o)))
            fd[sd] = Vector((0, 0.6 + 0.4 * math.sin(ph + o), -0.6))
        return merge({'body': {'loc': b, 'rot': q(XA, 2 * math.sin(ph))}, 'neck': {'dir': tilt(6 + 3 * math.sin(ph))},
                      'head': {'dir': Vector((0, -1, 0.2))}, 'tail': {'dir': q(ZA, 6 * math.sin(2 * ph)) @ Vector((0, 1, 0.3))}},
                     *legs(b, feet, fd))

    def dabble(t):
        d = track(t, [(0, 0), (0.22, 1), (0.75, 1), (1, 0)])
        wig = math.sin(2 * math.pi * t * 6) * (1 if 0.25 < t < 0.72 else 0)
        b = Vector((0, 0, 0.02 + 0.01 * d))
        base = swim(t * 2 % 1)
        base['body'] = {'loc': b, 'rot': q(XA, 32 * d)}
        base['neck'] = {'dir': tilt(10 + 120 * d, 0, 4 * wig)}
        base['head'] = {'dir': tilt(90 + 80 * d, 0, 8 * wig, base=Vector((0, 0, 1)))}
        base['tail'] = {'dir': q(ZA, 15 * wig) @ Vector((0, 1, 0.3 + 0.8 * d))}
        return base
    rig.clip('swim', 1.0, swim)
    rig.clip('walk', 0.6, walk)
    rig.clip('dabble', 2.0, dabble)
    rig.default_pose(swim(0))
    print('TRIS duck', tri_count([ob]), 'BONES', len(arm.data.bones))
    export_glb([arm], 'duck')


# ======================================================================== QUADRUPEDS (dog, buffalo)
DOG = dict(
    name='dog', sides=10,
    body=[(0.36, 0.47, 0.03, 0.03), (0.32, 0.47, 0.080, 0.085), (0.22, 0.465, 0.090, 0.095), (0.10, 0.47, 0.078, 0.085),
          (-0.02, 0.46, 0.085, 0.11), (-0.14, 0.45, 0.095, 0.125), (-0.22, 0.47, 0.085, 0.115), (-0.27, 0.50, 0.055, 0.075)],
    neck=([(0, -0.20, 0.49), (0, -0.29, 0.56), (0, -0.345, 0.615)], [0.078, 0.064, 0.055]),
    skull=((0, -0.38, 0.64), 0.062, (0.95, 1.1, 0.9)),
    muzzle=([(0, -0.41, 0.625), (0, -0.48, 0.607), (0, -0.525, 0.597)], [0.040, 0.030, 0.019], [0.036, 0.027, 0.017]),
    ears=[((0.035, -0.365, 0.675), (0.05, -0.36, 0.735), 0.022)], horns=None,
    front=[(0.075, -0.18, 0.46), (0.075, -0.155, 0.27), (0.075, -0.17, 0.07), (0.075, -0.215, 0.0)], fr=[0.055, 0.035, 0.022, 0.026],
    hind=[(0.075, 0.28, 0.46), (0.08, 0.215, 0.29), (0.08, 0.33, 0.12), (0.08, 0.30, 0.0)], hr=[0.068, 0.045, 0.024, 0.026],
    tail=[(0, 0.35, 0.49), (0, 0.45, 0.55), (0, 0.50, 0.64)], tr=[0.035, 0.03, 0.018],
    spine=[(0, 0.30, 0.47), (0, 0.10, 0.47), (0, -0.10, 0.47), (0, -0.24, 0.50), (0, -0.345, 0.61), (0, -0.52, 0.60)],
    coat=(0.74, 0.52, 0.27), pale=(0.90, 0.80, 0.60), dark=(0.10, 0.07, 0.05), belly=0.75, sock=0.3)
BUFFALO = dict(
    name='buffalo', sides=12,
    body=[(1.02, 1.05, 0.08, 0.08), (0.93, 1.03, 0.26, 0.28), (0.70, 0.99, 0.36, 0.36), (0.40, 0.96, 0.38, 0.38),
          (0.10, 0.96, 0.39, 0.40), (-0.20, 1.00, 0.37, 0.41), (-0.42, 1.04, 0.30, 0.36), (-0.55, 1.06, 0.20, 0.26)],
    neck=([(0, -0.48, 1.06), (0, -0.68, 1.04), (0, -0.82, 0.98)], [0.22, 0.19, 0.16]),
    skull=((0, -0.88, 0.99), 0.15, (0.9, 1.0, 0.85)),
    muzzle=([(0, -0.93, 0.93), (0, -1.10, 0.80), (0, -1.21, 0.73)], [0.13, 0.11, 0.09], [0.12, 0.10, 0.07]),
    ears=[((0.12, -0.86, 0.98), (0.27, -0.83, 0.95), 0.05)],
    horns=[(0.07, -0.84, 1.10), (0.25, -0.80, 1.14), (0.42, -0.72, 1.13), (0.50, -0.55, 1.16), (0.44, -0.40, 1.22)],
    front=[(0.20, -0.38, 0.95), (0.21, -0.36, 0.58), (0.21, -0.38, 0.20), (0.21, -0.45, 0.0)], fr=[0.15, 0.10, 0.065, 0.075],
    hind=[(0.20, 0.80, 0.98), (0.22, 0.64, 0.62), (0.21, 0.86, 0.28), (0.21, 0.82, 0.0)], hr=[0.17, 0.12, 0.06, 0.075],
    tail=[(0, 1.02, 1.03), (0, 1.09, 0.72), (0, 1.08, 0.42)], tr=[0.045, 0.03, 0.025],
    spine=[(0, 0.85, 1.0), (0, 0.30, 0.98), (0, -0.20, 1.0), (0, -0.48, 1.06), (0, -0.82, 0.98), (0, -1.20, 0.74)],
    coat=(0.20, 0.20, 0.21), pale=(0.50, 0.48, 0.45), dark=(0.06, 0.06, 0.06), belly=0.2, sock=0.55)


def quadruped(P):
    reset(); bpy.context.scene.render.fps = FPS
    sp = [Vector(p) for p in P['spine']]
    bones = [('hips', sp[0], sp[1], None), ('spine', sp[1], sp[2], 'hips'), ('chest', sp[2], sp[3], 'spine'),
             ('neck', sp[3], sp[4], 'chest'), ('head', sp[4], sp[5], 'neck'),
             ('tail1', P['tail'][0], P['tail'][1], 'hips'), ('tail2', P['tail'][1], P['tail'][2], 'tail1')]
    for sx, sd in ((1, 'L'), (-1, 'R')):
        m = lambda p: Vector((p[0] * sx, p[1], p[2]))
        f, h = [m(p) for p in P['front']], [m(p) for p in P['hind']]
        bones += [('f_up.' + sd, f[0], f[1], 'chest'), ('f_lo.' + sd, f[1], f[2], 'f_up.' + sd), ('f_paw.' + sd, f[2], f[3], 'f_lo.' + sd),
                  ('h_up.' + sd, h[0], h[1], 'hips'), ('h_lo.' + sd, h[1], h[2], 'h_up.' + sd), ('h_paw.' + sd, h[2], h[3], 'h_lo.' + sd)]
    arm = make_arm(P['name'], bones)
    COAT, PALE, DARK = lin(P['coat']), lin(P['pale']), lin(P['dark'])
    by = P['body']; zmid = sum(b[1] for b in by) / len(by); hmax = max(b[3] for b in by)

    def coat(p):
        k = sm((zmid - p.z) / hmax * 1.3 - 0.1)   # pale belly
        c = Vector(COAT).lerp(Vector(PALE), k * P['belly'])
        return tuple(c * (1 + 0.07 * hashn(p, 8 / hmax)))
    g = Geo(); S = P['sides']
    vv, ff = tube([(0, y, z) for y, z, _, _ in by], [b[2] for b in by], [b[3] for b in by], XA, S, True, True)
    g.add(vv, ff, coat, ['hips', 'spine', 'chest'])
    npts, nr = P['neck']; npts = list(npts[:-1]) + [P['skull'][0]]
    vv, ff = tube(npts, nr, None, XA, S)
    throat = lambda p: tuple(Vector(coat(p)).lerp(Vector(PALE), 0.6 * sm((npts[1][2] - p.z) / nr[1] * 0.8)))
    g.add(vv, ff, throat, ['chest', 'neck', 'head'])
    c, r, scl = P['skull']
    vv, ff = sphere(c, r, 5, S, scl)
    def eye(p):
        d = (p - Vector(c)).normalized()
        return 0.05 < d.z < 0.45 and d.y < -0.45 and 0.35 < abs(d.x) < 0.75
    g.add(vv, ff, lambda p: DARK if eye(p) else coat(p), ['head'], weights={'head': 1.0})
    mp, mrx, mry = P['muzzle']
    vv, ff = tube(mp, mrx, mry, XA, S - 2, False, True)
    tip = Vector(mp[-1])
    g.add(vv, ff, lambda p: DARK if (p - tip).length < mrx[-1] * 1.6 else tuple(Vector(coat(p)).lerp(Vector(PALE), 0.35 * P['belly'])), ['head'], weights={'head': 1.0})
    for a, b, er in P['ears']:
        for sx in (1, -1):
            pa, pb = Vector((a[0] * sx, a[1], a[2])), Vector((b[0] * sx, b[1], b[2]))
            vv, ff = tube([pa, pa.lerp(pb, 0.5), pb], [er, er * 0.7, er * 0.08], [er * 0.3, er * 0.25, er * 0.05], YA, 5, True, True)
            g.add(vv, ff, lambda p: tuple(Vector(COAT) * 0.8), ['head'], weights={'head': 1.0})
    if P['horns']:
        for sx in (1, -1):
            hp = [Vector((x * sx, y, z)) for x, y, z in P['horns']]
            vv, ff = tube(hp, [0.065, 0.055, 0.042, 0.026, 0.006], None, ZA, 8, True, True)
            g.add(vv, ff, lambda p: tuple(Vector(lin((0.16, 0.15, 0.14))) * (1 + 0.15 * hashn(p, 30))), ['head'], weights={'head': 1.0})
    vv, ff = tube(P['tail'], P['tr'], None, XA, 6, False, True)
    g.add(vv, ff, coat, ['hips', 'tail1', 'tail2'])
    for sx, sd in ((1, 'L'), (-1, 'R')):
        for key, rk, pre, par in (('front', 'fr', 'f_', 'chest'), ('hind', 'hr', 'h_', 'hips')):
            J = [Vector((p[0] * sx, p[1], p[2])) for p in P[key]]
            R = P[rk]
            pts = [J[0] + Vector((0, 0, R[0] * 0.6)), J[0], J[0].lerp(J[1], 0.5), J[1], J[1].lerp(J[2], 0.5), J[2], J[2].lerp(J[3], 0.6) + Vector((0, 0, R[3] * 0.4)), J[3] + Vector((0, (J[3] - J[2]).y * 0.4, R[3] * 0.4))]
            rr = [R[0] * 0.9, R[0], (R[0] + R[1]) / 2, R[1], (R[1] + R[2]) / 2 * 0.9, R[2], R[3], R[3] * 0.6]
            vv, ff = tube(pts, rr, None, YA, 8, False, True)
            vv = [Vector((p.x, p.y, max(0.0, p.z))) for p in vv]
            lo = J[2].z
            legc = lambda p, lo=lo: (tuple(Vector(DARK) * 1.5) if p.z < lo * 0.22 else
                                     tuple(Vector(COAT).lerp(Vector(PALE), P['sock'] * sm((lo * 2.0 - p.z) / lo)) * (1 + 0.06 * hashn(p, 8 / hmax))))
            g.add(vv, ff, legc, [par, pre + 'up.' + sd, pre + 'lo.' + sd, pre + 'paw.' + sd])
    m = mat_basic(P['name'], rough=0.88)
    ob = g.build(P['name'] + '_mesh', [m])
    vertex_ao([ob], [ob], samples=20, dist=hmax * 1.5, strength=0.8, floor=0.4, ground=True)
    skin(ob, arm, g, blend=hmax * 0.6)
    return arm, ob, Rig(arm)


def quad_pose(rig, P, hips_loc, hips_rot=None, feet_off=None, wrist_off=None, paw_curl=None, neck=None, head=None, tail=None, tail2=None, chest=None):
    sp = {'hips': {'loc': hips_loc}}
    if hips_rot is not None:
        sp['hips']['rot'] = hips_rot
    for b, d in (('neck', neck), ('head', head), ('tail1', tail), ('tail2', tail2), ('chest', chest)):
        if d is not None:
            sp[b] = {'dir': d}
    out = [sp]
    for sx, sd in ((1, 'L'), (-1, 'R')):
        for pre, pole in (('f_', Vector((0, 1, -0.2))), ('h_', Vector((0, -1, 0)))):
            key = pre + sd
            toe = rig.T[pre + 'paw.' + sd]; wr = rig.H[pre + 'paw.' + sd]
            off = (feet_off or {}).get(key, Vector((0, 0, 0)))
            woff = (wrist_off or {}).get(key, Vector((0, 0, 0)))
            curl = (paw_curl or {}).get(key, 0.0)
            pd = q(XA, -curl) @ (toe - wr)
            out.append(ik2(rig, pre + 'up.' + sd, pre + 'lo.' + sd, wr + off + woff, pole, pre + 'paw.' + sd, pd))
    return merge(*out)


def quad_walk(rig, P, stride, lift, bob):
    H0 = rig.H['hips']; nd = rig.T['neck'] - rig.H['neck']; hd = rig.T['head'] - rig.H['head']; td = rig.T['tail1'] - rig.H['tail1']
    phase = {'h_L': 0.0, 'f_L': 0.25, 'h_R': 0.5, 'f_R': 0.75}

    def walk(t):
        ph = 2 * math.pi * t
        fo, wo, cu = {}, {}, {}
        for k, o in phase.items():
            dy, dz = foot_cycle(t + o, stride, lift, 0.65)
            fo[k] = Vector((0, dy, dz)); u = math.sin(math.pi * min(1, max(0, ((t + o) % 1 - 0.65) / 0.35)))
            cu[k] = (35 if k[0] == 'f' else -25) * u
            wo[k] = Vector((0, 0, lift * 0.4 * u))
        hip = H0 + Vector((0.01 * math.sin(ph) * stride, 0, bob * math.cos(2 * ph)))
        return quad_pose(rig, P, hip, q(ZA, 2.5 * math.sin(ph)) @ q(YA, 2 * math.sin(ph)), fo, wo, cu,
                         neck=q(XA, 3 * math.cos(2 * ph)) @ nd, head=q(XA, 2 * math.cos(2 * ph + 1)) @ hd,
                         tail=q(ZA, 10 * math.sin(ph)) @ td)
    return walk


def scaled(P, k):
    out = dict(P)
    f = lambda x: [f(y) for y in x] if isinstance(x, (list, tuple)) else (x * k if isinstance(x, float) else x)
    for key in ('body', 'neck', 'skull', 'muzzle', 'ears', 'front', 'fr', 'hind', 'hr', 'tail', 'tr', 'spine'):
        out[key] = f(P[key])
    return out


def dog():
    P = scaled(DOG, 0.88); arm, ob, rig = quadruped(P)
    nd = rig.T['neck'] - rig.H['neck']; hd = rig.T['head'] - rig.H['head']; td = rig.T['tail1'] - rig.H['tail1']; t2 = rig.T['tail2'] - rig.H['tail2']
    walk = quad_walk(rig, P, 0.30, 0.06, 0.008)
    rig.clip('walk', 0.8, walk)

    def idle(t):
        sn = track(t, [(0, 0), (0.3, 0), (0.42, 1), (0.68, 1), (0.8, 0), (1, 0)])
        jit = math.sin(2 * math.pi * t * 14) * sn
        wag = math.sin(2 * math.pi * t * 6)
        return quad_pose(rig, P, rig.H['hips'] + Vector((0, 0, 0.003 * math.sin(2 * math.pi * t * 2))), None,
                         neck=q(XA, 70 * sn) @ nd, head=q(XA, 45 * sn + 3 * jit) @ q(ZA, 6 * math.sin(2 * math.pi * t)) @ hd,
                         tail=q(ZA, 28 * wag) @ td, tail2=q(ZA, 35 * wag) @ t2)
    rig.clip('idle', 3.0, idle)

    def sit(t):
        br = math.sin(2 * math.pi * t)
        fo = {'h_L': Vector((0.012, -0.05, -0.085)), 'h_R': Vector((-0.012, -0.05, -0.085))}
        wo = {}
        cu = {'h_L': 80, 'h_R': 80}
        return quad_pose(rig, P, Vector((0, 0.24, 0.17 + 0.002 * br)), q(XA, -38), fo, wo, cu,
                         neck=Vector((0, -0.45, 1)), head=Vector((0, -1, 0.05)), tail=Vector((0, 1, -0.4)), tail2=Vector((0, 1, -0.1)),
                         chest=Vector((0, -1, 0.75)))
    rig.clip('sit', 1.0, sit)
    rig.default_pose(idle(0))
    print('TRIS dog', tri_count([ob]), 'BONES', len(arm.data.bones))
    export_glb([arm], 'dog')


def buffalo():
    P = BUFFALO; arm, ob, rig = quadruped(P)
    nd = rig.T['neck'] - rig.H['neck']; hd = rig.T['head'] - rig.H['head']; td = rig.T['tail1'] - rig.H['tail1']; t2 = rig.T['tail2'] - rig.H['tail2']
    rig.clip('walk', 1.6, quad_walk(rig, P, 0.62, 0.11, 0.015))

    def idle(t):
        ph = 2 * math.pi * t
        fl = math.sin(ph * 3) * (1 if 0.3 < t < 0.7 else 0.2)
        return quad_pose(rig, P, rig.H['hips'] + Vector((0, 0, 0.006 * math.sin(ph))), None,
                         neck=q(XA, 6 * math.sin(ph) + 8) @ nd, head=q(ZA, 12 * math.sin(ph)) @ q(XA, 3 * math.sin(ph * 6)) @ hd,
                         tail=q(ZA, 22 * fl) @ td, tail2=q(ZA, 30 * fl) @ t2)
    rig.clip('idle', 4.0, idle)
    rig.default_pose(idle(0))
    print('TRIS buffalo', tri_count([ob]), 'BONES', len(arm.data.bones))
    export_glb([arm], 'buffalo')


if __name__ == '__main__':
    for n in args():
        globals()[n]()
