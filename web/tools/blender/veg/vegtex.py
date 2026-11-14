# Procedural texture painting for the vegetation set (numpy only; arrays are sRGB-encoded, row 0 = bottom).
import math
import numpy as np
from common import tile_noise, np_image, normal_from_height


def canvas(H, W, bg=(0, 0, 0)):
    rgb = np.zeros((H, W, 3), np.float32); rgb[:] = bg
    return rgb, np.zeros((H, W), np.float32)


def stamp(rgb, al, x0, y0, ang, L, W, col, prof, mid=1.12, side=(1.06, 0.9), wrap=False, hgt=None, tipcol=None, basecol=None):
    """Paint one leaf/strand: base at pixel (x0,y0), direction ang, length L px, max width W px; prof(s)->0..1 half-width."""
    Hh, Ww = al.shape
    dx, dy = math.cos(ang), math.sin(ang)
    ext = L + W + 2
    i0, i1, j0, j1 = int(x0 - ext), int(x0 + ext) + 1, int(y0 - ext), int(y0 + ext) + 1
    if not wrap:
        i0, i1, j0, j1 = max(0, i0), min(Ww, i1), max(0, j0), min(Hh, j1)
        if i1 <= i0 or j1 <= j0:
            return
    cols = np.arange(i0, i1); rows = np.arange(j0, j1)
    X = (cols + 0.5 - x0)[None, :]; Y = (rows + 0.5 - y0)[:, None]
    s = (X * dx + Y * dy) / L; t = -X * dy + Y * dx
    sc = np.clip(s, 0, 1)
    half = np.maximum(W * 0.5 * prof(sc), 0.0)
    a = np.clip(half - np.abs(t) + 0.5, 0, 1) * ((s >= 0) & (s <= 1))
    if not a.any():
        return
    rel = np.clip(np.abs(t) / np.maximum(half, 0.5), 0, 1)
    c = np.empty(a.shape + (3,), np.float32); c[:] = col
    if tipcol is not None:
        k = (sc ** 3)[..., None]; c = c * (1 - k) + np.array(tipcol, np.float32) * k
    if basecol is not None:
        k = np.clip(1 - sc / 0.25, 0, 1)[..., None]; c = c * (1 - k) + np.array(basecol, np.float32) * k
    c *= np.where(t > 0, side[0], side[1])[..., None]
    c = np.where((rel < 0.13)[..., None], c * mid, c)
    ix = np.ix_(rows % Hh, cols % Ww) if wrap else (slice(j0, j1), slice(i0, i1))
    A = a[..., None]
    rgb[ix] = np.where((al[ix] > 0.02)[..., None], rgb[ix] * (1 - A) + c * A, np.where(A > 0, c, rgb[ix]))  # no dark fringe on empty texels
    al[ix] = np.maximum(al[ix], a)
    if hgt is not None:
        hgt[ix] = np.where(a > 0.3, np.sqrt(np.clip(1 - rel ** 2, 0, 1)), hgt[ix])


