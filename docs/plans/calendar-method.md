# SCIENCE-UI-001: Water calendar and Method and limits

Human owner: Quoc (frontend). Actor: Codex. Consumer: visitors, scientific reviewers and submission figures. Branch: feat/water-calendar-method, baseline product main 249961d. Depends on published CONTRACT-001 1.0.0 cells, series, places and acquisition metadata. No new data files, backend service or dependency are introduced. Source requirements: Nasa_prep spec_uiux111126 sections 6.6 and 6.11, as read from the pinned source checkout; the product data contract remains authoritative.

## Delivered views

/calendar/ groups blocks by nearest_hamlet, includes all 24 published names and follows the 20 actual acquisitions. Rows sort by first observed W, with deterministic name ordering for ties. This is explicitly not exact flood onset or an official boundary. Percentages are W/(W+N) for the selected acquisition; no carry-forward is used. Coverage below 50% is hatched and no percentage is shown. Exactly 50% coverage remains eligible. Five equal-percentage bands use the existing palette. Empty or missing records never become dry observations. Corrupt/mismatched records fail explicitly.

Each table cell contains a percentage or unknown mark, an accessible date/track/coverage label and an action to open the matching map acquisition. Arrow keys and Home/End move a single tab stop through the table. The selected nearest-hamlet group is fitted and named in the map. The root landscape and map expose the calendar; the fifth guided-tour scene embeds the actual table with a full-view action. Save image produces a complete high-resolution PNG with every group, dates, source and the required grouping caveat, suitable for the Project figure.

/method/ reads actual block counts, dates, method and every per-acquisition rule/threshold from meta.json. Overrides take precedence; explicit null remains unknown. Threshold display is rounded to three decimals and links to the original metadata. It explains the four required limits, no depth measurement, dry-surface ambiguity, date bounds, the calendar denominator, and the map's labelled carry-forward behaviour. It discloses language-model assistance for web code/copy and distinguishes illustrative landscape/radar effects from observations. It links published data and primary sources, retains attribution, and displays no reference-agreement scores or independent-validation claim. H5 wording was not substituted with invented results; the limitations use the approved spec and current metadata.

## Integration and modules

- web/src/science/calendarModel.js: pure grouping, coverage, colour bins, map query and method-override presentation.
- referenceData.js: published-site and real-metadata loader; no fixture fallback.
- calendar.js, calendar/index.html: semantic table, accessible inspection, keyboard movement and PNG export.
- method.js, method/index.html: metadata-derived method and threshold table, limits, AI disclosure and sources.
- referencePage.js, reference.css: self-hosted fonts, shared Paper layout, local-site links, accessible close and internal history replacement. External citations open their source in a separate tab; published JSON links download.
- ui/referenceWorkspace.js: native same-tab reference dialog with source/origin-checked messages, Escape, Back and focus restoration. Landscape rendering/audio pause while open. Iframe route and hash navigation replace child history so they cannot trap the parent Back action.
- main.js, ui/chrome.js, ui/mapWorkspace.js, map/main.js, world/signature.js: entry links, nested-map updates, group context and the final tour preview. Existing intro, modes, timeline, tour stop and standalone map stay available.
- vite.config.js: adds calendar and method entry points. web/test/science.test.mjs: calculation and public-record reconciliation tests.

## Verification

104 Node tests pass, including seven new tests for exact-observation denominators, half-coverage boundary, empty groups, deterministic ordering, invalid records, method overrides/null and Unicode map queries. Every group/date aggregate reconciles against all published block series. Production build passes; the existing large-chunk warning remains. All 28 public inputs still match HEAD; public/data and dist/data match those files byte for byte. No supplied data, pipeline, contract, package or lockfile is rewritten. Main received the public H5 handoff during implementation; the web allowlist includes that committed validation file byte for byte, without rendering its agreement metrics or post-hoc content.

Edge checks pass for 24x20 cells, keyboard navigation, PNG download, phone horizontal containment, per-acquisition overrides, missing-series failure, same-tab calendar/map navigation including an already-open map, final-tour table, paused world rendering, reduced-motion Escape/focus and nested-reference browser Back. No application exceptions were recorded. Desktop, phone, exported PNG and tour screenshots were opened for visual review. Local evidence is in runtime/map-redesign/science-qa and science test/build logs, outside Git. Test browsers and preview servers are closed.

Scientific reference pages use Paper for reading rather than overlaying long prose on the terrain. The shared UI skill's accessible names and visible-label guidance was applied; no animation library or AI imagery is added. The geometry/observation pipeline and accuracy assessment are unchanged. Full screen-reader/device audits, new GPU traversal benchmarks, a new H5 scientific review, Bang Rakam observations and deployment are not claimed by this task. CI and release status are tracked on its PR.
