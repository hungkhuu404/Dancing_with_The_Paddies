# jars, clothesline, hammock.  Blender Z-up; glTF front +Z == Blender -Y; origin at base centre.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *


def jar(k, c, h, r, lid=False):
    c = Vector(c)
    zs = [0, 0.06, 0.18, 0.32, 0.46, 0.6, 0.72, 0.82, 0.89, 0.94, 1.0]
    rs = [0.6, 0.74, 0.9, 0.98, 1.0, 0.95, 0.83, 0.66, 0.53, 0.5, 0.54]
    rim = lambda i, p: (1.25, 1.1, 0.95) if p.z > c.z + h * 0.86 else (1, 1, 1)
    k.tube([c + Vector((0, 0, h * z)) for z in zs], [r * x for x in rs], 'Glaze', rim, sides=13)
    ri = r * 0.44
    k.tube([c + Vector((0, 0, h * 0.88)), c + Vector((0, 0, h))], [ri * 1.05, r * 0.54], 'Glaze', L(0.6, 0.6, 0.6), sides=13, inside=True)  # same direction as the shell so rings align  # inner neck
    if lid:
        k.tube([c + Vector((0, 0, h * 1.0)), c + Vector((0, 0, h + 0.02)), c + Vector((0, 0, h + 0.05)), c + Vector((0, 0, h + 0.07))],
               [r * 0.58, r * 0.58, r * 0.3, 0.03], 'Metal', L(0.85, 0.85, 0.85), sides=13, cap1=True)
        k.tube([c + Vector((0, 0, h + 0.07)), c + Vector((0, 0, h + 0.1))], 0.025, 'Metal', L(0.6, 0.6, 0.6), sides=6, cap1=True)
    else:
        k.poly([c + Vector((ri * math.cos(a), ri * math.sin(a), h * 0.9)) for a in [2 * math.pi * i / 13 for i in range(13)]], 'Dark', L(0.03, 0.035, 0.03))


def jars():
    reset(); k = Kit()
    jar(k, (-0.42, 0.18, 0), 0.92, 0.36, lid=True)
    jar(k, (0.42, 0.22, 0), 0.86, 0.34)
    jar(k, (0.0, -0.45, 0), 0.72, 0.29)
    obs = finish([(k, 'jars_mesh')], 'jars', ao_dist=0.4, ao_samples=20)
    root = root_empty('jars', obs)
    done('jars', root, obs)


def cloth(k, rects, col, x0, ztop, seed):
    """rects in (u,v) metres relative to the hanging point (v down). Gentle wave so it isn't a flat card."""
    m = k.mark(); rng = random.Random(seed)
    for (u0, v0, w, h) in rects:
        k.grid((x0 + u0, 0, ztop - v0), (w, 0, 0), (0, 0, -h), 'Fabric', col, nu=max(1, round(w / 0.12)), nv=max(1, round(h / 0.15)))
    ph = rng.uniform(0, 6)
    for i in range(m, k.mark()):
        p = k.mb.v[i]
        k.mb.v[i] = p + Vector((0, 0.03 * math.sin(ph + 9 * p.x) * min(1, (ztop - p.z) * 3) + 0.02 * (ztop - p.z), 0))


