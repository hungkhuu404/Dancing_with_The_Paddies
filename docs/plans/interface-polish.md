# Interface, recovery and capture refinement

Task WEB-INTERFACE-013. Human owner AIVIETNAM-AIO-QP09; actor Codex. Product baseline 973092d; secondary baseline dc499ee. Consumers: scene/map navigation, reference pages, scene startup and video export. Start from the merged reviewed sources; keep the backend exports and scientific decisions unchanged. Completion requires tests/build, both-site browser checks, no overlapping toolbar controls on phone/desktop, a working non-WebGL route and recorded playback audio. Publish linked review PRs; no auto-merge.

## Interface

Remove the repeated T?n H?i H7 radar data and Bang Rakam radar data badges from all four views. Keep the provenance and post-hoc caveats in Sources/Method. H7 acceptance and Q1 metadata do not change.

Scene help moves into the real action toolbar beside Map and Tools. The actual control is moved, retaining its listener and focus state. Calendar/Method share one reference navigation row on phones and an aligned column on desktop. Both remain directly visible. The map gives Help/Method a reserved toolbar group, with a second navigation row only on standalone phones; embedded maps use one compact row. Existing fonts, icons, transparent materials, legends, motion and reduced-motion support remain. Compact mobile Tour and Map controls retain descriptive accessible names.

A non-WebGL direct scene link now explains the problem in plain English and offers Water calendar and Method for the selected site, plus the location chooser. These HTML routes do not depend on WebGL; a MapLibre-only fallback would not solve this case.

## Startup and recording

Models share one cached promise and decode per name across scene/living-world consumers. Remove the HEAD-before-GET round trip and begin these requests alongside scene metadata/textures. Preserve full texture/shadow/lit/effect warm-up and first-view gates; do not trade a shorter overlay for new shader hitches. Debug boot timings and network counts support before/after checks. No scene/model budget or observation state changes.

Application audio outputs expose playback-only taps after their gain/filter/limiter. A recording-owned mixer combines narration, score, data sonification and enabled ambient sound into one audio track for the canvas recorder. It subscribes to late-created audio contexts, adds a limiter, and disconnects/closes only its own resources on finish. Live playback/mute/ducking remain independent. It never captures a microphone or system audio. Unsupported audio capture preserves the video-only path. Existing generated voice files and manifests are unchanged; no paid API calls are made.

## Verification

Record actual test, browser, capture and timing results here before publishing. Compare both sites and both quality profiles. A low preset on NVIDIA is not an Intel hardware result. Keep timing samples separate from hardware guarantees and source-processing accuracy. Cache evidence stays task-local and own helper servers/browsers are closed.

### Executed verification

- 171/171 Node tests and production build pass; the 48-file committed-input and exact-output guards pass. No water data, schemas, model assets, weather archives, voices or package dependencies changed.
- Both complete 60-second tours pass site-specific invitation/caption/audio/evidence, focused chrome, completion, Escape/End tour and phone reduced-motion checks. A 30-second tour capture contains stereo audio (29.82 s decoded, RMS 0.0719). A separate mute/unmute capture measures RMS 0.1068 while audible, 0.0000126 after muting and 0.0186 after resuming. No microphone/system-audio permissions are requested.
- 41 browser layout checks pass for both sites, world widths 320/375/768/812/1440 and direct map widths 320/375/812/1440, including an embedded phone map. Headers stay on screen without overlap; map navigation no longer stretches between top/bottom anchors. Badges are absent from all four views. Captures were opened and inspected.
- With WebGL disabled, both direct site links offer their own HTML calendar and the expected 24/4 groups load. Atlas recovery also links to the selected calendar with a plain-language message.
- Local sequential before/after benchmark: same machine, plugged in, 1600 ? 900, reduced motion, 2-second standing and 9.5-second four-target flight samples. Before uses merged Nasa main; after uses this product build. Low uses verified Intel UHD LUID; high uses RTX 4050.

| Site | Phase / GPU tier | Ready seconds | Flight mean / minimum-bin FPS | Worst flight ms | Frames >100 ms | Model GET / HEAD |
| --- | --- | --- | --- | --- | --- | --- |
| tan_hoi | before / RTX high | 9.46 | 140.2 / 131.0 | 20.9 | 0 | 41 / 41 |
| tan_hoi | after / RTX high | 9.66 | 140.5 / 131.1 | 21.0 | 0 | 41 / 0 |
| tan_hoi | intel / Intel low | 10.04 | 47.5 / 44.1 | 56.3 | 0 | 41 / 0 |
| bang_rakam | before / RTX high | 8.97 | 135.6 / 119.2 | 21.2 | 0 | 47 / 47 |
| bang_rakam | after / RTX high | 8.90 | 136.5 / 124.0 | 41.6 | 0 | 47 / 0 |
| bang_rakam | intel / Intel low | 8.82 | 38.2 / 33.8 | 69.4 | 0 | 47 / 0 |

The startup difference is small and does not establish a meaningful speedup. The change demonstrably removes 41/47 model HEAD requests and shares decoded models; full shader warm-up still takes time. Do not compare these local readiness values directly to the prior hosted 14?16-second sample. No sampled flight exceeds 100 ms, but this is not a guarantee for all camera/driver/thermal conditions. Large bundle warnings remain: scene 1,347.29 kB (453.86 kB gzip), map 1,094.58 kB (299.66 kB gzip).

Evidence stays local in .cache/interface-polish/: qa/results.json and tour-30s.webm; layout/results.json and responsive screenshots; recovery/results.json and fallback screenshots; performance/results.json and route captures; tests.log/build.log. Own direct-Node Vite servers and Edge instances are closed after checks.
