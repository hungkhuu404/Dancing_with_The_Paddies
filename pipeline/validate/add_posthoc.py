"""Attach a post-hoc entry (schema 2.0.0) to a validation.json: before = reference snapshot."""
import json, sys
from pathlib import Path
import validation as V

KEYS = ("n_pairs", "kappa_median", "kappa_min", "kappa_max", "by_track", "by_n_tracks", "gt30", "onset")


def pick(block):
    out = {k: block[k] for k in KEYS if k in block}
    out["by_track"] = {t: {"n_pairs": v["n_pairs"], "kappa_median": v["kappa_median"]} for t, v in block["by_track"].items()}
    out["by_n_tracks"] = {t: {"kappa_median": v["kappa_median"]} for t, v in block["by_n_tracks"].items()}
    return out


def main(new_path, before_path, entry_path):
    new = json.loads(Path(new_path).read_text(encoding="utf-8"))
    before = json.loads(Path(before_path).read_text(encoding="utf-8"))
    entry = json.loads(Path(entry_path).read_text(encoding="utf-8"))
    new["frozen_utc"] = before["frozen_utc"]
    entry.update(before=pick(before["filtered"]), after=pick(new["filtered"]))
    history = []
    for item in before.get("posthoc", []) + new.get("posthoc", []):
        if item["id"] == entry["id"]:
            continue
        previous = next((p for p in history if p["id"] == item["id"]), None)
        if previous is not None and previous != item:
            raise ValueError("Conflicting post-hoc history")
        if previous is None:
            history.append(item)
    new["posthoc"] = history + [entry]
    new = V.normalize_timestamps(new)
    Path(new_path).write_text(json.dumps(new, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")


if __name__ == "__main__":
    main(*sys.argv[1:4])
