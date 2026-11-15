"""Explicit local build/input paths; this module never reads datasets."""
import os
from pathlib import Path
TOOLS = Path(__file__).resolve().parent
def _required(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set {name} to an explicit local directory before running this generator")
    return Path(value).expanduser().resolve()
def build_dir(): return _required("FLOOD_BUILD_DIR")
def source_dir(): return _required("FLOOD_SOURCE_DIR")
def h0_dir(): return _required("FLOOD_H0_DIR")
def web_dir(): return Path(os.environ.get("FLOOD_WEB_DIR", TOOLS.parent)).resolve()
def models_dir(): return Path(os.environ.get("FLOOD_MODELS_DIR", build_dir() / "models")).resolve()
def aoi_file():
    from site_config import PROFILE
    if PROFILE["boundary"]["mode"] == "frame": return None
    return Path(os.environ.get("FLOOD_AOI_FILE", web_dir() / PROFILE["boundary"]["file"])).resolve()
def reference_scene(): return Path(os.environ.get("FLOOD_REFERENCE_SCENE", web_dir() / "public/scene")).resolve()
