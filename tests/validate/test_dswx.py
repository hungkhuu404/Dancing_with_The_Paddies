import sys
from pathlib import Path

import numpy as np
from affine import Affine

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline" / "validate"))
import dswx  # noqa: E402

TH = dict(valid_code_lt=250, valid_share_min=0.7, water_share_min=0.5, water_code=1, extra_code=3)
TF = Affine(10, 0, 0, 0, -10, 100)  # 10 m pixels, 10x10 raster, x 0..100, y 0..100


def test_aggregate_cells_basic():
    a = np.zeros((10, 10), np.uint8)
    a[:, :5] = 1  # left half water
    bounds = np.array([(0, 0, 50, 100), (50, 0, 100, 100)], float)
    f1, f3, vs = dswx.aggregate(a, TF, bounds, TH)
    assert np.allclose(f1, [1, 0]) and np.allclose(f3, [0, 0]) and np.allclose(vs, [1, 1])


def test_valid_threshold():
    a = np.zeros((10, 10), np.uint8)
    a[:, :] = 255
    a[:3, :] = 1  # 30% valid -> invalid cell
    f1, f3, vs = dswx.aggregate(a, TF, np.array([(0, 0, 100, 100)], float), TH)
    assert np.isnan(f1[0]) and abs(vs[0] - 0.3) < 1e-9
    a[:7, :] = 1  # exactly 70% valid
    f1, _, vs = dswx.aggregate(a, TF, np.array([(0, 0, 100, 100)], float), TH)
    assert f1[0] == 1.0 and abs(vs[0] - 0.7) < 1e-9


def test_water_flags_and_code13():
    a = np.zeros((10, 10), np.uint8)
    a[:5] = 1   # 50% -> water (>=)
    f1, f3, vs = dswx.aggregate(a, TF, np.array([(0, 0, 100, 100)], float), TH)
    v, w, w13 = dswx.flags(f1, f3, vs, TH)
    assert v[0] and w[0] and w13[0]
    a = np.zeros((10, 10), np.uint8)
    a[:3] = 1; a[3:5] = 3   # code1 30%, code3 20%
    f1, f3, vs = dswx.aggregate(a, TF, np.array([(0, 0, 100, 100)], float), TH)
    v, w, w13 = dswx.flags(f1, f3, vs, TH)
    assert not w[0] and w13[0]
    # invalid cell is never water
    f1, f3, vs = np.array([1.0]), np.array([0.0]), np.array([0.5])
    assert not dswx.flags(f1, f3, vs, TH)[1][0]


def test_share_is_of_valid_pixels():
    a = np.full((10, 10), 255, np.uint8)
    a[:8, :] = 0
    a[:4, :] = 1  # 40 px water of 80 valid = 0.5
    f1, _, vs = dswx.aggregate(a, TF, np.array([(0, 0, 100, 100)], float), TH)
    assert abs(f1[0] - 0.5) < 1e-9 and abs(vs[0] - 0.8) < 1e-9


def _g(ur):
    return {"umm": {"GranuleUR": ur}}


def test_latest_version():
    a = "OPERA_L3_DSWx-S1_T48PWS_20260818T224403Z_20260819T100000Z_S1A_30_v1.0"
    b = "OPERA_L3_DSWx-S1_T48PWS_20260818T224403Z_20260901T100000Z_S1A_30_v1.0"
    c = "OPERA_L3_DSWx-S1_T48PWS_20260830T224403Z_20260831T100000Z_S1A_30_v1.0"
    got = dswx.select_latest([_g(a), _g(b), _g(c)])
    assert len(got) == 2
    assert got[("T48PWS", "20260818T224403Z")]["umm"]["GranuleUR"] == b


def test_local_time():
    utc, loc = dswx.to_local("20260817T224403Z", "Asia/Ho_Chi_Minh")
    assert (loc.day, loc.hour, loc.minute) == (18, 5, 44)
    assert utc.hour == 22


def test_cells_250_ids():
    assert dswx.cell_id(511500, 1113250) == "E511500N1113250"
