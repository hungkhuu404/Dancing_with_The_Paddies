# Flood Calendar

*Day in, days under, day out: NISAR keeps each rice block's flood calendar.*

Team **Dancing with The Paddies** · NASA Space Apps Challenge 2026 · Challenge: *Dancing with the SARs*

**Migration status:** Tân Hội landscape, same-tab map, location entrance, water calendar and Method and limits are integrated with the S0/S7 tools, site configuration, JSON Schema and public v1 data. H5 reference-comparison output is available; the interface does not report agreement scores. S1-S6 pipeline integration, Bang Rakam observations and H7 remain separate work. See [web instructions](web/README.md) and [scientific views](docs/plans/calendar-method.md).

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

The table below describes the planned pipeline. These folders contain placeholders; executable S0–S7 code, site configuration, schema and pipeline tests have not been migrated. The current web reads the existing public export instead of running this pipeline.

| Stage | What it does | Folder |
| --- | --- | --- |
| S0 Catalogue | Query NASA CMR for NISAR L2 GCOV scenes over the site; keep the latest CRID of each acquisition | `pipeline/catalog/` |
| S1 Read | Read the HH and HV windows over HTTPS into a local cache | `pipeline/core/` |
| S2 Grid | Average 10 m pixels into 250 m cells (linear power, then dB) | `pipeline/core/` |
| S3 Reference | Measure a river reference and a stable area for each track; run checks P1–P3 | `pipeline/core/` |
| S4 Classify | Mark each cell as water / no water / no data per image; remove single-image flips | `pipeline/core/` |
| S5 Indicators | Water arrival, days under water, current status, >30-day flag | `pipeline/core/` |
| S6 Compare | Compare with OPERA DSWx-S1 | `pipeline/validate/` |
| S7 Export | Write static files for the web | `pipeline/export/` |

The exported method metadata records default rule Q0 (HH < −14 dB and HV < −20 dB), with per-acquisition Q1 overrides. `validation.json` is absent: the local web does not report agreement scores. Future agreement after tuning with OPERA DSWx-S1 must not be described as independent validation.

The file format between the pipeline and the web is defined in [docs/data-contract.md](docs/data-contract.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `pipeline/core/` | Placeholder for S1–S5; not migrated |
| `pipeline/catalog/`, `pipeline/export/` | Placeholders for S0, S7; not migrated |
| `pipeline/validate/` | Placeholder for S6; not migrated |
| `config/sites/` | Placeholder for site TOML files; not migrated |
| `schema/` | Placeholder for JSON Schema; not migrated |
| `tests/` | Placeholder for pipeline tests; not migrated. Web tests are in `web/test/` |
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

Not migrated. There is no runnable pipeline or requirements file in this checkout. Python setup and Earthdata credentials are not required to explore the migrated local web. Do not commit tokens, image caches or signed links when pipeline work is added later.

## Data sources

| Data | Provider | Use | Terms |
| --- | --- | --- | --- |
| NISAR L2 GCOV | NASA / ISRO, via ASF DAAC | Water detection (S1–S5) | NASA open data |
| OPERA DSWx-S1 | NASA JPL (OPERA project) | Planned S6 comparison; validation export not migrated | NASA open data |
| ESA WorldCover 2021 | European Space Agency | Cropland mask | CC BY 4.0. © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium |
| OpenStreetMap | OpenStreetMap contributors | Commune boundary, hamlet names, roads, bridges and places in the 3D scene | ODbL, © OpenStreetMap contributors |

<!-- TODO: thêm nguồn ảnh quang học dùng trong video nếu có -->

## Limits

<!-- TODO: thay bằng bản cuối "Validation and limits" khi khóa số liệu -->

- Validation results are unavailable in this snapshot; no agreement score is reported or fabricated. Agreement after tuning with DSWx-S1 would not be an independent test.
- Bang Rakam, H7/final data and pipeline S0–S7 are not migrated.
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
