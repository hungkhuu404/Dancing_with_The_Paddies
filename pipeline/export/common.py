"""JSON and GeoJSON helpers for S7."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
def rounded(value):
    if isinstance(value, (list, tuple)):
        return [rounded(v) for v in value]
    return round(float(value), 6)
def feature(geometry, properties):
    return {"type": "Feature", "geometry": geometry, "properties": properties}
def collection(features):
    return {"type": "FeatureCollection", "features": features}
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def invalid_constant(value):
    raise ValueError("Non-JSON numeric constant: " + value)
def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=invalid_constant)
