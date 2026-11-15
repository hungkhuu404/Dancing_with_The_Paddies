# Historical weather and Bang Rakam tour (WEB-EXPERIENCE-011)

Human owner AIVIETNAM-AIO-QP09; actor Codex. Product baseline: Dancing_with_The_Paddies@855f9fb; secondary baseline Nasa_prep@315ea36. Consumers: both site's scene weather, tour invitation, narration/captions, camera route and science evidence. Develop first in the product; synchronize only reviewed source/assets to a separate Nasa preview branch. No auto-merge. Water exports, H7 acceptance, schemas and classifications are unchanged.

## Archived weather

The existing fetch-history.mjs now derives its UTC interval from the selected site's actual acquisitions and includes the next interpolation hour. It requests hourly cloud_cover, rain, wind_speed_10m and wind_direction_10m using models=era5, wind_speed_unit=ms and timezone=UTC. A failed/incomplete request or unexpected units/timezone cannot overwrite a previous archive. --out writes a review copy before publication. Coverage is checked at every acquisition, not inferred from array length.

- Tân Hội: 2,040 hourly records, 11 August–3 November UTC; 22/22 acquisitions covered.
- Bang Rakam: 1,920 hourly records, 13 August–31 October UTC; 11/11 acquisitions covered. The initial ascending pass is on 13 August UTC and 14 August locally.
- Source: [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), ERA5 reanalysis, CC BY 4.0. Exact URLs, retrieval time, units, returned grid centre and coverage indices are stored with each static JSON. ERA5 is an approximately 25 km atmospheric estimate, not per-field weather or a local station reading. Rain is an hourly amount; interpolation supplies a visual estimate at the acquisition minute, not instantaneous measured rainfall or water depth.
- Tân Hội's existing 23 Sentinel-2 tile cloud entries are preserved with their earlier provenance. No new optical entries or cloud percentages are invented for Bang Rakam or missing dates. The weather fetch command does not refresh optical metadata.
- Browsers request static local JSON only. Weather is not used to change any W/N/- record. Rain/cloud visuals and ambient sound remain illustrations.

## Bang Rakam's one-minute tour

Five 12-second scenes introduce the managed Yom floodplain, illustrated riverside life, radar surface responses, a real block record and the actual four-group/eleven-visit water calendar. English captions are single-line, concise and site-specific. No Tân Hội/24-hamlet text is reused for this site. The existing Tân Hội script and voice binaries are retained unchanged.

The route is profile configuration, not site branching scattered through the engine. Intro targets are near the mapped Bang Rakam place node/1068830365 and an existing mapped bridge. These are illustrative camera positions, not surveyed assets. The record target is selected from actual loaded parcels, preferring informative confirmed records where available; unconfirmed data are never relabelled. The opening camera stays below the illustrated cloud layer for a readable village/river view without altering the archived cloud estimate.

The arrival invitation names the selected site and remains optional/once per session. Exploration controls fade and become inert during the tour; exit/audio, illustration attribution, radar interpretation, block evidence and calendar remain available at the relevant times. The tour restores the prior view and input state on completion, End tour, Escape or page hiding. Reduced motion retains the story with stationary scene views instead of continuous camera movement. No new user-facing controls duplicate the existing tour tools.

Narration uses the previously chosen Jon – Warm & Grounded Storyteller voice through ElevenLabs, model eleven_multilingual_v2. Scenes 3 and 4 reuse the existing hash-checked Tân Hội speech because their text is identical; only 1, 2 and 5 are newly generated. Each is under the 12-second scene budget. Provider, settings, text hash, cue starts, speech duration, binary hashes and reuse are in audio/tour-bang-rakam/manifest.json. The existing procedural score changes on scene boundaries and ducks for speech. The shared mute stops both score and narration. Credentials remain outside the checkout; no paid operation occurs during build, CI or browser use.

## Verification and limits

Node tests cover real acquisition coverage, UTC/local-date boundaries, missing values, wind wrap, malformed weather axes/ranges, script/audio hash/cue consistency, record priority and route continuity. Full browser runs must complete all 60 seconds at both sites, exercise all five recorded segments, inspect each scene, verify correct evidence counts, and check exit/restoration, mobile/reduced-motion and no provider API calls at runtime. Capture/log output belongs under .cache/history-tour/. Audio playback/decoding checks are technical checks; they do not certify pronunciation on every device.

No new model/texture imagery, library dependency, water depth, satellite pass or optical statistic is fabricated. Existing large bundle warnings and the previous lack of direct Intel UHD hardware verification remain separate limitations. Linked PRs record actual test/build/parity and hosted-preview results; neither source commit nor an existing test result alone implies a merged production release.

### Executed checks

- 169/169 Node tests and production build pass. Both public-data guards verify exactly 48 approved input/output files. No water exports, schemas, package dependencies or original T?n H?i narration binaries change.
- Edge headless exercised both full 60-second tours, all five audio segments per site, correct per-site invitation/captions/evidence, normal completion, Escape/End tour restoration, phone layout and reduced motion. No runtime Open-Meteo/ElevenLabs request or JavaScript error was observed. The final closer Bang Rakam opening was separately captured and checked after adjusting its camera distance.
- All five Bang Rakam MP3 files decode successfully: 6.08?7.01 seconds, RMS 0.101?0.113. This checks working playback assets, not human pronunciation or loudness on every speaker. Audio/manifest total: 533,927 bytes; weather archives: 73,523 bytes (T?n H?i) and 65,411 bytes (Bang Rakam).
- Tour calendar preview uses acquisition-count columns and compact styling only inside the preview. All 44 Bang Rakam cells fit at 900 ? 280 and 355 ? 219 pixels. The four group names and the note that these are not official boundaries remain visible. The full calendar keeps its normal controls and sizing.
- Main scene chunk: 1,346.37 kB (453.55 kB gzip); map chunk: 1,094.61 kB (299.65 kB gzip). Existing large-chunk warnings remain. No new claim about FPS on Intel UHD or hardware frame-time acceptance is made by these functional checks.
- Local evidence: .cache/history-tour/qa/results.json, audio.json, both sites' tour screenshots, bang-opening-settled.png, calendar-preview-900.png and calendar-preview-355.png. Servers and Edge instances created by these checks were closed.
