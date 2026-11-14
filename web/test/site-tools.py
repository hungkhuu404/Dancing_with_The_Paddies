"""Offline tool smoke check using only task-created fixtures. Run with NumPy Python -I."""
import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

WEB = Path(__file__).resolve().parents[1]
TOOLS = WEB / "tools"
sys.path.insert(0, str(TOOLS))
from site_config import PROFILE

with tempfile.TemporaryDirectory(prefix="flood-site-") as temp:
    root = Path(temp)
    os.environ.update(FLOOD_BUILD_DIR=str(root / "build"), FLOOD_SOURCE_DIR=str(root / "source"), FLOOD_H0_DIR=str(root / "source"))
    (root / "source").mkdir()
    for name in ("osm_waterways", "osm_roads", "osm_water"):
        (root / "source" / (name + ".geojson")).write_text(json.dumps({"type": "FeatureCollection", "features": []}), encoding="utf8")
    sys.path.insert(0, str(TOOLS / "commune"))
    import common
    import numpy as np
    for zone in (47, 48):
        lon, lat = (100.12, 16.75) if zone == 47 else (105.18, 10.14)
        e, n = common.utm(lon, lat, zone)
        ll = common.inverse_utm(e, n, zone)
        assert np.hypot(*(np.array(common.utm(*ll, zone)) - [e, n])) < .5
    for path in [*TOOLS.glob("commune/*.py"), TOOLS / "geo/geo.py", TOOLS / "site_config.py", TOOLS / "recovery_paths.py"]:
        ast.parse(path.read_text(encoding="utf8"), filename=str(path))
    result = subprocess.run([sys.executable, "-I", str(TOOLS / "commune/prep.py"), "--site", PROFILE["id"], "--no-tex"], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    global_data = json.loads((common.WORK / "global.json").read_text(encoding="utf8"))
    mask = np.load(common.WORK / "mask10.npy")
    if PROFILE["boundary"]["mode"] == "frame":
        assert mask.all()
        assert len(global_data["tiles"]) == 36
    else:
        assert len(global_data["tiles"]) == 54
    assert all(t["utm_e"] == common.tile_centre(t["i"], t["j"])[0] for t in global_data["tiles"])
    print(json.dumps({"site": PROFILE["id"], "tiles": len(global_data["tiles"]), "mask_cells": int(mask.sum()), "projection_roundtrip": "pass", "synthetic_inputs_only": True}))
