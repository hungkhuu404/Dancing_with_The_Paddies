# People: adult wader, fisher, washer.  usage: blender -b --factory-startup --python build_people.py -- wader [fisher ...]
import os, sys; sys.path.insert(0, os.path.dirname(__file__))
from humans import *

SKIN_M = (0.60, 0.42, 0.30); SKIN_F = (0.70, 0.52, 0.40)
HAIR = (0.045, 0.04, 0.035)


def foot_cycle(p, stride, lift, duty=0.6):
    """in-place gait: returns (dy, dz) of a foot; stance slides front(-Y) -> back(+Y)."""
    p %= 1.0
    if p < duty:
        u = p / duty
        return -stride / 2 + stride * u, 0.0
    u = (p - duty) / (1 - duty)
    return stride / 2 - stride * sm(u), lift * math.sin(math.pi * u)


def bowl(geo, c, R, D, col, bones, segs=18, weights=None):
    prof = [(0.0, -D), (R * 0.45, -D * 0.94), (R * 0.8, -D * 0.6), (R * 0.97, -D * 0.1), (R, 0.0), (R * 1.03, 0.004)]
    vv, ff = [], []
    for i, (r, z) in enumerate(prof):
        for j in range(segs):
            a = 2 * math.pi * j / segs
            vv.append(Vector(c) + Vector((math.cos(a) * r, math.sin(a) * r, z)))
    for i in range(len(prof) - 1):
        for j in range(segs):
            a, b = i * segs + j, i * segs + (j + 1) % segs
            ff.append([a, b, b + segs, a + segs])
    vv = vv[segs - 1:]  # collapse centre ring to one vertex
    ff = [[max(0, k - (segs - 1)) for k in f] for f in ff]
    ff = [list(dict.fromkeys(f)) for f in ff]
    geo.add(vv, ff, col, bones, weights=weights)


