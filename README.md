# Flood Calendar

*Day in, days under, day out: NISAR keeps each rice block's flood calendar.*

Team **Dancing with The Paddies** · NASA Space Apps Challenge 2026 · Challenge: *Dancing with the SARs*

**Data status:** The web reads the Tân Hội H7 and Bang Rakam radar exports under contract 2.0.0. The repository includes S1–S5, an offline S6 comparison runner and S7. Reference agreement is post-hoc, not independent accuracy evidence; the interface does not report agreement scores. See [web instructions](web/README.md), [method](docs/pixel-dual-method.md), [S6 instructions](docs/s6-comparison.md) and [H7 data status](docs/provenance/h7-data-status.md).

**Web app:** https://flood-calendar.pages.dev — on 15 November 2026 it served the same Tân Hội H7 and Bang Rakam exports as `data/` in this repository (matching `generated_utc` in each `meta.json`).

## The problem

Every autumn, Tân Hội commune in An Giang, Vietnam, opens the dikes around its rice fields after the Autumn–Winter harvest and lets the Mekong flood in. This is deliberate: the flood brings silt and cleans the fields between crops. Then the water has to be pumped out again before Winter–Spring rice can be sown, and the province's sowing calendar for that crop closes on 31 December 2026. A field that still holds water cannot be sown.

The commune's own plan sets out who has to make this work (Plan 122/KH-UBND, 12 May 2026, following provincial Letter 3767/SNNMT-KH). It covers 24 hamlets and 9,622 ha of diked fields:

- The **Commune People's Committee** sets the sowing window and the flood-release timing, and must update the flood level to adjust the sowing calendar.
- The **flood-release zones** pump the water out so they can sow within the calendar.
- The **cooperatives** track the water and announce the flood-release schedule to farmers.

Each of these duties needs the same answer: where is open water still standing, hamlet by hamlet, and since when? The plan asks the commune to track the flood; it does not give it a map of the flood. The season when the answer matters most is also the season when the delta is often under cloud, which limits optical satellites. Radar is not limited by cloud.

Reports give totals, not places. In the 2025 season, a provincial sowing report listed 25,053 of 505,712 ha (4.95%) of An Giang's planned Winter–Spring rice as sown (Official Letter 5395/SNNMT-CCTTBVTV). A number like that says how far the season has gone, not which fields still hold water.

## Who it is for

| User (from Plan 122) | Decision | What Flood Calendar gives them |
| --- | --- | --- |
| Commune People's Committee, Tân Hội | Sowing window and flood-release timing for 24 hamlets; when to adjust the calendar | For each 250 m block: is open water still seen, when it arrived, how long it has stayed. Summarised by nearest hamlet (hamlet names from OpenStreetMap) |
| Agricultural cooperatives | Which areas to check first before announcing the schedule to farmers | Blocks where open water is no longer seen, and blocks where it is still seen, on the latest radar date. This does not mean a field is ready to sow |
| Later: provincial department | Progress across communes | The same view for other communes, after site set-up and a threshold review |

Flood Calendar does not replace a field visit. It shows where to send one.

NISAR data reaches us about two weeks after acquisition, so the map shows recent weeks, not today. Every date is a range between two radar passes.

These users and decisions come from the commune's published plan. We have not yet put the tool in front of commune staff; that is the next step.

## Why NISAR

Flat open water reflects NISAR's L-band radar away from the satellite, so it shows dark in both HH and HV, with or without cloud, day or night. Tân Hội is covered by three NISAR tracks, so each block gets a new look every 3–5 days, from free NASA data.

On the latest radar date for each block (up to 3 November 2026), open water was still seen on 9,825 ha and no longer seen on 1,281 ha. These areas are within our 14,650 ha grid of 2,344 blocks, not the 9,622 ha diked area of the plan. The 1,281 ha show where a cooperative could check first.

We also ran the method on Bang Rakam, a rice plain in Phitsanulok, Thailand (2,304 blocks, 11 radar passes). It needed its own site settings, per-image thresholds and handling for mixed 10 m and 20 m pixels.

## What it does

