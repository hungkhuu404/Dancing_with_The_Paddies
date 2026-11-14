# Flood Calendar

*Day in, days under, day out: NISAR keeps each rice block's flood calendar.*

Team **Dancing with The Paddies** · NASA Space Apps Challenge 2026 · Challenge: *Dancing with the SARs*

**Live site:** https://flood-calendar.pages.dev

## What it does

In An Giang, Vietnam, communes open their diked rice fields to the river flood after the Autumn–Winter crop, then pump the water out before sowing the Winter–Spring crop. The flood is wanted: it cleans the fields, flushes acidity, brings silt, and breaks the cycle of brown planthoppers and weeds. The hard part is timing. Commune plans set a sowing window, and cooperatives have to know which fields still hold water.

Flood Calendar uses NISAR L-band radar to answer three questions for every 250 m cell of Tân Hội commune (2,344 cells, 14,650 ha):

1. **Is open water still there?**
2. **How long has the field been under water?** Given as a minimum and a maximum number of days.
3. **When did the water arrive?** Given as a date range. On dry, flat fields the radar can mark the start earlier than it happened on the ground.

Each NISAR track revisits every 12 days, so every date is a range between two images, never a single day.

The site also has:

- A map that can be replayed image by image, and a chart for any single cell.
- A sound made from the data itself: a "listen" button for the whole commune or for one cell.
- A layer for fields flooded more than 30 days before the season, relevant *if the IPCC emission factor is applied* (IPCC 2019, Table 5.13).
- A second test site, Bang Rakam (Thailand). <!-- TODO: cập nhật theo mức Bang Rakam cuối cùng tại mốc khóa số liệu -->

What it does **not** do: it does not measure methane, and it cannot tell whether a field was sown right after the water left.

## How it works

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

The default HH/HV thresholds are −14/−20 dB, with track-specific fallback where reference checks require it. For a valid cell, each pixel must be below both acquisition thresholds; the cell is water when at least 75% of jointly valid pixels meet them. A 50% lower threshold controls whether a dry singleton between water observations is filled. The pixel method was selected after examining OPERA DSWx-S1 agreement, so those numbers are post-hoc agreement, not independent validation or field accuracy.

The file format between the pipeline and the web is defined in [docs/data-contract.md](docs/data-contract.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `pipeline/core/` | S1–S5 |
| `pipeline/catalog/`, `pipeline/export/` | S0, S7 |
| `pipeline/validate/` | S6 |
| `config/sites/` | One TOML file per site: area, EPSG, tracks and frames, reference areas, thresholds |
| `schema/` | JSON Schema for every exported file |
| `tests/` | Pipeline tests |
| `data/` | Exported data read by the web (`data/sites.json`, `data/{site}/`) |
| `web/` | Static website (Vite, MapLibre GL JS, Three.js); `web/tools/` holds the generators for the 3D assets |
| `web/src/sound/` | Sound generated from the data |
| `docs/` | Data contract and method notes |

## Quick start

### Web

Requires Node.js 24.

```bash
cd web
npm ci
npm run dev      # local server; copies data/ into web/public/data/
npm test
npm run build    # static site in web/dist/
```

### Pipeline

Requires Python 3.11+ and a NASA Earthdata token.

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
| OPERA DSWx-S1 | NASA JPL (OPERA project) | Threshold tuning and comparison (S6) | NASA open data |
| ESA WorldCover 2021 | European Space Agency | Cropland mask | CC BY 4.0. © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium |
| OpenStreetMap | OpenStreetMap contributors | Commune boundary, hamlet names, roads, bridges and places in the 3D scene | ODbL, © OpenStreetMap contributors |

<!-- TODO: thêm nguồn ảnh quang học dùng trong video nếu có -->

## Limits

<!-- TODO: thay bằng bản cuối "Validation and limits" khi khóa số liệu -->

- The 75% pixel method and 50% temporal guard were selected after examining DSWx-S1; agreement is not an independent test and DSWx-S1 is not ground truth.
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
