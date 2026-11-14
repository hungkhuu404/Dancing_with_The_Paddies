# Vegetation set for the Tan Hoi flood-season world. Usage: blender -b --factory-startup --python build_veg.py -- [names...]
# Blender Z-up here; glTF export converts to +Y up. Front = glTF +Z = Blender -Y.
import bpy, math, random, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from vegtex import *


def sm(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)


class MBN(MB):
    """MB + per-vertex custom normals (foliage cards)."""
    def __init__(self):
        super().__init__(); self.n = []

    def build(self, name, mats, **kw):
        ob = super().build(name, mats, **kw)
        ob.data.normals_split_custom_set_from_vertices([tuple(n) for n in self.n])
        return ob


def colvar(rng, a=0.18, h=0.07):
    t = rng.uniform(1 - a, 1.0); hh = rng.uniform(-h, h)
    c = (t * (1 + hh), t, t * (1 - 1.5 * hh)); m = max(c)
    return tuple(x / m * t for x in c) if m > 1 else c


def strip(mb, centers, dw, W, cell, cols=1, cup=0.0, col=(1, 1, 1), nout=None, nblend=0.6, nref=None):
    """Card along a polyline of row centres. W: scalar or per-row widths. UV: row 0 = bottom of atlas cell."""
    centers = [Vector(c) for c in centers]
    dl = (centers[-1] - centers[0]).normalized()
    dw = Vector(dw); dw = (dw - dl * dw.dot(dl)).normalized()
    n = dw.cross(dl)
    ref = nref if nref is not None else nout
    if ref is not None and n.dot(ref) < 0:
        dw = -dw; n = -n
    Ws = W if hasattr(W, '__len__') else [W] * len(centers)
    cu, cv, su, sv = cell; mu, mv = su * 0.012, sv * 0.012
    rows = len(centers) - 1
    nn = n if nout is None else (n * (1 - nblend) + Vector(nout).normalized() * nblend).normalized()
    V, U = [], []
    for i, c in enumerate(centers):
        s = i / rows
        for k in range(cols + 1):
            f = k / cols * 2 - 1
            V.append(c + dw * (f * Ws[i] / 2) + n * (cup * Ws[i] * 0.5 * (abs(f) - 0.5)))
            U.append((cu + mu + (su - 2 * mu) * k / cols, cv + mv + (sv - 2 * mv) * s))
    S = cols + 1
    F = [[i * S + k, i * S + k + 1, (i + 1) * S + k + 1, (i + 1) * S + k] for i in range(rows) for k in range(cols)]
    mb.add(V, F, U, col=[tuple(col)] * len(V))
    mb.n += [nn] * len(V)


def card(mb, p0, dl, dw, L, W, cell, rows=2, droop=0.0, **kw):
    dl = Vector(dl).normalized()
    cs = [p0 + dl * (L * i / rows) - UP * (droop * (i / rows) ** 2) for i in range(rows + 1)]
    strip(mb, cs, dw, W, cell, **kw)


def vol_ao(P, C, R, density, samples=24, chunk=4000):
    """Sky transmittance through a cloud of foliage spheres (C centres, R radii): mean exp(-density * path)."""
    P = np.asarray(P, np.float64); C = np.asarray(C, np.float64); R2 = np.asarray(R, np.float64) ** 2
    dirs = np.array([tuple(d) for d in hemi_dirs(samples, seed=5)])
    out = np.zeros(len(P))
    for c0 in range(0, len(P), chunk):
        oc = P[c0:c0 + chunk, None, :] - C[None]
        cc = (oc * oc).sum(-1) - R2[None]
        acc = np.zeros(len(oc))
        for d in dirs:
            b = oc @ d; disc = b * b - cc
            sq = np.sqrt(np.maximum(disc, 0))
            seg = np.where(disc > 0, np.maximum(-b + sq - np.maximum(-b - sq, 0), 0), 0)
            acc += np.exp(-density * seg.sum(1))
        out[c0:c0 + chunk] = acc / len(dirs)
    return out


def mb_ao(mb, ao):
    mb.col = [tuple(x * a for x in c[:3]) for c, a in zip(mb.col, ao)]


def mb_pts(mb):
    return np.array([tuple(v) for v in mb.v])


def along(pts, s):
    f = s * (len(pts) - 1); i = min(int(f), len(pts) - 2); t = f - i
    return pts[i].lerp(pts[i + 1], t), (pts[i + 1] - pts[i]).normalized()


def finish_asset(name, parts):
    root = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(root)
    for o in parts:
        o.parent = root
    print('TRIS', name, tri_count(parts))
    export_glb([root], name)


