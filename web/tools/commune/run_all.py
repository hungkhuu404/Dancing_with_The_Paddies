"""Whole pipeline: prep -> per-tile layout+props (parallel subprocesses) -> finish.py (checks, index.json, preview).
Run: <blender python> -I run_all.py [workers]"""
import sys, json, subprocess, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from recovery_paths import build_dir
from site_config import PROFILE, POSITIONAL
PY = sys.executable
WORKERS = int(POSITIONAL[0]) if POSITIONAL else 2

def run(*args):
    r = subprocess.run([PY, "-I", *map(str, args), "--site", PROFILE["id"]], capture_output=True, text=True, encoding="utf8", errors="replace")
    if r.returncode: raise RuntimeError(f"{args}\n{r.stdout[-2000:]}\n{r.stderr[-4000:]}")
    return r.stdout.strip()

t0 = time.time()
print(run(HERE / "prep.py"))
tiles = json.loads((build_dir() / PROFILE["scene"]["base"].rstrip("/").split("/")[-1] / "work/global.json").read_text(encoding="utf8"))["tiles"]
def one(t):
    try: return run(HERE / "tile_layout.py", t["i"], t["j"]) + "\n  " + run(HERE / "tile_props.py", t["i"], t["j"])
    except RuntimeError as e: return "FAILED " + str(e)
with ThreadPoolExecutor(WORKERS) as ex:
    res = list(ex.map(one, tiles))
for line in res: print(line, flush=True)
if any(r.startswith("FAILED") for r in res): sys.exit("some tiles failed")
print(run(HERE / "finish.py"))
print(f"total {time.time() - t0:.0f} s")
