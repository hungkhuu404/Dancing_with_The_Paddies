# Parametric rural Vietnamese person: skeleton (17 bones) + skinned mesh (body vcol, head texture, nón lá).
from life_common import *

BASE = dict(pelvis=(0, 0, 0.93), spine=(0, 0, 1.03), chest=(0, 0, 1.19), neck=(0, 0.01, 1.405), headb=(0, 0.0, 1.49),
            top=(0, 0.0, 1.665), sh=(0.175, 0.01, 1.375), el=(0.20, 0.03, 1.09), wr=(0.215, 0.0, 0.85),
            hd=(0.222, -0.01, 0.68), hip=(0.088, 0.0, 0.885), kn=(0.094, -0.015, 0.485), an=(0.098, 0.02, 0.085),
            toe=(0.10, -0.12, 0.02))
TORSO_M = [(0.755, 0.192, 0.148), (0.80, 0.184, 0.140), (0.88, 0.170, 0.128), (0.97, 0.156, 0.112), (1.05, 0.152, 0.106),
           (1.14, 0.160, 0.112), (1.23, 0.170, 0.118), (1.31, 0.174, 0.115), (1.355, 0.168, 0.106), (1.39, 0.140, 0.090), (1.415, 0.092, 0.07),
           (1.432, 0.062, 0.058)]
TORSO_F = [(0.755, 0.200, 0.150), (0.80, 0.194, 0.144), (0.88, 0.178, 0.130), (0.97, 0.150, 0.104), (1.05, 0.140, 0.100),
           (1.14, 0.148, 0.112), (1.21, 0.158, 0.124), (1.29, 0.160, 0.112), (1.345, 0.160, 0.100), (1.385, 0.122, 0.080),
           (1.42, 0.062, 0.056)]


def head_tex(name, skin, hair, female=False, scarf=False, n=512):
    v, u = (np.mgrid[0:n, 0:n] + 0.5) / n
    ph = u * 360 - 180; th = v * 180 - 90; aph = np.abs(ph)
    nz = tile_noise(n, n, 40, seed=11)
    col = np.array(skin)[None, None, :] * (0.94 + 0.12 * nz[..., None])
    # warm cheeks / lips area
    ch = np.exp(-(((aph - 34) / 14) ** 2 + ((th + 14) / 10) ** 2))
    col *= (1 + 0.06 * ch)[..., None] * np.array([1.0, 0.94, 0.92])[None, None, :] ** ch[..., None]
    # brows
    bc = 13.0 + 1.6 * (1 - ((aph - 19) / 12) ** 2)
    brow = (aph > 7) & (aph < 31) & (np.abs(th - bc) < 1.5 + 0.5 * (aph < 18))
    col[brow] = col[brow] * 0.25 + np.array(hair) * 0.75
    # eyes
    e = ((aph - 19) / 7.5) ** 2 + ((th - 3.0) / 2.4) ** 2
    col[e < 1] = np.array([0.70, 0.64, 0.58])
    iris = ((aph - 18.5) / 2.6) ** 2 + ((th - 3.0) / 2.6) ** 2 < 1
    col[iris & (e < 1)] = np.array([0.07, 0.05, 0.04])
    lid = (e < 1.9) & (e >= 0.7) & (th > 3.0)
    col[lid] *= 0.45
    col[(e > 1) & (e < 2.6) & (th < 3)] *= 0.88
    # nostrils + mouth
    nos = ((aph - 4.5) / 2.2) ** 2 + ((th + 18.5) / 1.6) ** 2 < 1
    col[nos] *= 0.45
    lip = (aph < 10.5 - 0.0) & (th > -34.5) & (th < -27.5) & (((aph / 10.5) ** 2 + ((th + 31) / 3.5) ** 2) < 1)
    col[lip] = col[lip] * 0.55 + np.array([0.52, 0.27, 0.25]) * 0.45
    col[(aph < 10) & (np.abs(th + 30.6) < 0.7)] *= 0.55
    # hair / scarf
    if scarf:
        hl = np.interp(aph, [0, 35, 60, 90, 115, 180], [32, 30, 18, -6, -30, -46])
        chk = ((np.floor(u * 110) + np.floor(v * 55)) % 2).astype(np.float32)
        sc = np.where(chk[..., None] > 0.5, np.array([0.70, 0.68, 0.62]), np.array([0.10, 0.10, 0.11]))
        sc = sc * (0.85 + 0.2 * nz[..., None])
        m = th > hl
        col[m] = sc[m]
    else:
        hl = np.interp(aph, [0, 35, 60, 90, 112, 180], [36, 30, 17, 8, -24, -36] if not female else [37, 31, 14, 2, -30, -44])
        m = th > hl + 1.5 * (nz - 0.5) * 4
        hc = np.array(hair)[None, None, :] * (0.8 + 0.5 * nz[..., None])
        col[m] = hc[m]
    return np_image(name, np.clip(col, 0, 1).astype(np.float32))


