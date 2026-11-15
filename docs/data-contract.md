# Data contract, version 2.0.0

This document defines the static files that the pipeline exports and the web app reads. It covers file names, JSON keys, types, units, the meaning of every value, and the rules a valid data bundle must satisfy. The stage names used below (S0 to S7) are the pipeline stages listed in the repository README.

## Summary

| Topic | Rule |
| --- | --- |
| Interface | Static UTF-8 files, no server needed: `data/sites.json` and one directory `data/{site}/` per site (section 6) |
| Writers | The export stage S7 (`pipeline/export/s7.py`) writes the files from the outputs of stages S1–S5 (`pipeline/core/`). The comparison stage S6 (`pipeline/validate/`) produces `validation.json` |
| Readers | The web app (`web/`) |
| Cells and IDs | Square 250 m cells (called "blocks" in the README). ID `E{x}N{y}` from the south-west corner in the site's UTM zone. Each GeoJSON feature also has an integer `id` |
| Units | English `snake_case` keys with the unit in the name (`_db`, `_ha`, `_days`). HH and HV in `series.json` are dB multiplied by 10, rounded to integers |
| Time | `acq_utc` is UTC. `date_local` is the date in the site's local time and is the date shown to users |
| Missing data | `null`. Never `NaN`, `-9999` or an empty string. Readers must not display the text "null" or "NaN"; if a file fails to load, they show a one-line message |
| Configuration | Pipeline: one TOML file per site in `config/sites/`; coordinates and thresholds are not hard-coded. Web: reads the site list from `data/sites.json` |
| Secrets | The Earthdata token is kept in a file outside the repository. Code reads its path from the environment variable `EARTHDATA_TOKEN_FILE`. The token is never printed, logged or committed |
| Compatibility checks | A JSON Schema for every file in `schema/`, cross-file checks in `pipeline/export/verify.py` (section 9), size limits in section 7 |

## 1. General rules

- Files are static, UTF-8, and need no server.
- Keys are English `snake_case`. The unit is part of the key name: `_db`, `_ha`, `_days`.
- A missing value is `null`. `NaN`, `-9999` and empty strings are not allowed. Python writers must call `json.dumps` with `allow_nan=False`.
- File names are lower case ASCII. A date in a file name is `YYYYMMDD` in the site's local time.
- Site IDs: `tan_hoi`, `bang_rakam`. The schemas enumerate these two IDs.

## 2. Grid and cell IDs

- **Working coordinate system:** the site's UTM zone. Tân Hội uses EPSG:32648. Bang Rakam uses EPSG:32647.
- **Cell:** a 250 m square, 6.25 ha. The south-west corner of every cell lies on a multiple of 250 m on both axes.
- **Cells of a site:** a cell belongs to the site when its centre lies inside the site boundary (`aoi.geojson`). Tân Hội has 2,344 cells (14,650 ha). Bang Rakam has 2,304 cells (14,400 ha).
- **Cell ID:** `E{x}N{y}`, where x and y are the easting and northing of the south-west corner in metres. Example: `E512000N1117750`. IDs do not change between runs.
- **Exported coordinates:** EPSG:4326, longitude then latitude, 6 decimal places.

## 3. Time and time zones

- **`acq_utc`:** acquisition time in UTC, for example `2026-10-27T11:23:21Z`.
- **`date_local`:** the date in the site's local time, for example `2026-10-27`. Tân Hội uses Asia/Ho_Chi_Minh (UTC+07:00). Bang Rakam uses Asia/Bangkok (UTC+07:00). Readers display this date.
- **Ascending tracks:** tracks 083A (Tân Hội) and 011A (Bang Rakam) acquire late in the UTC evening, so `date_local` is one day after the UTC date. Example: `acq_utc` `2026-08-18T22:36:00Z` has `date_local` `2026-08-19`.
- **Durations:** computed from the difference of two `acq_utc` values, in days, with 1 decimal place.

## 4. State of a cell at one acquisition

| Symbol | Meaning | Condition |
| --- | --- | --- |
| `W` | Water signal under the pixel rule | The cell is valid, and at least 75% of its valid pixels have both HH and HV below the thresholds of that acquisition |
| `N` | No open water seen | The cell is valid and does not meet the `W` condition |
| `-` | No data | The cell is not valid at that acquisition (outside the swath or masked) |

### Thresholds