# ======================================================================== WADER
def wader():
    reset(); bpy.context.scene.render.fps = FPS
    bc = Vector((0, -0.33, 0.95))
    arm, g, J, s, hc, _ = build_human('wader', H=1.63, skin=SKIN_M, hair=HAIR, shirt=(0.42, 0.32, 0.22), trousers=(0.07, 0.065, 0.06),
                                      sleeves='rolled', legs='rolled', hat='nonla', wet=0.42, seed=1.0,
                                      extra_bones=[('basket', bc, bc + Vector((0, 0, 0.1)), None)])
    bam = col_noise(lin((0.60, 0.47, 0.28)), 0.15, 60, 3)
    bowl(g, bc, 0.215, 0.075, bam, ['basket'], weights={'basket': 1.0})
    ob = finish_human('wader', arm, g, SKIN_M, HAIR)
    rig = Rig(arm)
    an = J['an']; FL = Vector((0.12 * s, -0.10, an.z)); FR = Vector((-0.12 * s, 0.08, an.z))
    hz = J['pelvis'].z

    def hold(C, R):
        return ({'L': C + R @ Vector((0.205, 0.01, 0.012)), 'R': C + R @ Vector((-0.205, 0.01, 0.012))},
                {'L': R @ Vector((0.25, -1, -0.35)), 'R': R @ Vector((-0.25, -1, -0.35))})

    def work(t):
        bend = track(t, [(0, 0), (0.28, 1), (0.5, 1), (0.66, 0.3), (0.85, 0.3), (1, 0)])
        lean = 8 + 66 * bend
        C = track(t, [(0, (0, -0.33, 0.95)), (0.28, (0, -0.52, 0.38)), (0.40, (0, -0.66, 0.30)), (0.50, (0, -0.60, 0.34)),
                      (0.66, (0, -0.42, 0.82)), (0.85, (0, -0.40, 0.84)), (1.0, (0, -0.33, 0.95))])
        sh = math.sin(2 * math.pi * (t - 0.68) / 0.17 * 3) * sm((t - 0.66) / 0.04) * sm((0.87 - t) / 0.04) if 0.66 < t < 0.87 else 0
        C = C + Vector((0.045 * sh, 0, 0.01 * abs(sh)))
        R = q(XA, track(t, [(0, 0), (0.28, 22), (0.40, 26), (0.5, 6), (0.66, 0), (1, 0)])) @ q(YA, 6 * sh)
        hands, hd = hold(C, R)
        hips = Vector((0, 0.07 * bend, hz - 0.15 * bend))
        return hpose(rig, hips, hrot=q(XA, 0.38 * lean), spine=tilt(0.72 * lean), chest=tilt(lean),
                     neck=tilt(lean * 0.75 - 6), head=tilt(max(lean - 30, -4)),
                     hands=hands, elbows={'L': Vector((0.7, 0.6, -0.4)), 'R': Vector((-0.7, 0.6, -0.4))}, hdirs=hd,
                     feet={'L': FL, 'R': FR}, knees={'L': Vector((0.2, -1, 0)), 'R': Vector((-0.2, -1, 0))},
                     extra={'basket': {'loc': C, 'rot': R}})
    rig.clip('work', 3.0, work)

    def walk(t):
        ph = 2 * math.pi * t
        hips = Vector((0.018 * math.sin(ph), 0.0, hz - 0.035 + 0.018 * math.cos(2 * ph)))
        feet = {}
        for sd, sx, o in (('L', 1, 0.0), ('R', -1, 0.5)):
            dy, dz = foot_cycle(t + o, 0.46, 0.17, 0.6)
            feet[sd] = Vector((sx * 0.11 * s, dy - 0.02, an.z + dz))
        Rb = q(ZA, 4 * math.sin(ph)) @ q(YA, 80)
        C = hips + Vector((0.30 * s, 0.03, -0.12))
        return hpose(rig, hips, hrot=q(ZA, 5 * math.sin(ph)) @ q(XA, 6), spine=tilt(9, 0, 0), chest=tilt(12, -1.5 * math.sin(ph)),
                     neck=tilt(4), head=tilt(-2, 0, 3 * math.sin(ph)),
                     hands={'L': C + Rb @ Vector((-0.205, 0.0, 0.0)),
                            'R': lambda h: h + Vector((-0.04, 0.16 * math.sin(ph) - 0.02, -0.50))},
                     elbows={'L': Vector((0.4, 1, 0)), 'R': Vector((-0.3, 1, 0))},
                     hdirs={'L': Vector((0, -0.3, -1))},
                     feet=feet, knees={'L': Vector((0.1, -1, 0.2)), 'R': Vector((-0.1, -1, 0.2))},
                     extra={'basket': {'loc': C, 'rot': Rb}})
    rig.clip('walk', 1.4, walk)
    rig.default_pose(work(0.0))
    print('TRIS wader', tri_count([ob]), 'BONES', len(arm.data.bones))
    export_glb([arm], 'wader')


# ======================================================================== FISHER
def net_tex(n=256, cells=16):
    v, u = (np.mgrid[0:n, 0:n] + 0.5) / n
    fu = (u * cells) % 1; fv = (v * cells) % 1
    line = (np.minimum(fu, 1 - fu) < 0.07) | (np.minimum(fv, 1 - fv) < 0.07)
    a = np.where(line, 0.92, 0.05).astype(np.float32)
    col = np.ones((n, n, 3), np.float32) * np.array([0.74, 0.75, 0.70], np.float32)
    return np_image('net', np.concatenate([col, a[..., None]], -1))


def blend_mat(name, img):
    m = mat_basic(name, img=img, rough=0.8, double=True)
    nt = m.node_tree; tex = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]
    nt.links.new(tex.outputs['Alpha'], nt.nodes['Principled BSDF'].inputs['Alpha'])
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        pass
    return m