def head_geo(geo, c, S, mat, female=False):
    """Deformed lat-long head, UVs = (lon, lat). c = centre, S = scale (1 = adult male)."""
    ax, ay, az = 0.074 * S, 0.094 * S, 0.112 * S
    if female:
        ax, ay, az = ax * 0.96, ay * 0.97, az * 0.97
    THS = [-90, -72, -56, -43, -33, -24, -16, -8, 0, 8, 17, 30, 48, 68, 90]
    PHS = [0, 9, 19, 30, 43, 58, 75, 93, 113, 135, 158, 180]
    PH = sorted(set([-p for p in PHS] + PHS))  # -180..180
    PH = [p for p in PH if p > -180]  # ring: -158..180
    lons = [-180] + sorted([p for p in PH if p != 180]) + [180]
    verts, uvs, faces = [], [], []

    def shape(ph, th):
        p, t = math.radians(ph), math.radians(th)
        d = Vector((math.sin(p) * math.cos(t), -math.cos(p) * math.cos(t), math.sin(t)))
        x, y, z = d.x * ax, d.y * ay, d.z * az
        front = max(0.0, -d.y)
        if th < -8:   # jaw narrows toward chin
            k = sm((-8 - th) / 70)
            x *= 1 - 0.28 * k
            y *= 1 - 0.10 * k * (1 - front)
        if d.y > 0 and th > -20:  # occiput
            y *= 1.0 + 0.06 * sm((th + 20) / 40)
        y *= 1 - 0.07 * front ** 2  # flatter face
        # features (push along -Y = forward)
        g = lambda a, s: math.exp(-(a / s) ** 2)
        nose = (0.020 * g(th + 15, 7) + 0.010 * g(th + 4, 9)) * g(ph, 8) * S
        brow = 0.006 * g(th - 12, 6) * g(abs(ph) - 18, 16) * S
        eye = -0.006 * g(th - 3, 5) * g(abs(ph) - 19, 9) * S
        chin = 0.008 * g(th + 52, 9) * g(ph, 18) * S
        lips = 0.004 * g(th + 30, 5) * g(ph, 10) * S
        cheek = 0.004 * g(th + 12, 10) * g(abs(ph) - 38, 12) * S
        y -= (nose + brow + eye + chin + lips) * front ** 0.5
        x += cheek * math.copysign(1, d.x) if abs(d.x) > 0.01 else 0
        return Vector((x, y, z)) + Vector(c)
    S1 = len(lons)
    for th in THS[1:-1]:
        for ph in lons:
            verts.append(shape(ph, th)); uvs.append(((ph + 180) / 360, (th + 90) / 180))
    R = len(THS) - 2
    for i in range(R - 1):
        for j in range(S1 - 1):
            a = i * S1 + j
            faces.append([a, a + 1, a + 1 + S1, a + S1])
    bot = len(verts); verts.append(shape(0, -90)); uvs.append((0.5, 0.0))
    for j in range(S1 - 1):
        faces.append([bot, j + 1, j])
    top = len(verts); verts.append(shape(0, 90)); uvs.append((0.5, 1.0))
    o = (R - 1) * S1
    for j in range(S1 - 1):
        faces.append([top, o + j, o + j + 1])
    geo.add(verts, faces, (1, 1, 1), ['head', 'neck'], mat=mat, uv=uvs)
    # ears
    for sx in (1, -1):
        ex = sx * (ax * 0.96)
        pts = [Vector((ex, 0.006 * S, -0.034 * S)) + Vector(c), Vector((ex + sx * 0.008 * S, 0.010 * S, 0.0)) + Vector(c),
               Vector((ex + sx * 0.010 * S, 0.012 * S, 0.026 * S)) + Vector(c)]
        vv, ff = tube(pts, [0.010 * S, 0.016 * S, 0.010 * S], [0.004 * S, 0.006 * S, 0.004 * S], YA, 6, True, True)
        geo.add(vv, ff, (1, 1, 1), ['head'], mat=mat, uv=[(0.5 + sx * 0.25, 0.48)] * len(vv), weights={'head': 1.0})
    return ax, ay, az