- **Default rule `Q0`:** HH < −14 dB and HV < −20 dB (strict comparison), for every track.
- **Fallback rule `Q1`:** the threshold of each channel equals the water reference level plus 3 dB. It is used only where a reference check fails (P1 or P3 below).
- **Reference windows:** each site configuration defines an open-water window (`[references.water]`) and a stable window (`[references.stable]`). The pipeline measures HH and HV in both windows for every acquisition.
- **Three reference checks (stage S3).** Results are written per track to the pipeline output `reference.json`, also when a check fails:
  - **P1:** the median water reference level of the track is at least 2 dB below the default threshold, in both HH and HV. A track that fails uses `Q1`, computed from that median.
  - **P2:** the standard deviation over time of the stable window is at most 0.5 dB.
  - **P3:** on the stable window, an image with processing version `P05036` differs by at most 3 standard deviations from the mean of the `P05023` images of the same track. An image that fails uses its own `Q1` threshold, computed from the water reference of that image.
- The thresholds actually used are recorded per acquisition in `meta.json` (section 6.2).

### Pixel rule

- A pixel is valid when HH and HV are both present at the same position, finite and positive, and the GCOV `mask` value is between 1 and 254. Mask value 0 marks samples that are not fully focused; 255 marks samples outside the image.
- Each valid pixel is compared with the HH and HV thresholds of the acquisition, in linear power.
- A 250 m cell needs the complete 25 × 25 lattice of 10 m positions and at least 438 valid pixels out of 625 (70%).
- The water fraction is the number of pixels below both thresholds divided by the number of valid pixels. A fraction of at least 75% gives `W`; otherwise the state is `N`. A cell that does not meet the validity conditions is `-`.
- The cell-mean HH and HV are still exported for reference (mean of linear power, expressed in dB). They are not used to derive `W`.

### 20 m GCOV scenes (Bang Rakam)

- On the aligned grid, each 20 m pixel is split into four 10 m parts with the same HH, HV and validity.
- This accounts for the area that overlaps a 250 m cell at its edges. The same limits apply: 70% valid pixels, 75% water fraction, 50% fill fraction.
- The split does not add radar detail.
- Reference windows use sample counts on the native grid.
- The same GCOV mask range of 1 to 254 applies.

### Two-level filter

- For each cell, order the valid acquisitions by time, pooling all tracks. Apply a single-acquisition filter to the raw 75% series.
- **`W-N-W`:** the middle `N` becomes `W` only if the water fraction of the middle acquisition is at least 50%. Below 50% it stays `N`.
- **`N-W-N`:** the middle `W` becomes `N`.
- The first and last valid acquisitions, and missing acquisitions, are never changed.
- **Always compare against the raw series, at all positions at once.** Do not change a value in place and then use the changed value for the next position. Example, where every `N` has a water fraction of at least 50%: `NNWNWW` becomes `NNNWWW`.

### Exported series and limits of interpretation

- The export contains both the raw 75% series (`s_raw`) and the filtered series (`s`). All indicators are computed on the filtered series.
- The method was selected after looking at OPERA DSWx-S1. It is therefore **post hoc**, not an independent validation.
- DSWx-S1 is not ground truth. Sparse acquisitions do not prove continuous flooding.

## 5. Per-cell indicators

A **flood episode** is a run of consecutive valid acquisitions with state `W`. The **main episode** is the episode that starts latest.

Each track revisits every 12 days, so the exact day water arrived or receded is unknown. The contract records **two bounding dates** instead of one date:

| Key | Meaning |
| --- | --- |
| `onset_after_local` | Date of the last acquisition without water immediately before the main episode. `null` if the cell already had water at its first image |
| `onset_by_local` | Date of the first acquisition with water in the main episode. Water arrived after `onset_after_local` and no later than this date |
| `end_after_local` | Date of the last acquisition with water in the main episode. `null` if the cell still has water at its last image |
| `end_by_local` | Date of the first acquisition without water after the main episode. `null` if the cell still has water at its last image |
| `flood_days_min` | Days between the first and the last `W` of the main episode. Reading this as continuous flooding depends on an assumption about the time between images; sparse observations do not prove continuity |
| `flood_days_max` | Longest possible flood duration: from `onset_after` to `end_by`. If water remains, it is counted to the last image of the cell. `null` if there is no `onset_after` |
| `ongoing` | `true` if the cell has water at its last image. Both durations then mean "up to the last image" |
| `status` | One of the 5 values in the table below |
| `status_confirmed` | `true` if the state at the last image of the cell equals the state at the valid image just before it. `false` means the state has been seen at one acquisition only |
| `flag_gt30` | One of the 4 values in the table below |
| `last_obs_local` | Date of the last valid acquisition of the cell |
| `n_obs`, `n_tracks`, `max_gap_days` | Number of valid acquisitions, number of tracks, and longest gap between two consecutive valid acquisitions |
| `n_episodes` | Number of flood episodes in the observation window |
| `cropland` | `true` if at least 50% of the cell is cropland in ESA WorldCover 2021 |
| `nearest_hamlet` | Name of the nearest hamlet point from OpenStreetMap, measured from the cell centre. It is a label only, not a boundary |

