"""Offline Tân Hội S6 comparison with explicit inputs and snapshot hashes.

Outputs stay in a new local directory. Only S7 publishes into data/.
"""
import argparse
import csv
import hashlib
import json
import os
import sys
from zoneinfo import ZoneInfo
from pathlib import Path
import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(REPO / "pipeline/core"))
import validation as V
import science
import add_posthoc

R4 = lambda x: None if x is None else round(float(x), 4)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def input_paths(args):
    paths = {key: getattr(args, key) for key in ("cube", "metrics", "dswx", "landcover", "gate")}
    if args.posthoc_entry:
        paths.update(posthoc_entry=args.posthoc_entry, before_validation=args.before_validation)
    return paths


def input_hashes(args):
    return {key: hashlib.sha256(path.read_bytes()).hexdigest()
            for key, path in input_paths(args).items()}


def protect_output(args):
    output = args.output_dir.resolve()
    for public in (REPO / "data", REPO / "web/public"):
        require(not output.is_relative_to(public.resolve()), "S6 cannot publish into data/ or web/public/")
    require(not output.exists() or (output.is_dir() and not any(output.iterdir())),
            "Output directory must be new or empty")
    for path in input_paths(args).values():
        require(path.is_file(), "Missing input: " + path.name)
        require(not path.resolve().is_relative_to(output), "Output directory contains an input")


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    require(bool(rows), "Empty CSV: " + path.name)
    result = {row["cell_id"]: row for row in rows}
    require(len(result) == len(rows), "Duplicate CSV cell_id: " + path.name)
    return result


def validate_inputs(cube, dsw):
    for name, data in (("cube", cube), ("DSWx", dsw)):
        ids = data["cell_id"].tolist()
        require(bool(ids) and len(ids) == len(set(ids)), name + " has empty/duplicate cell_id")
    require(set(cube["cell_id"].tolist()) == set(dsw["cell_id"].tolist()), "DSWx/cube cell_id differ")
    t, n = len(cube["acq_utc"]), len(cube["cell_id"])
    require(t > 0 and len(cube["track"]) == t, "Cube acquisition length mismatch")
    times = [V._dt(V.utc_z(str(x))) for x in cube["acq_utc"]]
    require(times == sorted(set(times)), "Cube acquisitions must be unique and ordered")
    for key in ("s", "s_raw"):
        require(cube[key].shape == (t, n), "Cube state shape mismatch")
        require(bool(np.isin(cube[key], [0, 1, 2]).all()), "Unknown state code")
    require(np.array_equal(cube["s"] > 0, cube["s_raw"] > 0), "Filtered/raw validity differs")
    td = len(dsw["TD_utc"])
    require(td > 0 and len(dsw["TD"]) == td, "DSWx time length mismatch")
    for key in ("valid", "water", "water13"):
        require(dsw[key].shape == (td, n), "DSWx flag shape mismatch")
        require(dsw[key].dtype == np.dtype(bool), "DSWx flags must be boolean")


def metrics_rows(states, acq_utc, tracks, cropland):
    return [science.metrics_for_cell(states[:, k], acq_utc, tracks, bool(cropland[k])) for k in range(states.shape[1])]


