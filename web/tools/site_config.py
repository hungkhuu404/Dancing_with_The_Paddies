"""Shared JS/Python scene profiles; no source datasets are read here."""
import argparse
import json
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((WEB / "src/data/site-profiles.json").read_text(encoding="utf8"))
_parser = argparse.ArgumentParser(add_help=False)
_parser.add_argument("--site", default=REGISTRY["default"])
_options, POSITIONAL = _parser.parse_known_args()
if _options.site not in REGISTRY["sites"]:
    raise ValueError("Unknown study site")
PROFILE = REGISTRY["sites"][_options.site]

def frame_polygon(profile=PROFILE):
    f = profile["frame"]
    return [[f["e0"], f["n0"]], [f["e1"], f["n0"]], [f["e1"], f["n1"]], [f["e0"], f["n1"]], [f["e0"], f["n0"]]]

if __name__ == "__main__":
    print(json.dumps({"profile": PROFILE, "frame_polygon": frame_polygon()}))
