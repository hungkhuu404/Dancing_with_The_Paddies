# Flood Calendar web

A static web app built with Vite, three.js and MapLibre GL JS. It shows the published water observations of two sites, Tân Hội (Vietnam) and Bang Rakam (Thailand), as a 3D landscape, a map and a calendar. Dependency versions are pinned in `package.json` and `package-lock.json`.

## Run locally

Requires Node.js 24. From `web/`:

```sh
npm ci --ignore-scripts
npm test
npm run build
node scripts/verify-published-data.mjs
node node_modules/vite/bin/vite.js preview --host 127.0.0.1
```

- `npm test` runs the Node test files in `test/`.
- `npm run build` first runs `scripts/sync-data.mjs`, which copies the published data files into `public/data/`, and then builds the static site into `dist/`.
- `scripts/verify-published-data.mjs` checks that `public/data/` and `dist/data/` match the committed files in `../data/` byte for byte. It calls `git`, so it needs a Git checkout.
- The last command serves the built site locally.
- `npm run dev` starts the Vite development server. It runs the same data sync first.

## Pages

- `/` is the regional entrance. It opens the 3D landscape of the selected site. The map opens inside the same page.
- `/map/` is the map as a standalone page.
- `/calendar/` and `/method/` show published observations only.

The Tân Hội calendar groups the 2,344 blocks by the nearest of 24 hamlet points. These groups are not administrative hamlet boundaries. Both site tours have captions and optional ElevenLabs narration. Ambient audio is illustrative. A separate data sound follows the observed water area.

## Data and illustrations

- The web app reads the export files in `../data/`. `scripts/public-data-files.json` lists the 48 files that are published; they cover both sites. The app does not run pipeline stages S1–S7. It rejects incompatible metadata and never substitutes replacement observations. The file format is defined in the data contract (`../docs/data-contract.md`).
- Tân Hội: data contract 2.0.0, 2,344 blocks and 22 acquisitions from 11 August to 3 November 2026, with the GCOV mask applied.
- Bang Rakam: 2,304 blocks and 11 acquisitions (14 August–31 October 2026), EPSG:32647, in a 12 × 12 km study frame. Its cards, map and calendar show this export. Its landscape objects are illustrative.
- The Bang Rakam acquisition of 31 October uses per-image thresholds. For both sites the method was selected after comparison with the reference product (post hoc).
- `scripts/sync-data.mjs` validates the listed input files before it rebuilds `public/data/`. `scripts/verify-public-data.mjs` checks that the committed inputs match Git `HEAD`; with `--output <directory>` it also compares one output directory. Use `scripts/verify-published-data.mjs` to check `public/data/` and `dist/data/` for both sites. CI runs both scripts.
- Pixel classification requires 75% water pixels and 70% jointly valid coverage, with the 50% temporal guard (see `../docs/pixel-dual-method.md`). The block-average HH and HV values are diagnostic and are not the classification decision. The selection against DSWx-S1 is post hoc. It is not independent validation or field accuracy. No comparison scores are displayed.
- Homes, people, vegetation, water elevation, weather effects and architecture are illustrative. Attribution for the OpenStreetMap locations, the CC BY optical background and the procedural models is in the manifests under `public/`. The Bang Rakam scene shows no operational barrage and no Y.16 marker, because no verified location was available.

## Rendering and tools

- On the high quality tier, the Tân Hội scene streams four detailed tiles and limits distant simulation and mirrors. The far-field layer covers the rest of the site.
- On the low tier (for example Intel integrated graphics), tile streaming can stall occasionally.
- The build reports a size warning for the large map and scene chunks. This is known.
- The asset generators are in `tools/`; see [tools/README.md](tools/README.md). They take explicit local input and output paths. Regenerating every committed asset from this repository has not been verified.
- Some generators need Blender and separate Python and model-compression dependencies. `npm ci` does not install these.
- The repository contains no raw imagery, tokens or source caches.

## Deployment

`.github/workflows/web-ci.yml` tests and builds the app on pull requests and on pushes to `main`. On `main` it deploys the tested build to the Cloudflare Pages project `floodcalendar`. The deployment requires both the web job and the backend checks (`.github/workflows/backend-checks.yml`) to pass. Production is at https://floodcalendar.pages.dev/.

## Historical weather and narrated tours

Both sites have static Open-Meteo/ERA5 weather for every published acquisition: Tân Hội 22/22 and Bang Rakam 11/11. Weather is an approximately 25 km reanalysis estimate at the acquisition time in UTC. It is not a measurement per field. Missing values are never converted to dry or clear conditions in the archive.

Each site has its own tour script, camera route, captions and narration audio (`public/audio/tour/` for Tân Hội, `public/audio/tour-bang-rakam/` for Bang Rakam). The Bang Rakam tour is 60 seconds long. The Bang Rakam calendar shows its four mapped place groups and eleven acquisitions.

## Interface and video capture

- Help is on the scene and map toolbar. Calendar and Method are separate views with direct links.
- The scientific caveats are in the Sources and Method views.
- In a browser without WebGL, the calendar and Method pages of the selected site still open.
- The canvas recording includes narration, score, data tones and ambient audio if enabled, and respects mute. It does not capture the microphone or system audio.
