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