def frond(fmb, rmb, start, hdir, pitch, L, g, wmax, age, isdry, texlen, ns=10, i0=2, strips=3, dangs=(22, 18, 15),
          rach_r=0.035, rach_col=(0.34, 0.37, 0.16), rsides=3, age_droop=30):
    """Pinnate frond after build_palms: rachis tube + two leaflet sheets mapped on a tex_frond atlas (row 0 green, row 1 dry)."""
    rp = []
    for i in range(ns + 1):
        s = L * i / ns
        rp.append(start + hdir * (math.cos(pitch) * s) + UP * (math.sin(pitch) * s - g * s * s))
    rr = [rach_r * (1 - i / ns) ** 1.5 + 0.006 for i in range(ns + 1)]
    V, F, U = loft(rp, rr, sides=rsides, up_hint=UP)
    rmb.add(V, F, U, col=lin(rach_col))
    cum = [0.0]
    for i in range(1, ns + 1):
        cum.append(cum[-1] + (rp[i] - rp[i - 1]).length)
    s0 = cum[i0]; Ltot = cum[-1]
    T, _, _ = frames_along(rp)
    d = [math.radians(dangs[0] + age_droop * min(age, 1) + (20 if isdry else 0))]
    for j in range(1, strips):
        d.append(d[-1] + math.radians(dangs[j]))
    vb = 0.5 if isdry else 0.0
    st = strips + 1
    for side in (1, -1):
        V, U, F, C = [], [], [], []
        for i in range(i0, ns + 1):
            t = (cum[i] - s0) / (Ltot - s0)
            w = wmax * max(0.1, math.sin(math.pi * (0.1 + 0.9 * t)) ** 0.6 * (1 - 0.25 * t))
            S = T[i].cross(UP)
            if S.length < 1e-3:
                S = hdir.cross(UP)
            S = S.normalized() * side
            dn = -(UP - T[i] * UP.dot(T[i])).normalized()
            p = rp[i]; V.append(p)
            for j in range(strips):
                p = p + S * (w / strips) * math.cos(d[j]) + dn * (w / strips) * math.sin(d[j]); V.append(p)
            u = t * (Ltot - s0) / texlen
            U += [(u, vb + 0.495 * j / strips) for j in range(st)]
            shade = (0.6 + 0.4 * sm(0.0, 0.4, t)) * (0.82 + 0.18 * (1 - min(age, 1)))
            C += [(shade * 0.85,) * 3] + [(shade,) * 3] * strips
        for i in range(ns - i0):
            a = i * st
            for j in range(strips):
                q = [a + j, a + j + 1, a + j + 1 + st, a + j + st]
                F.append(q if side > 0 else q[::-1])
        fmb.add(V, F, U, col=C)
    return rp


# ================================================================ 1. bamboo clump
def bamboo():
    reset(); rng = random.Random(7)
    T_leaf = tex_bamboo_leaves(); T_culm, T_cn = tex_culm()
    culm, leaf = MB(), MBN()
    cen, rad = [], []
    for k in range(32):
        young = k >= 26
        r = 0.8 * math.sqrt(rng.random()); a = rng.uniform(0, 2 * math.pi)
        base = Vector((r * math.cos(a), r * math.sin(a), 0))
        az = a + rng.uniform(-0.5, 0.5) if r > 0.15 else rng.uniform(0, 2 * math.pi)
        H = rng.uniform(3.0, 5.5) if young else rng.uniform(8.5, 12.0)
        tilt0 = math.radians(rng.uniform(1, 6) + 12 * r)
        arch = math.radians(rng.uniform(55, 95)) * min(1, H / 10)
        segs = 8; Lc = H * 1.08
        pts = []; p = base.copy()
        for i in range(segs + 1):
            pts.append(p.copy()); s = i / segs
            th = tilt0 + arch * s ** 3
            p = p + Vector((math.cos(az) * math.sin(th), math.sin(az) * math.sin(th), math.cos(th))) * (Lc / segs)
        r0 = rng.uniform(0.045, 0.06) * (H / 10) ** 0.5
        radii = [r0 * (1 - 0.8 * i / segs) * (1.15 if i == 0 else 1) + 0.005 for i in range(segs + 1)]
        V, F, U = loft(pts, radii, sides=5, vscale=0.5, phase=rng.uniform(0, 6))
        tone = rng.uniform(0.72, 1.0); ac = (tone, tone * rng.uniform(0.95, 1.0), tone * rng.uniform(0.7, 1.0))
        culm.add(V, F, U, col=lambda i, p, ac=ac: tuple(c * (0.55 + 0.45 * sm(0, 3.0, p.z)) for c in ac))
        s = 0.22 if not young else 0.35
        while s < 1.0:
            pos, T = along(pts, s)
            saz = az + rng.choice([-1, 1]) * rng.uniform(0.5, 2.3)
            hor = Vector((math.cos(saz), math.sin(saz), 0))
            pitch = math.radians(rng.uniform(5, 40) + 30 * s)
            dl = hor * math.cos(pitch) - UP * math.sin(pitch)
            L = rng.uniform(1.3, 1.9) * (1 - 0.3 * s) * (0.7 if young else 1.0)
            ck = 2 if (s < 0.5 and rng.random() < 0.55) else rng.choice([0, 1])
            o = Vector((pos.x, pos.y, 0)); o = (o.normalized() if o.length > 0.2 else hor) + UP * 0.6
            card(leaf, pos, dl, hor.cross(UP), L, L * 0.78, CELL[ck], rows=2, droop=0.12 * L, col=colvar(rng), nout=o.normalized(), nblend=0.4)
            cen.append(pos + dl * L * 0.5); rad.append(L * 0.55)
            s += rng.uniform(0.025, 0.04)
    for k in range(34):   # dense twiggy base
        a = rng.uniform(0, 2 * math.pi); r = rng.uniform(0.2, 1.1)
        hor = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((r * math.cos(a), r * math.sin(a), rng.uniform(0.0, 1.6)))
        dl = (hor * rng.uniform(0.3, 0.8) + UP).normalized()
        L = rng.uniform(1.3, 2.0)
        card(leaf, p0, dl, hor.cross(UP), L, L * 0.9, CELL[3], rows=1, col=colvar(rng, 0.25), nout=(hor + UP * 0.3).normalized(), nblend=0.5)
        cen.append(p0 + dl * L * 0.5); rad.append(L * 0.5)
    for mb, fl in ((leaf, 0.3), (culm, 0.25)):
        P = mb_pts(mb)
        ao = vol_ao(P, cen, rad, 0.5)
        ao = fl + (1 - fl) * ao * (0.6 + 0.4 * np.clip(P[:, 2] / 3.0, 0, 1))
        mb_ao(mb, ao)
    mc = mat_basic('Bamboo_Culm', img=T_culm, nrm=T_cn, rough=0.45)
    ml = mat_basic('Bamboo_Leaf', img=T_leaf, rough=0.6, alpha_clip=True, double=True)
    finish_asset('bamboo', [culm.build('bamboo_culms', [mc]), leaf.build('bamboo_leaves', [ml])])