Flood Calendar uses NISAR L-band radar to answer three questions for every 250 m cell of Tân Hội commune (2,344 cells, 14,650 ha):

1. **Is open water still there?**
2. **How long has the field been under water?** Given as a minimum and a maximum number of days.
3. **When did the water arrive?** Given as a date range. On dry, flat fields the radar can mark the start earlier than it happened on the ground.

Each NISAR track revisits every 12 days, so every date is a range between two images, never a single day.

The local web includes:

- A map that can be replayed image by image, and a chart for any single cell.
- A layer for fields flooded more than 30 days before the season, relevant *if the IPCC emission factor is applied* (IPCC 2019, Table 5.13).

Bang Rakam (Thailand) uses the QUAN-9 export: 2,304 blocks and 11 observations in a 12 × 12 km study frame. Tân Hội H7 uses 22 observations. Both retain their scientific limitations. Data sonification follows observed water area; ambient landscape audio is illustrative. See [two-site integration](docs/plans/two-site-real-data.md).

What it does **not** do: it does not measure methane, and it cannot tell whether a field was sown right after the water left.

## How it works

The web reads the published pixel export rather than running the pipeline. S6 runs offline on explicitly supplied snapshots and records their hashes; only S7 publishes web data.

| Stage | What it does | Folder |
| --- | --- | --- |
| S0 Catalogue | Query NASA CMR for NISAR L2 GCOV scenes over the site; keep the latest CRID of each acquisition | `pipeline/catalog/` |
| S1 Read | Read the HH and HV windows over HTTPS into a local cache | `pipeline/core/` |
| S2 Grid | Prepare 250 m cells and diagnostic HH/HV means | `pipeline/core/` |
| S3 Reference | Measure a river reference and a stable area for each track; run checks P1–P3 | `pipeline/core/` |
| S4 Classify | Apply HH/HV thresholds to pixels, require 75% water pixels, and filter single-image flips using a 50% fill guard | `pipeline/core/` |
| S5 Indicators | Water arrival, days under water, current status, >30-day flag | `pipeline/core/` |
| S6 Compare | Compare with OPERA DSWx-S1 | `pipeline/validate/` |
| S7 Export | Write static files for the web | `pipeline/export/` |

The v2 export records Q0 defaults of HH < −14 dB and HV < −20 dB, with per-acquisition Q1 overrides. It marks a cell as water when at least 75% of jointly valid pixels meet both acquisition thresholds. A 50% threshold controls whether a dry singleton between water observations is filled. The pixel method was selected after examining OPERA DSWx-S1 agreement; that agreement is post-hoc, not independent validation or field accuracy. The comparison file also retains its clearly marked historical H3 baseline; the web reads the v2 pixel states.