def fisher():
    reset(); bpy.context.scene.render.fps = FPS
    NC = Vector((0, -1.5, 0.0))
    extra = [('net', NC, NC + Vector((0, 0, -0.3)), None), ('net_rim', NC, NC + Vector((0, 0, -0.3)), 'net')]
    arm, g, J, s, hc, _ = build_human('fisher', H=1.66, skin=SKIN_M, hair=HAIR, shirt=(0.16, 0.16, 0.19), trousers=(0.09, 0.08, 0.07),
                                      sleeves='rolled', legs='long', hat=None, foot_col=(0.12, 0.09, 0.06), seed=2.0, extra_bones=extra)
    NR, NS, RAD = 8, 32, 1.6
    vv, uv, ff, ww = [NC.copy()], [(NC.x / 0.8, NC.y / 0.8)], [], [{'net': 1.0}]
    for i in range(1, NR + 1):
        r = i / NR
        for j in range(NS):
            a = 2 * math.pi * j / NS
            p = NC + Vector((RAD * r * math.cos(a), RAD * r * math.sin(a), 0))
            vv.append(p); uv.append((p.x / 0.8, p.y / 0.8)); ww.append({'net': 1 - r, 'net_rim': r})
    for j in range(NS):
        ff.append([0, 1 + j, 1 + (j + 1) % NS])
    for i in range(NR - 1):
        for j in range(NS):
            a, b = 1 + i * NS + j, 1 + i * NS + (j + 1) % NS
            ff.append([a, a + NS, b + NS, b])
    o = len(g.V)
    g.add(vv, ff, (1, 1, 1), [], mat=3, uv=uv)
    for k, w in enumerate(ww):
        g.W[o + k] = w
    rimp = [NC + Vector((RAD * math.cos(a), RAD * math.sin(a), 0)) for a in np.linspace(0, 2 * math.pi, 25)]
    v2, f2 = tube(rimp, [0.014] * 25, None, ZA, 4)
    g.add(v2, f2, lin((0.25, 0.25, 0.25)), [], weights={'net_rim': 1.0})
    wrj = Vector((-J['wr'].x, J['wr'].y, J['wr'].z)); hdj = Vector((-J['hd'].x, J['hd'].y, J['hd'].z))
    wr = wrj.lerp(hdj, 0.55)
    rp = [wr.lerp(NC, u) for u in np.linspace(0, 1, 9)]
    v3, f3 = tube(rp, [0.006] * 9, None, ZA, 4)
    o = len(g.V)
    g.add(v3, f3, lin((0.62, 0.56, 0.42)), [])
    for k, p in enumerate(v3):
        u = min(1.0, max(0.0, (p - wr).dot(NC - wr) / (NC - wr).length_squared))
        g.W[o + k] = {'hand.R': 1 - u, 'net': u} if u > 1e-3 else {'hand.R': 1.0}
    m_net = blend_mat('fisher_net', net_tex())
    ob = finish_human('fisher', arm, g, SKIN_M, HAIR, extra_mats=[m_net])
    rig = Rig(arm)
    an = J['an'].z; hz = J['pelvis'].z
    FL = Vector((0.13 * s, -0.16, an)); FR = Vector((-0.14 * s, 0.12, an))
    LAND = Vector((0.25, -4.2, 0.0))
    HOLD_R, HOLD_L = Vector((-0.22, -0.24, 1.0)), Vector((-0.05, -0.32, 1.04))

    def palm(W):
        return W['hand.R'] @ Vector((0, rig.len['hand.R'] * 0.55, 0))

    def body(hR, hL, yaw, lean, hy):
        return hpose(rig, Vector((0, hy, hz - 0.02)), hrot=q(ZA, yaw * 0.4) @ q(XA, lean * 0.2),
                     spine={'rot': q(ZA, yaw * 0.3), 'dir': tilt(lean * 0.6, 0, yaw * 0.7)},
                     chest={'rot': q(ZA, yaw * 0.3), 'dir': tilt(lean, 0, yaw)}, neck=tilt(lean * 0.5), head=tilt(lean * 0.3 - 6),
                     hands={'L': hL, 'R': hR}, elbows={'L': Vector((0.6, 0.6, -1)), 'R': Vector((-0.6, 0.6, -1))},
                     feet={'L': FL, 'R': FR}, knees={'L': Vector((0.25, -1, 0)), 'R': Vector((-0.25, -1, 0))},
                     fdirs={'L': Vector((0.15, -1, -0.35)), 'R': Vector((-0.45, -1, -0.35))})

    def cast_body(t):
        yaw = track(t, [(0, 0), (0.15, 0), (0.42, -50), (0.52, 20), (0.62, 30), (0.8, 8), (1, 0)])
        lean = track(t, [(0, 8), (0.15, 8), (0.42, 2), (0.52, 22), (0.62, 28), (0.8, 14), (1, 10)])
        hy = track(t, [(0, 0), (0.42, 0.05), (0.55, -0.06), (0.8, -0.03), (1, 0)])
        hR = track(t, [(0, HOLD_R), (0.15, HOLD_R), (0.42, (-0.50, 0.22, 1.08)), (0.52, (-0.02, -0.58, 1.38)), (0.62, (0.12, -0.50, 1.18)),
                       (0.8, (-0.12, -0.40, 1.12)), (1, (-0.18, -0.34, 1.08))])
        hL = track(t, [(0, HOLD_L), (0.15, HOLD_L), (0.42, (-0.28, 0.02, 1.12)), (0.52, (0.16, -0.52, 1.32)), (0.62, (0.32, -0.30, 1.08)),
                       (0.8, (0.20, -0.18, 0.98)), (1, (0.20, -0.15, 0.95))])
        return body(hR, hL, yaw, lean, hy)
    REL = palm(rig.solve(cast_body(0.52))[0])

    def with_net(sp, pos, k, h):
        sp['net'] = {'loc': pos, 'scale': (k, 1, k)}
        sp['net_rim'] = {'loc': pos + Vector((0, 0, -h))}
        return sp

    def cast(t):
        sp = cast_body(t)
        if t < 0.52:
            return with_net(sp, palm(rig.solve(sp)[0]), 0.07, 0.85)
        u = min(1.0, (t - 0.52) / 0.24); e = sm(min(1.0, u / 0.75))
        pos = REL.lerp(LAND, u) + Vector((0, 0, 1.3 * 4 * u * (1 - u)))
        k, h = 0.07 + 0.93 * e, 0.85 - 0.72 * e
        if t > 0.76:
            w = sm((t - 0.76) / 0.24); pos = LAND + Vector((0, 0, -0.35 * w)); k = 1 - 0.2 * w; h = 0.13 + 0.32 * w
        return with_net(sp, pos, k, h)
    rig.clip('cast', 3.5, cast)

    def pull_body(t):
        u = min(1.0, t / 0.8); ph = 2 * math.pi * u * 3
        hR = Vector((-0.10, -0.44, 1.0)).lerp(Vector((-0.20, -0.06, 1.16)), 0.5 - 0.5 * math.cos(ph))
        hL = Vector((0.10, -0.44, 1.0)).lerp(Vector((0.16, -0.06, 1.16)), 0.5 + 0.5 * math.cos(ph))
        w = sm((t - 0.8) / 0.2)
        return body(hR.lerp(HOLD_R, w), hL.lerp(HOLD_L, w), 0, (16 + 5 * math.cos(ph)) * (1 - w) + 8 * w, 0.0)

    def pull(t):
        sp = pull_body(t)
        hp = palm(rig.solve(sp)[0])
        u = min(1.0, t / 0.72)
        prog = u + 0.03 * math.sin(2 * math.pi * u * 3)
        pos = Vector((LAND.x, LAND.y, -0.35)).lerp(Vector((0.0, -0.75, -0.30)), prog)
        pos = pos.lerp(hp, sm((t - 0.70) / 0.30))
        k = 0.8 - 0.68 * sm(u) - 0.05 * sm((t - 0.72) / 0.28)
        h = 0.45 + 0.15 * sm(u) + 0.25 * sm((t - 0.72) / 0.28)
        return with_net(sp, pos, k, h)
    rig.clip('pull', 3.0, pull)
    rig.default_pose(cast(0))
    print('TRIS fisher', tri_count([ob]), 'BONES', len(arm.data.bones))
    export_glb([arm], 'fisher')