# ================================================================ 2. melaleuca (tram)
def tram():
    reset(); rng = random.Random(11)
    T_leaf = tex_tram_leaves(); T_bark, T_bn = tex_tram_bark()
    wood, leaf = MB(), MBN()
    cen, rad = [], []
    H = 10.0
    n = 20
    tp = [Vector((0.18 * math.sin(i / n * 2.6 + 0.4) - 0.07 + 0.05 * math.sin(i * 1.3), 0.12 * math.sin(i / n * 1.9), H * i / n)) for i in range(n + 1)]
    tr = [0.12 * (1 - 0.85 * p.z / H) + 0.02 + 0.09 * math.exp(-p.z / 0.35) for p in tp]
    V, F, U = loft(tp, tr, sides=8, vscale=0.5)
    wood.add(V, F, U)

    def foliage_on(pts, n_cards, Lr=(1.0, 1.5), s0=0.3):
        for c in range(n_cards):
            s = s0 + (1 - s0) * (c + rng.random()) / n_cards
            pos, T = along(pts, s)
            rnd = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.6)))
            dl = (T * 0.6 + rnd * 0.7 + UP * 0.35).normalized()
            L = rng.uniform(*Lr)
            o = Vector((pos.x, pos.y, 0)); o = (o.normalized() if o.length > 0.15 else rnd.normalized()) + UP * 0.5
            card(leaf, pos - dl * 0.1, dl, Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)), L, L * 0.85,
                 CELL[3 if rng.random() < 0.12 else rng.choice([0, 1, 2])], rows=2, droop=0.22 * L, col=colvar(rng, 0.15),
                 nout=o.normalized(), nblend=0.3)
            cen.append(pos + dl * L * 0.5); rad.append(L * 0.5)

    nb = 14
    for b in range(nb):
        f = b / (nb - 1)
        z = 3.8 + 5.4 * f + rng.uniform(-0.2, 0.2)
        az = b * 2.39996 + rng.uniform(-0.3, 0.3)
        hor = Vector((math.cos(az), math.sin(az), 0))
        th0 = math.radians(rng.uniform(42, 58) - 18 * f)
        Lb = (2.5 - 1.3 * f) * rng.uniform(0.85, 1.15)
        st, _ = along(tp, z / H)
        bp = []; p = st.copy()
        for i in range(6):
            bp.append(p.copy()); th = th0 * (1 - 0.45 * i / 5)
            p = p + (hor * math.sin(th) + UP * math.cos(th)) * (Lb / 5)
        r0 = 0.045 * (Lb / 2.2) + 0.01
        V, F, U = loft(bp, [r0 * (1 - 0.75 * i / 5) for i in range(6)], sides=5, vscale=0.5)
        wood.add(V, F, U)
        foliage_on(bp, int(6 + 7 * Lb), s0=0.25)
        for sb in range(2 if Lb > 1.3 else 1):   # side branchlets
            q, T = along(bp, 0.35 + 0.3 * sb)
            a2 = az + rng.choice([-1, 1]) * 0.8
            h2 = Vector((math.cos(a2), math.sin(a2), 0))
            sp = [q, q + (h2 * 0.5 + UP * 0.5) * 0.6 * Lb * 0.5, q + (h2 * 0.6 + UP * 0.9) * 0.6 * Lb]
            V, F, U = loft(sp, [r0 * 0.5, r0 * 0.35, r0 * 0.2], sides=4, vscale=0.5)
            wood.add(V, F, U)
            foliage_on(sp, 7, s0=0.2)
    top = [tp[int(n * 0.82)], tp[n]]
    foliage_on(top, 16, Lr=(0.9, 1.3), s0=0.0)
    P = mb_pts(wood)
    ao = 0.3 + 0.7 * vol_ao(P, cen, rad, 0.6)
    flood = np.array([1 - 0.38 * (1 - sm(0.78, 0.92, z)) for z in P[:, 2]])
    ao = ao * flood * (0.75 + 0.25 * np.clip(P[:, 2] / 1.5, 0, 1))
    wood.col = [(a * 0.97, a * 0.95, a * 0.9) if z < 0.85 else (a, a, a) for a, z in zip(ao, P[:, 2])]
    P = mb_pts(leaf)
    mb_ao(leaf, 0.35 + 0.65 * vol_ao(P, cen, rad, 0.6))
    mw = mat_basic('Tram_Bark', img=T_bark, nrm=T_bn, rough=0.85)
    ml = mat_basic('Tram_Leaf', img=T_leaf, rough=0.7, alpha_clip=True, double=True)
    finish_asset('tram', [wood.build('tram_wood', [mw]), leaf.build('tram_leaves', [ml])])


