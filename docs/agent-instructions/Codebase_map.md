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
