# Coconut palms palm_a / palm_b.
import bpy, math, random, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- textures
def frond_texture(seed=3):
    W, H = 1024, 256
    LEN = 4.6  # metres of frond covered by u in [0,1]
    rows = []
    for dry in (False, True):
        rng = np.random.default_rng(seed + dry)
        rgb = np.zeros((H, W, 3), np.float32); al = np.zeros((H, W), np.float32)
        X = (np.arange(W) + 0.5) / W * LEN; Y = (np.arange(H) + 0.5) / H
        xm, ym = np.meshgrid(X, Y)
        s = 0.0
        while s < LEN:
            s += rng.uniform(0.05, 0.072) * (1.15 if dry else 1.0)
            t = s / LEN
            if dry and rng.random() < 0.18:
                continue
            th = math.radians(rng.uniform(48, 60))
            vt = rng.uniform(0.86, 0.95) * (rng.uniform(0.45, 0.95) if (rng.random() < (0.25 if dry else 0.07)) else 1.0)
            ln = vt / math.sin(th)
            curv = rng.uniform(0.004, 0.014)  # sideways bow (m)
            wid = rng.uniform(0.024, 0.032) * (0.7 if dry else 1.0) * (0.75 + 0.25 * math.sin(math.pi * min(1, t * 1.2)))
            bx, by = s, 0.03
            dx, dy = math.cos(th), math.sin(th)
            x0, x1 = bx - 0.1, bx + ln * dx + 0.1
            i0 = max(0, int(x0 / LEN * W)); i1 = min(W, int(x1 / LEN * W) + 1)
            if i1 <= i0:
                continue
            px = xm[:, i0:i1] - bx; py = ym[:, i0:i1] - by
            sa = px * dx + py * dy                # along leaflet
            sd = -px * dy + py * dx               # perpendicular
            tt = np.clip(sa / ln, 0, 1)
            sd = sd - curv * (tt ** 2) * 4 * (1 - tt * 0.5)
            ww = wid * np.clip(tt / 0.04, 0.35, 1) * (1 - tt) ** 0.55 + 0.003
            inside = (sa > 0) & (sa < ln)
            a = np.clip((ww / 2 - np.abs(sd)) / 0.004 + 0.5, 0, 1) * inside
            if dry:
                base = np.array([0.56, 0.45, 0.30]) * rng.uniform(0.75, 1.1)
                tip = np.array([0.62, 0.55, 0.42])
            else:
                base = np.array([0.29, 0.40, 0.12]) * rng.uniform(0.82, 1.12)
                tip = np.array([0.50, 0.50, 0.18]) * rng.uniform(0.9, 1.1)
            c = base[None, None, :] * (1 - tt[..., None] ** 2.5) + tip[None, None, :] * tt[..., None] ** 2.5
            side = np.where(sd > 0, 1.08, 0.88)[..., None]
            vein = (np.abs(sd) < ww * 0.1)[..., None]
            c = c * side
            c = np.where(vein, c * 1.25 + 0.03, c)
            m = a > al[:, i0:i1]
            rgb[:, i0:i1][m] = c[m]; al[:, i0:i1] = np.maximum(al[:, i0:i1], a)
        # fill transparent texels with average leaf colour (clean mip fringes)
        meanc = rgb[al > 0.5].mean(0)
        rgb = np.where(al[..., None] > 0.01, rgb, meanc)
        n = tile_noise(H, W, (40, 40), seed=7)[..., None]
        rgb *= 0.88 + 0.24 * n
        rows.append(np.concatenate([rgb, al[..., None]], -1))
    return np_image('palm_frond', np.concatenate(rows, 0))


