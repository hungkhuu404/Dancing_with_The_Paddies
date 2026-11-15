# S6: offline comparison with OPERA DSWx-S1 (Tân Hội)

Stage S6 compares the NISAR water states with the OPERA DSWx-S1 surface-water product. The runner is `pipeline/validate/run_s6.py`. It works offline on input files that you supply. It makes no network calls and needs no token.

The pixel method was selected after looking at the DSWx-S1 comparison (see [pixel method](pixel-dual-method.md)). The result of this stage is therefore post-hoc agreement. It is not independent validation. DSWx-S1 is not ground truth, so it is not field accuracy either.

## Environment

Use Python 3.11 or later in a separate virtual environment:

```sh
python -m pip install -r requirements-s6.txt
python -I -m pytest -p no:cacheprovider -q tests/core tests/validate
```

`requirements-s6.txt` adds pinned raster and plotting dependencies on top of `requirements.txt`. The option `-p no:cacheprovider` only stops pytest from writing a cache directory. CI runs the same tests without it (`.github/workflows/backend-checks.yml`).

Reading DSWx-S1 from the archive is a separate step (`dswx.py`, see [Supporting tools](#supporting-tools)). It has its own configuration and needs an Earthdata token.

## What the runner computes

- It turns the DSWx-S1 flags into a state per cell and pass: missing, not water, or water. The DSWx-S1 series is not filtered in the main comparison.
- It pairs each NISAR acquisition with the nearest DSWx-S1 pass by UTC time, within 3 days (inclusive).
- For each pair, over the cells that are valid on both sides, it computes Cohen's kappa, precision and recall. DSWx-S1 is the reference and water is the positive class. It reports the median, minimum and maximum kappa, for all pairs, per track, and for the cells seen by 3 tracks and by 2 tracks.
- It applies the S5 metrics function to both series and compares the water-arrival intervals (share of cells whose intervals overlap; median midpoint difference in days, NISAR minus DSWx-S1) and the >30-day flag (precision and recall of `yes`, and a 3 × 3 table of `yes` / `possible` / `no`).
- It reports the cropland share among the cells that NISAR flags `yes`, the water share of observations on built-up cells, and optionally the water share on one stable control cell. A cell counts as cropland or built-up when its share is at least 0.5.
- It does all of this for the filtered series `s` and for the raw series `s_raw`. A side note repeats the main figures with the DSWx-S1 series passed through the single-flip filter.

## Inputs

Keep the input files outside Git. The examples below use the git-ignored directory `runtime/`.

| Option | Required | Content |
| --- | --- | --- |
| `--cube` | yes | NPZ written by S1–S5 (`<site>_cube.npz`), with `cell_id`, `acq_utc`, `track`, `s_raw` and `s`. State codes: 0 missing, 1 not water, 2 water. |
| `--metrics` | yes | Metrics CSV of the same run (`<site>_metrics.csv`). The runner recomputes the metrics from the cube and stops if any value differs. |
| `--dswx` | yes | NPZ with `cell_id`, `TD_utc`, `TD` (local time) and the boolean arrays `valid` and `water` of shape (passes, cells). See below for `water13` and `cell_bounds`. |
| `--landcover` | yes | CSV with `cell_id`, `cropland_share` and `builtup_share` (ESA WorldCover 2021 shares per cell, as written by `landcover.py`). |
| `--gate` | yes | JSON with two timezone-aware timestamps, `frozen_utc` and `first_dswx_read_utc`. See below. |
| `--output-dir` | yes | A new or empty directory. |
| `--stable-cell-id` | no | ID of one cell to use as stable control. The runner never chooses a cell by itself. |
| `--posthoc-entry`, `--before-validation` | no | A post-hoc entry and the earlier validation file. The two options must be given together. See below. |
| `--figures` | no | Also write two figures. |

Notes on the inputs:

- **DSWx-S1 NPZ.** The cell IDs must be the same set as in the cube. The order may differ. `water13` is optional. Supply it only when exact labels for classes 1+3 are available. Without it the runner leaves out the secondary class 1+3 comparison; it never derives these labels from rounded fractions. `cell_bounds` is needed only for `--figures`.
- **Land-cover CSV and metrics CSV.** Both must cover exactly the cells of the cube.
- **Gate file.** `frozen_utc` is the time the original method definition was frozen. `first_dswx_read_utc` is the time DSWx-S1 was first read. The runner requires the read to be later than the freeze and copies both timestamps into `validation.json`. It does not modify the gate file. The pixel method was adopted after DSWx-S1 had been read, so these timestamps do not make the comparison independent.
- **Post-hoc entry.** A JSON object that describes a method change made after DSWx-S1 was first read. The entries in `data/tan_hoi/validation.json` have the fields `id`, `changed_utc`, `by`, `what` and `why`. `schema/validation.schema.json` requires `id` to be `PH-` followed by at least two digits. The runner adds `before` and `after` summaries of the filtered comparison, takes `frozen_utc` from the earlier validation file and keeps that file's post-hoc history. Without these two options, `posthoc` is an empty list and `comparison_is_independent` in `input_snapshot.json` is null: the runner makes no claim that the comparison is independent. With them, it is `false`.

## Run

From the repository root:

```sh
python -I pipeline/validate/run_s6.py \
  --cube runtime/pixel/tan_hoi_cube.npz \
  --metrics runtime/pixel/tan_hoi_metrics.csv \
  --dswx runtime/dswx/dswx_tan_hoi.npz \
  --landcover runtime/tan_hoi_landcover.csv \
  --gate runtime/baseline/gate.json \
  --stable-cell-id E520000N1122500 \
  --posthoc-entry runtime/pixel/posthoc_entry.json \
  --before-validation runtime/baseline/validation.json \
  --output-dir runtime/s6-check \
  --figures
```

`E520000N1122500` is the cell at the stable reference window in `config/sites/tan_hoi.toml`.

The runner stops with an error when:

- the output directory is inside `data/` or `web/public/`, or is not new or empty;
- an input file is missing or lies inside the output directory;
- cell IDs are duplicated, or the cube, DSWx-S1, land-cover and metrics files do not cover the same cells;
- an array has the wrong shape, a state code is not 0, 1 or 2, or a DSWx-S1 flag array is not boolean;
- the cube acquisitions are not unique and in time order;
- the metrics CSV does not match the metrics recomputed from the cube;
- an input file changes during the run.

## Outputs

- `validation.json`: the comparison, checked against `schema/validation.schema.json`. Timestamps are written in UTC with a `Z` suffix and keep their fractional seconds.
- `input_snapshot.json`: the SHA-256 of every input file, of `validation.json` and of the source files `run_s6.py`, `validation.py`, `science.py` and `add_posthoc.py`, plus the number of cells and acquisitions.
- With `--figures`: `fig/map_nisar_vs_dswx.png` and `fig/kappa_per_pair.png`, for review.

The runner does not publish anything. Only S7 writes the files in `data/`.

To check a reproduced file against the published one:

```sh
python -c "import json,pathlib; p=pathlib.Path; assert json.loads(p('runtime/s6-check/validation.json').read_text()) == json.loads(p('data/tan_hoi/validation.json').read_text())"
```

The two files are equal only if all inputs, including the post-hoc entry and the earlier validation file, are the ones used for the published file.

## Supporting tools

All tools are in `pipeline/validate/`.

- **`dswx.py <reader.toml> [--force]`**: reads OPERA DSWx-S1. It searches CMR, reads the window of each granule, caches it, aggregates the pixel codes per cell and writes an NPZ (including `cell_id`, `cell_bounds`, `TD`, `TD_utc`, `valid`, `water`, `water13`) and a summary CSV. The environment variable `EARTHDATA_TOKEN_FILE` must point to a file that holds the Earthdata token. `--force` downloads cached windows again.
- **`landcover.py --config <reader.toml>`**: computes the ESA WorldCover 2021 shares per 250 m cell. It writes a CSV with `cell_id`, `x_m`, `y_m`, `n_px`, `cropland_share`, `builtup_share`, `water_share`, `tree_share` and `cropland`, and a PNG map. It stops if the number of cells differs from `expected_cells`.
- **`csv_to_dswx.py --csv <file> --timezone Asia/Ho_Chi_Minh --output <file.npz>`**: converts a per-cell table with the columns `cell_id`, `acq_utc`, `acq_local`, `valid` and `water` into the NPZ for the class 1 comparison. It checks every timestamp, cell ID and flag, requires a complete table (every cell at every time) and does not overwrite an existing output file. It does not create class 1+3 labels.
- **`add_posthoc.py <validation.json> <before-validation.json> <entry.json>`**: attaches a post-hoc entry with its `before` and `after` summaries. It keeps the fractional seconds of `frozen_utc` and rejects conflicting post-hoc history. `run_s6.py` calls it when the post-hoc options are given.
- **`make_limits_text.py validation.json limits.md`**: writes the public limitations text. By default the text contains no DSWx-S1 agreement figures. With `--internal` it writes the agreement figures for review; a missing figure is shown as "not available".

### Reader configuration

`dswx.py` and `landcover.py` each take their own TOML file. The repository does not include these files. The site files in `config/sites/` configure S1–S5; they lack the reader fields and cannot be passed directly. Paths for the cache, the boundary and the outputs are resolved relative to the directory of the TOML file.

| Tool | Table | Keys read by the code |
| --- | --- | --- |
| `dswx.py` | `[site]` | `bbox`, `epsg` |
| | `[grid]` | `mode` (`cells_250` or `dev_npz`). For `cells_250`: `cell_size_m`, `frame_e_min`, `frame_e_max`, `frame_n_min`, `frame_n_max`, `window_margin_m`, and optionally `boundary_path` with `boundary_epsg` |
| | `[search]` | `cmr_url`, `short_name`, `temporal_start`, `temporal_end`, `page_size`, `layer_suffix`, `local_tz` |
| | `[thresholds]` | `valid_code_lt`, `valid_share_min`, `water_code`, `extra_code`, `water_share_min` |
| | `[output]` | `cache_dir`, `npz`, `csv` |
| `landcover.py` | `[site]` | `epsg`, `cell_size_m`, `frame_e_min`, `frame_e_max`, `frame_n_min`, `frame_n_max`, `expected_cells`, and optionally `boundary_path` with `boundary_epsg` |
| | `[worldcover]` | `url`, `cache_path`, `window_margin_m`, `nodata_class`, `cropland_class`, `builtup_class`, `water_class`, `tree_class`, `cropland_threshold` |
| | `[output]` | `csv`, `png`, `share_decimals` |

The published comparison records these DSWx-S1 rules in `validation.json`: a cell is valid if at least 70% of its pixels have a code below 250, and it is water if at least 50% of its valid pixels have code 1 (open water).

## Protocol regression suite

```sh
python -I -m pytest -p no:cacheprovider -q tests/bang1/tests \
  --bang1-adapter pipeline/core/bang1_adapter.py --bang1-require-adapter
```

This suite checks the cell-mean classifier, the single-flip filter and the metrics (see `tests/bang1/README.md`). It does not replace the tests of the pixel classification in `tests/core/test_pixel_dual.py`.

One land-cover test in `tests/validate` reads a real output table. It is skipped when the reader configuration and that table are not present, as in a clean checkout. The other tests in `tests/validate` use synthetic inputs. Do not use fixture data as web output.

## Limitations

- The agreement is post-hoc. It is not independent validation and not field accuracy.
- The runner supports Tân Hội only. It writes `site: "tan_hoi"`, uses the Asia/Ho_Chi_Minh time zone and labels the figures for Tân Hội. Do not use it to publish Bang Rakam results.