# ======================================================================== WASHER
def washer():
    reset(); bpy.context.scene.render.fps = FPS
    BC = Vector((0, -0.40, 0.0)); CC = Vector((0, -0.40, 0.10))
    extra = [('basin', BC, BC + Vector((0, 0, 0.1)), None), ('cloth', CC, CC + Vector((0, 0, 0.1)), None)]
    arm, g, J, s, hc, _ = build_human('washer', H=1.54, female=True, skin=SKIN_F, hair=HAIR, shirt=(0.45, 0.32, 0.42), trousers=(0.05, 0.05, 0.06),
                                      sleeves='rolled', legs='long', hat='scarf', seed=3.0, extra_bones=extra)
    # aluminium basin + water + cloth
    prof = [(0.0, 0.006), (0.17, 0.006), (0.22, 0.05), (0.25, 0.12), (0.262, 0.13), (0.245, 0.12), (0.205, 0.05)]
    vv, ff = [], []
    S = 20
    for r, z in prof:
        for j in range(S):
            a = 2 * math.pi * j / S; vv.append(BC + Vector((math.cos(a) * r, math.sin(a) * r, z)))
    for i in range(len(prof) - 1):
        for j in range(S):
            a, b = i * S + j, i * S + (j + 1) % S
            ff.append([a, b, b + S, a + S])
    g.add(vv, ff, lin((0.62, 0.62, 0.60)), [], weights={'basin': 1.0})
    vv, ff = tube([BC + Vector((0, 0, 0.085)), BC + Vector((0, 0, 0.09))], [0.235, 0.235], None, XA, S, False, True)
    g.add(vv, ff, lin((0.42, 0.44, 0.40)), [], weights={'basin': 1.0})
    vv, ff = sphere(CC, 0.07, 4, 8, (1.3, 0.9, 0.55))
    vv = [p + Vector((0, 0, 0.015 * hashn(p, 70))) for p in vv]
    g.add(vv, ff, col_noise(lin((0.25, 0.35, 0.55)), 0.15, 60), [], weights={'cloth': 1.0})
    ob = finish_human('washer', arm, g, SKIN_F, HAIR, female=True, scarf=True)
    for mt in ob.data.materials[:1]:
        pass
    rig = Rig(arm)
    an = J['an'].z
    FL = Vector((0.15 * s, 0.06, an)); FR = Vector((-0.15 * s, 0.06, an))

    def wash(t):
        u = min(1.0, t / 0.6); sc = math.sin(2 * math.pi * u * 3) * (1 - sm((t - 0.55) / 0.06))
        lift = track(t, [(0.58, 0), (0.70, 1), (0.78, 0.15), (0.84, 0.35), (0.92, 0)])
        C = Vector((0, -0.40 + 0.045 * sc, 0.105 + 0.32 * lift))
        R = q(XA, 25 * lift) @ q(ZA, 8 * sc)
        lean = 58 - 18 * lift
        hands = {'L': C + Vector((0.07, 0.02 - 0.03 * sc, 0.035)), 'R': C + Vector((-0.07, 0.02 + 0.03 * sc, 0.035))}
        return hpose(rig, Vector((0, 0.12, 0.40 + 0.02 * lift)), hrot=q(XA, 28), spine=tilt(lean * 0.8), chest=tilt(lean, 0, 3 * sc),
                     neck=tilt(lean * 0.55), head=tilt(lean * 0.35 + 5),
                     hands=hands, elbows={'L': Vector((1, 0.2, -0.6)), 'R': Vector((-1, 0.2, -0.6))},
                     hdirs={'L': Vector((-0.4, -1, -0.6)), 'R': Vector((0.4, -1, -0.6))},
                     feet={'L': FL, 'R': FR}, knees={'L': Vector((0.55, -1, 0.4)), 'R': Vector((-0.55, -1, 0.4))},
                     fdirs={'L': Vector((0.2, -1, -0.35)), 'R': Vector((-0.2, -1, -0.35))},
                     extra={'cloth': {'loc': C, 'rot': R}, 'basin': {'loc': BC}})
    rig.clip('wash', 2.5, wash)
    rig.default_pose(wash(0))
    print('TRIS washer', tri_count([ob]), 'BONES', len(arm.data.bones))
    export_glb([arm], 'washer')


if __name__ == '__main__':
    for n in args():
        if n not in ('wader', 'fisher', 'washer'):
            raise ValueError('Only the three adult person models are supported')
        globals()[n]()