def trunk_textures():
    H, W = 512, 256   # 2 m tall x 1 m around
    v = np.arange(H)[:, None] / H; u = np.arange(W)[None, :] / W
    wav = 0.012 * np.sin(2 * np.pi * (u + 0.3)) + 0.006 * np.sin(4 * np.pi * u + 1.0)
    rings = 20
    ph = (v * rings + wav * rings) % 1.0
    groove = np.exp(-((ph - 0.5) / 0.06) ** 2)
    band = np.exp(-((ph - 0.62) / 0.12) ** 2)
    cracks = tile_noise(H, W, (60, 3), seed=4)
    blot = tile_noise(H, W, (90, 60), seed=5)
    hgt = -groove * 1.0 + band * 0.35 - (cracks < 0.38) * 0.4 + tile_noise(H, W, 6, seed=6) * 0.3
    base = np.array([0.47, 0.42, 0.36])
    c = base * (0.85 + 0.3 * blot[..., None])
    c = c * (1 - 0.55 * groove[..., None]) * (1 + 0.08 * band[..., None])
    c = np.where((cracks < 0.38)[..., None], c * 0.72, c)
    lich = (tile_noise(H, W, 25, seed=8) > 0.66)[..., None]
    c = np.where(lich, c * 0.6 + np.array([0.68, 0.67, 0.6]) * 0.4, c)
    return np_image('palm_trunk_col', c.astype(np.float32)), np_image('palm_trunk_nrm', normal_from_height(hgt.astype(np.float32), 3.0), noncolor=True)


