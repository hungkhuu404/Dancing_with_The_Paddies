import csv
import sys
from pathlib import Path

import numpy as np
import pytest
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "validate"))
import landcover as lc  # noqa: E402

CFG = ROOT / "config" / "tan_hoi_bang2.toml"


def test_cell_id_format_and_alignment():
    assert lc.cell_id(519250, 1121000) == "E519250N1121000"
    cells = lc.cells_in_polygon(Polygon([(0, 0), (1000, 0), (1000, 1000), (0, 1000)]), (0, 1000, 0, 1000), 250)
    assert len(cells) == 16
    assert all(x % 250 == 0 and y % 250 == 0 for x, y in cells)
    assert cells == sorted(cells, key=lambda c: (c[1], c[0]))


def test_center_in_boundary():
    # triangle: cell (0,0) center (125,125) inside; cell (250,0) center (375,125) outside
    tri = Polygon([(0, 0), (300, 0), (0, 300)])
    assert lc.cells_in_polygon(tri, (0, 500, 0, 500), 250) == [(0, 0)]


def test_shares():
    w = {"nodata_class": 0, "cropland_class": 40, "builtup_class": 50, "water_class": 80, "tree_class": 10}
    classes = np.array([40, 40, 50, 0, 10, 80, 40])
    cx = np.array([0, 0, 0, 0, 250, 250, 999])
    cy = np.zeros(7, dtype=int)
    rows = lc.compute_shares(classes, cx, cy, [(0, 0), (250, 0), (500, 0)], w)
    assert rows[0]["n_px"] == 3 and rows[0]["cropland_share"] == pytest.approx(2 / 3)
    assert rows[0]["builtup_share"] == pytest.approx(1 / 3)
    assert rows[1]["tree_share"] == 0.5 and rows[1]["water_share"] == 0.5
    assert rows[2]["n_px"] == 0 and rows[2]["cropland_share"] is None


def test_real_output():
    if not Path(CFG).exists():
        pytest.skip("no site config here")
    cfg = lc.load_config(CFG)
    p = lc.rel(cfg, cfg["output"]["csv"])
    if not p.exists():
        pytest.skip("no output yet")
    with open(p, encoding="utf-8") as f:
        ids = [r["cell_id"] for r in csv.DictReader(f)]
    assert len(ids) == len(set(ids)) == 2344