def polyline(rgb, al, pts, w0, w1, col, **kw):
    n = len(pts) - 1
    for i in range(n):
        (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        L = math.hypot(xb - xa, yb - ya) + 1.0
        w = w0 + (w1 - w0) * i / max(1, n - 1)
        stamp(rgb, al, xa, ya, math.atan2(yb - ya, xb - xa), L, w, col, lambda s: np.ones_like(s), mid=1.0, side=(1.05, 0.92), **kw)


def walk(rng, x, y, ang, L, steps, wig=0.12, bend=0.0):
    pts = [(x, y)]
    for i in range(steps):
        ang += rng.normal(0, wig) + bend
        x += math.cos(ang) * L / steps; y += math.sin(ang) * L / steps
        pts.append((x, y))
    return pts, ang


def finish(rgb, al, seed, nscale=30, amt=0.22):
    H, W = al.shape
    meanc = rgb[al > 0.5].mean(0) if (al > 0.5).any() else rgb.mean((0, 1))
    rgb = np.where(al[..., None] > 0.02, rgb, meanc)
    rgb = rgb * (1 - amt / 2 + amt * tile_noise(H, W, nscale, seed=seed)[..., None])
    return np.concatenate([np.clip(rgb, 0, 1), al[..., None]], -1).astype(np.float32)


def atlas(cells, name):
    """cells: list of 4 HxWx4 arrays -> 2x2 atlas: [0]=(u0,v0) [1]=(u.5,v0) [2]=(u0,v.5) [3]=(u.5,v.5)."""
    bot = np.concatenate([cells[0], cells[1]], 1); top = np.concatenate([cells[2], cells[3]], 1)
    return np_image(name, np.concatenate([bot, top], 0))


CELL = {0: (0.0, 0.0, 0.5, 0.5), 1: (0.5, 0.0, 0.5, 0.5), 2: (0.0, 0.5, 0.5, 0.5), 3: (0.5, 0.5, 0.5, 0.5)}

LANCE = lambda s: np.sin(np.pi * s ** 0.7) ** 0.85
ELLIP = lambda s: np.sin(np.pi * s) ** 0.75
MANGO = lambda s: np.sin(np.pi * s ** 0.85) ** 0.8 * (1 - 0.15 * s)


def jitter(rng, c, a=0.12):
    t = rng.uniform(1 - a, 1 + a); h = rng.uniform(-a / 2, a / 2)
    return (c[0] * t * (1 + h), c[1] * t, c[2] * t * (1 - h))


# ---------------------------------------------------------------- bamboo
def tex_bamboo_leaves(seed=1):
    N = 512; px = N / 1.4; cells = []
    greens = [(0.36, 0.50, 0.15), (0.30, 0.44, 0.12), (0.42, 0.54, 0.18), (0.27, 0.40, 0.11)]
    for kind in range(4):
        rng = np.random.default_rng(seed + kind)
        rgb, al = canvas(N, N)
        if kind == 3:   # base thicket: crossing twigs, dry sheaths, few leaves
            for k in range(70):
                x = rng.uniform(0, N); y = rng.uniform(0, N * 0.3)
                pts, _ = walk(rng, x, y, math.radians(rng.uniform(40, 140)), rng.uniform(0.3, 1.0) * N, 6, 0.15)
                polyline(rgb, al, pts, 3.2, 1.6, jitter(rng, (0.42, 0.40, 0.26), 0.2))
            for k in range(25):
                stamp(rgb, al, rng.uniform(0, N), rng.uniform(0, N * 0.5), math.radians(rng.uniform(60, 120)), rng.uniform(40, 110), rng.uniform(8, 14),
                      jitter(rng, (0.66, 0.58, 0.40), 0.15), ELLIP, mid=0.95)
            nleaf = 330; yellow = 0.15
        else:
            nleaf = 0; yellow = 0.04 if kind < 2 else 0.18
        twigs = []
        if kind < 3:
            main, _ = walk(rng, N / 2 + rng.normal(0, 8), 0, math.radians(90 + rng.normal(0, 6)), N * 0.9, 10, 0.08)
            twigs.append(main)
            for b in range(6 if kind < 2 else 4):
                i = int(rng.integers(1, 7)); x, y = main[i]
                side = 1 if b % 2 == 0 else -1
                sub, _ = walk(rng, x, y, math.radians(90 + side * rng.uniform(25, 60)), N * rng.uniform(0.3, 0.55), 6, 0.1, -side * 0.035)
                twigs.append(sub)
            for tw in twigs:
                polyline(rgb, al, tw, 3.0, 1.4, (0.50, 0.50, 0.26))
            # leaves in fans along the twigs
            for tw in twigs:
                for i in range(1, len(tw)):
                    x, y = tw[i]; base_a = math.atan2(tw[i][1] - tw[i - 1][1], tw[i][0] - tw[i - 1][0])
                    nfan = rng.integers(3, 7) if kind < 2 else rng.integers(2, 5)
                    for f in range(nfan):
                        a = base_a + rng.choice([-1, 1]) * math.radians(rng.uniform(10, 70))
                        L = rng.uniform(0.15, 0.26) * px; W = L * rng.uniform(0.12, 0.16)
                        c = jitter(rng, greens[rng.integers(0, 4)]) if rng.random() > yellow else jitter(rng, (0.62, 0.56, 0.26), 0.1)
                        stamp(rgb, al, x, y, a, L, W, c, LANCE, tipcol=(c[0] * 1.1, c[1] * 1.05, c[2] * 0.9))
        for k in range(nleaf):   # thicket leaves
            x, y = rng.uniform(0, N), rng.uniform(N * 0.2, N)
            L = rng.uniform(0.12, 0.2) * px
            c = jitter(rng, greens[rng.integers(0, 4)]) if rng.random() > yellow else jitter(rng, (0.62, 0.55, 0.3), 0.12)
            stamp(rgb, al, x, y, math.radians(rng.uniform(30, 150)), L, L * 0.14, c, LANCE)
        cells.append(finish(rgb, al, seed + 10 + kind, 40, 0.25))
    return atlas(cells, 'bamboo_leaf')


def tex_culm(seed=2):
    H, W = 512, 128   # v covers 2 m (loft vscale 0.5)
    v = (np.arange(H)[:, None] + 0.5) / H * 2.0; u = np.arange(W)[None, :] / W
    streak = tile_noise(H, W, (2, 40), seed=seed)
    base = np.array([0.46, 0.56, 0.22])
    c = base * (0.82 + 0.36 * streak[..., None])
    yel = (tile_noise(H, W, (3, 12), seed=seed + 1) > 0.66)[..., None]
    c = np.where(yel, c * 0.6 + np.array([0.70, 0.66, 0.36]) * 0.4, c)
    hgt = streak * 0.15
    for zn in (0.0, 0.42, 0.86, 1.26, 1.62, 2.0):
        d = v - zn
        ring = np.exp(-(d / 0.007) ** 2)
        wax = ((d < 0) & (d > -0.07)) * np.exp(d / 0.03)
        sheath = ((d > 0) & (d < 0.012))
        c = c * (1 - 0.55 * ring[..., None]) + wax[..., None] * 0.25 * (np.array([0.85, 0.85, 0.78]) - c)
        c = np.where(sheath[..., None] & (tile_noise(H, W, (8, 8), seed=seed + 3)[..., None] > 0.5), np.array([0.55, 0.47, 0.30]), c)
        hgt = hgt + np.exp(-(d / 0.02) ** 2) * 0.8 - ring * 0.6
    lich = (tile_noise(H, W, 18, seed=seed + 4) > 0.7)[..., None]
    c = np.where(lich, c * 0.65 + np.array([0.62, 0.62, 0.55]) * 0.35, c)
    return np_image('bamboo_culm', c.astype(np.float32)), np_image('bamboo_culm_nrm', normal_from_height(hgt.astype(np.float32), 2.5), noncolor=True)


# ---------------------------------------------------------------- melaleuca
def tex_tram_leaves(seed=11):
    N = 512; px = N / 1.1; cells = []
    greys = [(0.42, 0.50, 0.30), (0.36, 0.45, 0.27), (0.46, 0.53, 0.34), (0.33, 0.41, 0.24)]
    for kind in range(4):
        rng = np.random.default_rng(seed + kind)
        rgb, al = canvas(N, N)
        twigs = []
        main, _ = walk(rng, N / 2, 0, math.radians(90 + rng.normal(0, 8)), N * 0.9, 10, 0.1)
        twigs.append(main)
        for b in range(9):
            i = rng.integers(1, 8); x, y = main[i]; side = rng.choice([-1, 1])
            sub, _ = walk(rng, x, y, math.radians(90 + side * rng.uniform(25, 65)), N * rng.uniform(0.3, 0.55), 6, 0.12, side * 0.03)
            twigs.append(sub)
        for tw in twigs:
            polyline(rgb, al, tw, 2.6, 1.2, (0.48, 0.42, 0.33))
        dens = 1.0 if kind < 2 else 0.7
        for tw in twigs:
            for i in range(1, len(tw)):
                for k in range(int(rng.integers(8, 14) * dens)):
                    f = rng.uniform(0, 1)
                    x = tw[i - 1][0] + (tw[i][0] - tw[i - 1][0]) * f; y = tw[i - 1][1] + (tw[i][1] - tw[i - 1][1]) * f
                    ba = math.atan2(tw[i][1] - tw[i - 1][1], tw[i][0] - tw[i - 1][0])
                    a = ba + rng.choice([-1, 1]) * math.radians(rng.uniform(20, 60))
                    a -= 0.25 * math.cos(a)   # slight weeping
                    L = rng.uniform(0.07, 0.11) * px; W = L * rng.uniform(0.18, 0.26)
                    stamp(rgb, al, x, y, a, L, W, jitter(rng, greys[rng.integers(0, 4)], 0.1), ELLIP, mid=1.06)
            # small cream flower spikes on kind 3 (bottle-brush, Oct is late flowering)
        if kind == 3:
            for k in range(5):
                x, y = rng.uniform(N * 0.2, N * 0.8), rng.uniform(N * 0.4, N * 0.9)
                for j in range(30):
                    stamp(rgb, al, x + rng.normal(0, 3), y + rng.uniform(0, 40), math.radians(rng.uniform(0, 360)), rng.uniform(6, 11), 2.0,
                          (0.88, 0.86, 0.72), ELLIP, mid=1.0)
        cells.append(finish(rgb, al, seed + 20 + kind, 30, 0.2))
    return atlas(cells, 'tram_leaf')


def tex_tram_bark(seed=21):
    H, W = 512, 256   # 2 m x 1 m
    hgt = np.zeros((H, W), np.float32)
    c = np.zeros((H, W, 3), np.float32); c[:] = (0.50, 0.38, 0.30)     # exposed inner bark
    layers = [((0.66, 0.58, 0.50), 0.42), ((0.78, 0.73, 0.65), 0.46), ((0.84, 0.81, 0.74), 0.5), ((0.74, 0.71, 0.66), 0.56)]
    for i, (col, thr) in enumerate(layers):
        n = tile_noise(H, W, (14, 5), seed=seed + i) * 0.7 + tile_noise(H, W, (60, 6), seed=seed + 10 + i) * 0.3
        m = n > thr
        edge = np.clip((n - thr) / 0.02, 0, 1)
        c = np.where(m[..., None], np.array(col) * (0.9 + 0.2 * tile_noise(H, W, (80, 4), seed=seed + 20 + i))[..., None], c)
        c = np.where((m & (edge < 0.6))[..., None], c * 0.75, c)
        hgt += m * 0.5
    fib = tile_noise(H, W, (3, 120), seed=seed + 30)
    c *= (0.9 + 0.2 * fib)[..., None]
    hgt += fib * 0.4
    return np_image('tram_bark', c.astype(np.float32)), np_image('tram_bark_nrm', normal_from_height(hgt, 3.0), noncolor=True)


# ---------------------------------------------------------------- mango
def tex_mango_leaves(seed=31):
    N = 512; px = N / 1.2; cells = []
    darks = [(0.17, 0.29, 0.09), (0.14, 0.25, 0.08), (0.20, 0.33, 0.11), (0.12, 0.22, 0.07)]
    for kind in range(4):
        rng = np.random.default_rng(seed + kind)
        rgb, al = canvas(N, N)
        nros = 22 if kind < 3 else 16
        for r in range(nros):
            cx, cy = rng.uniform(N * 0.27, N * 0.73), rng.uniform(N * 0.32, N * 0.7)
            # twig into the rosette
            tw, _ = walk(rng, cx + rng.normal(0, 40), cy - rng.uniform(60, 120), math.radians(90 + rng.normal(0, 25)), rng.uniform(60, 110), 4, 0.1)
            polyline(rgb, al, tw, 3.5, 2.5, (0.30, 0.26, 0.18))
            cx, cy = tw[-1]
            flush = kind == 3 and r < 3
            for k in range(int(rng.integers(8, 13))):
                a = math.radians(rng.uniform(-150, -30))   # mango leaves hang from twig tips   # leaves droop off upward twig tips
                L = rng.uniform(0.13, 0.2) * px; W = L * rng.uniform(0.2, 0.26)
                if flush:
                    col = jitter(rng, (0.52, 0.32, 0.16), 0.1); a = math.radians(rng.uniform(-110, -70))  # young bronze leaves hang
                else:
                    col = jitter(rng, darks[rng.integers(0, 4)], 0.12)
                stamp(rgb, al, cx, cy, a, L, W, col, MANGO, mid=1.35, side=(1.12, 0.86), tipcol=(col[0] * 1.05, col[1] * 1.1, col[2]))
        cells.append(finish(rgb, al, seed + 40 + kind, 30, 0.2))
    return atlas(cells, 'mango_leaf')


def tex_mango_bark(seed=41):
    H, W = 512, 256
    n1 = tile_noise(H, W, (6, 30), seed=seed); n2 = tile_noise(H, W, 40, seed=seed + 1)
    fiss = np.abs(n1 - 0.5) < 0.04
    c = np.array([0.36, 0.32, 0.27]) * (0.8 + 0.4 * n2[..., None])
    c = np.where(fiss[..., None], c * 0.45, c)
    lich = (tile_noise(H, W, 14, seed=seed + 2) > 0.68)[..., None]
    c = np.where(lich, c * 0.5 + np.array([0.58, 0.60, 0.52]) * 0.5, c)
    hgt = -fiss.astype(np.float32) + n2 * 0.4
    return np_image('mango_bark', c.astype(np.float32)), np_image('mango_bark_nrm', normal_from_height(hgt.astype(np.float32), 3.0), noncolor=True)


# ---------------------------------------------------------------- pinnate fronds (areca, nipa) - after palm_frond
def tex_frond(name, LEN, spacing, ang, vt, wid, green, tip, seed=3, stiff=False):
    W, H = 1024, 256
    rows = []
    for dry in (False, True):
        rng = np.random.default_rng(seed + dry)
        rgb = np.zeros((H, W, 3), np.float32); al = np.zeros((H, W), np.float32)
        X = (np.arange(W) + 0.5) / W * LEN; Y = (np.arange(H) + 0.5) / H
        xm, ym = np.meshgrid(X, Y)
        s = 0.0
        while s < LEN:
            s += rng.uniform(*spacing)
            t = s / LEN
            if dry and rng.random() < 0.2:
                continue
            th = math.radians(rng.uniform(*ang))
            v = rng.uniform(*vt) * (rng.uniform(0.5, 0.9) if rng.random() < (0.25 if dry else 0.05) else 1.0)
            ln = v / math.sin(th)
            curv = 0 if stiff else rng.uniform(0.004, 0.012)
            wd = rng.uniform(*wid) * (0.7 if dry else 1.0) * (0.7 + 0.3 * math.sin(math.pi * min(1, t * 1.2)))
            bx, by = s, 0.03; dx, dy = math.cos(th), math.sin(th)
            i0 = max(0, int((bx - 0.1) / LEN * W)); i1 = min(W, int((bx + ln * dx + 0.1) / LEN * W) + 1)
            if i1 <= i0:
                continue
            px = xm[:, i0:i1] - bx; py = ym[:, i0:i1] - by
            sa = px * dx + py * dy; sd = -px * dy + py * dx
            tt = np.clip(sa / ln, 0, 1)
            sd = sd - curv * (tt ** 2) * 4
            ww = wd * np.clip(tt / 0.05, 0.35, 1) * (1 - tt) ** 0.5 + 0.003
            a = np.clip((ww / 2 - np.abs(sd)) / 0.004 + 0.5, 0, 1) * ((sa > 0) & (sa < ln))
            if dry:
                base = np.array([0.55, 0.44, 0.29]) * rng.uniform(0.75, 1.1); tp = np.array([0.62, 0.55, 0.42])
            else:
                base = np.array(green) * rng.uniform(0.85, 1.12); tp = np.array(tip) * rng.uniform(0.9, 1.1)
            c = base * (1 - tt[..., None] ** 2.5) + tp * tt[..., None] ** 2.5
            c = c * np.where(sd > 0, 1.1, 0.86)[..., None]
            c = np.where((np.abs(sd) < ww * 0.1)[..., None], c * 1.25 + 0.03, c)
            m = a > al[:, i0:i1]
            rgb[:, i0:i1][m] = c[m]; al[:, i0:i1] = np.maximum(al[:, i0:i1], a)
        meanc = rgb[al > 0.5].mean(0)
        rgb = np.where(al[..., None] > 0.01, rgb, meanc)
        rgb *= 0.88 + 0.24 * tile_noise(H, W, (40, 40), seed=7)[..., None]
        rows.append(np.concatenate([rgb, al[..., None]], -1))
    return np_image(name, np.concatenate(rows, 0).astype(np.float32))


def tex_areca_trunk(seed=51):
    H, W = 512, 128   # 2 m x around
    v = (np.arange(H)[:, None] + 0.5) / H * 2.0
    wav = 0.004 * np.sin(2 * np.pi * np.arange(W)[None, :] / W * 2 + 1)
    ph = ((v + wav) / 0.125) % 1.0   # 16 rings per 2 m
    ring = np.exp(-((ph - 0.5) / 0.07) ** 2)
    n = tile_noise(H, W, (4, 30), seed=seed)
    c = np.array([0.56, 0.57, 0.50]) * (0.85 + 0.3 * n[..., None])
    c = c * (1 - 0.2 * ring[..., None]) + ring[..., None] * 0.18 * (np.array([0.86, 0.85, 0.78]) - c)
    blot = (tile_noise(H, W, 20, seed=seed + 1) > 0.67)[..., None]
    c = np.where(blot, c * 0.7 + np.array([0.30, 0.32, 0.25]) * 0.3, c)
    hgt = ring * 0.8 + n * 0.2
    return np_image('areca_trunk', c.astype(np.float32)), np_image('areca_trunk_nrm', normal_from_height(hgt.astype(np.float32), 2.0), noncolor=True)


# ---------------------------------------------------------------- water hyacinth
def tex_hyacinth(seed=61):
    N = 512; cells = []
    yy, xx = np.mgrid[0:N, 0:N] + 0.5
    for kind in range(4):
        rng = np.random.default_rng(seed + kind)
        rgb, al = canvas(N, N)
        if kind == 2:   # flower spike on stalk
            polyline(rgb, al, [(N / 2, 0), (N / 2 + 4, N * 0.3), (N / 2 + 2, N * 0.5)], 12, 9, (0.42, 0.52, 0.22))
            for k in range(14):
                cx = N / 2 + rng.normal(0, 55); cy = N * rng.uniform(0.45, 0.93)
                R = rng.uniform(30, 44); a0 = rng.uniform(0, 6.28)
                for p in range(6):
                    a = a0 + p * math.pi / 3
                    stamp(rgb, al, cx, cy, a, R, R * 0.75, jitter(rng, (0.74, 0.64, 0.86), 0.06), ELLIP, mid=1.0, side=(1.0, 0.95))
                # upper petal: violet patch with yellow eye
                pa = a0 + math.pi / 2
                ex, ey = cx + math.cos(pa) * R * 0.45, cy + math.sin(pa) * R * 0.45
                stamp(rgb, al, ex, ey, pa, R * 0.42, R * 0.4, (0.40, 0.22, 0.62), ELLIP, mid=1.0)
                stamp(rgb, al, ex + math.cos(pa) * R * 0.1, ey + math.sin(pa) * R * 0.1, pa, R * 0.2, R * 0.18, (0.95, 0.82, 0.20), ELLIP, mid=1.0)
            cells.append(finish(rgb, al, seed + 70, 40, 0.1)); continue
        old = kind == 3
        # petiole: swollen spongy bulb from bottom to 45%
        cx = N / 2
        s = yy / (N * 0.48)
        half = N * (0.035 + 0.11 * np.sin(np.pi * np.clip(s * 1.05, 0, 1)) ** 1.4) * (1 - 0.35 * s)
        pm = (s <= 1.02) & (np.abs(xx - cx) < half)
        pcol = np.array((0.56, 0.62, 0.30) if not old else (0.62, 0.55, 0.30))
        rel = np.abs(xx - cx) / np.maximum(half, 1)
        sh = (0.72 + 0.38 * np.sqrt(np.clip(1 - rel ** 2, 0, 1)))[..., None]
        rgb = np.where(pm[..., None], pcol * sh, rgb); al = np.where(pm, 1.0, al)
        # blade: broad kidney/round, glossy
        bcx, bcy, R = cx + rng.normal(0, 6), N * 0.71, N * rng.uniform(0.27, 0.3)
        dx, dy = (xx - bcx) / R, (yy - bcy) / (R * 0.98)
        ang = np.arctan2(dy, dx); r = np.hypot(dx, dy)
        edge = 1 + 0.03 * np.sin(ang * 7 + kind) - 0.12 * np.exp(-((ang + np.pi / 2) / 0.35) ** 2)
        bm = r < edge
        aa = np.clip((edge - r) * R + 0.5, 0, 1)
        g = np.array((0.24, 0.44, 0.10) if not old else (0.58, 0.50, 0.18))
        vein = 0.5 + 0.5 * np.cos(ang * 22 + r * 3)
        c = g * (0.9 + 0.12 * vein[..., None]) * (0.85 + 0.25 * r[..., None])
        c = c + np.exp(-((dx + 0.25) ** 2 + (dy - 0.3) ** 2) / 0.08)[..., None] * 0.08    # soft sheen
        if old:
            blotch = tile_noise(N, N, 14, seed=seed + 5)[..., None]
            c = c * (0.7 + 0.5 * blotch) * np.where(blotch > 0.62, 0.55, 1.0)
        A = aa[..., None]
        rgb = rgb * (1 - A) + c * A; al = np.maximum(al, aa)
        # blade-petiole junction
        stamp(rgb, al, cx, N * 0.42, math.pi / 2, N * 0.2, 14, pcol * 0.95, lambda s: 1 - 0.6 * s, mid=1.0)
        cells.append(finish(rgb, al, seed + 80 + kind, 25, 0.12))
    return atlas(cells, 'hyacinth_leaf')


# ---------------------------------------------------------------- rice straw
def tex_straw(seed=71):
    N = 512   # covers 1.5 m
    rng = np.random.default_rng(seed)
    rgb, al = canvas(N, N, (0.16, 0.12, 0.08))
    hgt = np.zeros((N, N), np.float32)
    cols = [(0.66, 0.54, 0.32), (0.72, 0.62, 0.40), (0.56, 0.46, 0.30), (0.52, 0.48, 0.40), (0.62, 0.52, 0.34)]  # golden to grey-weathered
    for k in range(2600):
        a = math.radians(-90 + rng.normal(0, 18))
        stamp(rgb, al, rng.uniform(0, N), rng.uniform(0, N), a, rng.uniform(50, 170), rng.uniform(2.5, 4.5),
              jitter(rng, cols[rng.integers(0, 5)], 0.12), lambda s: np.ones_like(s), mid=1.08, side=(1.08, 0.82), wrap=True, hgt=hgt)
    rgb *= (0.85 + 0.3 * tile_noise(N, N, 8, seed=seed + 1))[..., None]
    return np_image('straw_col', np.clip(rgb, 0, 1)), np_image('straw_nrm', normal_from_height(hgt, 1.6), noncolor=True)


def tex_straw_wisps(seed=72):
    """2 cells side by side (512x512 image, cells 256 wide): hanging wisps attached at the bottom edge."""
    N = 512; rng = np.random.default_rng(seed)
    rgb, al = canvas(N, N)
    cols = [(0.80, 0.68, 0.42), (0.86, 0.78, 0.56), (0.66, 0.60, 0.48), (0.74, 0.64, 0.44)]
    for cell in range(2):
        x0 = cell * 256
        for k in range(160 if cell == 0 else 120):
            x = x0 + 128 + rng.normal(0, 40); a = math.radians(90 + rng.normal(0, 14 if cell == 0 else 35))
            pts, _ = walk(rng, x, 0, a, rng.uniform(0.3, 0.98) * N, 5, 0.06)
            pts = [(min(max(px, x0 + 3), x0 + 253), py) for px, py in pts]
            polyline(rgb, al, pts, 3.2, 2.2, jitter(rng, cols[rng.integers(0, 4)], 0.12))
    return np_image('straw_wisp', finish(rgb, al, seed, 20, 0.15))


# ---------------------------------------------------------------- reeds plume
def tex_plume(seed=81):
    N = 512; rng = np.random.default_rng(seed)
    rgb, al = canvas(N, N)
    for cell in range(2):
        x0 = cell * 256 + 128
        polyline(rgb, al, [(x0, 0), (x0 + 3, N * 0.5), (x0 + 6, N * 0.97)], 6, 3, (0.55, 0.52, 0.32))
        for k in range(900):
            y = N * rng.uniform(0.42, 0.95); f = (y / N - 0.42) / 0.53
            a = math.radians(90 + rng.choice([-1, 1]) * rng.uniform(8, 40) * (1 - 0.5 * f))
            L = rng.uniform(25, 75) * (1 - 0.5 * f)
            stamp(rgb, al, x0 + 3 + rng.normal(0, 3), y, a, L, 2.4, jitter(rng, (0.68, 0.56, 0.48) if cell == 0 else (0.76, 0.70, 0.56), 0.12),
                  lambda s: 1 - 0.6 * s, mid=1.0, side=(1.0, 0.9))
    return np_image('reed_plume', finish(rgb, al, seed, 20, 0.12))