# ================================================================ 3. areca palm (cau)
def areca():
    reset(); rng = random.Random(21)
    T_fr = tex_frond('areca_frond', 2.3, (0.045, 0.06), (40, 55), (0.85, 0.95), (0.05, 0.07), (0.30, 0.44, 0.13), (0.50, 0.52, 0.20), seed=5)
    T_tr, T_tn = tex_areca_trunk()
    trunk, misc, fr = MB(), MB(), MB()
    H = 11.6; n = 24
    tp = [Vector((0.16 * (i / n) ** 2 + 0.02 * math.sin(i * 0.9), 0.04 * math.sin(i / n * 3), H * i / n)) for i in range(n + 1)]
    rr = [0.082 - 0.014 * p.z / H + 0.045 * math.exp(-p.z / 0.22) + 0.003 * math.sin(p.z * 3) for p in tp]
    V, F, U = loft(tp, rr, sides=8, vscale=0.5)
    # base darker/mossy; top 2.5 m (newest rings) greener
    trunk.add(V, F, U, col=lambda i, p: tuple(np.array((1, 1, 0.95)) * (0.62 + 0.38 * sm(0, 2.0, p.z)) + np.array((-0.05, 0.02, -0.06)) * sm(H - 2.5, H, p.z)))
    T = (tp[-1] - tp[-3]).normalized()
    cs = [tp[-1] + T * (0.17 * k) for k in range(8)]
    V, F, U = loft(cs, [0.08, 0.098, 0.108, 0.112, 0.11, 0.1, 0.082, 0.05], sides=8, cap1=True)
    misc.add(V, F, U, col=lambda i, p: lin((0.34 + 0.03 * math.sin(i), 0.50, 0.14)))
    crown = cs[-1]
    ga = math.radians(137.5)
    for k in range(12):
        isdry = k == 11
        age = k / 10 if not isdry else 1.2
        a = k * ga + rng.uniform(-0.2, 0.2)
        hd = Vector((math.cos(a), math.sin(a), 0))
        if k == 0:   # spear leaf
            pitch, L, g = math.radians(84), 1.6, 0.02
        elif isdry:
            pitch, L, g = math.radians(-72), 1.9, 0.0
        else:
            pitch = math.radians(64 - 70 * age + rng.uniform(-5, 5)); L = rng.uniform(2.2, 2.7); g = 0.14 + 0.14 * age
        st = crown - T * (0.05 + 0.1 * min(age, 1)) + hd * 0.05 - (UP * 0.5 if isdry else UP * 0)
        frond(fr, misc, st, hd, pitch, L, g, 0.78 if k else 0.15, age, isdry, 2.3, ns=10, i0=1, strips=3, dangs=(34, 26, 22),
              rach_r=0.03, rach_col=(0.40, 0.46, 0.16) if not isdry else (0.42, 0.34, 0.2), age_droop=25)
    for b in range(2):   # nut bunches below the crownshaft
        a = 0.8 + b * 2.6; hd = Vector((math.cos(a), math.sin(a), 0))
        c0 = tp[-1] + hd * 0.12 - UP * 0.05
        V, F, U = loft([c0, c0 + hd * 0.2 - UP * 0.15, c0 + hd * 0.26 - UP * 0.5], [0.02, 0.015, 0.01], sides=4)
        misc.add(V, F, U, col=lin((0.52, 0.48, 0.28)))
        bp = [c0 + hd * 0.25 - UP * (0.12 + 0.08 * k) for k in range(7)]
        V, F, U = loft(bp, [0.03, 0.09, 0.11, 0.11, 0.1, 0.07, 0.02], sides=7, cap0=True, cap1=True)
        misc.add(V, F, U, col=lambda i, p, b=b: lin((0.36, 0.46, 0.12) if (i + b) % 4 else (0.70, 0.46, 0.12)))
    for mb in (trunk, misc):
        P = mb_pts(mb)
        mb_ao(mb, 0.4 + 0.6 * vol_ao(P, [crown + UP * 0.3], [1.6], 0.9))
    mt = mat_basic('Areca_Trunk', img=T_tr, nrm=T_tn, rough=0.8)
    mm = mat_basic('Areca_Misc', rough=0.4)
    mf = mat_basic('Areca_Frond', img=T_fr, rough=0.55, alpha_clip=True, double=True)
    finish_asset('areca', [trunk.build('areca_trunk', [mt]), misc.build('areca_misc', [mm]), fr.build('areca_fronds', [mf])])


