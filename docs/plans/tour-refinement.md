# Compact playback and focused tour refinement

Task WEB-TOUR-007; human owner Quoc, actor Codex. Feedback on product PR #14 is implemented first on feat/season-sound-guidance, then mirrored to Nasa preview PR #24. Baseline d74a380. No merge, production deployment, backend/data/schema/dependency changes or paid voice generation is included.

## Experience

- Landscape time control uses one compact row, approximately 420 x 46 CSS pixels on desktop. Map date playback is approximately 420 x 57 pixels. Repeated counters/helper text are removed visually; date/track/slider labels and keyboard stepping remain. Mobile layout stays within 375 pixels, with no forced title wrap or horizontal overflow. Coarse-pointer targets retain extra vertical clearance.
- Published-data sonification master increases from 0.12 to 0.42 (about 10.9 dB at this gain stage), with a dynamics compressor before output. Area-to-tone mapping, muted preference, fixture exclusion and ambient duck/recovery remain. Unmuting previews the currently selected observation; starting playback also gives immediate feedback when its index does not change. Output samples are checked rather than inferring audibility from a button state.
- A first-visit native dialog asks whether to start the one-minute tour after the Tân Hội entrance completes. Start tour begins directly with a gentle 1.2-second camera entry; Explore on my own and Escape continue to normal exploration. Answer is remembered for this browser session; the visible tour control always permits replay. Explicit map/block deep links and fixture sites are not interrupted.
- Exploration chrome fades over 320 ms and becomes inert/hidden from assistive technology during tour. Original inert/aria state is restored on full completion, End tour or Escape. Reduced motion makes the transition immediate. Camera/field input cannot accidentally interrupt the presentation.
- Subtitles, illustrated-site label/progress, End tour and labelled audio toggle remain. Radar interpretation, actual field record in scene four and the calendar evidence in scene five remain visible when needed. An informative published record is selected when one is available; absent dates/durations are never fabricated. Card links and secondary evidence actions are suppressed during the focused presentation.

## Verification

151 Node tests pass, covering invitation eligibility, bounded progress/camera entry, real record eligibility, data/audio semantics and existing engine behaviour. Production build and the 28-real-input/exact-generated-output gate pass. JS bundles remain subject to the existing large-chunk warning; no initial-transfer or universal FPS acceptance is newly claimed.

Edge/CDP uses the real atlas entrance, both invitation answers, a complete unaccelerated 60-second tour, intermediate radar/record/calendar evidence, early exit, Escape, reload/session suppression and 375-pixel/mobile/reduced-motion layouts. Captures are opened and visually inspected. Measured compact dock bounds are 420 x 46 and 420 x 57 CSS pixels. Fade is sampled between opacity zero and one while input is inert; restored aria/inert state is checked. Actual Web Audio samples have nonzero RMS with peaks below the clipping threshold; this is output evidence, not a human listening test on every speaker. Final logs/captures belong under .cache/tour-refinement/.

The full tour and field/card evidence are rechecked after choosing the informative record and entry blend. Browser/server helpers close only their own processes. Existing observation exports, scientific limitations and Bang Rakam pending data are unchanged. Linked PRs track CI, preview and merge status.
