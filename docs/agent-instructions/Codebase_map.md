# Product module map

The exported interface remains defined by [CONTRACT-001](../data-contract.md). Earlier migration/review documents are revision-specific evidence, not a second interface definition.

| Path | Responsibility |
| --- | --- |
| pipeline/, config/sites/, schema/, data/ | Backend processing, site configuration, contract schemas and published exports; unchanged by WEB-EXPERIENCE-006 |
| web/src/entry.js, ui/locationAtlas.js, data/siteRules.js | Regional entrance, explicit site selection and per-site scene profiles |
| web/src/main.js, scene/, world/ | Streamed landscape, illustration, radar/date transitions, guided tour and audio |
| web/src/map/ | Same-tab/standalone observation map and authoritative season cards |
| web/src/science/ | Nearest-hamlet calendar, method and source/limit pages |
| web/src/audio/seasonModel.js | Pure acquisition-area to musical-cue mapping; coverage is separate from water share |
| web/src/audio/seasonSound.js, sound.css | Lazy Web Audio, persisted default-on data sound, bounded/disconnected voices, accessible controls and workspace lifecycle |
| web/src/ui/quickGuide.js, quickGuide.css | Dismissible, once-per-view assistance using the existing landscape help control; no modal or forced sequence |
| web/src/fx/frameBudget.js | Quality-dependent shadow cadence and reflection reach; never changes observations |
| web/src/data/site-profiles.json | Site frames, ecology and streaming budgets; low Tân Hội streams two detailed tiles with farfield coverage |
| web/scripts/ | Reviewed source sync, separately labelled Bang Rakam illustration and committed-input/exact-output verification |
| web/test/seasonSound.test.mjs | Musical mapping, real-summary bounds and rendering-budget invariants |

[Current experience review](../plans/season-sound-guidance.md). [Earlier two-site integration](../plans/pixel-v2-two-sites.md) documents asset provenance and remaining scientific acceptance limits.

## Arrival and focused tour (WEB-TOUR-007)

- web/src/ui/tourInvitation.js and tourRules.js: session-scoped arrival choice, shared-link/fixture exclusion, bounded progress and entry/record eligibility.
- web/src/ui/tourFocus.js and tourExperience.css: reversible inert/aria state, fading exploration chrome and retained evidence/exit/audio controls.
- world/signature.js and main.js coordinate smooth camera entry, scientific evidence and normal/early-exit restoration; input is suspended only while the tour is active.
- audio/seasonModel.js and seasonSound.js retain the data mapping with a stronger limited output bus and selected-observation feedback on unmute.
- web/test/tourExperience.test.mjs covers the pure rules. [Refinement review](../plans/tour-refinement.md).

## Observatory landing (WEB-ATLAS-008)

- web/src/ui/locationAtlas.js: source-based SVG regional overview, real radar preview, honest site entry, keyboard highlighting and the existing cancel/skip/return contract.
- web/src/ui/atlasLayout.js: pure north-up regional display projection and path generation; no terrain-height or water-depth inference.
- web/src/ui/atlas.css: editorial composition, responsive map/entry actions and reduced-motion transitions.
- web/public/atlas/: pinned physical coastline/island geometry and source manifest; no political or maritime boundary layer.
- web/tools/build-atlas.mjs and build-atlas.py: pinned source acquisition plus topology-preserving offline geometry processing with Shapely.
- web/test/atlasLayout.test.mjs: projection, physical island retention, group labels and crop-edge/source invariants.

[Design, sources and verification](../plans/observatory-landing.md).

## Two-site real-data integration (WEB-DATA-009)

- data/sites.json and web/scripts/public-data-files.json publish both existing candidate site bundles; fixtures are not generated for registered real sites.
- web/src/data/releaseContext.js supplies release disclosure, study-frame limits and fixed radar reference/UV mapping without changing exported water states.
- web/src/ui/releaseNotice.js and releaseNotice.css show compact candidate status across landscape/map/reference pages.
- main.js, scene/shaderlib.js and world/signature.js map the real padded radar footprint into the selected scene and label its fixed date.
- science/method.js follows selected-site limits and infrastructure provenance; science/calendar.js retains candidate context.
- web/test/twoSiteData.test.mjs checks both real snapshots, local times, scene/raster footprint alignment and release semantics.

[Integration design and acceptance limits](../plans/two-site-real-data.md).

## Historical weather and site tours (WEB-EXPERIENCE-011)

- web/tools/fetch-history.mjs and history-rules.mjs: offline ERA5 acquisition from real pass times; UTC, units, continuity and coverage checks before writing.
- web/public/scene/history.json and scene/bang_rakam/history.json: credited static hourly archives, coverage and retained optical provenance.
- web/src/world/tourScript.js: per-site narration/caption scripts; default Tân Hội script remains compatible.
- web/src/data/site-profiles.json and world/signatureRules.js: five-view Bang Rakam camera configuration and bounded continuous route interpolation.
- web/src/world/signature.js and ui/tourInvitation.js: correct site invitation/script/route, real weather context and existing focused-tour lifecycle.
- web/tools/build-tour-voice.mjs and public/audio/tour-bang-rakam/: explicit offline voice generation, matching-clip reuse, timestamps and provenance.
- web/test/historyTour.test.mjs: UTC/archive coverage, narration binaries/cues, record preference and site route invariants.

[Sources, behavior and verification](../plans/history-bang-tour.md).

The science calendar entrypoint sets its acquisition count for compact tour-preview columns; reference.css scopes this evidence layout to .is-preview while preserving the full calendar.

## Interface and capture refinement (WEB-INTERFACE-013)

- ui/layout.css owns shared toolbar spacing and responsive scene/map reference navigation; map tools reserve Help/Method slots.
- main.js keeps all shader warm-up gates but preloads model promises; data/load.js shares one decode per model and avoids HEAD/GET pairs. main.js also provides selected-site non-WebGL HTML recovery.
- audio/recordMix.js taps application playback and owns the recording audio mix; world/recorder.js combines it with canvas video. tourAudio.js, tourScore.js, sound.js and audio/seasonSound.js register post-volume outputs.
- ui/tourFocus.js preserves toolbar focus/inert state after moving Help into the header. Repeated release badges are no longer mounted; data/releaseContext.js still supplies source/Method caveats.
- test/recordMix.test.mjs checks late sources, capture-only cleanup, playback survival and unsupported capture.

[Design and verification](../plans/interface-polish.md).

## Product production deployment (DEPLOY-014)

.github/workflows/web-ci.yml retains the web/data checks and publishes their verified artifact to the distinct Cloudflare Pages project floodcalendar only on main. Credentials live in GitHub Actions settings; PRs do not deploy. [Setup, activation and recovery](../plans/dancing-production.md). Nasa hosting remains independent.