# ================================================================ 4. mango
def mango():
    reset(); rng = random.Random(31)
    T_leaf = tex_mango_leaves(); T_bark, T_bn = tex_mango_bark()
    wood, leaf, core = MB(), MBN(), MB()
    C0 = Vector((0, 0, 4.9)); CR = Vector((3.5, 3.4, 2.45))
    # lobes on a shrunken crown shell
    lobes = [(C0 + Vector((0, 0, 0.3)), 2.0)]
    NL = 17
    for k in range(NL):
        zf = 1 - 2 * (k + 0.5) / NL; zf = max(zf, -0.45); th = k * 2.39996
        d = Vector((math.sqrt(1 - zf * zf) * math.cos(th), math.sqrt(1 - zf * zf) * math.sin(th), zf))
        c = C0 + Vector((d.x * CR.x, d.y * CR.y, d.z * CR.z)) * rng.uniform(0.5, 0.62)
        lobes.append((c, rng.uniform(1.45, 1.95)))
    LC = [l[0] for l in lobes]; LR = [l[1] for l in lobes]
    # trunk + limbs, sub-branches aimed at the lobes
    tp = [Vector((0.06 * math.sin(i), 0.04 * i / 6, 2.0 * i / 6)) for i in range(7)]
    V, F, U = loft(tp, [0.42, 0.3, 0.26, 0.25, 0.25, 0.26, 0.27], sides=10, vscale=0.5)
    wood.add(V, F, U)
    limbs = []
    for k in range(4):
        az = k * math.pi / 2 + rng.uniform(-0.4, 0.4); hor = Vector((math.cos(az), math.sin(az), 0))
        th0 = math.radians(rng.uniform(38, 55)); L = rng.uniform(2.6, 3.3)
        p = tp[-1] - UP * rng.uniform(0, 0.3) + hor * 0.1; pts = []
        for i in range(7):
            pts.append(p.copy()); th = th0 * (1 - 0.4 * i / 6)
            p = p + (hor * math.sin(th) + UP * math.cos(th)) * (L / 6)
        V, F, U = loft(pts, [0.19 * (1 - 0.7 * i / 6) for i in range(7)], sides=7, vscale=0.5)
        wood.add(V, F, U); limbs.append(pts)
    for c, r in lobes[1:]:
        best = min(((pt - c).length, li, j) for li, pts in enumerate(limbs) for j, pt in enumerate(pts[2:], 2))
        st = limbs[best[1]][best[2]]
        mid = st.lerp(c, 0.5) + UP * 0.3
        V, F, U = loft([st, mid, c], [0.07, 0.05, 0.025], sides=5, vscale=0.5)
        wood.add(V, F, U)
    # leaf cards on lobe surfaces
    for li, (c, r) in enumerate(lobes):
        ncard = int(48 * (r / 1.7) ** 2) if li else 20
        for k in range(ncard):
            d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
            if d.z < -0.5 and rng.random() < 0.6:
                d.z = -d.z * 0.5; d.normalize()
            p = c + d * r * rng.uniform(0.78, 1.0)
            if p.z < 2.2:
                continue
            hidden = any((p - c2).length < r2 * 0.62 for j, (c2, r2) in enumerate(lobes) if j != li)
            if hidden and li:
                continue
            g = (p - C0); g = Vector((g.x / CR.x ** 2, g.y / CR.y ** 2, g.z / CR.z ** 2)).normalized()
            nrm = (d + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.6).normalized()
            t1 = nrm.cross(UP if abs(nrm.z) < 0.9 else Vector((1, 0, 0))).normalized()
            t2 = nrm.cross(t1)
            ang = rng.uniform(0, 2 * math.pi)
            dl = t1 * math.cos(ang) + t2 * math.sin(ang); dw = nrm.cross(dl)
            L = rng.uniform(1.0, 1.35)
            ck = 3 if (p.z > C0.z + 1.2 and rng.random() < 0.25) else rng.choice([0, 1, 2])
            card(leaf, p - dl * L * 0.5, dl, dw, L, L, CELL[ck], rows=2, droop=0.12, col=colvar(rng, 0.2), nout=(d * 0.55 + g * 0.45).normalized(), nblend=0.75, nref=nrm)
    # dark inner core so the crown never reads as see-through
    rings, sides = 8, 14; V, F = [], []
    for i in range(rings + 1):
        phi = math.pi * i / rings
        for j in range(sides):
            th = 2 * math.pi * j / sides
            d = Vector((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th), math.cos(phi)))
            V.append(C0 + Vector((d.x * CR.x, d.y * CR.y, d.z * CR.z)) * (0.6 + 0.05 * math.sin(th * 3 + phi * 4)))
    for i in range(rings):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            F.append([a, a + sides, b + sides, b])
    core.add(V, F, col=lin((0.05, 0.09, 0.03)))
    for mb, fl, dens in ((leaf, 0.22, 0.5), (wood, 0.2, 0.5), (core, 0.3, 0.25)):
        P = mb_pts(mb)
        mb_ao(mb, fl + (1 - fl) * vol_ao(P, LC, LR, dens))
    mw = mat_basic('Mango_Bark', img=T_bark, nrm=T_bn, rough=0.9)
    ml = mat_basic('Mango_Leaf', img=T_leaf, rough=0.62, alpha_clip=True, double=True)
    mc = mat_basic('Mango_Core', rough=1.0, spec=0.1)
    finish_asset('mango', [wood.build('mango_wood', [mw]), leaf.build('mango_leaves', [ml]), core.build('mango_core', [mc])])


