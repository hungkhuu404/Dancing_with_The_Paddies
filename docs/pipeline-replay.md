# Replaying the two-site pipeline

The web reads approved S7 files from `data/`; it does not process raw radar imagery. Backend processing lives in this product repository. The Nasa preview retains matching web code, exported data and schemas, with its own hosting workflow.

## Site configuration

- `config/sites/tan_hoi.toml` covers the accepted H7 catalogue through 3 November 2026, including 30 October and 3 November. The published set has 2,344 cells and 22 observations.
- `config/sites/bang_rakam.toml` uses the accepted 12 km frame in EPSG:32647 and the exported study AOI. References, Q0 defaults and DSWx tile match QUAN-9's processing configuration. The published set has 2,304 cells and 11 observations. The acquisition-specific Q1 on 31 October remains unchanged.

Bang Rakam's reference windows come from the original QUAN-9 handoff, not a new selection. Its processing configuration has SHA-256 `dd6590bb06b928720caf5ac1381ecfd68202434078714cfaa3b66bc58a146922`; the reference confirmation is `4df41e4f29b603820899de8dce7c5c8c11431cefc1aff910709701c510965b4a`.

## Local inputs

Install the locked backend environment separately from the web:

```sh
python -m venv .venv
# Activate the environment for your shell, then:
python -m pip install -r requirements-s6.txt
python pipeline/core/check_inputs.py --config config/sites/tan_hoi.toml --config-only
python pipeline/core/check_inputs.py --config config/sites/bang_rakam.toml --config-only
```

`--config-only` checks the configuration values. Without it, preflight also requires the local catalogue, AOI and land-cover files. S1-S5 invokes that check before network reads or output creation.

| Input | Location relative to repository root |
| --- | --- |
| T?n H?i catalogue and WorldCover table | `runtime/tan_hoi/catalog.csv`, `runtime/tan_hoi/tan_hoi_landcover.csv` |
| Bang Rakam catalogue and WorldCover table | `runtime/bang_rakam/catalog.csv`, `runtime/bang_rakam/bang_rakam_landcover.csv` |
| AOIs | `data/tan_hoi/aoi.geojson`, `data/bang_rakam/aoi.geojson` |
| Native raster caches | The per-site `read.cache_dir` in the TOML |

For Bang Rakam, copy only `dau-vao/bang_rakam_landcover.csv` from the internal QUAN-9 handoff into the configured runtime location. Its SHA-256 is `8cd2d5403d35f52730cbd3c4d16d9251d1260295f3cb74bebb9b006b3e37392f`. It is derived from ESA WorldCover 2021; do not reconstruct cropland flags from water observations. Keep the archive, raw caches and credentials outside Git. The handoff does not include native GCOV caches; it cannot alone reproduce S1. Refresh S0 with the site TOML and the existing catalogue tool when the original catalogue is unavailable.

```sh
python pipeline/core/check_inputs.py --config config/sites/bang_rakam.toml
python pipeline/core/run_pipeline.py --config config/sites/bang_rakam.toml --output runtime/bang_rakam/replay
```

Use `--offline` only with a complete, compatible `manifest.json` and raster cache in the output directory. Frozen output directories remain immutable. A rerun creates a draft method definition; it does not replace the accepted export or confer a new scientific approval. See [S6 comparison](s6-comparison.md) for the separate post-hoc comparison stage.

## Native 20 m handling

`pipeline/core/science.py::classification_grid` represents each aligned 20 m pixel as four 10 m area samples with identical linear power and missingness. It does not interpolate or increase radar resolution. This preserves exact area weighting at 250 m edges, the 70% joint-valid threshold, 75% water classification and 50% temporal guard. Existing 10 m calculations are retained.

S1 reads edge-overlapping native pixels for the scene window, while references remain on their native grid. A scene with zero valid AOI pixels is explicitly skipped as `NoValidPixelsAfterGCOVMask`. Cache identity version 4 prevents reuse of earlier caches cropped before the edge fix; prepare a new cache/output rather than editing historical manifests.

The source adapter supplied with QUAN-9 has SHA-256 `bff6bc139ad9843c80e47580334390522d6b73d1bc3ba593d6013f561ef41e19`. The shared implementation is checked against independent rectangle-intersection calculations, including missing samples and reversed axis directions, plus synthetic end-to-end S1/S2-S5 tests.

## Checks before publication

```sh
python -I -m pytest -q tests/core tests/validate
python -I -m pytest -q tests/bang1/tests --bang1-adapter pipeline/core/bang1_adapter.py --bang1-require-adapter
python -X utf8 pipeline/export/verify.py --data data --site tan_hoi
python -X utf8 pipeline/export/verify.py --data data --site bang_rakam
npm --prefix web test
npm --prefix web run build
node web/scripts/verify-published-data.mjs
```

The reusable `.github/workflows/backend-checks.yml` runs backend regressions, configuration checks and both S7 verifiers without credentials or raw imagery. Product Web CI invokes it on PRs and main; production deployment requires both that job and the tested web build to succeed. The existing web workflow separately verifies the published inputs and built data. These checks establish consistency; post-hoc agreement is not independent field accuracy. A raw GCOV rerun, hosted deployment and human submission acceptance are separate checks.
