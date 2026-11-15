# Replaying the two-site pipeline

The web app reads the published S7 export files in `data/`. It does not process raw radar imagery. The processing code (stages S0–S7) is in `pipeline/` in this repository. This page explains how to re-run stages S0–S5 for each site and which checks to run before publishing an export.

## Site configuration

Each site has one TOML file. Paths inside a TOML are relative to that file.

- `config/sites/tan_hoi.toml` (Tân Hội, Vietnam, EPSG:32648): the catalogue window runs from 11 August to 3 November 2026 in local dates and includes the acquisitions of 30 October and 3 November. The published set has 2,344 cells and 22 observations.
- `config/sites/bang_rakam.toml` (Bang Rakam, Thailand): a 12 km study frame in EPSG:32647, with the study area in `data/bang_rakam/aoi.geojson`. The published set has 2,304 cells and 11 observations.

Each TOML also sets the two reference windows (`[references.water]` and `[references.stable]`, with the basis for their selection from ESA WorldCover 2021), the default thresholds (`[thresholds]`) and the DSWx tile (`[dswx]`).

Two threshold rules appear as the `rule` value in `data/<site>/meta.json`:

- `Q0`: the default thresholds from the TOML (HH −14.0 dB, HV −20.0 dB).
- `Q1`: per-image thresholds, recomputed for one acquisition from the reference windows.

In the published Bang Rakam export, the acquisition of 31 October uses `Q1`.

## Local inputs

The pipeline requires Python 3.11 or later. Install the pinned Python dependencies in a virtual environment. This is separate from the web app's Node.js setup.

```sh
python -m venv .venv
# Activate the environment for your shell, then:
python -m pip install -r requirements-s6.txt
python pipeline/core/check_inputs.py --config config/sites/tan_hoi.toml --config-only
python pipeline/core/check_inputs.py --config config/sites/bang_rakam.toml --config-only
```

`check_inputs.py` is an offline preflight. It prints a JSON result and exits with code 2 if anything is missing. With `--config-only` it checks the configuration values only. Without it, it also requires the local catalogue, AOI and land-cover files. The S1–S5 runner calls the same check before any network read or output creation.

| Input | Location relative to repository root |
| --- | --- |
| Tân Hội catalogue and WorldCover table | `runtime/tan_hoi/catalog.csv`, `runtime/tan_hoi/tan_hoi_landcover.csv` |
| Bang Rakam catalogue and WorldCover table | `runtime/bang_rakam/catalog.csv`, `runtime/bang_rakam/bang_rakam_landcover.csv` |
| AOIs | `data/tan_hoi/aoi.geojson`, `data/bang_rakam/aoi.geojson` |
| Native raster caches | The per-site `read.cache_dir` in the TOML (`cache/tan_hoi`, `cache/bang_rakam`) |

The AOI files are committed. The catalogues, land-cover tables and raster caches are not distributed with this repository; `runtime/` and `cache/` are git-ignored. Keep raw caches and credentials outside Git.

- **Catalogue.** S0 rebuilds the catalogue CSV from NASA CMR metadata. It needs network access but no Earthdata token and downloads no imagery:

  ```sh
  python pipeline/catalog/s0.py --config config/sites/bang_rakam.toml
  ```

- **Land-cover table.** This is a per-cell table derived from ESA WorldCover 2021. S1–S5 read its `cell_id` and `cropland` columns. `pipeline/validate/landcover.py` computes such a table; it takes its own TOML file (sections `site`, `worldcover`, `output`), and no such file is committed. Do not reconstruct cropland flags from water observations.
- **Raster cache.** Native GCOV caches are not included, so S1 must read the granules over the network. This needs a NASA Earthdata token. Put the token in a file outside the repository and set `EARTHDATA_TOKEN_FILE` to its path.

Then run the full preflight and stages S1–S5. The commands below are for Bang Rakam; use `config/sites/tan_hoi.toml` for Tân Hội.

```sh
python pipeline/core/check_inputs.py --config config/sites/bang_rakam.toml
python pipeline/core/run_pipeline.py --config config/sites/bang_rakam.toml --output runtime/bang_rakam/replay
```

Use `--offline` only with a complete, compatible `manifest.json` and raster cache in the output directory. The runner refuses an output directory that contains `method_freeze.json` (error `FrozenOutputDirectoryIsImmutable`); use a new directory. A rerun writes a draft method definition (`method_freeze.draft.json`). It does not replace the published export and is not a new scientific approval. See [S6 comparison](s6-comparison.md) for the separate post-hoc comparison stage.

## Native 20 m handling

`pipeline/core/science.py::classification_grid` represents each aligned 20 m pixel as four 10 m area samples with identical linear power and missingness. It does not interpolate or increase radar resolution. This preserves exact area weighting at 250 m edges, the 70% joint-valid threshold, 75% water classification and 50% temporal guard. Existing 10 m calculations are unchanged.

S1 reads edge-overlapping native pixels for the scene window. Reference windows stay on their native grid. A scene with zero valid AOI pixels is skipped and recorded as `NoValidPixelsAfterGCOVMask`. The cache identity (`pipeline/core/gcov_io.py::cache_identity`) has version 4, so caches written with an earlier identity are not reused. Prepare a new cache and output directory rather than editing existing manifests.

The implementation is checked against independent rectangle-intersection calculations, including missing samples and reversed axis directions, and by synthetic end-to-end S1 and S2–S5 tests (`tests/core`).

## Checks before publication

Run these from the repository root:

```sh
python -I -m pytest -q tests/core tests/validate
python -I -m pytest -q tests/bang1/tests --bang1-adapter pipeline/core/bang1_adapter.py --bang1-require-adapter
python -X utf8 pipeline/export/verify.py --data data --site tan_hoi
python -X utf8 pipeline/export/verify.py --data data --site bang_rakam
npm --prefix web test
npm --prefix web run build
node web/scripts/verify-published-data.mjs
```

- The first command runs the core and comparison regression tests.
- The second runs the S4–S5 rule tests in `tests/bang1/` (classification, state filter and metrics cases) against the pipeline through `pipeline/core/bang1_adapter.py`.
- `pipeline/export/verify.py` checks one site's S7 export in `data/` against the schemas in `schema/`.
- The last three commands test the web app, build it and compare the built data files with the committed inputs. See [the web app instructions](../web/README.md).

The reusable workflow `.github/workflows/backend-checks.yml` runs the backend tests, the two configuration checks and both S7 verifiers. It needs no credentials and no raw imagery. `.github/workflows/web-ci.yml` calls it on pull requests and on pushes to `main`. Production deployment requires both that job and the tested web build to succeed. The web workflow also verifies the committed data inputs and the built data.

These checks establish consistency only. Post-hoc agreement with DSWx-S1 is not independent field accuracy. A rerun from raw GCOV granules and a check of the hosted deployment are separate steps that these commands do not cover.