# ================================================================ 5. nipa palm (dua nuoc)
def nipa():
    reset(); rng = random.Random(41)
    T_fr = tex_frond('nipa_frond', 4.0, (0.06, 0.08), (36, 46), (0.9, 0.97), (0.06, 0.08), (0.28, 0.42, 0.12), (0.42, 0.48, 0.16), seed=9, stiff=True)
    rach, fr = MB(), MB()
    plants = [((0, 0), 7, 1.0), ((1.2, 0.5), 6, 0.85), ((-1.0, 0.7), 5, 0.8), ((0.4, -1.1), 4, 0.7)]
    for (x, y), nf, sc in plants:
        b = Vector((x, y, -0.35))
        a0 = rng.uniform(0, 6.28)
        for k in range(nf + 1):
            isdry = k == nf
            a = a0 + k * 2.39996 + rng.uniform(-0.2, 0.2)
            hd = Vector((math.cos(a), math.sin(a), 0))
            age = k / max(1, nf - 1) if not isdry else 1.2
            if isdry:
                pitch, L, g = math.radians(rng.uniform(18, 30)), 3.2 * sc, 0.08
            else:
                pitch = math.radians(80 - 22 * age + rng.uniform(-4, 4)); L = rng.uniform(5.2, 6.4) * sc; g = 0.03 + 0.03 * age
            frond(fr, rach, b + hd * 0.1, hd, pitch, L, g, 0.95 * sc, age, isdry, 4.0, ns=8, i0=3, strips=2, dangs=(10, 22),
                  rach_r=0.07 * sc, rach_col=(0.42, 0.44, 0.20) if not isdry else (0.40, 0.32, 0.2), rsides=4, age_droop=15)
    rach.col = [tuple(c[i] * (0.45 + 0.55 * sm(-0.3, 0.6, p.z)) for i in range(3)) for c, p in zip(rach.col, rach.v)]
    fr.col = [tuple(c[i] * (0.55 + 0.45 * sm(0.0, 2.0, p.z)) for i in range(3)) for c, p in zip(fr.col, fr.v)]
    mr = mat_basic('Nipa_Rachis', rough=0.5)
    mf = mat_basic('Nipa_Frond', img=T_fr, rough=0.4, alpha_clip=True, double=True)
    finish_asset('nipa', [rach.build('nipa_rachis', [mr]), fr.build('nipa_fronds', [mf])])


# ================================================================ 6. water hyacinth mat (luc binh)
def hyacinth():
    reset(); rng = random.Random(51)
    T = tex_hyacinth()
    leaf = MBN()
    ros = []
    for t in range(4000):
        p = Vector((rng.uniform(-1.5, 1.5), rng.uniform(-1.0, 1.0), 0))
        if (p.x / 1.5) ** 2 + (p.y / 1.0) ** 2 > 1 - 0.15 * math.sin(math.atan2(p.y, p.x) * 3) ** 2:
            continue
        if all((p - q).length > 0.33 for q in ros):
            ros.append(p)
    cen, rad = [], []
    for ri, c in enumerate(ros):
        edge = math.hypot(c.x / 1.5, c.y / 1.0)
        sc = rng.uniform(0.85, 1.15) * (1.1 - 0.35 * edge)
        nl = rng.randint(6, 8); a0 = rng.uniform(0, 6.28)
        cen.append(c + UP * 0.15 * sc); rad.append(0.3 * sc)
        for k in range(nl):
            a = a0 + k * 2.39996 + rng.uniform(-0.25, 0.25); hor = Vector((math.cos(a), math.sin(a), 0))
            old = rng.random() < 0.1 + 0.15 * edge
            L = rng.uniform(0.28, 0.42) * sc * (0.8 if old else 1.0)
            p1 = math.radians(rng.uniform(15, 28) if old else rng.uniform(42, 70))
            p2 = min(math.radians(86), p1 + math.radians(rng.uniform(10, 25)))
            b = c + hor * 0.03 + UP * 0.01
            m = b + (hor * math.cos(p1) + UP * math.sin(p1)) * L * 0.47
            t_ = m + (hor * math.cos(p2) + UP * math.sin(p2)) * L * 0.53
            ck = 3 if old else rng.choice([0, 1])
            strip(leaf, [b, m, t_], hor.cross(UP), [L * 0.62, L * 0.62, L * 0.62], CELL[ck], cols=2, cup=-0.25,
                  col=colvar(rng, 0.15, 0.05), nout=(hor * 0.6 + UP).normalized(), nblend=0.35)
    flowers = rng.sample(range(len(ros)), min(5, len(ros)))
    for fi in flowers:
        c = ros[fi]; h = rng.uniform(0.45, 0.6); a = rng.uniform(0, 3.14)
        for j in range(2):
            dw = Vector((math.cos(a + j * math.pi / 2), math.sin(a + j * math.pi / 2), 0))
            card(leaf, c + UP * 0.05, UP + Vector((rng.uniform(-.1, .1), rng.uniform(-.1, .1), 0)), dw, h, h * 0.5, CELL[2], rows=1,
                 col=(1, 1, 1), nout=(dw.cross(UP) + UP * 0.5).normalized(), nblend=0.3)
    P = mb_pts(leaf)
    ao = vol_ao(P, cen, rad, 2.0)
    mb_ao(leaf, (0.35 + 0.65 * ao) * (0.55 + 0.45 * np.clip(P[:, 2] / 0.3, 0, 1)))
    ml = mat_basic('Hyacinth_Leaf', img=T, rough=0.3, alpha_clip=True, double=True)
    finish_asset('hyacinth', [leaf.build('hyacinth_leaves', [ml])])