The file format between the pipeline and the web is defined in [docs/data-contract.md](docs/data-contract.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `pipeline/core/` | S1–S5 pixel pipeline |
| `pipeline/catalog/`, `pipeline/export/` | S0 catalog and S7 export |
| `pipeline/validate/` | S6 comparison, DSWx reader, landcover helpers and report tools |
| `config/sites/` | Site configuration |
| `schema/` | JSON Schema for exported files |
| `tests/` | Pipeline tests. Web tests are in `web/test/` |
| `data/` | Exported data read by the web (`data/sites.json`, `data/{site}/`) |
| `web/` | Local static website (Vite, MapLibre GL JS, Three.js); original asset-generator sources are included in web/tools/ |
| `web/src/sound/` | Not present; data sonification is not migrated |
| `docs/` | Data contract and method notes |

## Quick start

### Web

Requires Node.js 24.

```bash
cd web
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1  # syncs only allowlisted public files
npm test
npm run build    # static site in web/dist/
```

### Pipeline

The pipeline requires Python 3.11+. A NASA Earthdata token is required for network reads, but not for offline tests or the local web.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q tests/core
```

For S6, install `requirements-s6.txt` and follow [the explicit-input runner instructions](docs/s6-comparison.md). Raw snapshots, raster cache and tokens are not distributed with the repository.

Keep the token in a file outside the repository and point to it:

```bash
export EARTHDATA_TOKEN_FILE=/path/to/token.txt        # PowerShell: $env:EARTHDATA_TOKEN_FILE="C:\path\to\token.txt"
```

**Check a published export (offline, no token).** This re-checks schemas, cell IDs, series lengths, area totals, per-pass summaries, backdrop files and file-size limits against `data/`:

```bash
python pipeline/export/verify.py --data data --site tan_hoi
python pipeline/export/verify.py --data data --site bang_rakam
```

On Windows, set `PYTHONUTF8=1` first (`$env:PYTHONUTF8=1` in PowerShell) so the Vietnamese hamlet names print correctly. Both sites pass on this revision; the three web checks it lists as pending (OSM overlay, opening without manual edits, initial transfer size) are browser checks outside this script.

**Rebuild a site from NISAR (network and Earthdata token required).** The stages are separate commands, shown here for Tân Hội; replace the config with `config/sites/bang_rakam.toml` for Bang Rakam. Paths inside a site TOML are relative to that TOML.

```bash
python pipeline/catalog/s0.py --config config/sites/tan_hoi.toml           # S0: CMR catalogue
cd pipeline/core
python run_pipeline.py --config ../../config/sites/tan_hoi.toml --output <s1-s5-dir>   # S1–S5
cd ../..
python pipeline/export/s7.py --input-dir <s1-s5-dir> --config config/sites/tan_hoi.toml \
  --landcover <landcover.csv> --output <new-export-dir>                   # S7: web files
python pipeline/export/verify.py --data <new-export-dir> --site tan_hoi   # check the new export
```

S6 (comparison with OPERA DSWx-S1) runs offline on supplied snapshots; see [docs/s6-comparison.md](docs/s6-comparison.md). Run any stage with `--help` for its options. The published `data/` was produced by these stages; this README's full rebuild sequence was not re-run end to end when it was written.

Never commit the token, the image cache or files with signed links.

## Data sources

| Data | Provider | Use | Terms |
| --- | --- | --- | --- |
| NISAR L2 GCOV, Provisional and Validated V1 ([10.5067/NIL2GCOV-P1](https://doi.org/10.5067/NIL2GCOV-P1), [10.5067/NIL2GCOV-V1](https://doi.org/10.5067/NIL2GCOV-V1)) | NASA / ISRO, via ASF DAAC | Water detection (S1–S5) | NASA open data |
| OPERA DSWx-S1 V1 ([10.5067/OPDSWS1-L3V1](https://doi.org/10.5067/OPDSWS1-L3V1)) | NASA JPL (OPERA project) | Post-hoc comparison (S6) and post-hoc pixel-method selection | NASA open data |
| ESA WorldCover 10 m 2021 v200 ([10.5281/zenodo.7254221](https://doi.org/10.5281/zenodo.7254221)) | European Space Agency | Cropland mask | CC BY 4.0. © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium |
| OpenStreetMap (via Overpass API; base map tiles from OpenFreeMap) | OpenStreetMap contributors | Commune boundary, hamlet names, roads, bridges and places in the 3D scene; base map | ODbL, © OpenStreetMap contributors |
| EOxCloudless 2016 | EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016) | Regional imagery in the location entrance | CC BY 4.0 |
| Sentinel-2 scene metadata, via Element 84 Earth Search | Copernicus / ESA | Tile cloud cover shown in the web (not a commune measurement) | Copernicus open data terms |
| ERA5 reanalysis, via Open-Meteo | ECMWF / Copernicus Climate Change Service | Weather context (cloud cover) in the web | CC BY 4.0 |
| Natural Earth 1:10m physical layers | Natural Earth | Regional atlas labels and land | Public domain |

<!-- TODO: thêm nguồn ảnh quang học dùng trong video nếu có -->

## Limits

Final data (H7, 15 November 2026):

- **Tân Hội:** 22 NISAR acquisitions from tracks 047 D, 083 A and 148 D, 11 August–3 November 2026; 2,344 cells (14,650 ha). Nine acquisitions use per-image (Q1) thresholds instead of the default −14 dB HH / −20 dB HV.
- **Bang Rakam:** 11 acquisitions from tracks 011 A and 105 D, 14 August–31 October 2026; 2,304 cells (14,400 ha) in a 12 × 12 km study frame, not an administrative boundary. Track 112 A images had no valid samples after the GCOV mask and are excluded. The 31 October 105 D image failed the stable-area check (P3) and uses Q1 thresholds.

Limits:

- The 75% pixel method and 50% temporal guard were selected after examining OPERA DSWx-S1. Agreement with DSWx-S1 is post-hoc, not an independent test, and DSWx-S1 is not ground truth. The web does not report agreement scores; `validation.json` keeps them for inspection.
- Sparse observations do not prove continuous flooding. One track revisits every 12 days, so water arrival, days under water and water leaving are ranges between two images.
- The ">30 days" layer flags cells, not verified continuous flooding. In Tân Hội it marks 8,093.75 ha as "yes"; in a post-hoc check on 13 November the same rule applied to DSWx-S1 gave about 2,731 ha, so treat the layer as an upper bound.
- Trees and buildings can hide water from the radar; dry, flat fields can look like water, so water arrival may be dated early.
- Track 148 D misses about 14% of Tân Hội's cells; the map uses each cell's latest valid image.
- The repository's S6 runner currently supports the Tân Hội comparison; the Bang Rakam comparison (8 NISAR–DSWx-S1 pairs) was replayed from supplied inputs.
- The 3D scene is an illustration: houses, people and vegetation are generated by rules, and roads, bridges and churches follow OpenStreetMap. It is not a surveyed model of the commune.

## Use of AI

The backend team used AI coding agents (OpenAI Codex and Claude Code) to write code. Every line was reviewed manually by a team member before it was merged.

<!-- TODO: phần video đang hỏi lại -->


## References

Literature and plans:

- IPCC (2019). *2019 Refinement to the 2006 IPCC Guidelines for National Greenhouse Gas Inventories*, Vol. 4, Ch. 5, Table 5.13.
- Arai, H., Takeuchi, W., Oyoshi, K., Nguyen, L. D., Inubushi, K. (2018). Estimation of Methane Emissions from Rice Paddies in the Mekong Delta Based on Land Surface Dynamics Characterization with Remote Sensing. *Remote Sensing* 10(9), 1438. https://doi.org/10.3390/rs10091438
- Hoang-Phi, P., Lam-Dao, N., Dang-Pham-Bao, N., Le Toan, T., Truong-Nhat-Kieu, T., Sobue, S. (2026). Inundation Monitoring in Rice Fields Using ALOS-2 PALSAR-2: A Case Study of An Giang, the Mekong Delta in Vietnam. *Remote Sensing* 18(13), 2190. https://doi.org/10.3390/rs18132190
- Kitratporn, N., Koedkurang, K., Nueangjamnong, P., Simachokchai, K., Chayawat, C., Sobue, S., Le Toan, T. (2026). A Multi-Frequency SAR Framework for Methane Emission Estimation in Thai Rice Paddies. *Remote Sensing* 18(13), 2194. https://doi.org/10.3390/rs18132194
- CH4Rice project, Space Applications for Environment (SAFE) initiative led by the Vietnam National Space Center. https://www.eorc.jaxa.jp/SAFE/project/ch4rice
- Tân Hội Commune People's Committee, Plan 122/KH-UBND (12 May 2026).
- An Giang Department of Agriculture and Environment, Official Letter 3767/SNNMT-KH (16 April 2026).

Data: see [Data sources](#data-sources) for every dataset, provider, DOI and licence.

Software: Python (NumPy, h5py, pyproj, Shapely, Pillow, jsonschema, aiohttp, pytest); web built with Vite and three.js, MapLibre GL JS, postprocessing, n8ao and SunCalc; fonts IBM Plex Sans and Newsreader via Fontsource. Licences are listed under [License](#license).

## License

Code in this repository is released under the [MIT License](LICENSE).

Third-party packages used by the web keep their own licenses: three.js (MIT), MapLibre GL JS (BSD-3-Clause), postprocessing (Zlib), n8ao (ISC), IBM Plex Sans and Newsreader fonts via Fontsource (SIL OFL 1.1). Data keeps the terms listed under [Data sources](#data-sources).