`ongoing`, `status_confirmed` and `n_episodes` may be `null` only when `status` is `no_data`.

**Values of `status`:**

| Value | Condition | Suggested display text |
| --- | --- | --- |
| `never_water` | No acquisition is `W` | No open water seen |
| `flooded` | The last valid acquisition is `W`, and at least one earlier acquisition is `N` | Still under water as of (date of last image) |
| `water_gone` | There is a flood episode, and the last valid acquisition is `N` | Open water no longer seen since (date range) |
| `always_water` | Every valid acquisition is `W` | Water in every image (canal, pond, or flooded all season) |
| `no_data` | Fewer than 4 valid acquisitions | Not enough images |

**Order of evaluation for `status`:** `no_data` first, then `never_water`, `always_water`, `flooded`, `water_gone`. A cell with 3 valid acquisitions that are all `W` is still `no_data`.

**Values of `flag_gt30`** (flooded for more than 30 days before the season; cropland cells only):

| Value | Condition |
| --- | --- |
| `yes` | `flood_days_min` is greater than 30 |
| `possible` | Not `yes`, but the cell still has water, or `flood_days_max` is greater than 30 or is `null` |
| `no` | The flood episode has ended and `flood_days_max` is at most 30 |
| `na` | `status` is `never_water`, `always_water` or `no_data`, or the cell is not cropland |

**How to describe the more-than-30-days layer:**

- Always add "if the IPCC default factor applies". IPCC 2019 Refinement, Table 5.13: a field flooded for more than 30 days before the season has a scaling factor of 2.41 (range 2.13–2.73); a field not flooded for less than 180 days before the season has 1.00; when the pre-season water regime is unknown, the aggregated value is 1.22.
- The factor applies to emissions during the following rice season. IPCC states that it is not used to calculate emissions during the flooded period itself.
- The data do not show whether a cell is sown with the next crop immediately afterwards.

## 6. Files

All files are in `data/{site}/`, except `data/sites.json`. Published data live in `data/` at the repository root, not in `web/public/data/`: the script `web/scripts/sync-data.mjs` deletes and recreates that directory on every `dev` or `build`, copying the files listed in `web/scripts/public-data-files.json`.

| File | Content | Used for |
| --- | --- | --- |
| `data/sites.json` | Site list: ID, name, region, EPSG code, map centre, bounds | Site selection |
| `meta.json` | Contract version, generation time, method parameters, list of acquisitions (each with the thresholds used and its backdrop file), the four corners of the backdrop images, data sources, skipped acquisitions | Everything that depends on the acquisition list |
| `cells.geojson` | One polygon per cell. The properties are the indicators of section 5 | Map |
| `series.json` | State series and HH, HV of each cell for each acquisition | Per-cell charts and sound, per-acquisition view |
| `summary.json` | Site-wide areas per acquisition (`passes`) and totals of the data set (`totals`) | Legend, sound, headline figures |
| `validation.json` | Comparison with OPERA DSWx-S1 (stage S6) | Kept for inspection of the post-hoc agreement figures |
| `aoi.geojson`, `places.geojson` | Site boundary and hamlet points. The `name` of each point must match `nearest_hamlet` in `cells.geojson` character for character | Map |
| `backdrop/{YYYYMMDD}_{track}_hh.webp` | Greyscale HH image, fixed scale from −25 to −5 dB, 20 m grid, WebP quality 75, transparent where there is no data. `{track}` is lower case, for example `20261027_047d_hh.webp` | Map backdrop |

### 6.1. `data/sites.json`

`center` is longitude, latitude. `bounds` is west, south, east, north. All coordinates of a site's files must lie inside its `bounds`.

```json
{"sites": [
  {"id": "tan_hoi", "name": "Tân Hội", "region": "An Giang, Vietnam", "epsg": 32648,
   "center": [105.185992, 10.14206],
   "bounds": [105.104953, 10.068517, 105.267159, 10.215673], "default": true},
  {"id": "bang_rakam", "name": "Bang Rakam", "region": "Phitsanulok, Thailand", "epsg": 32647,
   "center": [100.11878375680217, 16.75013833127494],
   "bounds": [100.062105, 16.695507, 100.175494, 16.804756], "default": false}
]}
```

