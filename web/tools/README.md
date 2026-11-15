# Asset and scene build tools

These tools build the static 3D scene assets of the web app: models, tree impostors, scene tiles, infrastructure overlays, the regional atlas, the weather archive and tour narration. They are optional offline tools. None of them runs during `npm run build` or in the browser, and none of them changes the water observations in `data/`.

Every tool writes to an explicit local path. Review the output before copying it into `web/public/`. Run the commands below from the repository root unless stated otherwise.

The committed assets were produced with these scripts. Regenerating every committed asset from this repository alone has not been verified, because some inputs are not included (see [Inputs that are not in the repository](#inputs-that-are-not-in-the-repository)).

## Layout

- `blender/base/`: generators for palms, plants, houses, a boat and an egret, with shared helpers and a model self-check.
- `blender/veg/`: vegetation models and procedurally painted textures.
- `blender/built/`: boats, infrastructure, buildings and props.
- `blender/life/`: animals, a motorcycle and adult people, with rigging and animation helpers.
- `blender/thai/build_identity.py`: models for the Bang Rakam scene.
- `blender/render_tree_impostors.py`: renders tree impostor atlases.
- `commune/`: scene tile build (preparation, seeded parcel layout, props, index and cross-tile checks).
- `geo/geo.py`: UTM, clipping, input and imagery helper functions.
- `site-options.mjs`, `site_config.py`: read the shared site profile for Node and Python tools.
- `recovery_paths.py`: resolves the local build and input directories from environment variables. Nothing writes to `web/public/` automatically.
- `verify_recovery.py`: static check of the Python sources (see [Verification](#verification)).
- `RECOVERY.md`: provenance table of the generator scripts.
- `*.mjs` in this folder: Node tools described in the sections below.

## Dependencies

- Node.js 24 for the `.mjs` tools.
- Blender 5.3 for the `bpy` generators in `blender/`.
- For the `commune/` scripts, use Blender's bundled Python, or another Python with NumPy and OpenImageIO, and pass `-I`. `-I` isolates Python imports; the scripts add their local helper directories themselves.
- `@gltf-transform/cli` 4.5.1 for model compression. Install it in a separate local tool directory. It is not an application dependency.
- Shapely 2.2.0 for the atlas build.

`npm ci` does not install Blender, Python or the model-compression CLI. None of these tools installs packages.

The committed compressed GLB files were made with `@gltf-transform/cli` 4.5.1, meshopt compression and WebP textures, as recorded in their manifests in `web/public/models/`. The Blender generators export intermediate raw GLB files. Compression and budget checking are separate steps. Do not assume that newly compressed files match the committed ones byte for byte. Any published model must be at most 400 KB.

## Site profiles and `--site`

`web/src/data/site-profiles.json` is the shared scene and build profile registry. Browser modules, Node tools (`site-options.mjs`) and Python tools (`site_config.py`) read it. For each site it describes the projection, frame, origin, boundary policy, scene paths, field dimensions, illustrative ecology and narration. It is not a water-data export and does not override the data contract (`docs/data-contract.md`). Scene and observation metadata must match the selected profile before display.

The site-specific Node tools and the `commune/` scripts accept `--site <id>`. The default is `tan_hoi`; the other site is `bang_rakam`. Examples:

```text
node web/tools/fetch-infrastructure.mjs <cache-output.json> --site bang_rakam
node web/tools/build-infrastructure.mjs <cache-input.json> <review-output.json> --site bang_rakam
node web/tools/build-parcel-atlas.mjs --site bang_rakam
node web/tools/fetch-history.mjs --site bang_rakam
<python-with-numpy> -I web/tools/commune/run_all.py 2 --site bang_rakam
```

- Tân Hội scene files are in `web/public/scene/commune/`. Bang Rakam scene files are in `web/public/scene/bang_rakam/`.
- All inputs must belong to the selected site's source directory. Changing `--site` does not acquire missing input files.
- `bang_rakam` uses a full rectangular frame, not an administrative boundary. It has no radar reference windows in its profile, so no radar texture is produced, and no Tân Hội raster is substituted.
- Scene lighting uses the profile's coordinates and IANA timezone.
- Tour scripts and camera routes are selected by site.
- The Bang Rakam field and ecology values in the profile are an illustrative recipe, not measurements.

Offline smoke checks create and remove their own temporary fixtures and need no source data:

```text
<python-with-numpy> -I web/test/site-tools.py --site tan_hoi
<python-with-numpy> -I web/test/site-tools.py --site bang_rakam
```

## Local paths

The Python generators read their directories from environment variables. Set them in the launching process only.

| Variable | Meaning |
| --- | --- |
| `FLOOD_BUILD_DIR` | Required. Absolute local build directory, for example the resolved `.cache/generator-build` path. Outputs go to `raw/<category>/`, `commune/work/` and `commune/out/` (`bang_rakam/work/` and `bang_rakam/out/` for Bang Rakam). |
| `FLOOD_SOURCE_DIR` | Required for the scene tile build. Directory of prepared OSM GeoJSON files and the optical image. The Python scripts do not fetch anything. |
| `FLOOD_H0_DIR` | Required for the Tân Hội scene tile build. Directory with the commune boundary file and the NISAR sample-window NPZ files. Never commit these inputs. |
| `FLOOD_WEB_DIR` | Optional web root. Defaults to the directory above `tools/` (`web/`). |
| `FLOOD_AOI_FILE` | Optional AOI GeoJSON. Defaults to `web/fixtures/tan_hoi/aoi.geojson` for Tân Hội. |
| `FLOOD_REFERENCE_SCENE` | Optional reference scene directory. Defaults to `web/public/scene/`. |
| `FLOOD_MODELS_DIR` | Optional directory of compressed models for the self-checks. Defaults to `<build>/models/`. |

## Inputs that are not in the repository

The scene tile build for Tân Hội needs files that are not committed:

- In `FLOOD_SOURCE_DIR`: `osm_waterways.geojson`, `osm_roads.geojson`, `osm_water.geojson`, `osm_buildings.geojson`, `osm_landuse.geojson`, and the optical image `s2_tanhoi.png` with its metadata `s2_tanhoi.json`.
- In `FLOOD_H0_DIR`: `1_ranh_xa/xa_tan_hoi_osm.geojson` (commune boundary), `3_cua_so_anh_mau/047_20261027_P05036.npz` and `3_cua_so_anh_mau/148_20261022_P05036.npz` (NISAR sample windows).

Provide these only with the appropriate data permissions. A full run of the Tân Hội scene tile build from these inputs has not been validated. For Bang Rakam, the source directory can be built with the fetch tools in [Bang Rakam base scene](#bang-rakam-base-scene).

## Model generators

After setting `FLOOD_BUILD_DIR`:

```text
<blender> -b --factory-startup --python web/tools/blender/veg/build_veg.py -- bamboo
<blender> -b --factory-startup --python web/tools/blender/life/build_people.py -- wader fisher washer
```

The people generator builds three adult models only: `wader`, `fisher` and `washer`. It rejects any other name, and the export helper rejects child model names. The people in the scene do not represent measured population counts or locations.

The model manifests in `web/public/models/` describe the models as original procedural Blender work. The generators use no downloaded models and no imagery. OpenStreetMap data and optical imagery keep their own attribution. Parcel, tree, house and prop positions are seeded illustration unless a manifest identifies an OSM source.

## Scene tile build

`commune/run_all.py` runs the whole tile build: `prep.py`, then `tile_layout.py` and `tile_props.py` for each tile in parallel, then `finish.py` (checks, `index.json`, preview).

```text
<blender-python> -I web/tools/commune/run_all.py 2
```

`2` is the worker count. Review the output and the cross-tile checks before copying any asset into `web/public/scene/commune/`. Do not run the generators directly against the published output directories.

## Bang Rakam base scene

Preparation uses an OpenStreetMap snapshot (ODbL) and the pinned **EOxCloudless 2016** optical layer (CC BY 4.0). The scene covers the full rectangular frame. Raw downloads and build intermediates stay in a local cache. Only reviewed derived tiles and source manifests are published.

```text
node web/tools/fetch-osm-site.mjs <snapshot.json> --site bang_rakam
node web/tools/prepare-osm.mjs <snapshot.json> <source-directory> --site bang_rakam
node web/tools/fetch-optical.mjs <source-directory> --site bang_rakam
<python-with-numpy-and-openimageio> -I web/tools/commune/run_all.py 2 --site bang_rakam
```

Set `FLOOD_BUILD_DIR`, `FLOOD_SOURCE_DIR` and `FLOOD_WEB_DIR` to explicit local build, source and web directories. Inspect `<build>/bang_rakam/out/` and the `finish.py` checks. Then copy its `index.json`, `commune_*.webp` and tile layout and props files to `web/public/scene/bang_rakam/`, and run:

```text
node web/tools/build-infrastructure.mjs <snapshot.json> web/public/scene/bang_rakam/infrastructure.json --site bang_rakam
node web/tools/build-site-context.mjs <snapshot.json> --site bang_rakam
node web/tools/build-parcel-atlas.mjs --site bang_rakam
```

`build-site-context.mjs` does the following:

- It keeps mapped water outlines and holes for the raster worker.
- It anchors source buildings at polygon centroids and adds houses from the seeded layouts where the map has none.
- It removes generic actors from mapped schools and removes illustrative graves.
- It trims orchard trees if needed to keep the tile-size budget.

The props generator rejects bridge candidates that end in water. An unnamed mapped dam is not reclassified as an operational sluice.

## Infrastructure overlay

`fetch-infrastructure.mjs` saves bounded public Overpass API responses (OpenStreetMap, ODbL) into a local cache file that you name. It sends a generic User-Agent. Run it three times: with the default query, with `--buildings-only` and with `--facilities-only`. Public endpoints can time out. A failed request writes no snapshot.

`build-infrastructure.mjs <snapshot.json> [output.json] [more-snapshots.json ...]` combines those snapshots. It projects the geometry to the scene frame, keeps the OSM names, IDs and tags, deduplicates nested church sites and copies the place names from `web/fixtures/<site>/places.geojson` unchanged (24 for Tân Hội). It writes a separate static scene overlay (by default `web/public/scene/infrastructure.json` for Tân Hội). It never writes to `data/`.

`web/src/world/infrastructureShapes.js` holds the procedural geometry for infrastructure objects, with metre-scale bounds and memory-budget tests. These shapes need no Blender binary, no downloaded model and no generated image. Their source manifest is `web/public/scene/infrastructure-assets.json`.

## Parcel atlas

`node web/tools/build-parcel-atlas.mjs` rebuilds `web/public/scene/commune/parcel-cells.png` from the 54 committed tile layouts. With `--site bang_rakam` it uses that site's scene index and layouts. The tool rasterizes geometry only. The image stores the grid address of each parcel's centroid, not water observations. At runtime the far-field shader uses the current water-state texture. The tool is offline and deterministic and needs only Node.

## Tree impostors

`blender/render_tree_impostors.py` renders eight azimuths and two elevations of each tree model into 128-pixel tiles. First generate the raw `palm_a`, `palm_b`, `banana` and `bush` GLB files with the `blender/base/` generators (written to `<build>/raw/base/`). Then run:

```text
<blender> -b --factory-startup -t 2 --python web/tools/blender/render_tree_impostors.py -- --source <resolved-build-directory>/raw/base
```

The six other vegetation models are rendered from the `raw/veg/` outputs:

```text
<blender> -b --factory-startup -t 2 --python web/tools/blender/render_tree_impostors.py -- --source <resolved-build-directory>/raw/veg --names bamboo tram areca mango nipa reeds
```

- By default the tool writes `web/public/impostors/{palm_a,palm_b,banana,bush}.png` and `index.json`. `--out` selects another directory for review before copying.
- `--names` accepts only the model names known to the script: the ten vegetation models above and the two Bang Rakam trees `thai_borassus` and `thai_tamarind`.
- The tool merges new entries into the existing `index.json`, so rebuilding one group keeps the others.
- Each PNG must fit the 400 KB budget, or the command fails before it writes the index.
- The tool renders the model geometry and materials only. It uses no generated imagery. Provenance is in `web/public/impostors/manifest.json`.
- Impostors replace only the distant level of detail. Near-field rendering still uses the model geometry.

The committed impostors were rendered with Blender 5.3.

## Bang Rakam models

Run from the repository root with Blender 5.3 and a local review directory:

```text
<blender> -b --factory-startup -t 2 --python web/tools/blender/thai/build_identity.py -- --out <absolute-raw-directory>
node web/tools/compress-identity.mjs <raw-directory> <review-compressed-directory> <gltf-transform-4.5.1-cli.js>
<blender> -b --factory-startup -t 2 --python web/tools/blender/render_tree_impostors.py -- --source <absolute-raw-directory> --out <absolute-atlas-review-directory> --names thai_borassus thai_tamarind
```

- The Blender tool uses only built-in geometry and vertex colours. It exports 13 model presets and a Cycles contact sheet. `--only <model...>` rebuilds a subset. `--skip-contact` omits the contact sheet.
- Raw output stays outside `web/public/`.
- The compressor refuses to replace raw files in place. It checks the 400 KB cap and the meshopt extension.
- Inspect the Cycles images and the budget report. Then copy only the compressed GLB files to `web/public/models/`, and the two PNG atlases plus the index to `web/public/impostors/thai/`.
- Regenerate the hashes in `web/public/models/thai-manifest.json` after a model change.

## Regional atlas

```text
node web/tools/build-atlas.mjs --cache .cache/atlas-source --python <python-with-shapely>
```

This downloads public-domain Natural Earth physical layers at a pinned revision and runs `build-atlas.py` (Shapely 2.2.0). The output goes to `web/public/atlas/`; use `--out <review-directory>` for a review copy. No national or maritime boundary layer is generated. Source URLs, source hashes and label semantics are in `web/public/atlas/manifest.json`.

## Historical weather

```text
node web/tools/fetch-history.mjs --site tan_hoi --out <review-json>
node web/tools/fetch-history.mjs --site bang_rakam --out <review-json>
```

- The source is the Open-Meteo archive API with the ERA5 model (CC BY 4.0). Without `--out`, the tool writes the site's weather file under `web/public/scene/`.
- The time range is derived in UTC from the site's `data/<site>/meta.json` and includes the following hour for interpolation.
- The tool refuses incomplete acquisition coverage, a non-UTC time axis and wrong units before writing. A failed request leaves the existing archive unchanged.
- Review the source, grid and coverage metadata in the result before publishing.
- The optical cloud metadata already in the archive keeps its own provenance. This command does not acquire Sentinel-2 observations.

## Tour narration

```text
node web/tools/build-tour-voice.mjs --site bang_rakam --generate --key-file <private-file-outside-checkout> --out <empty-staging-directory> --reuse web/public/audio/tour
```

- Voice generation is a paid offline operation with the ElevenLabs API. It is never part of `npm run build` or browser use.
- It uses one fixed ElevenLabs voice ("Jon - Warm & Grounded Storyteller") and the `eleven_multilingual_v2` model.
- The API key file must be outside the checkout, and `--out` must be an empty directory. No credentials belong in the repository.
- `--reuse` copies matching, hash-checked clips from an existing directory, so they are not generated again. In the committed Bang Rakam set, clips 3 and 4 are reused from `web/public/audio/tour/`, and clips 1, 2 and 5 were generated.
- Check duration, cues and playback before copying the five MP3 files and the manifest to the audio path in the site profile (`web/public/audio/tour-bang-rakam/` for Bang Rakam).

## Catalogue query and illustration fixture

`node web/tools/fetch-site-catalog.mjs <output.json> --site bang_rakam` queries the public ASF catalogue for NISAR GCOV acquisition times and footprints only. The request window is August through October 2026 (`observation_selection` in the site profile).

`web/fixtures/bang_rakam/` holds committed fixture inputs: a selected catalogue and OSM positions. `node web/scripts/make-contract-fixture.mjs <output-directory> --site bang_rakam` writes a labelled synthetic fixture to an explicit output directory. It refuses to overwrite an existing site or the source `data/` directory. The data sync adds the fixture only when `data/sites.json` has no entry for the site. It never replaces a real export. `data/sites.json` contains a real Bang Rakam export, so the published build does not use the fixture.

`web/fixtures/bang_rakam/aoi-frame.schema.json` is a fixture-only variant of the AOI schema that allows a null OSM relation. It does not change the schemas in `schema/`. The fixture contains no reference-comparison results and no radar images. Its backdrop files are single transparent pixels and are not rendered as radar.

An optional schema check needs a Python environment with `jsonschema`:

```text
python web/test/check-site-export.py --data web/public/data --schemas <schema-directory> --frame-schema web/fixtures/bang_rakam/aoi-frame.schema.json
```

`<schema-directory>` is the `schema/` directory at the repository root. The `--frame-schema` override is rejected for non-fixture exports.

## Verification

`verify_recovery.py` parses the Python sources without importing Blender, opening imagery or running generators. It checks syntax, the absence of child-model generation calls and the absence of machine-specific user or project paths. It does not check outputs. Geometry, textures, rigging and compression still need the relevant self-check script and visual inspection after generation.