def clothesline():
    reset(); k = Kit(); rng = random.Random(14)
    W = L(0.75, 0.68, 0.6)
    for sx in (-1, 1):
        k.tube([Vector((sx * 2.0, 0, 0)), Vector((sx * 2.02, 0.02, 1.0)), Vector((sx * 1.97, 0, 1.9))], [0.05, 0.045, 0.038], 'Wood', W, sides=6, cap1=True)
    zl = lambda x: 1.8 - 0.14 * (1 - (x / 2.0) ** 2)
    k.tube([Vector((x, 0, zl(x))) for x in np.linspace(-2.0, 2.0, 11)], 0.005, 'Rope', L(0.4, 0.4, 0.4), sides=3)
    items = [
        (-1.35, [(-0.25, 0, 0.5, 0.62), (-0.42, 0, 0.17, 0.22), (0.25, 0, 0.17, 0.22)], L(0.35, 0.45, 0.62)),   # shirt
        (-0.55, [(-0.2, 0, 0.4, 0.18), (-0.2, 0.18, 0.18, 0.72), (0.02, 0.18, 0.18, 0.72)], L(0.12, 0.12, 0.14)),  # trousers
        (0.2, [(-0.22, 0, 0.44, 0.62)], L(0.9, 0.88, 0.84)),                                                   # towel
        (0.85, [(-0.24, 0, 0.48, 0.56), (-0.4, 0, 0.16, 0.18), (0.24, 0, 0.16, 0.18)], L(0.62, 0.22, 0.2)),    # shirt
        (1.45, [(-0.3, 0, 0.6, 0.85)], L(0.42, 0.55, 0.35)),                                                   # sarong / cloth
    ]
    for i, (x, rects, col) in enumerate(items):
        cloth(k, rects, col, x, zl(x) - 0.01, i)
        for dx in (-0.15, 0.15):
            k.box((x + dx, 0, zl(x + dx) + 0.005), (0.015, 0.025, 0.06), 'Wood', L(0.85, 0.8, 0.7))   # pegs
    obs = finish([(k, 'clothesline_mesh')], 'clothesline', ao_dist=0.3, ao_samples=12)
    root = root_empty('clothesline', obs)
    done('clothesline', root, obs)


def hammock():
    reset(); k = Kit()
    W = L(0.72, 0.65, 0.56)
    for sx in (-1, 1):
        k.tube([Vector((sx * 1.6, 0, 0)), Vector((sx * 1.6, 0, 1.85))], [0.07, 0.06], 'Wood', W, sides=7, cap1=True)
    nu, nv = 14, 6
    stripes = [L(0.62, 0.16, 0.12), L(0.85, 0.7, 0.25), L(0.2, 0.42, 0.3), L(0.85, 0.7, 0.25), L(0.62, 0.16, 0.12), L(0.2, 0.42, 0.3)]
    def P(t, v):
        x = -1.1 + 2.2 * t
        w = 0.04 + 0.42 * math.sin(math.pi * t) ** 0.7
        z = 1.0 - 0.48 * math.sin(math.pi * t) + 0.16 * (v * v) * (w / 0.46)
        return Vector((x, v * w, z))
    for j in range(nv):
        v0 = -1 + 2 * j / nv; v1 = -1 + 2 * (j + 1) / nv
        V, F, U = [], [], []
        for i in range(nu + 1):
            t = i / nu
            V += [P(t, v0), P(t, v1)]
            U += [(t * 2.2 / 0.3, (j / nv) * 0.9 / 0.3), (t * 2.2 / 0.3, ((j + 1) / nv) * 0.9 / 0.3)]
        F = [[2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1] for i in range(nu)]
        k.add(V, F, U, 'Fabric', stripes[j])
    for sx in (-1, 1):
        e = Vector((sx * 1.1, 0, 1.0)); top = Vector((sx * 1.6, 0, 1.55))
        k.tube([top, e], 0.01, 'Rope', L(0.55, 0.5, 0.4), sides=4)
        tie = top
        k.tube([tie + Vector((sx * 0.0, 0, 0.08)), tie + Vector((sx * 0.08, 0, 0)), tie + Vector((0, 0, -0.06))], 0.012, 'Rope', L(0.55, 0.5, 0.4), sides=4)
        for v in (-1, -0.33, 0.33, 1):
            k.tube([e, P(0.06 if sx < 0 else 0.94, v)], 0.006, 'Rope', L(0.55, 0.5, 0.4), sides=3)
    obs = finish([(k, 'hammock_mesh')], 'hammock', ao_dist=0.3, ao_samples=12)
    root = root_empty('hammock', obs)
    done('hammock', root, obs)


FN = {'jars': jars, 'clothesline': clothesline, 'hammock': hammock}
for n in (args() or list(FN)):
    FN[n]()