### 6.2. `meta.json`

Abridged from `data/tan_hoi/meta.json`: 2 of the 22 acquisitions are shown.

```json
{
  "contract_version": "2.0.0",
  "site": "tan_hoi",
  "generated_utc": "2026-11-14T16:51:26.073876Z",
  "timezone": "Asia/Ho_Chi_Minh",
  "grid": {"epsg": 32648, "cell_m": 250, "n_cells": 2344},
  "method": {"rule": "Q0", "hh_db_max": -14.0, "hv_db_max": -20.0, "single_flip_filter": true,
             "frozen_utc": null, "classification": "pixel_fraction_75_dual_50",
             "water_fraction": 0.75, "fill_min_fraction": 0.5, "joint_valid_fraction": 0.7,
             "selection_status": "post_hoc", "valid_mask": "gcov_fully_focused_1_254"},
  "acquisitions": [
    {"i": 0, "acq_utc": "2026-08-11T11:31:41Z", "track": "148D", "frame": "083", "crid": "P05023",
     "rule": "Q1", "hh_db_max": -14.21537279713478, "hv_db_max": -18.998982010155764,
     "date_local": "2026-08-11", "backdrop": "backdrop/20260811_148d_hh.webp",
     "valid_share": 0.8592150170648464},
    {"i": 1, "acq_utc": "2026-08-16T11:23:21Z", "track": "047D", "frame": "083", "crid": "P05023",
     "rule": "Q0", "hh_db_max": -14.0, "hv_db_max": -20.0,
     "date_local": "2026-08-16", "backdrop": "backdrop/20260816_047d_hh.webp",
     "valid_share": 1.0}
  ],
  "backdrop": {"db_min": -25, "db_max": -5,
               "corners": [[105.105001, 10.215672], [105.267159, 10.21558],
                           [105.267037, 10.068518], [105.104953, 10.068609]]},
  "sources": ["NISAR L2 GCOV (NASA/ISRO), ASF DAAC", "ESA WorldCover 2021",
              "OpenStreetMap contributors (ODbL)"],
  "skipped": []
}
```

- **`contract_version` appears only in `meta.json`.** It is not repeated in the other files.
- **`timezone` and `grid.epsg`** must match the site: `Asia/Ho_Chi_Minh` and 32648 for `tan_hoi`, `Asia/Bangkok` and 32647 for `bang_rakam`. `grid.cell_m` is always 250. `grid.n_cells` equals the number of features in `cells.geojson`.
- **`acquisitions` is sorted by ascending `acq_utc`.** `i` is the position in this list, starting at 0. Every series in `series.json` and `summary.json` uses the same order. Readers take the number of acquisitions and the list of tracks from here and do not hard-code them.
- **`track`** is three digits followed by `A` (ascending) or `D` (descending). **`frame`** is three digits. **`crid`** is the processing version of the source product.
- **`valid_share`:** the share of the site's cells that are valid at that acquisition.
- **`rule`, `hh_db_max`, `hv_db_max` of each acquisition:** the thresholds actually used for that acquisition. The `method` block holds only the defaults. This is needed because `Q1` sets a separate threshold for a track, and a `P05036` image may have its own threshold (check P3). Readers draw threshold lines per acquisition.
- **`method`:** `classification` is always `pixel_fraction_75_dual_50`, `water_fraction` is 0.75, `fill_min_fraction` is 0.5, `single_flip_filter` is `true` and `selection_status` is `post_hoc`. `joint_valid_fraction` is the minimum share of valid pixels in a cell (0.7). `frozen_utc` is the UTC time recorded in the pipeline's method-freeze file, or `null`.
- **`method.valid_mask`:** optional. The value `gcov_fully_focused_1_254` states that the export applied the GCOV mask. A file without this key makes no statement about the mask. The published `tan_hoi/meta.json` has the key; the published `bang_rakam/meta.json` does not.
- **`backdrop` of each acquisition:** path of the backdrop image, relative to `data/{site}/`. It matches `backdrop/{YYYYMMDD}_{track}_hh.webp` with the local date and the lower-case track. Readers do not build the file name themselves.
- **`backdrop.corners`:** the four corners of the backdrop image as longitude, latitude, in the order top-left, top-right, bottom-right, bottom-left. This is the order MapLibre needs to place an image on the map. All backdrops of a site share one frame. The UTM frame is slightly rotated against geographic north (for Tân Hội about 10 m across a width of 17.8 km), so placing the image by its four corners is sufficient.
- **`sources`:** a non-empty list of attribution strings.
- **`skipped`:** acquisitions that are in the pipeline catalogue (`catalog.csv`) but not in `acquisitions`. If nothing was excluded the value is `[]`. Each element has:
  - `acq_utc`, `track`, `frame`, `crid`: as in `acquisitions`.
  - `granule`: the `.h5` file name, without a path or link.
  - `reason`: one of `read_error` (reading failed after retries), `missing_hv` (the image has no HV, for example SHSH mode), `other`.
  - `detail`: the name of the error type only, for example `TimeoutError`. It matches `^[A-Za-z_][A-Za-z0-9_.]*$`. Links and raw error messages are not allowed, because they may contain signed URLs.
  - Example from `data/bang_rakam/meta.json`: `{"acq_utc": "2026-08-20T22:54:19Z", "frame": "010", "crid": "P05023", "track": "112A", "granule": "NISAR_L2_PR_GCOV_028_112_A_010_4005_DHDH_A_20260820T225419_20260820T225454_P05023_N_F_J_001.h5", "reason": "other", "detail": "NoValidPixelsAfterGCOVMask"}`.