# ================================================================ 7. rice straw stack (dong rom)
def straw_pile():
    reset(); rng = random.Random(61)
    T_c, T_n = tex_straw(); T_w = tex_straw_wisps()
    dome, wisp, pole = MB(), MBN(), MB()
    prof = [(0, 1.62), (0.2, 1.8), (0.55, 1.9), (0.95, 1.86), (1.35, 1.7), (1.7, 1.45), (2.05, 1.1), (2.35, 0.72), (2.58, 0.38), (2.72, 0.14), (2.78, 0.0)]
    sides = 26; V, U, Fc = [], [], []
    arc = 0.0
    nrm_out = []
    for i, (z, r) in enumerate(prof):
        if i:
            arc += math.hypot(z - prof[i - 1][0], r - prof[i - 1][1])
        for j in range(sides + 1):
            th = 2 * math.pi * j / sides
            d = Vector((math.cos(th), math.sin(th), 0))
            p = d * r + UP * z
            nz = mathutils.noise.noise(p * 0.9 + Vector((3.1, 1.7, 0.5)))
            p = p + (d * 0.9 + UP * 0.3).normalized() * (0.12 * nz) * (1 if r > 0.05 else 0) - UP * (0.06 * nz * (z / 2.8))
            V.append(p); U.append((j / sides * 7.0, arc / 1.5))
    for i in range(len(prof) - 1):
        for j in range(sides):
            a = i * (sides + 1) + j; S = sides + 1
            Fc.append([a, a + 1, a + S + 1, a + S])
    dome.add(V, Fc, U, col=lambda i, p: tuple(np.array((1.0, 1.0, 1.0)) * (1 - 0.3 * sm(1.4, 2.7, p.z)) * np.array((1, 0.98, 1 + 0.08 * sm(1.4, 2.7, p.z)))
                                                * (np.array((0.82, 0.74, 0.62)) if p.z < 0.25 else 1)))
    dob = dome.build('straw_dome', [mat_basic('Straw', img=T_c, nrm=T_n, rough=0.92, nrm_strength=1.2)])
    vertex_ao([dob], [dob], samples=24, dist=1.5, ground=True, strength=1.1)
    # pole + twisted cap
    V, F, U = loft([Vector((0.03, 0.02, 2.0)), Vector((0.05, 0.03, 3.3))], [0.045, 0.03], sides=6, cap1=True)
    pole.add(V, F, U, col=lin((0.30, 0.24, 0.17)))
    V, F, U = loft([Vector((0, 0, 2.62)), Vector((0.02, 0, 2.8)), Vector((0.04, 0.02, 2.98))], [0.3, 0.17, 0.06], sides=8)
    pole.add(V, F, U, col=lin((0.48, 0.40, 0.26)))
    # hanging wisps on the surface + loose straw on the ground
    me = dob.data
    for k in range(0):   # surface wisps read as tassels; ground straw only
        z = rng.uniform(0.2, 0.75)   # only a ragged skirt near the base
        th = rng.uniform(0, 2 * math.pi)
        r = np.interp(z, [p[0] for p in prof], [p[1] for p in prof]) + 0.06
        d = Vector((math.cos(th), math.sin(th), 0))
        hit = dob.ray_cast(d * (r + 1.0) + UP * z, -d)
        if not hit[0]:
            continue
        p, n = hit[1], hit[2]
        down = (-UP + n * n.dot(UP)).normalized() if abs(n.z) < 0.98 else d
        dl = (down * 0.85 + n * 0.25).normalized()
        L = rng.uniform(0.3, 0.6)
        ck = (0.0, 0, 0.5, 1) if rng.random() < 0.6 else (0.5, 0, 0.5, 1)
        card(wisp, p - dl * 0.08 * L + n * 0.015, dl, n.cross(dl), L, L * 0.55, ck, rows=2, droop=0.05, col=colvar(rng, 0.2),
             nout=n, nblend=0.6)
    for k in range(16):
        th = rng.uniform(0, 2 * math.pi); hor = Vector((math.cos(th), math.sin(th), 0))
        L = rng.uniform(0.6, 1.1)
        p0 = hor * rng.uniform(1.45, 1.75) + UP * 0.02
        dl = (hor + hor.cross(UP) * rng.uniform(-0.6, 0.6)).normalized()
        card(wisp, p0, dl, dl.cross(UP), L, L * 0.7, (0.5, 0, 0.5, 1), rows=1, col=colvar(rng, 0.2), nout=UP, nblend=0.7, nref=UP)
    wisp.v = [Vector((v.x, v.y, max(v.z, 0.01))) for v in wisp.v]  # keep hanging wisps above ground
    wob = wisp.build('straw_wisps', [mat_basic('Straw_Wisp', img=T_w, rough=0.9, alpha_clip=True, double=True)])
    pob = pole.build('straw_pole', [mat_basic('Straw_Pole', rough=0.85)])
    vertex_ao([wob, pob], [dob], samples=16, dist=1.0, ground=True)
    finish_asset('straw_pile', [dob, wob, pob])