def build_human(name, H=1.65, female=False, skin=(0.66, 0.47, 0.35), hair=(0.05, 0.045, 0.04),
                shirt=(0.36, 0.27, 0.20), trousers=(0.08, 0.075, 0.07), sleeves='long', legs='long',
                hat='nonla', shirtless=False, shorts_col=None, foot_col=None, extra_bones=(), wet=None, seed=0.0):
    s = H / 1.65
    hs = 0.98 if female else 1.0
    J = {k: Vector(v) * s for k, v in BASE.items()}
    if female:
        for k in ('sh', 'el', 'wr', 'hd'):
            J[k].x *= 0.91
        for k in ('hip', 'kn'):
            J[k].x *= 1.05
    for k in ('headb', 'top'):
        J[k] = J['neck'] + (J[k] - J['neck']) * hs
    bones = [('hips', J['pelvis'], J['spine'], None), ('spine', J['spine'], J['chest'], 'hips'),
             ('chest', J['chest'], J['neck'], 'spine'), ('neck', J['neck'], J['headb'], 'chest'),
             ('head', J['headb'], J['top'], 'neck')]
    for sx, sd in ((1, 'L'), (-1, 'R')):
        m = lambda k: Vector((J[k].x * sx, J[k].y, J[k].z))
        bones += [('upperarm.' + sd, m('sh'), m('el'), 'chest'), ('forearm.' + sd, m('el'), m('wr'), 'upperarm.' + sd),
                  ('hand.' + sd, m('wr'), m('hd'), 'forearm.' + sd), ('thigh.' + sd, m('hip'), m('kn'), 'hips'),
                  ('shin.' + sd, m('kn'), m('an'), 'thigh.' + sd), ('foot.' + sd, m('an'), m('toe'), 'shin.' + sd)]
    bones += list(extra_bones)
    arm = make_arm(name, bones)

    SK = lin(skin); SH = lin(shirt); TR = lin(trousers); HAIR = lin(hair)
    FC = lin(foot_col) if foot_col else None
    g = Geo()
    wf = 1.0
    skin_c = col_noise(SK, 0.05, 17, seed)
    shirt_c = col_noise(SH, 0.09, 19, seed + 1)

    def trou_c(p):
        c = Vector(TR) * (1 + 0.08 * hashn(p, 21, seed + 2))
        if wet is not None and p.z < wet:
            c *= 0.62
        return tuple(c)

    # ---- torso
    hipz = J['hip'].z
    if shirtless:
        rings = [(z, rx * 0.92, ry * 0.92) for z, rx, ry in TORSO_M[2:]]
        tc = skin_c
    else:
        rings = TORSO_F if female else TORSO_M
        tc = shirt_c
    pts = [Vector((0, 0, z * s)) for z, _, _ in rings]
    rx = [r * s * wf for _, r, _ in rings]; ry = [r * s * wf for _, _, r in rings]
    vv, ff = tube(pts, rx, ry, XA, 16, cap1=True, nexp=2.3)
    shz = J['sh'].z

    def torso_w(p):
        if p.z < hipz + 0.04 * s:
            k = 0.85 * sm((hipz + 0.04 * s - p.z) / (0.12 * s)); xl = sm((p.x + 0.05 * s) / (0.10 * s))
            return {'hips': 1 - k, 'thigh.L': k * xl, 'thigh.R': k * (1 - xl)}
        if p.z > shz - 0.05 * s and abs(p.x) > 0.10 * s:
            return {'chest': 0.72, 'upperarm.L' if p.x > 0 else 'upperarm.R': 0.28}
        return None

    def placket(p):
        c = tc(p)
        if not shirtless and abs(p.x) < 0.012 and p.y < 0:
            c = tuple(x * 0.8 for x in c)
        return c
    g.add(vv, ff, placket, ['hips', 'spine', 'chest', 'neck'], weights=torso_w)
    if shirtless:  # shorts (waist) piece
        sc_ = lin(shorts_col or (0.15, 0.2, 0.35)); scc = col_noise(sc_, 0.08, 19, seed + 3)
        pz = [0.78, 0.86, 0.93, 0.975]; prx = [0.170, 0.160, 0.150, 0.146]; pry = [0.125, 0.118, 0.108, 0.104]
        vv, ff = tube([Vector((0, 0, z * s)) for z in pz], [r * s * wf for r in prx], [r * s * wf for r in pry], XA, 14,
                      nexp=2.3)
        g.add(vv, ff, scc, ['hips'], weights=torso_w)
    # neck
    vv, ff = tube([J['neck'] + Vector((0, -0.003, -0.04 * s)), J['neck'], J['headb'] + Vector((0, 0, 0.02 * s))],
                  [0.052 * s * wf] * 3, [0.050 * s * wf] * 3, XA, 10)
    g.add(vv, ff, skin_c, ['chest', 'neck', 'head'])
    # head
    hc = J['headb'] + Vector((0, -0.006 * s * hs, 0.066 * s * hs))
    ax, ay, az = head_geo(g, hc, s * hs, 1, female)
    if female and hat != 'scarf':   # hair bun
        vv, ff = sphere(hc + Vector((0, ay * 0.98, -az * 0.25)), 0.036 * s, 4, 8)
        g.add(vv, ff, col_noise(HAIR, 0.2, 40, seed), ['head'], weights={'head': 1.0})
    # hat
    if hat == 'nonla':
        R0 = 0.215 * s; rim = hc.z + 0.035 * s * hs; Hh = 0.185 * s
        tv, tf, tuv = [], [], []
        NS = 28; rr = [1.0, 0.72, 0.45, 0.2]
        for i, r in enumerate(rr):
            for j in range(NS + 1):
                a = 2 * math.pi * j / NS
                p = Vector((math.cos(a) * R0 * r, math.sin(a) * R0 * r + hc.y + 0.004, rim + Hh * (1 - r)))
                tv.append(p); tuv.append((0.5 + 0.5 * r * math.cos(a), 0.5 + 0.5 * r * math.sin(a)))
        for i in range(len(rr) - 1):
            for j in range(NS):
                a = i * (NS + 1) + j
                tf.append([a, a + 1, a + NS + 2, a + NS + 1])
        ap = len(tv); tv.append(Vector((0, hc.y + 0.004, rim + Hh))); tuv.append((0.5, 0.5))
        o = (len(rr) - 1) * (NS + 1)
        for j in range(NS):
            tf.append([ap, o + j, o + j + 1])
        tilt_q = q(XA, 6)   # slight backward tilt
        tv = [hc + tilt_q @ (p - hc) for p in tv]
        g.add(tv, tf, (1, 1, 1), ['head'], mat=2, uv=tuv, weights={'head': 1.0})
    elif hat == 'helmet':
        HC = lin((0.55, 0.06, 0.05))
        pts = []; r1 = []; r2 = []
        for i, th in enumerate([-10, 5, 25, 45, 65, 80]):
            t = math.radians(th)
            pts.append(hc + Vector((0, 0.008 * s, 0.02 * s + az * 1.18 * math.sin(t))))
            r1.append(ax * 1.32 * math.cos(t) + 0.004); r2.append(ay * 1.22 * math.cos(t) + 0.004)
        vv, ff = tube(pts, r1, r2, XA, 16, cap1=True)
        g.add(vv, ff, col_noise(HC, 0.04, 10, seed), ['head'], weights={'head': 1.0})
        # visor
        vp = [hc + Vector((x * s, -(ay * 1.22 + 0.025 * s) + abs(x) * 0.35, 0.02 * s)) for x in (-0.07, -0.035, 0, 0.035, 0.07)]
        vv, ff = tube(vp, [0.006 * s] * 5, [0.028 * s] * 5, ZA, 4, True, True)
        g.add(vv, ff, lin((0.1, 0.1, 0.1)), ['head'], weights={'head': 1.0})
    # ---- arms / hands / legs / feet
    for sx, sd in ((1, 'L'), (-1, 'R')):
        m = lambda k: Vector((J[k].x * sx, J[k].y, J[k].z))
        sh, el, wr, hd = m('sh'), m('el'), m('wr'), m('hd')
        P = lambda a, b, t: a.lerp(b, t)
        A = [sh + Vector((-sx * 0.045 * s, 0, -0.02 * s)), sh, P(sh, el, 0.33), P(sh, el, 0.7), el, P(el, wr, 0.5), wr - (wr - el).normalized() * 0.015]
        if shirtless:
            rr = [0.046, 0.048, 0.044, 0.040, 0.036, 0.032, 0.026]; cols = [skin_c] * 7; cut = 7
        else:
            rr = [0.058, 0.060, 0.056, 0.050, 0.047, 0.044, 0.042]; cut = 7 if sleeves == 'long' else 5
        rr = [r * s * wf for r in rr]
        cand = ['chest', 'upperarm.' + sd, 'forearm.' + sd, 'hand.' + sd]
        if shirtless:
            vv, ff = tube(A, rr, None, YA, 8)
            g.add(vv, ff, skin_c, cand)
        else:
            a0 = A[:cut]; r0 = rr[:cut]
            if sleeves != 'long':   # rolled sleeve: thicker roll at the end
                a0 = a0 + [a0[-1] + (wr - el).normalized() * 0.02 * s]; r0 = r0 + [r0[-1] * 1.12]
            vv, ff = tube(a0, r0, None, YA, 8)
            g.add(vv, ff, shirt_c, cand)
            if sleeves != 'long':
                sk = [A[cut - 1] - (wr - el).normalized() * 0.02 * s, P(el, wr, 0.6), wr]
                vv, ff = tube(sk, [0.041 * s, 0.035 * s, 0.029 * s], None, YA, 8)
                g.add(vv, ff, skin_c, cand)
        # hand: palm faces the body (normal -sx X); width along forward
        hdv = (hd - wr).normalized(); curl = Vector((-sx, 0, 0)) * 0.016 * s
        hp = [wr + hdv * 0.0, wr + hdv * 0.045 * s, wr + hdv * 0.095 * s, wr + hdv * 0.14 * s + curl * 0.5, wr + hdv * 0.175 * s + curl]
        vv, ff = tube(hp, [r * s for r in (0.026, 0.038, 0.043, 0.038, 0.026)], [r * s for r in (0.020, 0.017, 0.014, 0.011, 0.008)],
                      Vector((0, -1, 0)), 8, False, True)
        g.add(vv, ff, skin_c, ['forearm.' + sd, 'hand.' + sd])
        tp = [wr + hdv * 0.03 * s + Vector((0, -0.022, 0)) * s, wr + hdv * 0.07 * s + Vector((-sx * 0.012, -0.034, 0)) * s,
              wr + hdv * 0.10 * s + Vector((-sx * 0.02, -0.03, 0)) * s]
        vv, ff = tube(tp, [0.011 * s, 0.010 * s, 0.008 * s], None, XA, 5, False, True)
        g.add(vv, ff, skin_c, ['hand.' + sd], weights={'hand.' + sd: 1.0})
        # legs
        hip, kn, an = m('hip'), m('kn'), m('an')
        Lp = [hip + Vector((-sx * 0.025 * s, 0, 0.06 * s)), hip + Vector((-sx * 0.012 * s, 0, 0)), P(hip, kn, 0.35), P(hip, kn, 0.7), kn, P(kn, an, 0.4), P(kn, an, 0.75), an + Vector((0, 0, 0.02 * s))]
        cand = ['hips', 'thigh.' + sd, 'shin.' + sd, 'foot.' + sd]
        if female:
            rl = [0.080, 0.090, 0.104, 0.092, 0.084, 0.080, 0.077, 0.075]
        else:
            rl = [0.075, 0.086, 0.100, 0.090, 0.083, 0.080, 0.077, 0.075]
        rl = [r * s * wf for r in rl]
        bare = [0.075, 0.072, 0.064, 0.055, 0.047, 0.051, 0.040, 0.033]
        bare = [r * s * wf for r in bare]
        if legs == 'long':
            vv, ff = tube(Lp, rl, None, YA, 10)
            g.add(vv, ff, trou_c, cand)
            ank = [an + Vector((0, 0, 0.04 * s)), an + Vector((0, 0, -0.01 * s))]
            vv, ff = tube(ank, [0.034 * s * wf] * 2, None, YA, 8)
            g.add(vv, ff, skin_c, cand)
        else:
            cut = 5 if legs == 'rolled' else 3   # rolled above knee / shorts mid thigh
            a0 = Lp[:cut]; r0 = rl[:cut]
            if legs == 'shorts':
                r0 = [r * 0.92 for r in r0]
            a0 = a0 + [a0[-1] + (an - kn).normalized() * 0.03 * s] if legs == 'rolled' else a0 + [P(hip, kn, 0.5)]
            r0 = r0 + [r0[-1] * (1.13 if legs == 'rolled' else 1.0)]
            vv, ff = tube(a0, r0, None, YA, 10)
            g.add(vv, ff, trou_c if not shirtless else col_noise(lin(shorts_col or (0.15, 0.2, 0.35)), 0.08, 19, seed + 3), cand)
            st = cut - 1 if legs == 'rolled' else 2
            vv, ff = tube(Lp[st:], bare[st:], None, YA, 8)
            g.add(vv, ff, skin_c, cand)
        # foot (bare or sandal sole)
        toe = m('toe')
        fp = [an + Vector((0, 0.065 * s, -0.045 * s)), an + Vector((0, 0.02 * s, -0.025 * s)), an.lerp(toe, 0.55) + Vector((0, 0, -0.012 * s)), toe + Vector((0, -0.045 * s, -0.003 * s))]
        fp = [Vector((p.x, p.y, max(p.z, 0.022 * s))) for p in fp]
        vv, ff = tube(fp, [0.032 * s, 0.040 * s, 0.046 * s, 0.036 * s], [0.026 * s, 0.040 * s, 0.026 * s, 0.014 * s], XA, 8, True, True)
        vv = [Vector((p.x, p.y, max(p.z, 0.0))) for p in vv]
        fc = (lambda p: tuple(Vector(FC) * (0.6 if p.z < 0.012 else 1.0))) if FC else (lambda p: tuple(Vector(SK) * (0.75 if p.z < 0.01 else 1.0)))
        g.add(vv, ff, fc, ['shin.' + sd, 'foot.' + sd])
    return arm, g, J, s, hc, (ax, ay, az)