### 6.3. `cells.geojson`

A FeatureCollection with one Polygon feature per cell, sorted by `cell_id`. One feature from `data/tan_hoi/cells.geojson`:

```json
{
  "type": "Feature",
  "geometry": {"type": "Polygon", "coordinates": [[[105.109531, 10.111569], [105.111813, 10.111568],
                [105.111814, 10.113829], [105.109532, 10.11383], [105.109531, 10.111569]]]},
  "properties": {
    "cell_id": "E512000N1117750",
    "status": "flooded", "flag_gt30": "yes",
    "onset_after_local": "2026-09-16", "onset_by_local": "2026-09-21",
    "end_after_local": null, "end_by_local": null,
    "last_obs_local": "2026-11-03", "n_obs": 22, "n_tracks": 3, "n_episodes": 1,
    "flood_days_min": 43.0, "flood_days_max": 48.0, "max_gap_days": 5.0,
    "ongoing": true, "status_confirmed": true,
    "cropland": true, "nearest_hamlet": "Phú Hiệp"
  },
  "id": 3
}
```

- All 18 properties are required. The meaning of each is given in section 5.
- Each feature has an integer `id` at feature level: the zero-based position of the cell after sorting by `cell_id`. Map libraries need it to restyle a single cell without reloading the layer. `cell_id` remains the stable key across files.
- The ring lists the south-west, south-east, north-east and north-west corners and closes on the first point.

### 6.4. `aoi.geojson` and `places.geojson`

Coordinates are EPSG:4326, like every exported file.

