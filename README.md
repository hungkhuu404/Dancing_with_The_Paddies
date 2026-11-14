# Flood Calendar

*Day in, days under, day out: NISAR keeps each rice block's flood calendar.*

Team **Dancing with The Paddies** · NASA Space Apps Challenge 2026 · Challenge: *Dancing with the SARs*

**Migration status:** The local web includes the Tân Hội landscape, map, location entrance, water calendar and Method and limits. It reads the existing public v1 data and H5 reference-comparison output; the interface does not report agreement scores. The S0/S7 tools, site configuration, schema and S1–S5 pixel pipeline are present. Exporting and integrating the pixel data, S6 code, Bang Rakam observations and H7 remain separate work. See [web instructions](web/README.md) and [scientific views](docs/plans/calendar-method.md).

**Existing live site:** https://flood-calendar.pages.dev — this migration has not been deployed or verified against that site.

## What it does

In An Giang, Vietnam, communes open their diked rice fields to the river flood after the Autumn–Winter crop, then pump the water out before sowing the Winter–Spring crop. The flood is wanted: it cleans the fields, flushes acidity, brings silt, and breaks the cycle of brown planthoppers and weeds. The hard part is timing. Commune plans set a sowing window, and cooperatives have to know which fields still hold water.

Flood Calendar uses NISAR L-band radar to answer three questions for every 250 m cell of Tân Hội commune (2,344 cells, 14,650 ha):

1. **Is open water still there?**
2. **How long has the field been under water?** Given as a minimum and a maximum number of days.
3. **When did the water arrive?** Given as a date range. On dry, flat fields the radar can mark the start earlier than it happened on the ground.

Each NISAR track revisits every 12 days, so every date is a range between two images, never a single day.

The local web includes:

- A map that can be replayed image by image, and a chart for any single cell.
- A layer for fields flooded more than 30 days before the season, relevant *if the IPCC emission factor is applied* (IPCC 2019, Table 5.13).

Data sonification and the second site, Bang Rakam (Thailand), are planned work and are not available in this checkout. Ambient 3D audio is illustrative, not the planned data sonification.

What it does **not** do: it does not measure methane, and it cannot tell whether a field was sown right after the water left.

## How it works

The table describes the pipeline code in this branch. The web reads the existing v1 public export rather than running the pipeline. S6 remains separate work; the pixel pipeline and v2 export have not yet replaced the public data.

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

The existing v1 export records Q0 defaults of HH < −14 dB and HV < −20 dB, with per-acquisition Q1 overrides. Its H5 validation file is present, but the local web does not report agreement scores. The new pixel pipeline marks a cell as water when at least 75% of jointly valid pixels meet both acquisition thresholds. A 50% threshold controls whether a dry singleton between water observations is filled. The pixel method was selected after examining OPERA DSWx-S1 agreement; that agreement is post-hoc, not independent validation or field accuracy.

The file format between the pipeline and the web is defined in [docs/data-contract.md](docs/data-contract.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `pipeline/core/` | S1–S5 pixel pipeline |
| `pipeline/catalog/`, `pipeline/export/` | S0 catalog and S7 export |
| `pipeline/validate/` | Placeholder for S6; not migrated |
| `config/sites/` | Site configuration |
| `schema/` | JSON Schema for exported files |
| `tests/` | Pipeline tests. Web tests are in `web/test/` |
| `data/` | Exported data read by the web (`data/sites.json`, `data/{site}/`) |
| `web/` | Local static website (Vite, MapLibre GL JS, Three.js); asset generators are not migrated |
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

Keep the token in a file outside the repository and point to it:

```bash
export EARTHDATA_TOKEN_FILE=/path/to/token.txt        # PowerShell: $env:EARTHDATA_TOKEN_FILE="C:\path\to\token.txt"
```

<!-- TODO: lệnh chạy pipeline cho một site — điền khi code S0–S7 đã vào repo. Không ghi lệnh chưa chạy thử. -->

Never commit the token, the image cache or files with signed links.

## Data sources

| Data | Provider | Use | Terms |
| --- | --- | --- | --- |
| NISAR L2 GCOV | NASA / ISRO, via ASF DAAC | Water detection (S1–S5) | NASA open data |
| OPERA DSWx-S1 | NASA JPL (OPERA project) | H5 comparison and post-hoc pixel-method selection; S6 code remains separate | NASA open data |
| ESA WorldCover 2021 | European Space Agency | Cropland mask | CC BY 4.0. © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium |
| OpenStreetMap | OpenStreetMap contributors | Commune boundary, hamlet names, roads, bridges and places in the 3D scene | ODbL, © OpenStreetMap contributors |

<!-- TODO: thêm nguồn ảnh quang học dùng trong video nếu có -->

## Limits

<!-- TODO: thay bằng bản cuối "Validation and limits" khi khóa số liệu -->

- The 75% pixel method and 50% temporal guard were selected after examining DSWx-S1; agreement is not an independent test and DSWx-S1 is not ground truth.
- The local web does not report agreement scores. Its existing v1 data has not yet been replaced with the pixel output.
- Bang Rakam, H7/final data and S6 pipeline code are not migrated.
- One track revisits every 12 days, so water arrival and water leaving are date ranges.
- Track 148 D does not cover about 13.5% of the commune's cells; the map uses each cell's latest valid image.
- Water arrival may be dated early on dry, flat fields.
- The 3D scene is an illustration: houses, people and vegetation are generated by rules, and roads, bridges and churches follow OpenStreetMap. It is not a surveyed model of the commune.

## Use of AI

<!-- TODO: điền theo khai báo của từng thành viên (hạn 12:00 15/11) -->

## References

<!-- TODO: bổ sung tên bài và tác giả đầy đủ -->

- IPCC (2019). *2019 Refinement to the 2006 IPCC Guidelines for National Greenhouse Gas Inventories*, Vol. 4, Ch. 5, Table 5.13.
- Arai, H. et al. (2018). *Remote Sensing* 10:1438.
- *Remote Sensing* 18(13):2190 (2026), An Giang.
- GISTDA (2026). *Remote Sensing* 18(13):2194.
- CH4Rice.
- Tân Hội Commune People's Committee, Plan 122/KH-UBND (12 May 2026).
- An Giang Department of Agriculture and Environment, Official Letter 3767/SNNMT-KH (16 April 2026).

## License

Code in this repository is released under the [MIT License](LICENSE).

Third-party packages used by the web keep their own licenses: three.js (MIT), MapLibre GL JS (BSD-3-Clause), postprocessing (Zlib), n8ao (ISC), IBM Plex Sans and Newsreader fonts via Fontsource (SIL OFL 1.1). Data keeps the terms listed under [Data sources](#data-sources).
