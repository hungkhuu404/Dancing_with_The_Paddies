# banana.glb, bush.glb, rice_tuft.glb
import bpy, math, random, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *


def banana_texture(seed=4):
    W, H = 512, 256
    rows = []
    for dry in (False, True):
        rng = np.random.default_rng(seed + dry)
        v, u = np.mgrid[0:H, 0:W]; u = (u + 0.5) / W; v = (v + 0.5) / H
        half = 0.48 * np.clip(u * 5, 0, 1) ** 0.5 * np.clip((1 - u) * 7, 0, 1) ** 0.55
        dv = v - 0.5; ad = np.abs(dv)
        a = (ad < half).astype(np.float32)
        a = np.clip((half - ad) * H / 1.5, 0, 1)
        # lateral veins (angled toward the tip)
        ph = (u * 9.0 - ad * 1.6) * 60
        vein = 0.5 + 0.5 * np.cos(ph * 2 * np.pi / 6)
        if dry:
            base = np.array([0.50, 0.40, 0.24]); edge = np.array([0.36, 0.28, 0.17])
        else:
            base = np.array([0.24, 0.42, 0.11]); edge = np.array([0.42, 0.45, 0.16])
        rel = np.clip(ad / np.maximum(half, 1e-3), 0, 1)[..., None]
        c = base * (1 - rel ** 6) + edge * rel ** 6
        c = c * (0.93 + 0.07 * vein[..., None])
        c = c * (0.85 + 0.3 * tile_noise(H, W, (30, 6), seed=seed + 5 + dry)[..., None])
        if dry:
            c = c * (0.75 + 0.4 * tile_noise(H, W, (4, 40), seed=9)[..., None])
        mid = ad < 0.012
        c[mid] = np.array([0.58, 0.6, 0.32]) if not dry else np.array([0.55, 0.47, 0.32])
        # tears along veins from the edge inward
        ntear = 26 if dry else 14
        for k in range(ntear):
            ut = rng.uniform(0.1, 0.95); side = rng.choice([-1, 1]); depth = rng.uniform(0.3, 0.98)
            # tear line: u - ad*1.6/9 = const
            k0 = ut - 0.48 * 1.6 / 9
            line = np.abs((u - ad * 1.6 / 9) - k0) * W
            wid = 0.8 + 3.0 * np.clip((ad / 0.48 - (1 - depth)) / depth, 0, 1)
            cut = (line < wid) & (np.sign(dv) == side) & (ad > 0.48 * (1 - depth) + 0.015)
            a[cut] = 0
        if dry:
            holes = tile_noise(H, W, 10, seed=11) > 0.72
            a[holes] = 0
        meanc = c[a > 0.5].mean(0)
        c = np.where(a[..., None] > 0.01, c, meanc)
        rows.append(np.concatenate([c, a[..., None]], -1))
    return np_image('banana_leaf', np.concatenate(rows, 0).astype(np.float32))