# ---------------------------------------------------------------- palm
def build_palm(name, H, lean, curve, nfronds, ncoco, seed, dry=2):
    rng = random.Random(seed)
    trunk_mb, misc_mb, frond_mb = MB(), MB(), MB()
    # trunk path
    n = int(H / 0.25)
    pts = []
    az = math.radians(rng.uniform(0, 360))
    for i in range(n + 1):
        t = i / n
        t2 = max(0.0, (H * t - 0.4) / (H - 0.4))  # vertical first 0.4 m
        f = t2 ** 1.4 if curve == 'gentle' else 1 - (1 - t2) ** 2.2
        off = lean * f
        wig = 0.12 * math.sin(t2 * 5.5 + seed) - 0.12 * math.sin(seed)
        pts.append(Vector((math.cos(az) * off - math.sin(az) * wig, math.sin(az) * off + math.cos(az) * wig, H * t)))

    def rad(t, z):
        r = 0.15 - 0.03 * t + 0.012 * math.sin(t * 9 + seed)
        r += 0.14 * math.exp(-z / 0.18)
        r *= 1 + 0.03 * math.sin(t * 61)
        if t > 0.96:
            r *= 1 + (t - 0.96) * 3
        return r
    radii = [rad(i / n, p.z) for i, p in enumerate(pts)]
    V, F, U = loft(pts, radii, sides=10, vscale=0.5)

    def tcol(i, p):
        z = p.z
        moss = 1 - smooth(0.0, 1.6, z)
        top = smooth(H - 1.6, H - 0.2, z)
        c = np.array([1.0, 1.0, 1.0]) * (1 - 0.25 * moss) + np.array([-0.08, 0.02, -0.1]) * moss
        c = c * (1 - 0.15 * top) + np.array([0.06, 0.0, -0.06]) * top
        return tuple(c)
    trunk_mb.add(V, F, U, col=tcol)
    top = pts[-1]; Ttop = (pts[-1] - pts[-3]).normalized()

    # crown boot (frond bases)
    bp = [top - Ttop * 0.35 + Ttop * 0.12 * k for k in range(7)]
    br = [0.17, 0.24, 0.29, 0.30, 0.27, 0.2, 0.08]
    V, F, U = loft(bp, br, sides=10, cap1=True)
    misc_mb.add(V, F, U, col=lambda i, p: lin((0.42 + 0.05 * math.sin(i), 0.36, 0.2)))

    # fronds
    crown = top + Ttop * 0.25
    ga = math.radians(137.5)
    total = nfronds + dry
    for k in range(total):
        isdry = k >= nfronds
        age = k / max(1, nfronds - 1) if not isdry else 1.2
        a = k * ga + rng.uniform(-0.15, 0.15)
        hdir = Vector((math.cos(a), math.sin(a), 0))
        if isdry:
            pitch = math.radians(rng.uniform(-80, -65)); L = rng.uniform(3.6, 4.2); g = 0.0
        else:
            pitch = math.radians(52 - 80 * age + rng.uniform(-6, 6))
            L = 3.4 + 1.8 * math.sin(math.pi * min(1, 0.25 + age * 0.75)) + rng.uniform(-0.2, 0.2)
            g = 0.07 + 0.09 * age
        start = crown + hdir * (0.12 + 0.05 * age) - UP * (0.08 * age * 3 if not isdry else 0.5)
        ns = 10
        rp = []
        for i in range(ns + 1):
            s = L * i / ns
            rp.append(start + hdir * (math.cos(pitch) * s) + UP * (math.sin(pitch) * s - g * s * s))
        # rachis
        rr = [0.035 * (1 - i / ns) ** 1.5 + 0.006 for i in range(ns + 1)]
        V, F, U = loft(rp, rr, sides=3, up_hint=UP)
        rc = (0.36, 0.30, 0.18) if isdry else (0.34, 0.37, 0.16)
        misc_mb.add(V, F, U, col=lin(rc))
        # leaf halves
        cum = [0.0]
        for i in range(1, ns + 1):
            cum.append(cum[-1] + (rp[i] - rp[i - 1]).length)
        i0 = 2  # bare petiole
        s0 = cum[i0]; Ltot = cum[-1]
        T, _, _ = frames_along(rp)
        wmax = rng.uniform(1.0, 1.15) * (0.75 if isdry else 1.0)
        d1 = math.radians(22 + 30 * min(age, 1) + (20 if isdry else 0))
        d2 = d1 + math.radians(18)
        d3 = d2 + math.radians(15)
        vb = 0.5 if isdry else 0.0
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
                p0 = rp[i]
                p1 = p0 + S * (w / 3) * math.cos(d1) + dn * (w / 3) * math.sin(d1)
                p2 = p1 + S * (w / 3) * math.cos(d2) + dn * (w / 3) * math.sin(d2)
                p3 = p2 + S * (w / 3) * math.cos(d3) + dn * (w / 3) * math.sin(d3)
                V += [p0, p1, p2, p3]
                u = t * (Ltot - s0) / 4.6
                U += [(u, vb + 0.0), (u, vb + 0.165), (u, vb + 0.33), (u, vb + 0.495)]
                shade = (0.55 + 0.45 * smooth(0.0, 0.4, t)) * (0.8 + 0.2 * (1 - min(age, 1)))
                C += [(shade * 0.85,) * 3, (shade,) * 3, (shade,) * 3, (shade,) * 3]
            for i in range(ns - i0):
                a_ = i * 4
                for j in range(3):
                    q = [a_ + j, a_ + j + 1, a_ + j + 5, a_ + j + 4]
                    F.append(q if side > 0 else q[::-1])
            frond_mb.add(V, F, U, col=C)

    # coconuts
    for c in range(ncoco):
        a = rng.uniform(0, 2 * math.pi) if c % 4 == 0 else a + rng.uniform(0.35, 0.6)
        h = Vector((math.cos(a), math.sin(a), 0))
        ctr = top - Ttop * rng.uniform(0.05, 0.35) + h * rng.uniform(0.32, 0.42)
        rx = rng.uniform(0.11, 0.13)
        pp = [ctr + UP * (rx * 1.25 * (k / 6 - 0.5) * 2) for k in range(7)]
        rr = [rx * math.sin(math.pi * k / 6) ** 0.8 + 0.001 for k in range(7)]
        V, F, U = loft(pp, rr, sides=8, cap0=True, cap1=True)
        col = rng.choice([(0.30, 0.38, 0.10), (0.36, 0.42, 0.12), (0.48, 0.42, 0.14), (0.42, 0.32, 0.14)])
        misc_mb.add(V, F, U, col=lin(col))

    trunk_img, trunk_nrm = TEX_TRUNK
    m_tr = mat_basic('Palm_Trunk', img=trunk_img, nrm=trunk_nrm, rough=0.9)
    m_ms = mat_basic('Palm_Misc', rough=0.65)
    m_fr = mat_basic('Palm_Frond', img=TEX_FROND, rough=0.6, alpha_clip=True, double=True)
    ot = trunk_mb.build(name + '_trunk', [m_tr])
    om = misc_mb.build(name + '_misc', [m_ms])
    of = frond_mb.build(name + '_fronds', [m_fr])
    vertex_ao([ot, om], [ot, om], samples=24, dist=1.2, ground=True)
    root = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(root)
    for o in (ot, om, of):
        o.parent = root
    print('TRIS', name, tri_count([ot, om, of]))
    return root


for nm, kw in (('palm_a', dict(H=10.0, lean=1.3, curve='gentle', nfronds=22, ncoco=7, seed=11)),
               ('palm_b', dict(H=7.4, lean=2.9, curve='canal', nfronds=21, ncoco=10, seed=23, dry=3))):
    reset()
    TEX_FROND = frond_texture()
    TEX_TRUNK = trunk_textures()
    r = build_palm(nm, **kw)
    export_glb([r], nm)