def run(args):
    OUT = args.output_dir.resolve()
    protect_output(args)
    hashes = input_hashes(args)
    cube = np.load(args.cube, allow_pickle=False)
    dsw = np.load(args.dswx, allow_pickle=False)
    gate = json.loads(args.gate.read_text(encoding="utf-8"))
    ids = cube["cell_id"].tolist()
    validate_inputs(cube, dsw)
    order = {c: i for i, c in enumerate(dsw["cell_id"].tolist())}
    perm = np.array([order[c] for c in ids])  # cube cell order -> dswx column
    D = {k: dsw[k][:, perm] for k in ("valid", "water", "water13")}
    lc = read_csv(args.landcover)
    require(set(lc) == set(ids), "Landcover cell_id set differs from cube")
    crop = np.array([float(lc[c]["cropland_share"]) >= 0.5 for c in ids])
    built = np.array([float(lc[c]["builtup_share"]) >= 0.5 for c in ids])
    tm = read_csv(args.metrics)
    require(set(tm) == set(ids), "Metrics cell_id set differs from cube")
    ntr = np.array([int(tm[c]["n_tracks"]) for c in ids])
    acq = [str(x) for x in cube["acq_utc"]]
    trk = [str(x) for x in cube["track"]]
    dutc = [V.utc_z(str(x) if V._dt(str(x)).tzinfo is not None else str(x)+"Z") for x in dsw["TD_utc"]]
    require(V._dt(V.utc_z(gate["first_dswx_read_utc"])) > V._dt(V.utc_z(gate["frozen_utc"])),
            "Historical first DSWx read must follow original H3 freeze")
    dloc = [str(x)[:10] for x in dsw["TD"]]
    nloc = [V._dt(a).astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat() for a in acq]
    pairs_idx = V.pair_acquisitions(acq, dutc, 3.0)

    # DSWx states: 0 missing, 1 N, 2 W (main: unfiltered, code 1)
    def dstates(water):
        return np.where(D["valid"], np.where(water, 2, 1), 0).astype(np.uint8)
    dS = dstates(D["water"]); dS13 = dstates(D["water13"])
    dSf = science.filter_singletons(dS)
    dtracks = ["dswx"] * len(dutc)

    # sanity: Tan's metrics recomputed from cube s equal CSV
    nm_f = metrics_rows(cube["s"], acq, trk, crop)
    for k, cell in enumerate(ids):
        for key, value in tm[cell].items():
            if key == "cell_id":
                continue
            require(key in nm_f[k], "Unknown metric column: " + key)
            actual = nm_f[k][key]
            if value == "":
                expected = None
            elif value in ("true", "false"):
                expected = value == "true"
            elif isinstance(actual, (int, float)) and not isinstance(actual, bool):
                expected = float(value)
            else:
                expected = value
            require(actual == expected, "Metrics differ from cube/S5 for " + cell + ": " + key)

    def block(nkey, dstate, dwater_key_states):
        N = cube[nkey]
        ns = N == 2
        nv = N > 0
        pairs, ks = [], []
        by_track = {}
        for i, j, gap in pairs_idx:
            both = nv[i] & (dwater_key_states[j] > 0)
            st = V.agreement_stats(ns[i][both], (dwater_key_states[j] == 2)[both])
            pairs.append(dict(i=i, track=trk[i], nisar_date_local=nloc[i], dswx_date_local=dloc[j],
                              dswx_time_local=str(dsw["TD"][j])[11:16], gap_days=round(gap, 1),
                              n_cells=st["n_cells"], kappa=R4(st["kappa"]), precision=R4(st["precision"]),
                              recall=R4(st["recall"])))
            ks.append(st["kappa"])
            by_track.setdefault(trk[i], []).append(st["kappa"])
        agg = V.summarize(ks)
        b = dict(n_pairs=len(pairs), n_nisar_acquisitions=len(acq), n_pairs_with_kappa=sum(k is not None for k in ks),
                 kappa_median=R4(agg["kappa_median"]), kappa_min=R4(agg["kappa_min"]), kappa_max=R4(agg["kappa_max"]))
        b["by_track"] = {t: dict(n_pairs=len(v), kappa_median=R4(V.summarize(v)["kappa_median"]),
                                 kappa_min=R4(V.summarize(v)["kappa_min"]), kappa_max=R4(V.summarize(v)["kappa_max"]))
                         for t, v in sorted(by_track.items())}
        b["by_n_tracks"] = {}
        for g in (3, 2):
            sel = ntr == g
            gk = []
            for i, j, gap in pairs_idx:
                both = nv[i] & (dwater_key_states[j] > 0) & sel
                gk.append(V.agreement_stats(ns[i][both], (dwater_key_states[j] == 2)[both])["kappa"])
            s = V.summarize(gk)
            b["by_n_tracks"][str(g)] = dict(n_cells_in_group=int(sel.sum()), n_pairs=len(pairs_idx),
                                            kappa_median=R4(s["kappa_median"]), kappa_min=R4(s["kappa_min"]),
                                            kappa_max=R4(s["kappa_max"]))
        # metrics from NISAR series
        nrows = metrics_rows(N, acq, trk, crop)
        drows = metrics_rows(dwater_key_states, dutc, dtracks, crop)
        on = V.onset_comparison(nrows, drows)
        b["onset"] = dict(n_cells=on["n_cells"], overlap_share=R4(on["overlap_share"]),
                          median_diff_days=R4(on["median_diff_days"]))
        g3 = V.gt30_comparison([r["flag_gt30"] for r in nrows], [r["flag_gt30"] for r in drows])
        b["gt30"] = dict(n_cells=g3["n_cells"], precision=R4(g3["precision"]), recall=R4(g3["recall"]),
                         table_rows_nisar_cols_dswx=g3["table_rows_nisar_cols_dswx"],
                         n_cells_excluded_na_on_either_side=g3["n_cells_excluded_na_on_either_side"],
                         n_nisar_yes=sum(r["flag_gt30"] == "yes" for r in nrows),
                         n_dswx_yes=sum(r["flag_gt30"] == "yes" for r in drows))
        yes = [k for k, r in enumerate(nrows) if r["flag_gt30"] == "yes"]
        b["cropland_share_of_flagged"] = R4(crop[yes].mean()) if yes else None
        b["cropland_share_of_flagged_n_cells"] = len(yes)
        bn = nv[:, built]
        b["water_share_on_builtup"] = R4(((N[:, built] == 2) & bn).sum() / bn.sum()) if bn.sum() else None
        b["water_share_on_builtup_n_obs"] = int(bn.sum())
        b["water_share_on_builtup_n_cells"] = int(built.sum())
        if args.stable_cell_id:
            require(args.stable_cell_id in ids, "Stable control cell absent from cube")
            sc = ids.index(args.stable_cell_id)
            sv = nv[:, sc]
            b["water_share_on_stable_reference_cell"] = R4(((N[:, sc] == 2) & sv).sum() / sv.sum()) if sv.sum() else None
            b["water_share_on_stable_reference_cell_n_obs"] = int(sv.sum())
        b["n_cells_total"] = len(ids)
        return b, pairs

    filt, pf = block("s", None, dS)
    unf, pu = block("s_raw", None, dS)
    filt["pairs_detail_key"] = unf["pairs_detail_key"] = "pairs"
    v13f, _ = block("s", None, dS13)
    v13u, _ = block("s_raw", None, dS13)
    side_f, _ = block("s", None, dSf)
    side = lambda b: {k: b[k] for k in ("n_pairs", "kappa_median", "kappa_min", "kappa_max", "onset", "gt30")}
    out = dict(
        reference="OPERA DSWx-S1, WTR class 1 (open water)",
        frozen_utc=gate["frozen_utc"], first_dswx_read_utc=gate["first_dswx_read_utc"],
        site="tan_hoi", n_dswx_passes=len(dutc), n_nisar_acquisitions=len(acq),
        pairing="each NISAR acquisition to nearest DSWx pass by UTC time, within 3 days (inclusive)",
        dswx_rules="cell valid if >=70% px code<250; water if >=50% of valid px code 1; DSWx series not filtered",
        filtered=filt, unfiltered=unf, pairs=pf, pairs_unfiltered=pu,
        dswx_class_1_3={"filtered": {k: v13f[k] for k in ("n_pairs", "kappa_median", "kappa_min", "kappa_max")},
                        "unfiltered": {k: v13u[k] for k in ("n_pairs", "kappa_median", "kappa_min", "kappa_max")}},
        side_note_dswx_single_flip_filtered=side(side_f),
        posthoc=[])
    for b in (filt, unf):
        b.pop("pairs_detail_key")
    (OUT / "fig").mkdir(parents=True, exist_ok=True)
    out = V.normalize_timestamps(out)
    (OUT / "validation.json").write_text(json.dumps(out, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print("pairs", len(pf), "dswx passes", len(dutc))
    for nm, b in (("filtered", filt), ("unfiltered", unf)):
        print(nm, {k: b[k] for k in ("n_pairs", "kappa_median", "kappa_min", "kappa_max", "onset", "cropland_share_of_flagged",
              "water_share_on_builtup")})
        print("  gt30", b["gt30"]); print("  by_track", b["by_track"]); print("  by_n", b["by_n_tracks"])
    print("1_3", out["dswx_class_1_3"]); print("side", out["side_note_dswx_single_flip_filtered"])

    path = OUT / "validation.json"
    if args.posthoc_entry:
        add_posthoc.main(path, args.before_validation, args.posthoc_entry)
    result = json.loads(path.read_text(encoding="utf-8"))
    from jsonschema import Draft202012Validator, FormatChecker
    schema = json.loads((REPO / "schema/validation.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(result)
    require(hashes == input_hashes(args), "An input changed during S6 run")
    evidence = dict(task="BANG-6-S6", input_sha256=hashes,
                    validation_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                    n_cells=len(ids), n_acquisitions=len(acq), schema_errors=0,
                    source_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                   for p in [Path(__file__), Path(V.__file__), Path(science.__file__), Path(add_posthoc.__file__)]},
                    comparison_is_independent=False if args.posthoc_entry else None)
    (OUT / "input_snapshot.json").write_text(json.dumps(evidence, indent=2)+"\n", encoding="utf-8")
    if args.figures:
        require(bool(pairs_idx), "No matched passes to plot")
        figures(cube, dsw, D, dloc, dutc, trk, nloc, pf, pairs_idx, dS, OUT)
    cube.close()
    dsw.close()
    return result


def figures(cube, dsw, D, dloc, dutc, trk, nloc, pf, pairs_idx, dS, OUT):
    cache = OUT / ".cache"
    (cache / "matplotlib").mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("MPLCONFIGDIR", str(cache / "matplotlib"))
    os.environ.setdefault("XDG_CACHE_HOME", str(cache))
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap
    from matplotlib.patches import Patch
    N = cube["s"]
    ids = cube["cell_id"].tolist()
    order = {c: i for i, c in enumerate(dsw["cell_id"].tolist())}
    perm = np.array([order[c] for c in ids])
    b = dsw["cell_bounds"][perm]
    x0 = b[:, 0]; y0 = b[:, 1]
    ix = ((x0 - x0.min()) / 250).astype(int); iy = ((y0 - y0.min()) / 250).astype(int)
    H, W = iy.max() + 1, ix.max() + 1
    best = max(pairs_idx, key=lambda p: int(((N[p[0]] > 0) & (dS[p[1]] > 0)).sum()))
    i, j, gap = best
    both = (N[i] > 0) & (dS[j] > 0)
    def grid(vals):
        g = np.full((H, W), np.nan); g[iy, ix] = vals; return g
    ext = [x0.min() / 1000, (x0.max() + 250) / 1000, y0.min() / 1000, (y0.max() + 250) / 1000]
    kw = dict(origin="lower", extent=ext, interpolation="nearest")
    wd = ListedColormap(["#e8e4d8", "#1f6fb4"])
    fig, ax = plt.subplots(1, 3, figsize=(16, 6.2))
    ns = np.where(N[i] > 0, (N[i] == 2).astype(float), np.nan)
    ds = np.where(dS[j] > 0, (dS[j] == 2).astype(float), np.nan)
    for a, g, t in ((ax[0], ns, f"NISAR L-band ({trk[i]}, {nloc[i]})"), (ax[1], ds, f"DSWx-S1 C-band ({dloc[j]} {str(dsw['TD'][j])[11:16]})")):
        a.imshow(grid(g), cmap=wd, vmin=0, vmax=1, **kw); a.set_title(t, fontsize=12)
    ax[0].legend(handles=[Patch(color="#1f6fb4", label="Water"), Patch(color="#e8e4d8", label="No open water")], loc="lower left", fontsize=9)
    ag = np.full(len(ids), np.nan)
    nw, dw = N[i] == 2, dS[j] == 2
    ag[both & nw & dw] = 0; ag[both & nw & ~dw] = 1; ag[both & ~nw & dw] = 2; ag[both & ~nw & ~dw] = 3
    cm = ListedColormap(["#1f6fb4", "#d95f02", "#7570b3", "#e8e4d8"])
    ax[2].imshow(grid(ag), cmap=cm, vmin=-0.5, vmax=3.5, **kw)
    ax[2].set_title(f"Agreement ({int(both.sum())} cells valid in both, gap {gap:.1f} d)", fontsize=12)
    ax[2].legend(handles=[Patch(color=c, label=l) for c, l in zip(["#1f6fb4", "#d95f02", "#7570b3", "#e8e4d8"],
                 ["Both water", "NISAR only", "DSWx only", "Both dry"])], loc="lower left", fontsize=9)
    for a in ax:
        a.set_xlabel("Easting, UTM 48N (km)"); a.set_aspect("equal")
    ax[0].set_ylabel("Northing (km)")
    fig.suptitle("Tan Hoi: NISAR water state vs OPERA DSWx-S1 (filtered NISAR series)", fontsize=14)
    fig.tight_layout(); fig.savefig(OUT / "fig/map_nisar_vs_dswx.png", dpi=150); plt.close(fig)
    # kappa over time
    col = {"047D": "#1b9e77", "083A": "#d95f02", "148D": "#7570b3"}
    fig, a = plt.subplots(figsize=(10, 5))
    from datetime import date
    for p in pf:
        if p["kappa"] is None: continue
        a.scatter(date.fromisoformat(p["nisar_date_local"]), p["kappa"], s=60, color=col[p["track"]])
    for t, c in col.items():
        a.scatter([], [], color=c, label=f"Track {t}")
    a.set_ylim(0, 1); a.set_ylabel("Cohen's kappa vs DSWx-S1"); a.set_xlabel("NISAR acquisition date (local)")
    a.set_title("Agreement per NISAR-DSWx pair (3-day matching window)"); a.legend(); a.grid(alpha=.3)
    fig.autofmt_xdate(); fig.tight_layout(); fig.savefig(OUT / "fig/kappa_per_pair.png", dpi=150); plt.close(fig)




def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('cube', 'metrics', 'dswx', 'landcover', 'gate', 'output-dir'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--stable-cell-id', help='Optional configured stable control cell')
    parser.add_argument('--posthoc-entry', type=Path)
    parser.add_argument('--before-validation', type=Path)
    parser.add_argument('--figures', action='store_true')
    args = parser.parse_args(argv)
    if bool(args.posthoc_entry) != bool(args.before_validation):
        parser.error('--posthoc-entry and --before-validation must be supplied together')
    return run(args)


if __name__ == '__main__':
    main()