def finish_human(name, arm, g, skin_col, hair, female=False, scarf=False, extra_mats=(), ao=True, ao_occ=()):
    m_body = mat_basic(name + '_body', rough=0.85, double=True)
    m_head = mat_basic(name + '_head', img=head_tex(name + "_face", skin_col, hair, female, scarf), rough=0.6)
    m_hat = mat_basic(name + '_hat', img=straw_tex(), rough=0.8, double=True)
    ob = g.build(name + '_mesh', [m_body, m_head, m_hat] + list(extra_mats))
    if ao:
        vertex_ao([ob], [ob] + list(ao_occ), samples=20, dist=0.18, strength=0.85, floor=0.35, ground=True)
    skin(ob, arm, g, blend=0.06)
    return ob


def hpose(rig, hips, hrot=None, spine=None, chest=None, neck=None, head=None, hands=None, elbows=None, hdirs=None,
          feet=None, knees=None, fdirs=None, extra=None):
    """Assemble a human pose spec. hands/feet: {'L': target, 'R': target}; elbows/knees: pole directions."""
    sp = {'hips': {'loc': hips}}
    if hrot is not None:
        sp['hips']['rot'] = hrot
    for b, d in (('spine', spine), ('chest', chest), ('neck', neck), ('head', head)):
        if d is not None:
            sp[b] = d if isinstance(d, dict) else {'dir': d}
    out = [sp]
    for sd in 'LR':
        sx = 1 if sd == 'L' else -1
        if hands and hands.get(sd) is not None:
            out.append(ik2(rig, 'upperarm.' + sd, 'forearm.' + sd, hands[sd],
                           (elbows or {}).get(sd, Vector((sx * 0.5, 1, -0.3))),
                           'hand.' + sd, (hdirs or {}).get(sd)))
        if feet and feet.get(sd) is not None:
            fd = (fdirs or {}).get(sd)
            if fd is None:
                fd = rig.T['foot.' + sd] - rig.H['foot.' + sd]
            out.append(ik2(rig, 'thigh.' + sd, 'shin.' + sd, feet[sd],
                           (knees or {}).get(sd, Vector((sx * 0.1, -1, 0))), 'foot.' + sd, fd))
    if extra:
        out.append(extra)
    return merge(*out)