# ================================================================ 8. canal-edge reeds
def reeds():
    reset(); rng = random.Random(71)
    T = tex_plume()
    bl, pl = MB(), MBN()

    def blade(b, out, L, pitch, bend, w, dry):
        side = out.cross(UP).normalized(); tw = rng.uniform(-0.5, 0.5)
        V, C = [], []
        g0 = Vector(lin((0.30, 0.44, 0.12) if rng.random() > 0.3 else (0.38, 0.48, 0.16))[:3]) * rng.uniform(0.8, 1.0)
        tipc = Vector(lin((0.62, 0.54, 0.32))[:3]) if dry else g0 * 1.15
        basec = Vector(lin((0.55, 0.55, 0.34))[:3])
        for i in range(5):
            s = L * i / 4; f = i / 4
            p = b + out * math.cos(pitch) * s + UP * (math.sin(pitch) * s - bend * s * s)
            sd = (side * math.cos(tw * f) + UP * math.sin(tw * f) * 0.3).normalized()
            ww = w * (1 - f) ** 0.7 if i < 4 else 0
            ao = 0.45 + 0.55 * sm(0, 0.6, p.z)
            c = basec.lerp(g0, sm(0, 0.3, f)).lerp(tipc, sm(0.55, 1.0, f) if dry else f * 0.4) * ao
            if i < 4:
                V += [p - sd * ww / 2, p + sd * ww / 2]; C += [tuple(c)] * 2
            else:
                V.append(p); C.append(tuple(c))
        F = [[0, 1, 3, 2], [2, 3, 5, 4], [4, 5, 7, 6], [6, 7, 8]]
        bl.add([Vector((v.x, v.y, max(v.z, 0.0))) for v in V], F, col=C)
    for k in range(66):
        a = rng.uniform(0, 2 * math.pi); r = 0.12 * math.sqrt(rng.random())
        b = Vector((r * math.cos(a), r * math.sin(a), 0))
        out = Vector((math.cos(a + rng.uniform(-0.6, 0.6)), math.sin(a + rng.uniform(-0.6, 0.6)), 0))
        blade(b, out, rng.uniform(0.5, 1.05), math.radians(rng.uniform(55, 84)), rng.uniform(0.25, 0.9), rng.uniform(0.012, 0.02), rng.random() < 0.35)
    for k in range(6):
        a = rng.uniform(0, 2 * math.pi); r = 0.07 * rng.random()
        b = Vector((r * math.cos(a), r * math.sin(a), 0)); lean = Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(0.05, 0.18)
        h = rng.uniform(0.85, 1.0)
        pts = [b, b + lean * 0.3 + UP * h * 0.5, b + lean + UP * h]
        V, F, U = loft(pts, [0.006, 0.005, 0.003], sides=3)
        bl.add(V, F, U, col=lin((0.50, 0.50, 0.28)))
        for j in range(2):
            q = pts[0].lerp(pts[1], 0.4 + 0.5 * j)
            aa = a + rng.uniform(1, 5)
            blade(q, Vector((math.cos(aa), math.sin(aa), 0)), rng.uniform(0.3, 0.45), math.radians(rng.uniform(30, 55)), 0.6, 0.014, rng.random() < 0.4)
        ck = (0.0, 0, 0.5, 1) if k % 2 else (0.5, 0, 0.5, 1)
        T_ = (pts[2] - pts[1]).normalized()
        for j in range(2):
            dw = Vector((math.cos(a + j * math.pi / 2), math.sin(a + j * math.pi / 2), 0))
            card(pl, pts[2] - T_ * 0.12, T_, dw, rng.uniform(0.38, 0.48), 0.2, ck, rows=1, droop=0.0, col=(1, 1, 1), nout=(dw.cross(T_) + UP * 0.3).normalized(), nblend=0.3)
    mb = mat_basic('Reed_Blade', rough=0.65, double=True)
    mp = mat_basic('Reed_Plume', img=T, rough=0.85, alpha_clip=True, double=True)
    finish_asset('reeds', [bl.build('reed_blades', [mb]), pl.build('reed_plumes', [mp])])


import mathutils
ALL = {'bamboo': bamboo, 'tram': tram, 'areca': areca, 'mango': mango, 'nipa': nipa, 'hyacinth': hyacinth, 'straw_pile': straw_pile, 'reeds': reeds}
for w in (args() or list(ALL)):
    ALL[w]()
