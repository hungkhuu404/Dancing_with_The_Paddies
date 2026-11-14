# MAP-UX-001: Integrated water map

Human owner: Quốc. Actor: Codex. Consumer: new visitors and people inspecting block water records. Baseline: `d881de3` on `migration/web-local`, after the test/build CI addition. Implementation branch: `ui/integrated-map`. Depends on the migrated public Tân Hội H4 export. No new fixture, schema or input data. Completion requires tests, production build, inspected desktop/mobile screenshots and browser interaction checks. No commit, push, merge or deploy is authorised by this document.

## Design

The map is a working view of the same application, rather than a separate destination. Normal map links open a full-window workspace in the current tab. A 3D world / Map switch returns to the existing scene without reconstructing its camera. An explicit block action can instead focus that block in 3D. Direct `/map/` links remain usable, including when 3D cannot load. The map uses a lazy same-origin frame so its MapLibre styles and context cannot interfere with the Three.js scene. A native dialog makes the world inert and contains keyboard focus while it is open. Source and origin checks restrict the message channel.

The map occupies the canvas. A compact paper-tinted explorer introduces the task and contains Water status / Arrival / Duration. The active map key includes words and areas. Display options are secondary. A contextual block panel replaces the old sentence stack with bounded factual rows, an observation strip and optional radar measurements. Sources, validation limits and detailed methodology remain available on demand rather than permanent notices. No disabled placeholder features remain.

The timeline explicitly distinguishes Full season from individual observation dates. Full season reads the exported metrics. Selecting a date reads the latest valid state on or before that image; missing images carry earlier states and are labelled accordingly. Even the final image can be viewed in observation mode, rather than silently switching to season metrics. Choosing Arrival or Duration restores Full season. Block panels always label their bounded indicators as a full-season record. No dates, depths, scores or classifications are invented.

Newsreader and IBM Plex Sans remain self-hosted. The existing Radar / Paper / Water / Silt / Missing palette remains authoritative. Light surfaces, generous map space and restrained transitions replace the dense dark sidebar and three-track control strip. The UI/UX skill's generic enterprise landing-page result was not applicable; its verified Minimalism & Swiss Style guidance informed hierarchy and progressive disclosure. No GSAP, neon, new assets or dependencies.

## Modules

- `web/src/ui/mapWorkspace.js`: lazy map workspace, current-tab navigation, same-origin messaging, browser back handling and focus restoration.
- `web/src/map/presentation.js`: pure URL state, observation age/carry-forward, area counting, safe text and block-to-scene coordinates. Does not change CONTRACT-001 metrics.
- `web/src/map/main.js`: MapLibre layers and the redesigned explorer, date scope, playback, block selection and sharing.
- `web/map/index.html`, `web/src/map/map.css`: responsive workspace, floating controls, contextual panel and source dialog.
- `web/src/main.js`: suspends world rendering while Map is active and resumes the existing scene. Stops the tour/time-lapse before switching. `world/sound.js` suspends ambient audio without losing the user's sound preference.

The contract reader, metrics and public data are preserved. The migration manifest continues to describe the original imported snapshot; these modules are subsequent UI development on the migrated code. The original source repository remains read-only.

## Verification

Local results: 89/89 Node tests pass (83 inherited and six new presentation tests). Production build passes. New tests compare every public block at every acquisition with the unchanged CONTRACT-001 as-of helper, check area conservation, bound URL dates and verify south-positive block coordinates.

Edge checks used the actual NVIDIA D3D11 backend. The full browser flow passes: same-tab map opening, lazy frame creation, zero 3D render frames while the map is open, camera preservation, keyboard focus restoration, browser Back/Forward, selected-block return to 3D and shared-map URL reload. Map-only checks also pass against the final touch-layout build. Screenshots were opened and inspected at desktop, tablet and phone sizes (1440x900, 768x1024, 390x844, 375x667, 844x390 and 568x320). Map controls remain reachable in short landscape layouts.

Layer switching, observation playback, first/final image scope, carried-forward states, season-only overlays, radar-only view, keyboard centre selection, chart/table disclosure, clipboard sharing, source-dialog focus, reduced motion, reduced transparency and missing-data errors pass. No application exception or failed local resource request occurred. This is not a screen-reader audit, Intel benchmark or audible audio test.

Build output: main JS 1,320.72 kB (446.12 kB gzip), map JS 1,091.86 kB (298.81 kB gzip), shared presentation JS 5.00 kB (2.27 kB gzip), main CSS 33.45 kB (7.27 kB gzip), map CSS 87.97 kB (14.34 kB gzip). The existing large-chunk warning remains. No dependency or public-data file changed. A cold shared link into the integrated map currently warms the 3D world first; the direct /map/ route avoids that cost.

Local evidence outside Git: runtime/map-redesign/final/ for the complete integration flow and runtime/map-redesign/touch-final/ for the final touch layouts; runtime/map-redesign/review/ contains the final copy-polished map screenshots and map-only checks. Important screenshots: map-overview.png, map-block.png, map-arrival.png, phone-overview.png, small-landscape-overview.png and integrated-block.png. Browser reports are results.json in each folder. Temporary browser and server processes are closed after checks. The review branch is ui/integrated-map, based on migration/web-local while migration PR #1 remains open. The UI PR targets that branch to keep the review diff limited to this task. CI accepts pull requests into main and migration/web-local; push checks remain limited to main. Deployment configuration is unchanged.

Remaining product limitations include the absence of validation results, Bang Rakam, H7 and the pipeline; this UI task does not supply those outputs. The external OpenFreeMap base layer remains optional. The root 3D page is retained for existing features and WebGL fallback.
