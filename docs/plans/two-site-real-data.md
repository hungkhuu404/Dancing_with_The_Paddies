# Two-site real-data integration (WEB-DATA-009)

> Historical integration snapshot. The catalogue and Q1 decisions recorded as pending below were later confirmed; see [H7 data status](../provenance/h7-data-status.md).

Human owner: AIVIETNAM-AIO-QP09; actor: Codex. Product baseline: Dancing_with_The_Paddies@0415f2b, containing data PRs #12 and #15 and the merged observatory entrance. Consumer: landscape, map, water calendar, method and data sound. Secondary baseline: Nasa_prep@fb8277c. Implement in the product first, then mirror selected committed frontend/public-data/schema files for preview. No automatic merge or scientific acceptance is included.

## Input and publication

- Tân Hội retains the backend's 2,344-cell, 22-acquisition export, 11 August–3 November 2026, including the GCOV mask correction. No water records, thresholds, raw/filtered series, comparison metrics or backdrops are recalculated by the frontend. The catalogue is interim, not final H7.
- Bang Rakam registers the existing 2,304-cell, 11-acquisition QUAN-9 candidate, 14 August–31 October 2026. Its scene, EPSG:32647 and 12 × 12 km frame match the study AOI. Track 112A's six acquisitions are excluded by the source export because no samples survive the mask. The frontend neither restores those acquisitions nor fills missing states.
- The publication allowlist contains exactly the reviewed site registry and both complete public bundles. Registering the real site suppresses its separate fixture generation. Required files missing from either registered site fail synchronization rather than silently generating fake observations.
- Only data/sites.json is changed as publication integration. The data-team site bundles remain byte/canonical-Git-identical to the baseline. Registry bounds enclose the actual rounded exported geometries and backdrop footprint, avoiding sub-metre clipping from recomputing exact frame corners.
- Both sites are labelled Candidate radar release. The Method page and source panel retain pending scientific review: Bang Rakam's 31 October 105D Q1 decision and Tân Hội's interim catalogue/post-hoc method. No reference scores are surfaced as proof of accuracy. The underlying assets remain eligible for technical review without implying final acceptance.

## Frontend behavior

The atlas reads each real acquisition count/date and its own latest HH image. A new image is revealed only after loading; changing site cannot briefly relabel the previous site's image. Maps, calendar columns, block cards and sonification consume the real summary and filtered series, with Tân Hội remaining the default.

Bang Rakam's landscape now has a fixed real HH reference (31 October), explicitly dated in Radar mode. The original Tân Hội scene reference remains unchanged. The generic radar helper uses the scene reference when available, otherwise the last real exported backdrop. The Bang Rakam raster footprint is padded by 10 m on each edge to a 20 m grid; a shader UV transform maps it into the scene frame, rather than stretching the padded image. Transparent source pixels use illustrative context and are not interpreted as dark water measurements. Original raster bytes are unchanged.

Method and limits distinguishes the square study AOI from an administrative boundary and describes overlap-area weighting of native 20 m samples. Its infrastructure source link follows the selected site. Calendar and Method also show candidate status. No scientific metrics, survey positions, irrigation operations, weather values or voices are invented. Missing archived weather remains explicitly unavailable. Bang Rakam's existing tour remains disabled; Tân Hội retains its narrated tour.

## Verification and review gates

The data team's verifier is run separately for each site using the current schemas: strict JSON, AOI/cell coordinate bounds, unique IDs, series lengths/local dates, recomputed area/pass/as-of totals, metrics-to-series consistency, source paths and file-size limits must pass. These checks establish consistency, not independent classification accuracy.

Node tests cover both real registered exports, actual local dates/backdrop files, 20 m padded footprint and UV placement, candidate disclosure and study-frame limits, in addition to existing regression tests. Build and the committed-input/exact-output gate run on both repositories. Browser checks exercise atlas, real landscape/radar, last observation, same-site map/block interaction, Calendar/Method and a full Tân Hội tour. Screenshots and measurements are task-local under .cache/two-site-data/; helper servers/browsers close their own processes.

Product and secondary PRs must link to one another. Scientific review remains pending with the data owners; this integration does not change acceptance state. Preserve each repository's hosting commands, coordination documents and original checkout dirty work. The secondary is a web preview mirror: backend pipeline execution stays in the product repository. Only source exports, the needed schemas/configuration/handoff notes and frontend integration are synchronized.

## Recorded verification

161/161 Node tests pass; build passes. Both backend schema/cross-file verifiers pass. The public site bundles total 6,676,577 bytes (Tân Hội) and 3,272,254 bytes (Bang Rakam). The scene/model assets are unchanged. The landscape chunk is approximately 1,345 KB minified / 453 KB gzip, and the map chunk 1,095 KB / 300 KB gzip; existing large-chunk warnings remain. This is not an initial-page-transfer measurement.

Edge uses NVIDIA RTX 4050 preference and exercises both high and low tiers; low on this GPU is not an Intel UHD hardware check. Four-tile flights are sampled, not exhaustive benchmarks. Observed instantaneous debug FPS and maximum frame times are below; these are not averages/minima over a controlled before/after run.

| Site | Tier | Standing FPS | Last flight FPS | Standing max ms | Flight max ms |
| --- | --- | --- | --- | --- | --- |
| tan_hoi | high | 135 | 96 | 97 | 49 |
| tan_hoi | low | 144 | 144 | 7 | 28 |
| bang_rakam | high | 133 | 137 | 21 | 42 |
| bang_rakam | low | 143 | 143 | 14 | 35 |

The repeated functional run passes both real sites, fixed-radar labels, last-date navigation, real map blocks, per-site Calendar/Method and a complete unaccelerated Tân Hội tour, with no JavaScript/shader errors. Desktop, radar, selected map record, calendar/method, tour evidence and 375-pixel mobile captures are opened for visual inspection. Candidate status placement is checked on mobile after moving it clear of Calendar/Method controls. Missing historical weather is a declared limitation, not filled with fabricated values.
