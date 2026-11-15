# Data sound, lightweight rendering and first-visit assistance

Task WEB-EXPERIENCE-006; human owner Quoc, actor Codex. Branch feat/season-sound-guidance starts from product main 59ec09e. Consumers: first-time/judging visitors, landscape/map/calendar playback and Intel devices. Data, pipeline, schema, dependencies and source Nasa checkout are unchanged. This feature is for review, with no automatic production deployment or merge.

## Behaviour

Data sound is enabled by default and starts only after a user interaction permits Web Audio. The speaker beside playback mutes it and remembers that choice across the three views and reloads. Audio is procedural original synthesis, with gentle gain envelopes and no external audio download/API. Ambient sound and tour narration/music remain separate. Data tones are suppressed during the guided tour and stopped at workspace/visibility transitions; missing Web Audio degrades to a disabled, labelled control.

Each acquisition reads summary.passes from the same published export. One to four triangle tones encode water_ha / valid_ha; high/low accents mark positive newly observed wet/dry areas, with gain proportional to the corresponding share of valid area. Two short low ticks represent no valid observation; one tick marks coverage below 50%. Missing is never mapped to dry. Neither pitch nor loudness represents water depth or radar intensity. Bang Rakam fixture observations cannot produce data sound. The calendar highlights the corresponding observation column while playing.

Quick guide uses three short actions, a dismiss button and reopenable help. It does not use a modal, steal initial focus, dim the scene, expire before reading, or require completing steps. The first-visit choice is stored per view; existing detailed navigation help remains accessible. A separate compact button keeps the mobile header clear. Reduced motion/contrast preferences, keyboard focus and 44-pixel audio/help targets are respected. The UI follows the existing palette/typefaces and uses original inline SVG icons.

## Rendering changes

Only low Tân Hội uses two detailed tiles (previously four), a 1,400 m streaming radius and smaller distant activity/crown/mirror budgets. The farfield still covers unloaded areas and observations stay unchanged. Low-tier shadows update every fourth frame; reflections stay enabled near the water/in boat view and are omitted at distant overview heights. High-tier cadence and detail stay unchanged. This trades distant detail for responsiveness rather than reducing geographic/data coverage.

## Verification

146 Node tests pass, including deterministic musical mapping, invalid/missing data, every real acquisition and rendering-budget rules. Build passes with the existing large-chunk warning. All 28 committed published inputs and both generated data outputs pass the exact-byte gate. No scientific export is regenerated.

Edge/CDP checks exercise real Web Audio output (nonzero analyser samples), default-on state, mute/reload/shared preference, map/calendar playback, 24 highlighted calendar cells, fixture audio exclusion, reopenable/skippable guidance and mobile overflow. Desktop/mobile captures are opened and visually reviewed; timeline speaker overlap and calendar speaker contrast found in the first captures are corrected. Evidence is task-local under .cache/season-sound/qa/, tests.log and build.log. The harness closes its own Edge and direct Node Vite preview server.

Performance: mains power, 1600 x 900, separate confirmed RTX 4050 and Intel UHD runs. Same four-target, 9.5-second route, no simultaneous browser benchmark. Minimum is the worst complete one-second sample. An obsolete Intel adapter ID selected NVIDIA initially; that run was rejected, the current DXGI ID was read without changing system settings, and the low baseline was rerun against the original build.

| GPU/tier | Flight average FPS before / after | Flight minimum FPS before / after | Longest flight frame before / after | Frames over 100 ms before / after |
| --- | --- | --- | --- | --- |
| RTX 4050 high | 135.13 / 139.65 | 117.20 / 130.00 | 34.7 / 20.9 ms | 0 / 0 |
| Intel UHD low | 42.93 / 50.39 | 36.00 / 47.03 | 131.9 / 62.5 ms | 2 / 0 |

Intel stationary average rises from 39.00 to 51.86 FPS in these samples. Source evidence: .cache/season-sound/before/, before-low/ and after/. These measurements are route/device samples, not a guarantee for every device or village. Large bundles and the unproven 3 MB initial-transfer target remain open. No blanket performance acceptance is claimed.

## Remaining review

Listen on real speakers/headphones to judge musical taste and comfortable volume; automated sample analysis establishes output, not a human listening review. Scientific limits of the 20-image v2 export, pending 22-image backend candidate, S6 input-identity confirmation and Bang Rakam real observations remain independent of this feature. Product CI and PR state are tracked on GitHub; no hosting workflow is introduced.
