# Two-site pixel frontend integration

> Historical migration snapshot. Both real site exports are now integrated, and the Tân Hội H7 catalogue is confirmed; see H7 data status.

Task MIG-WEB-TWO-SITES-005; human owner Quoc, actor Codex. Consumers: published Tân Hội landscape/map/calendar/Method and the separately labelled Bang Rakam illustration. Source cb6a2031615264b177c460fad19400b3c99557e8; product baseline 43359f0; branch migration/pixel-v2-two-sites. User authorization covers commit, push, PR and merge after successful review/checks. This document records technical scope, not submission acceptance.

## Scope and conditions

Migrate the current reviewed frontend while preserving backend source, configuration, schema and all 28 published input files. Real observations must match CONTRACT-001 2.0.0; incompatible/missing observations fail visibly. Bang Rakam illustration is the explicit allowed stub, never a replacement for missing real Tân Hội data. Its source registry is generated under web/public/data/, not committed to data/. Existing source checkout and old product checkout remain untouched. Legacy unused development fixture exports/fallback are omitted; the manual fixture CLI rejects published-site targets before creating any files.

Merge requires source/provenance review, backend cross-file checks, frontend tests/build, browser interaction checks, committed-input and exact-output gates, clean scope/secret review and green PR CI. No hosting workflow or Nasa production deployment is included.

## Current module map

| Module | Responsibility |
| --- | --- |
| web/src/data/site-profiles.json, siteRules.js, projection.js | Per-site frames, EPSG zones 47/48, ecology and render budgets |
| web/src/data/contractPolicy.js, load.js; web/src/science/referenceData.js | Strict published v2 policy; opt-in labelled scene illustration; science views reject fixtures |
| web/src/scene/; web/src/world/identityRules.js, identity.js | Shared streaming/rendering and optional Thai architecture/activity; fixed illustrative water elevation |
| web/public/scene/bang_rakam/; models/thai_*.glb; impostors/thai/ | 36 tiles covering the confirmed 12 km frontend frame, source-backed OSM positions and original Thai assets |
| web/scripts/sync-data.mjs, make-site-fixture.mjs, fixtureRules.mjs | Preflight reviewed real inputs; append deterministic illustration only when no real site exists |
| web/scripts/verify-public-data.mjs, verify-published-data.mjs | Real committed-input checks and exact two-site public/build output checks |
| web/src/map/, ui/mapWorkspace.js, science/ | Same-tab and standalone maps; authoritative backend season properties, observation replay, 24 nearest-hamlet calendar and Method |
| web/tools/ | Optional original generators/acquisition helpers; explicit inputs/cache; not executed by normal build |

## Verification

- 142/142 Node tests pass; locked npm installation and production build pass. Existing large-chunk warning remains. Main scene bundle 742.21 KB / 301.69 KB gzip; map 1,094.22 KB / 299.50 KB gzip. Runtime bundle hashes match the reviewed source build.
- The backend pipeline/export/verify.py passes all eight real-data schemas and cross-file checks: 2,344 cells, 20 acquisitions, cell IDs, chronology/timezone, state/null correspondence, indicators, area totals, backdrop limits and every summary pass. Its unmeasured transport/overlay placeholders are not presented as completed validation.
- All 28 committed real inputs are unchanged; public/data and dist/data exactly match them plus the independently regenerated, explicit Bang Rakam illustration. An extra task-owned output is rejected; removing it restores a passing gate.
- Edge/CDP checks pass for both landscapes, Thai models/wet/night behaviour, labels, embedded map, 24 calendar rows and 20 method rows. All four entrypoints reject intercepted v1 metadata. Both standalone maps render cells and respond to status/arrival/duration and date/season controls. Captures of Tân Hội, calendar and map were opened and visually inspected.
- Evidence is task-local under .cache/migration-two-sites/: tests.log, build.log, schema-cross-check.json, qa/results.json and map/results.json with PNGs. The harness waits for its direct Node Vite preview server and closes its own browser/server. The first browser attempt preceded server readiness; the corrected harness then passed. No user process is stopped.
- This migration does not rerun real S1-S6 processing or install/modify shared Python dependencies. The existing schema environment is used read-only. Source performance samples are retained as prior evidence, not claimed as a new target benchmark: high Tân Hội flight 104.56 avg / 73.94 min FPS, longest 48.5 ms; Bang Rakam 111.88 / 70.99, 35 ms. Tân Hội high uses four detailed tiles and reduced distant simulation/mirrors.

## Open limits and parallel work

- Current published data is the 20-image v2 export, not H7 or the 22-image/mask candidate in [product PR #12](https://github.com/hungkhuu404/Dancing_with_The_Paddies/pull/12). That candidate needs its own data/web review and map/backdrop verification. It is not merged by this task.
- The exact original S7/S6 input identity still needs data-owner confirmation; the existing provenance notes an aggregate/replay match without asserting NPZ byte identity. No agreement scores or independent-accuracy claim is added.
- Bang Rakam real water export, administrative/frame AOI agreement and final acquisition schedule remain pending. The 12 km frontend illustration is independent of the separate backend processing frame. Publishing real data requires reviewed frame, metadata and allowlist alignment.
- Intel low still has occasional frames over 100 ms. Large bundles and the initial-transfer 3 MB target remain open; no blanket performance acceptance is asserted.
- The Nasa-hosted live site is separate. Product main CI tests/builds this migration; no deployment, project submission or remote production acceptance is implied.

Per-file source and destination hashes. PR/merge state is recorded by GitHub rather than inferred from this local report.
