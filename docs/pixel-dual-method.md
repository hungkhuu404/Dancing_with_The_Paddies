# Pixel-fraction water classification (75% rule, 50% fill guard)

This document describes how the pipeline marks a 250 m cell as open water from NISAR L-band HH and HV backscatter. The exported metadata names the method `pixel_fraction_75_dual_50`.

- A cell is water in one acquisition when at least 75% of its valid 10 m pixels are below both the HH threshold and the HV threshold.
- A temporal filter removes single-acquisition flips. It fills a dry observation between two water observations only when at least 50% of the pixels were water in that acquisition.

The computations are in `pipeline/core/science.py` (`pixel_fraction_states`, `filter_dual`, `metrics_for_cell`, `evaluate_references`). `pipeline/core/run_pipeline.py` runs them as stages S1–S5.

## Processing overview

```text
NISAR GCOV + acquisition catalogue (S0) + site configuration
             │
             ▼
S1: read HH/HV windows for the study grid and the reference areas; cache locally
             │
             ▼
S2–S3: build 250 m cells; run reference checks P1–P3;
       set the thresholds of each acquisition (rule Q0 or Q1)
             │
             ▼
S4: classify pixels → 75% cell fraction → temporal filter with 50% fill guard
             │
             ▼
S5: series s_raw and s, timing, per-cell metrics, >30-day flag
             │
             ▼
Run outputs with configuration and code hashes
             │
             ▼
S7: check the method metadata and export the web data
```

OPERA DSWx-S1 is used only in the separate comparison stage S6 (see [S6 comparison](s6-comparison.md)). It is not an input to the classification.

## Inputs

- NISAR L2 GCOV backscatter, layers `HHHH` and `HVHV`, in linear power.
- The acquisition catalogue from S0 (`pipeline/catalog/s0.py`) and the site configuration (`config/sites/<site>.toml`).
- A land-cover table with a cropland flag per cell, derived from ESA WorldCover 2021. It is used only for the >30-day flag.

S1 sets a sample to missing unless its GCOV mask value is between 1 and 254 (`valid_mask: gcov_fully_focused_1_254`).

## Cells and valid pixels

Each 250 m cell holds 25 × 25 pixel positions of 10 m. A native 20 m pixel is represented as four 10 m samples with the same value; nothing is interpolated.

A pixel is valid when HH and HV are both finite and positive. A cell is classified in an acquisition only when all 25 × 25 positions lie inside the raster and at least 438 of the 625 pixels are valid (`min_valid_pixel_fraction = 0.70`).

## Thresholds per acquisition

The default thresholds (rule `Q0`) come from the site configuration. For Tân Hội they are HH −14.0 dB and HV −20.0 dB.

S3 measures two reference windows in every acquisition: a water reference and a stable reference. For each window it takes the mean HH and HV in dB. It then runs three checks per track:

| Check | Passes when |
| --- | --- |
| P1 | The median water-reference value of the track is at least 2 dB below the default threshold, in both channels. Only water windows with enough valid pixels count (`min_pixels`, 1,000 for Tân Hội). |
| P2 | The standard deviation of the stable-reference value over the track's acquisitions is at most 0.5 dB, in both channels. |
| P3 | For each acquisition with product version (CRID) `P05036`, the stable-reference value is within 3 standard deviations of the mean of the same track's `P05023` acquisitions. |

Threshold rules:

- `Q0`: the default thresholds.
- `Q1`, when P1 fails for a track: the track's median water-reference value plus 3 dB, per channel.
- `Q1`, when P3 fails for an acquisition: that acquisition's own water-reference value plus 3 dB, per channel.

If a threshold cannot be resolved, it stays null and the run stops. It is not replaced by the default. S3 keeps the original result of every check and records which acquisitions use `Q1`. A failed check is never changed to a pass.

## Classification and temporal filter

1. For each valid pixel, compare HH and HV linear power with the acquisition's thresholds, converted from dB to power (`10^(dB/10)`). The pixel is water when **both** values are strictly below their threshold.
2. Divide the number of water pixels by the number of valid pixels in the cell. If the fraction is at least 75%, the raw state is `W`. If it is lower, the raw state is `N`. A cell without enough valid data is `-`. The cell-mean HH and HV are kept as diagnostic values. They do not decide `W`.
3. Filter the series of each cell. The filter looks only at valid observations and skips missing ones. All decisions use the raw states, so one change does not trigger another.
   - `N-W-N`: the middle `W` becomes `N`.
   - `W-N-W`: the middle `N` becomes `W` only if the water-pixel fraction of that acquisition is at least 50%.
   - The first and last valid observations and all missing observations stay unchanged.