def leaf_card(mb, start, hdir, pitch, L, Wd, g, dry, droop, rng, segs=8):
    pts = []
    for i in range(segs + 1):
        s = L * i / segs
        pts.append(start + hdir * math.cos(pitch) * s + UP * (math.sin(pitch) * s - g * s * s))
    T, _, _ = frames_along(pts)
    V, U, F = [], [], []
    vb = 0.5 if dry else 0.0
    for i, p in enumerate(pts):
        S = T[i].cross(UP)
        if S.length < 1e-3:
            S = hdir.cross(UP)
        S.normalize()
        dn = -(UP - T[i] * UP.dot(T[i])).normalized()
        w = Wd / 2
        row = []
        for k, (f, ang) in enumerate(((-1, droop * 1.6), (-0.5, droop), (0, 0), (0.5, droop), (1, droop * 1.6))):
            off = abs(f)
            q = p + S * (f * w * math.cos(ang)) + dn * (off * w * math.sin(ang) * 1.0)
            row.append(q)
        V += row
        U += [(i / segs, vb + 0.01 + 0.48 * (k / 4)) for k in range(5)]
    for i in range(segs):
        for k in range(4):
            a = i * 5 + k
            F.append([a, a + 5, a + 6, a + 1])
    shade = [(0.6 + 0.4 * min(1, (i // 5) / 3.0),) * 3 for i in range(len(V))]
    mb.add(V, F, U, col=shade)
    return pts[-1]


def banana():
    reset(); rng = random.Random(3)
    tex = banana_texture()
    stems, leaves = MB(), MB()
    plants = [((0, 0), 2.5, 7, 0.12), ((0.55, 0.35), 1.9, 6, 0.1), ((-0.45, 0.4), 1.2, 5, 0.075), ((0.2, -0.5), 0.7, 3, 0.05)]
    for (x, y), h, nl, r in plants:
        base = Vector((x, y, 0)); lean = Vector((x, y, 0)) * 0.12
        pts = [base + lean * (k / 6) ** 2 + UP * (h * k / 6) for k in range(7)]
        rr = [r * (1.35 if k == 0 else 1.0) * (1 - 0.25 * k / 6) for k in range(7)]
        V, F, U = loft(pts, rr, sides=10, cap1=True)
        def scol(i, p):
            n = 0.5 + 0.5 * math.sin(i * 1.7 + p.z * 13) * math.sin(i * 0.37)
            gcol = Vector(lin((0.33, 0.42, 0.16))); bcol = Vector(lin((0.32, 0.24, 0.14)))
            c = gcol.lerp(bcol, 0.35 + 0.5 * n * (1 - p.z / h * 0.6))
            return tuple(c)
        stems.add(V, F, U, col=scol)
        top = pts[-1]
        for k in range(nl):
            dry = k >= nl - (2 if h > 1.5 else 1)
            a = k * 2.4 + rng.uniform(-0.3, 0.3)
            hd = Vector((math.cos(a), math.sin(a), 0))
            if dry:
                # dead leaf hanging down along the stem
                start = top - UP * 0.15 + hd * r
                leaf_card(leaves, start, hd, math.radians(-82), h * 0.75, 0.35, 0.0, True, 0.9, rng, segs=5)
                continue
            age = k / max(1, nl - 1)
            pitch = math.radians(75 - 65 * age + rng.uniform(-8, 8))
            # petiole
            pl = 0.35 + 0.15 * (h / 2.5)
            p_end = top + hd * math.cos(pitch) * pl + UP * math.sin(pitch) * pl
            V, F, U = loft([top - UP * 0.05, p_end], [0.03, 0.02], sides=4)
            stems.add(V, F, U, col=lin((0.42, 0.48, 0.2)))
            L = (1.5 + 1.1 * (h / 2.5)) * rng.uniform(0.85, 1.05)
            leaf_card(leaves, p_end, hd, pitch * 0.85, L, L * 0.3, 0.2 + 0.25 * age, False, math.radians(25 + 30 * age), rng)
    # fruit bunch + bud on the main plant
    top = Vector((0, 0, 2.5)) + Vector((0, 0, 0))
    a = 2.0; hd = Vector((math.cos(a), math.sin(a), 0))
    sp = [top - UP * 0.1, top + hd * 0.25 - UP * 0.05, top + hd * 0.45 - UP * 0.35, top + hd * 0.5 - UP * 0.9, top + hd * 0.48 - UP * 1.2]
    V, F, U = loft(sp, [0.025] * 5, sides=5); stems.add(V, F, U, col=lin((0.4, 0.45, 0.18)))
    bp = [top + hd * 0.47 - UP * (0.4 + 0.06 * k) for k in range(9)]
    br = [0.05, 0.14, 0.17, 0.18, 0.17, 0.16, 0.14, 0.1, 0.05]
    V, F, U = loft(bp, [x * (1 + 0.15 * math.sin(k * 2.2)) for k, x in enumerate(br)], sides=9)
    stems.add(V, F, U, col=lambda i, p: lin((0.30, 0.42, 0.12)) if (i % 3) else lin((0.22, 0.32, 0.08)))
    cp = [sp[-1] - UP * 0.02 * k for k in range(0)] or [sp[-1], sp[-1] - UP * 0.12, sp[-1] - UP * 0.24]
    V, F, U = loft(cp, [0.06, 0.055, 0.005], sides=7, cap0=True); stems.add(V, F, U, col=lin((0.35, 0.08, 0.12)))
    ms = mat_basic('Banana_Stem', rough=0.65)
    ml = mat_basic('Banana_Leaf', img=tex, rough=0.55, alpha_clip=True, double=True)
    os_ = stems.build('banana_stems', [ms]); ol = leaves.build('banana_leaves', [ml])
    vertex_ao([os_], [os_], samples=16, dist=0.6)
    root = bpy.data.objects.new('banana', None); bpy.context.scene.collection.objects.link(root)
    os_.parent = root; ol.parent = root
    print('TRIS banana', tri_count([os_, ol]))
    export_glb([root], 'banana')


def bush_texture(seed=6):
    n = 512
    rng = np.random.default_rng(seed)
    c = np.zeros((n, n, 3), np.float32); a = np.zeros((n, n), np.float32)
    y, x = np.mgrid[0:n, 0:n] + 0.5
    for k in range(420):
        rr_ = n * 0.42 * np.sqrt(rng.uniform(0, 1)); aa_ = rng.uniform(0, 6.283)
        cx, cy = n / 2 + rr_ * np.cos(aa_), n / 2 + rr_ * np.sin(aa_)
        ang = rng.uniform(0, 2 * np.pi); L = rng.uniform(38, 66); Wd = L * rng.uniform(0.38, 0.5)
        dx, dy = np.cos(ang), np.sin(ang)
        px = x - cx; py = y - cy
        s = (px * dx + py * dy) / L; t = (-px * dy + py * dx) / (Wd / 2)
        prof = np.clip(1 - np.abs(s * 2) ** 2, 0, 1) ** 0.6 * (1 - 0.35 * (s > 0) * s * 2)
        m = (np.abs(s) < 0.5) & (np.abs(t) < prof)
        tone = rng.uniform(0.75, 1.25)
        base = np.array([0.20, 0.36, 0.10]) * tone if rng.random() > 0.15 else np.array([0.36, 0.48, 0.16]) * tone
        col = base * (1 + 0.12 * np.sign(t))[..., None]
        vein = np.abs(t) < 0.08
        col = np.where(vein[..., None], col * 1.25, col)
        shade = 0.7 + 0.3 * (k / 420)
        c[m] = (col * shade)[m]; a[m] = 1
    meanc = c[a > 0.5].mean(0)
    c = np.where(a[..., None] > 0, c, meanc)
    return np_image('bush_leaves', np.concatenate([c, a[..., None]], -1))


def bush():
    reset(); rng = random.Random(8)
    tex = bush_texture()
    cards, core = MB(), MB()
    C = Vector((0, 0, 1.0)); R = Vector((1.05, 0.95, 0.9))
    nrm_list = []
    N = 64
    for k in range(N):
        zf = 1 - 2 * (k + 0.5) / N; th = k * 2.39996
        d = Vector((math.sqrt(1 - zf * zf) * math.cos(th), math.sqrt(1 - zf * zf) * math.sin(th), zf))
        if d.z < -0.55:
            d.z = -0.55; d.normalize()
        p = C + Vector((d.x * R.x, d.y * R.y, d.z * R.z)) * rng.uniform(0.6, 0.85)
        s = rng.uniform(1.0, 1.3)
        q = Quaternion(d, rng.uniform(0, 6.28)) @ d.to_track_quat('Z', 'Y')
        corners = [q @ Vector((sx * s / 2, sy * s / 2, 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        V = [p + c for c in corners]
        for v in V:
            if v.z < 0.05:
                v.z = 0.05
        u0 = rng.choice([0, 0.5]); v0 = rng.choice([0, 0.5])
        U = [(0, 0), (1, 0), (1, 1), (0, 1)]
        sh = 0.55 + 0.45 * max(0, (p - C).normalized().z * 0.5 + 0.5)
        cards.add(V, [[0, 1, 2, 3]], U, col=(sh, sh, sh))
        for v in V:
            nrm_list.append(((v - C) * 0.5 + d).normalized())
    V, F, U = loft([C + Vector((0, 0, -0.85)) + Vector((0, 0, 0.17 * k)) for k in range(11)],
                   [x * 0.62 for x in (0.2, 0.55, 0.75, 0.85, 0.9, 0.9, 0.85, 0.75, 0.6, 0.4, 0.05)], sides=10, cap0=True, cap1=True)
    core.add(V, F, U, col=lin((0.05, 0.09, 0.03)))
    for k in range(5):
        a = k * 1.3
        V, F, U = loft([Vector((0.1 * math.cos(a), 0.1 * math.sin(a), 0)), Vector((0.3 * math.cos(a), 0.3 * math.sin(a), 0.5))], [0.03, 0.02], sides=4)
        core.add(V, F, U, col=lin((0.25, 0.2, 0.14)))
    ml = mat_basic('Bush_Leaf', img=tex, rough=0.6, alpha_clip=True, double=True)
    mc = mat_basic('Bush_Core', rough=0.9)
    oc = cards.build('bush_cards', [ml]); oo = core.build('bush_core', [mc])
    oc.data.normals_split_custom_set_from_vertices([tuple(n) for n in nrm_list])
    root = bpy.data.objects.new('bush', None); bpy.context.scene.collection.objects.link(root)
    oc.parent = root; oo.parent = root
    print('TRIS bush', tri_count([oc, oo]))
    export_glb([root], 'bush')


def rice():
    reset(); rng = random.Random(2)
    mb = MB()
    for k in range(26):
        a = rng.uniform(0, 6.28); r = rng.uniform(0, 0.06)
        b = Vector((r * math.cos(a), r * math.sin(a), 0))
        tilt = Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(0.02, 0.08)
        h = rng.uniform(0.14, 0.3)
        V, F, U = loft([b, b + tilt + UP * h], [0.004, 0.0035], sides=3, cap1=True)
        cc = rng.choice([(0.62, 0.52, 0.3), (0.55, 0.45, 0.26), (0.7, 0.6, 0.38), (0.45, 0.4, 0.22)])
        mb.add(V, F, U, col=lin(cc), smooth=False)
    for k in range(20):
        a = rng.uniform(0, 6.28); r = rng.uniform(0, 0.05)
        b = Vector((r * math.cos(a), r * math.sin(a), 0))
        out = Vector((math.cos(a), math.sin(a), 0))
        L = rng.uniform(0.28, 0.52); pitch = math.radians(rng.uniform(55, 82)); bend = rng.uniform(0.3, 0.9)
        pts = []
        for i in range(5):
            s = L * i / 4
            pts.append(b + out * math.cos(pitch) * s + UP * (math.sin(pitch) * s - bend * 0.5 * s * s))
        side = out.cross(UP).normalized()
        V = []
        for i, p in enumerate(pts):
            w = 0.006 * (1 - i / 4) + 0.0005
            V += [p - side * w, p + side * w]
        F = [[2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2] for i in range(4)]
        g = rng.choice([(0.25, 0.45, 0.1), (0.32, 0.52, 0.12), (0.22, 0.38, 0.1)])
        C = [tuple(x * (0.55 + 0.45 * (i // 2) / 4) for x in lin(g)[:3]) for i in range(len(V))]
        mb.add(V, F, col=C)
    m = mat_basic('Rice_Tuft', rough=0.7, double=True)
    o = mb.build('rice_tuft', [m])
    print('TRIS rice', tri_count([o]))
    export_glb([o], 'rice_tuft')


for w in (args() or ['banana', 'bush', 'rice']):
    {'banana': banana, 'bush': bush, 'rice': rice}[w]()