| File | Structure | Properties |
| --- | --- | --- |
| `aoi.geojson` | FeatureCollection with exactly 1 feature, Polygon or MultiPolygon | `site`, `name`, `area_ha` (area in the site's UTM zone, 1 decimal place), plus the keys for the AOI type below |
| `places.geojson` | FeatureCollection with one Point per hamlet. Only points inside the site's AOI are kept | `name` (matches `nearest_hamlet` character for character); `osm_id` (string of the form `node/123456`) |

An AOI is exactly one of two types:

- **OpenStreetMap boundary.** `osm_relation` is a positive integer. Tân Hội uses relation 15449921 (`area_ha` 14617.8).
- **Study frame.** `aoi_type` is `study_bbox`. `source` names where the frame comes from, `epsg` is the EPSG code of the source UTM zone, and `bbox_utm_m` holds exactly four coordinates in metres in the order west, south, east, north. `osm_relation` is reserved for OpenStreetMap boundaries and must be absent. The GeoJSON polygon is still in EPSG:4326 and must match the four corners of the source frame after projection. Bang Rakam uses EPSG:32647 and `bbox_utm_m` `[613250, 1846250, 625250, 1858250]` (`area_ha` 14400).

Hamlet points are OpenStreetMap nodes tagged `place=village` or `place=quarter`. Tân Hội has 24 points inside its boundary (OpenStreetMap data downloaded on 10 November 2026). Bang Rakam has 4 points.

### 6.5. `series.json`

The index `i` is the same as in `acquisitions` of `meta.json`. Every string and array has one entry per acquisition. HH and HV are the cell means in dB multiplied by 10 and rounded to integers.

Two cells from `data/tan_hoi/series.json`:

```json
{
  "cells": {
    "E512000N1117750": {
      "s": "NNNNNNNNNNWWWWWWWWWWWW",
      "s_raw": "NNNNNNNNNNWWWWWWWWWNWW",
      "hh": [-87, -106, -114, -88, -87, -102, -115, -99, -122, -151, -165, -184, -170, -175, -192, -172, -176, -192, -171, -181, -195, -174],
      "hv": [-189, -202, -223, -157, -157, -177, -178, -161, -195, -201, -214, -244, -222, -216, -246, -221, -217, -249, -216, -217, -247, -228]
    },
    "E524500N1123750": {
      "s": "-WW-WW-WW-WW-NN-NN-NN-",
      "s_raw": "-WW-WW-NW-WW-NN-NN-NN-",
      "hh": [null, -171, -204, null, -193, -203, null, -145, -159, null, -167, -166, null, -117, -115, null, -125, -93, null, -138, -111, null],
      "hv": [null, -241, -249, null, -251, -250, null, -231, -243, null, -255, -251, null, -227, -209, null, -220, -223, null, -222, -211, null]
    }
  }
}
```

- `s` and `s_raw` contain only the characters `W`, `N` and `-`.
- At every position, `s` is `-` exactly when `s_raw` is `-`, `hh` is `null` and `hv` is `null`.
- The set of keys in `cells` equals the set of `cell_id` values in `cells.geojson`.

### 6.6. `summary.json`

Abridged from `data/tan_hoi/summary.json`: 2 of the 22 passes are shown.

```json
{
  "passes": [
    {"i": 0, "date_local": "2026-08-11", "track": "148D", "valid_ha": 12587.5,
     "water_ha": 625.0, "new_water_ha": 0.0, "water_gone_ha": 0.0,
     "asof_obs_ha": 12587.5, "asof_water_ha": 625.0},
    {"i": 8, "date_local": "2026-09-12", "track": "083A", "valid_ha": 14650.0,
     "water_ha": 4493.75, "new_water_ha": 1000.0, "water_gone_ha": 112.5,
     "asof_obs_ha": 14650.0, "asof_water_ha": 4493.75}
  ],
  "totals": {
    "n_cells": 2344, "area_ha": 14650.0, "last_obs_local": "2026-11-03",
    "status_ha": {"never_water": 3518.75, "flooded": 9825.0, "water_gone": 1281.25,
                  "always_water": 25.0, "no_data": 0.0},
    "gt30_ha": {"yes": 8093.75, "possible": 2381.25, "no": 631.25, "na": 3543.75}
  }
}
```

**Keys of `passes`.** There is one element per acquisition, in the same order, with the same `i`, `date_local` and `track`. Areas are computed on the filtered series `s`. Each cell counts 6.25 ha.

| Key | Meaning |
| --- | --- |
| `valid_ha` | Area of the cells that are valid at acquisition `i` |
| `water_ha` | Area of the cells where `s[i]` is `W` |
| `new_water_ha` | Area of the cells where `s[i]` is `W` and the previous valid acquisition of the same cell is `N` |
| `water_gone_ha` | Area of the cells where `s[i]` is `N` and the previous valid acquisition of the same cell is `W` |
| `asof_obs_ha` | Area of the cells that have had at least one valid acquisition up to and including `i` |
| `asof_water_ha` | Among those cells, the area of the cells whose most recent valid acquisition up to and including `i` is `W` |

- **Why there are two `asof_` keys:** track 148D covers only about 86% of the Tân Hội cells (`valid_share` 0.858 to 0.862). The ratio of `water_ha` to `valid_ha` therefore jumps with the coverage of each track, not only with water. The two `asof_` keys cover the whole site and use the most recent state of each cell. Use them for any site-wide water area per acquisition.
- **`totals`** is the single source for headline figures. `area_ha` equals `n_cells` × 6.25. The values of `status_ha` must add up to `area_ha`, and so must the values of `gt30_ha`. `last_obs_local` is the latest `last_obs_local` of any cell.

### 6.7. `validation.json`

The file reports agreement between the exported states and OPERA DSWx-S1. The method was selected after looking at DSWx-S1, so these numbers are post-hoc agreement. They must not be presented as independent validation or as field accuracy.

Abridged from `data/tan_hoi/validation.json`. Omitted: the blocks `unfiltered`, `pairs_unfiltered`, `side_note_dswx_single_flip_filtered` and `posthoc`, two of the three `by_track` entries, 18 of the 19 `pairs`, and additional count keys inside `filtered`.

```json
{
  "reference": "OPERA DSWx-S1, WTR class 1 (open water)",
  "frozen_utc": "2026-11-13T06:23:57.749213Z",
  "first_dswx_read_utc": "2026-11-13T07:29:02Z",
  "site": "tan_hoi",
  "n_dswx_passes": 26,
  "n_nisar_acquisitions": 22,
  "pairing": "each NISAR acquisition to nearest DSWx pass by UTC time, within 3 days (inclusive)",
  "dswx_rules": "cell valid if >=70% px code<250; water if >=50% of valid px code 1; DSWx series not filtered",
  "filtered": {
    "n_pairs": 19, "kappa_median": 0.5594, "kappa_min": 0.0676, "kappa_max": 0.7248,
    "by_track": {"047D": {"n_pairs": 7, "kappa_median": 0.5132, "kappa_min": 0.0676, "kappa_max": 0.7248}},
    "by_n_tracks": {"3": {"n_cells_in_group": 2021, "n_pairs": 19, "kappa_median": 0.4923, "kappa_min": 0.0441, "kappa_max": 0.6969},
                    "2": {"n_cells_in_group": 323, "n_pairs": 19, "kappa_median": 0.5871, "kappa_min": -0.0253, "kappa_max": 0.8993}},
    "onset": {"n_cells": 1338, "overlap_share": 0.1966, "median_diff_days": -15.0},
    "gt30": {"n_cells": 1394, "precision": 0.3765, "recall": 0.8935},
    "cropland_share_of_flagged": 1.0, "water_share_on_builtup": 0.0
  },
  "pairs": [{"i": 1, "track": "047D", "nisar_date_local": "2026-08-16", "dswx_date_local": "2026-08-18",
             "dswx_time_local": "05:44", "gap_days": 1.5, "n_cells": 543,
             "kappa": 0.4599, "precision": 0.3333, "recall": 0.8667}]
}
```

**Required top-level keys:** `reference`, `frozen_utc`, `first_dswx_read_utc`, `filtered`, `unfiltered`, `pairs`, `posthoc`. Published files may carry further descriptive keys, as in the example.

| Key | Meaning |
| --- | --- |
| `reference` | Name of the reference product and class |
| `frozen_utc` | UTC time of the method freeze recorded for the comparison |
| `first_dswx_read_utc` | UTC time when DSWx-S1 data were first read |
| `filtered` | Comparison of the filtered series `s` with DSWx-S1. A reader that shows comparison figures must take them from this block |
| `unfiltered` | The same keys, computed on the raw series `s_raw` |
| `pairs` | One element per NISAR–DSWx pair of the `filtered` block |
| `posthoc` | Changes made after the first comparison, in order. `[]` if there are none |

**Keys of `filtered` and `unfiltered`.** DSWx-S1 is the reference and water is the positive class. A statistic that is undefined is `null`.

| Key | Meaning |
| --- | --- |
| `n_pairs` | Number of NISAR acquisitions paired with a DSWx-S1 pass |
| `kappa_median`, `kappa_min`, `kappa_max` | Median, minimum and maximum of Cohen's kappa over the pairs, on cells valid in both products |
| `by_track` | Per NISAR track: at least `n_pairs` and `kappa_median` |
| `by_n_tracks` | Per group of cells with the same `n_tracks` (key is the number as a string): at least `kappa_median` |
| `gt30` | Comparison of `flag_gt30`, where the same indicator rules are applied to the DSWx-S1 series. `n_cells` counts the cells where both flags are `yes`, `possible` or `no`. `precision` and `recall` refer to the value `yes` |
| `onset` | Comparison of the onset interval (`onset_after_local` to `onset_by_local`). `n_cells` counts the cells where both products have `onset_after_local`. `overlap_share` is the share of those cells whose two intervals intersect. `median_diff_days` is the median difference of the interval midpoints, NISAR minus DSWx-S1 |
| `cropland_share_of_flagged` | Share of the cells with `flag_gt30` `yes` that are cropland |
| `water_share_on_builtup` | Share of valid observations classified `W` on cells that are at least 50% built-up |

**Keys of each element of `pairs`:** `i` (index in `acquisitions`), `dswx_date_local`, `gap_days` (time between the two acquisitions, 1 decimal place), `n_cells` (cells valid in both), `kappa`, `precision`, `recall`.

**Keys of each element of `posthoc`:**

| Key | Meaning |
| --- | --- |
| `id` | Entry identifier matching `^PH-\d{2,}$`, numbered in order |
| `changed_utc` | Time of the change, UTC |
| `by` | Name of the person who made the change |
| `what`, `why` | What was changed and why. One English sentence per key, so that the text can be displayed verbatim |
| `before`, `after` | The numbers before and after the change, with the same key names as the `filtered` block. At least `kappa_median`, `kappa_min`, `kappa_max`, `n_pairs` |

`data/tan_hoi/validation.json` has two `posthoc` entries. `data/bang_rakam/validation.json` has none.

## 7. Size limits

| File | Limit |
| --- | --- |
| `cells.geojson` | At most 2 MB uncompressed (2,000,000 bytes) |
| `series.json` | At most 1.5 MB uncompressed (1,500,000 bytes) |
| Each backdrop `.webp` | At most 300 KB (300,000 bytes). Readers load only the image of the acquisition on screen |
| Whole directory `data/{site}/` | At most 15 MB (15,000,000 bytes) |
| First load of the web app (HTML, JS, CSS, `meta.json`, `cells.geojson`) | At most 3 MB transferred |

The first four limits are enforced by `pipeline/export/verify.py`. The first-load limit is not checked by that script.

Sizes of the published data:

| Site | Cells | Acquisitions | `cells.geojson` | `series.json` | Largest backdrop | Directory |
| --- | --- | --- | --- | --- | --- | --- |
| `tan_hoi` | 2,344 | 22 | 1,389,117 bytes | 726,812 bytes | 252,752 bytes | about 6.7 MB |
| `bang_rakam` | 2,304 | 11 | 1,354,936 bytes | 407,339 bytes | 137,726 bytes | about 3.3 MB |

Hard limits of the host: Cloudflare Pages accepts at most 25 MiB per file and at most 20,000 files on the Free plan.

## 8. Versioning and missing data

- **Version:** `contract_version` is `2.0.0`. It identifies the pixel-fraction classification of section 4 and the meaning of `s_raw`, `s` and the indicators that follow from it. Change this document and `schema/` together when the contract changes.
- **Acquisition that could not be read:** it is not added to `acquisitions`. It is recorded in `skipped` in `meta.json` with a reason.
- **Cell without data at an acquisition:** the character `-` in `s` and `s_raw`, and `null` in `hh` and `hv`.
- **No synthetic data in `data/`.** The directory holds only real exported data.

## 9. Checking a data bundle

Every file has a JSON Schema (draft 2020-12) in `schema/`: `sites`, `meta`, `cells`, `series`, `summary`, `aoi`, `places` and `validation`, each named `{name}.schema.json`.

`pipeline/export/verify.py` validates the files of one site against the schemas and then checks the rules that span several files. `validation.json` is validated only if it exists. The script needs the Python packages `jsonschema` and `shapely`.

```bash
python pipeline/export/verify.py --data data --site tan_hoi
```

Cross-file rules checked by the script:

- `acquisitions` is not empty, is in time order, has `i` equal to 0, 1, 2, … and has no duplicate (`acq_utc`, `track`, `frame`).
- `date_local` equals the date of `acq_utc` in the `timezone` of `meta.json`.
- `cell_id` values in `cells.geojson` are sorted and unique, and equal the keys of `series.json`. Feature `id` equals the position. `grid.n_cells` equals the number of cells.
- Every geometry is valid. Every coordinate lies inside the site's `bounds` in `sites.json` and has at most 6 decimal places. Every place lies inside the AOI. The backdrop corners lie inside the site's `bounds`.
- `nearest_hamlet` of every cell is a `name` in `places.geojson`.
- Every `s`, `s_raw`, `hh` and `hv` has one entry per acquisition, and missing values agree at every position (section 6.5).
- `n_obs`, `n_tracks`, `last_obs_local`, `status`, `ongoing` and `status_confirmed` of every cell equal the values recomputed from `s`.
- `flood_days_min` is not greater than `flood_days_max` when both are present. `onset_after_local`, when present, is earlier than `onset_by_local`.
- `totals` and every element of `passes` equal the values recomputed from `cells.geojson` and `series.json` (section 6.6). `water_ha` is not greater than `valid_ha`, `asof_water_ha` is not greater than `asof_obs_ha`, and `asof_obs_ha` never decreases.
- `valid_share` equals `valid_ha` divided by the total area.
- Every backdrop file exists inside the site directory.
- The size limits of section 7 hold.
