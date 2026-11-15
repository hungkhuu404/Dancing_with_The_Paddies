# Flood Calendar web



## Run locally

Requires Node.js 24. From web/:

```sh
npm ci --ignore-scripts
npm test
npm run build
node scripts/verify-published-data.mjs
node node_modules/vite/bin/vite.js preview --host 127.0.0.1
```

The regional entrance opens a selected landscape. Map opens inside the same page; /map/ remains a standalone route. /calendar/ and /method/ accept published observations only. The calendar groups the 2,344 blocks by their nearest one of 24 hamlet points, not administrative hamlet boundaries. Captions and optional ElevenLabs narration accompany both site tours; ambient audio is illustrative, while the separate data sound follows observed water area.

## Data and illustrations

- The registry and its 48 approved public files contain both real site exports. The final Tân Hội export uses data contract 2.0.0: 2,344 blocks and 22 acquisitions from 11 August to 3 November 2026, with the GCOV mask applied. The web reads these exports and does not execute S1–S7. It rejects incompatible metadata instead of supplying replacement observations.
- Bang Rakam has 2,304 blocks, 11 acquisitions (14 August–31 October 2026), EPSG:32647, in the confirmed 12 × 12 km study frame. Its data-driven cards, map and calendar are not fixtures. Landscape objects remain illustrative.
- Tân Hội's catalogue is final. The Bang Rakam image of 31 October uses per-image thresholds. Both sites retain the post-hoc reference limitation.
- Sync validates required real inputs before rebuilding public/data/. CI verifies committed input bytes and reconstructs the explicit illustration to check both public/data/ and dist/data/ exactly. The retained verify-public-data.mjs command without --output checks real inputs only; use verify-published-data.mjs for two-site outputs.
- Pixel classification requires 75% water pixels and 70% jointly valid coverage, with the 50% temporal guard. Diagnostic block-average HH/HV are not the classification decision. Selection against DSWx-S1 is post-hoc; it is not independent validation or field accuracy. No comparison scores are displayed.
- Homes, people, vegetation, water elevation, weather effects and architecture are illustrative. Source-backed OSM locations, the old CC BY optical background and original procedural model notices remain in public/ manifests. Bang Rakam does not invent an operational barrage or a Y.16 marker.

## Rendering and tools

The high-tier Tân Hội profile uses four detailed streamed tiles and limited distant simulation/mirrors; farfield retains coverage. Intel low still has occasional streaming stalls. The large map/scene chunks remain a known build warning. Generator source is in tools/ with explicit local input/output options; source recovery does not prove every historic asset is fully reproducible. No raw imagery, tokens, source cache or heldout are included. Some generators require Blender and separate Python/model-compression dependencies; npm ci alone does not install these.

The product package scripts and lockfile are retained. Product production targets Cloudflare Pages project floodcalendar through its own gated Web CI workflow. Production is available at https://floodcalendar.pages.dev/. Its main deployment requires both web and backend contract checks.


## Historical weather and narrated tours

Both sites have static Open-Meteo/ERA5 weather for every published acquisition: Tân Hội 22/22 and Bang Rakam 11/11. Weather is an approximately 25 km reanalysis estimate at the acquisition UTC, not a measurement per field. Missing values are never converted to dry/clear conditions in the archive.

Bang Rakam now has a site-specific 60-second route, invitation, captions and Jon narration, with the existing scene score and focused-tour controls. Its calendar shows the actual four mapped groups and eleven visits. Tân Hội retains its original script/audio.

## Interface and video capture

Help shares the scene/map toolbar; Calendar and Method remain separate, directly available views. Repeated radar-release badges are removed while Sources/Method retain the scientific caveats. On browsers without WebGL, the selected site can still open its HTML calendar and Method. Canvas recording includes application narration, score, data tones and enabled ambient playback, respecting mute; it does not capture a microphone or system audio.