4. Compute the metrics from the filtered series.

The raw series is exported as `s_raw` and the filtered series as `s`. In the pipeline arrays, 0 is missing (`-`), 1 is `N` and 2 is `W`.

## Metrics and the >30-day flag

Metrics need at least four valid observations in a cell. The main episode is the latest-starting run of consecutive `W` among the valid observations.

- `flood_days_min` is the time from the first to the last `W` of the main episode.
- `flood_days_max` is the time from the last observation before the episode to the first observation after it. If the episode is still ongoing, it ends at the last `W`. It is null when the episode starts at the first valid observation.

`flag_gt30` is set for cropland cells that are not water in every valid observation:

| Value | Condition |
| --- | --- |
| `yes` | `flood_days_min` is more than 30 days. |
| `possible` | Not `yes`, and the episode is ongoing, or `flood_days_max` is null or more than 30 days. |
| `no` | Otherwise. |
| `na` | Not cropland, water in every valid observation, never water, or fewer than four valid observations. |

Observations are sparse. A `yes` flag does not prove continuous flooding between acquisitions.

## Stable-reference check

The quality check `s4_stable_control` passes when at most 5% of the acquisitions classify the stable reference as water. It applies the thresholds to the mean HH and HV of the stable area. It is not an independent evaluation of the pixel classifier.

## Export metadata

S7 (`pipeline/export/s7.py`) refuses to export unless the method definition names `pixel_fraction_75_dual_50` with a water fraction of 0.75, a fill fraction of 0.5, the configured valid-pixel fraction, the single-flip filter enabled and the selection status `post_hoc`. The exported `meta.json` records `classification`, `water_fraction`, `fill_min_fraction`, `joint_valid_fraction`, `selection_status` and `valid_mask`. Earthdata tokens and raster caches are not part of the exported data.

## Exploratory comparison at Tân Hội

The method was compared with OPERA DSWx-S1 on 1,182 comparison cells, using the >30-day flag on both sides:

| Measure | Value |
| --- | --- |
| Precision of `yes` | 363/895 = **40.56%** |
| Recall of `yes` | 363/379 = **95.78%** |
| Agreement on the three labels `yes` / `possible` / `no` | 533/1,182 = **45.09%** |
| Accuracy where both sides say `yes` or `no` | 417/548 = **76.09%** |
| Coverage of that accuracy | 548/621 = **88.24%** of the cells where DSWx-S1 says `yes` or `no` |

How to read these figures:

- Precision counts every cell that the method labels `yes`, including cells where DSWx-S1 says `possible`.
- Recall keeps all 379 cells where DSWx-S1 says `yes`.
- The three-label agreement keeps `na` cells in the denominator and never counts them as agreement.
- A DSWx-S1 `possible` does not mean that the field was not flooded.

The cell count and the DSWx-S1 label counts used here (1,182 cells, 379 `yes`, 621 `yes` or `no`) equal those in the `before` block of the first `posthoc` entry in `data/tan_hoi/validation.json`. That block records the comparison of the earlier cell-mean classification.

The comparison for the published data is in `data/tan_hoi/validation.json`. It comes from a later run (GCOV validity mask applied, two more acquisitions) and covers all cells that have a flag on both sides, so its figures differ from the table above.

## Limitations

- **These results are post-hoc.** Several options were compared on the same 1,182 cells, and this method was selected after looking at the results.
- DSWx-S1 comes from a different sensor and from different acquisition times. It is not ground truth. The figures above are not independent validation and not field accuracy.
- The HH and HV thresholds were first set for cell means. They have not been calibrated separately for pixels.
- The method still needs an evaluation on independent labels that were not used to select it.

## Data contract and tests

`s_raw`, `s`, the metrics and the method metadata have the meaning defined in version 2.0.0 of the [data contract](data-contract.md).

`tests/core/test_pixel_dual.py` tests the pixel fraction, the joint validity rule, the cell boundaries and the dual filter. The protocol regression suite in `tests/bang1/` checks the cell-mean classifier, the single-flip filter and the metrics. It does not test the 75% pixel rule or the 50% fill guard.
