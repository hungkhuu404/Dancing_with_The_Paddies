# Recovered Flood Calendar generators

## Phase 2 infrastructure

`fetch-infrastructure.mjs` saves bounded public Overpass responses into an explicit local cache file, with a generic User-Agent. Use the default query, `--buildings-only` and `--facilities-only` separately; public endpoints can time out, and failed requests never fabricate a snapshot. `build-infrastructure.mjs` combines those snapshots, projects source geometry to the scene frame, retains exact names/IDs/tags, deduplicates nested church sites and copies the 24 existing place names unchanged. It writes a separate static scene overlay, never water contract files. Full commands, attribution and limits: [infrastructure review](https://github.com/hungkhuu404/Nasa_prep/blob/cb6a2031615264b177c460fad19400b3c99557e8/docs/plans/3d-infrastructure_review.md).

`web/src/world/infrastructureShapes.js` is the reproducible procedural geometry source for new infrastructure, with metre-scale bounds and memory-budget tests. No Blender binary, downloaded model or generated AI image is needed for these shapes. Its source manifest is `web/public/scene/infrastructure-assets.json`.

## Phase 1 derived assets

Run `node web/tools/build-parcel-atlas.mjs` from the repository root to rebuild `web/public/scene/commune/parcel-cells.png` from the committed 54 tile layouts. It rasterizes geometry only; the image stores the grid address of each parcel's centroid, not water observations. At runtime the far-field shader uses the current contract state texture. The tool is offline, deterministic and needs only Node.

`blender/render_tree_impostors.py` renders eight azimuths and two elevations of the four original base tree models into 128-pixel tiles. First regenerate raw `palm_a`, `palm_b`, `banana` and `bush` GLBs with the recovered `blender/base/` generators (the build directory's `raw/base/`). Then run:

```text
<blender> -b --factory-startup -t 2 --python web/tools/blender/render_tree_impostors.py -- --source <resolved-build-directory>/raw/base
```

This tool writes `web/public/impostors/{palm_a,palm_b,banana,bush}.png` and `index.json` by default. `--out` selects another directory for review before copying. It does not render invented trees or use generative imagery; it reuses original model geometry/materials. The existing provenance remains applicable; see the new `web/public/impostors/manifest.json`. The committed impostors were rendered successfully with Blender 5.3 from the recovered raw base outputs; full regeneration of all original commune inputs remains unverified.

The six specialized vegetation models are baked from recovered `raw/veg/` outputs:

```text
<blender> -b --factory-startup -t 2 --python web/tools/blender/render_tree_impostors.py -- --source <resolved-build-directory>/raw/veg --names bamboo tram areca mango nipa reeds
```

`--names` accepts only the ten known vegetation model names. The tool merges regenerated entries into the existing index so rebuilding one source category preserves the others. Each generated PNG must fit the 400 KB budget or the command fails before publishing its index. All ten atlases keep the original near-field geometry; only the distant LOD changes.

These procedural generators were recovered from the previous local project session. They are source recovery, not proof that every original output is reproducible from the committed repository alone. See [RECOVERY.md](RECOVERY.md) for the original source hashes and mapping.

## Layout and provenance

- `blender/base/`: original palms, plants, houses, boat and egret generators, shared helpers and model self-check.
- `blender/veg/`: vegetation models and procedurally painted textures.
- `blender/built/`: boats, infrastructure, buildings and props.
- `blender/life/`: animals, motorcycle and **adult-only** people with rigging and animation helpers.
- `commune/`: preparation, seeded parcel/layout and props generation, index and cross-tile checks.
- `geo/geo.py`: original UTM, clipping/input and imagery helper functions.
- `recovery_paths.py`: explicit local input and build locations. Nothing writes to `web/public/` automatically.

Existing model manifests in `web/public/models/` describe the assets as original procedural Blender work. Recovery preserves those source algorithms; it does not introduce downloaded models, imagery or an independently verified new license. Imagery and OSM retain their own attribution. The original scripts' optional preview renderers depending on an external HDR environment were deliberately excluded.

The child model constructor, human child proportions, child model self-check and child placement at bridges have been removed. The people CLI accepts only `wader`, `fisher`, `washer`; export helpers additionally reject child model names. Adults do not imply measured population counts or locations. Parcel, tree, house and prop positions remain seeded illustration unless the existing manifest identifies an OSM source.

## Dependencies

Use Blender 5.3 for `bpy` generators. For commune scripts use Blender's bundled Python with `-I`; the previous scripts require NumPy and OpenImageIO. `-I` isolates Python imports; these scripts explicitly add their local helper directories. No packages are installed by this recovery.

The existing compressed GLBs were made with `@gltf-transform/cli` 4.5.1, meshopt compression and WebP textures according to their manifests. Blender exports here produce intermediate raw GLBs. Compression and budget checking are separate steps; do not publish raw outputs automatically or assume the compressed files match byte-for-byte. Any new published model must be at most 400 KB.

## Safe local paths

Set environment variables in the launching process only and restore the caller's values afterwards. Relative examples assume the repository root:

| Variable | Meaning |
| --- | --- |
| `FLOOD_BUILD_DIR` | Required absolute local build directory, e.g. the resolved `.cache/generator-build` path. Outputs go to `raw/<category>/`, `commune/work/`, `commune/out/`. |
| `FLOOD_SOURCE_DIR` | Required for commune: explicitly supplied directory of prepared OSM GeoJSON and optical imagery files. No fetching is performed. |
| `FLOOD_H0_DIR` | Required for commune: authorized input directory with the existing boundary and NISAR sample-window NPZ files. Never commit the inputs. |
| `FLOOD_WEB_DIR` | Optional web root; defaults to the directory above `tools/` after installation. |
| `FLOOD_AOI_FILE` | Optional AOI GeoJSON, default `web/fixtures/tan_hoi/aoi.geojson`. |
| `FLOOD_REFERENCE_SCENE` | Optional reference schema directory, default `web/public/scene/`. |
| `FLOOD_MODELS_DIR` | Optional directory containing compressed models for self-check; default `<build>/models/`. |

Model invocation after setting `FLOOD_BUILD_DIR`:

```text
<blender> -b --factory-startup --python web/tools/blender/veg/build_veg.py -- bamboo
<blender> -b --factory-startup --python web/tools/blender/life/build_people.py -- wader fisher washer
```

Commune invocation after supplying authorized sources:

```text
<blender-python> -I web/tools/commune/run_all.py 2
```

`2` is the worker count, intentionally conservative. Review the output and the cross-tile checks before manually copying any asset into `web/public/scene/commune/`. Do not invoke generators against production outputs as a substitute for reviewing changes.

## Inputs not recovered into the repository

The historical prepared-source directory is not part of this recovery. `geo.py` references `osm_waterways.geojson`, `osm_roads.geojson` and other OSM feature collections used by the scripts, plus `s2_tanhoi.json` and `s2_tanhoi.png`. The H0 directory supplies `1_ranh_xa/xa_tan_hoi_osm.geojson`, `3_cua_so_anh_mau/047_20261027_P05036.npz` and `148_20261022_P05036.npz`. Provide these only with the appropriate data permissions. No heldout files have been opened. No imagery reproduction or full pipeline execution has been validated in this recovery.

## Verification

`verify_recovery.py` parses source without importing Blender, opening imagery or running generators. It checks syntax, forbidden child-generation calls and absence of machine-specific user/project paths. Source recovery was checked statically; output geometry, texture, rigging and compression still require the relevant self-check and visual inspection after generation.

## Site configuration (BR-ENGINE-001)

`src/data/site-profiles.json` is the shared scene/build profile registry, read by browser modules, Node tools (`site-options.mjs`) and Python tools (`site_config.py`). It describes projection, frame, origin, boundary policy, scene paths, field dimensions, illustrative ecology and enabled narration. It is not a water-data export and does not override CONTRACT-001. Scene and observation metadata must match the selected profile before display.

Existing commands default to `tan_hoi`; its `public/scene/commune/` paths remain compatible. Explicit examples, run from the repository root:

```text
node web/tools/fetch-infrastructure.mjs <cache-output.json> --site bang_rakam
node web/tools/build-infrastructure.mjs <cache-input.json> <review-output.json> --site bang_rakam
node web/tools/build-parcel-atlas.mjs --site bang_rakam
node web/tools/fetch-history.mjs --site bang_rakam
<python-with-numpy> -I web/tools/commune/run_all.py 2 --site bang_rakam
```

The fetch commands access public services only during offline preparation. Inspect their outputs before publishing. The parcel atlas requires that site's existing index/layouts; it does not generate observations. Weather output is per site and requests UTC hours; scene lighting uses the profile's coordinates and IANA timezone. The 2026 season request window remains August through October.

Python generators keep `FLOOD_BUILD_DIR`, `FLOOD_SOURCE_DIR` and, for Tan Hoi's existing reference rasters, `FLOOD_H0_DIR` explicit as described in [RECOVERY.md](RECOVERY.md). All inputs belong to the selected site's source directory; changing `--site` does not acquire missing input files. Generated files remain in the local build directory until reviewed and copied. `bang_rakam` uses a full rectangular frame rather than an invented administrative boundary. Its missing radar references produce no radar texture, and no existing Tan Hoi raster is substituted.

The Bang Rakam field/ecology profile is a preliminary illustrative recipe for the base-scene phase. Thai architecture, species refinement, real scene acquisition and water fixtures are later phases; the atlas keeps the site pending until both a matching scene index and published observations exist. The Tan Hoi tour is disabled for other profiles until an appropriate script is provided.

Offline smoke checks create and remove their own temporary fixtures and do not access private source data:

```text
<python-with-numpy> -I web/test/site-tools.py --site tan_hoi
<python-with-numpy> -I web/test/site-tools.py --site bang_rakam
```

## Bang Rakam base scene (BR-BASE-002)

Preparation uses an OSM snapshot and the pinned **EOxCloudless 2016 CC BY 4.0** optical layer. The full scene is rectangular, not an administrative boundary. Raw downloads and build intermediates stay in a local cache; only reviewed derived tiles and source manifests are published.

```text
node web/tools/fetch-osm-site.mjs <snapshot.json> --site bang_rakam
node web/tools/prepare-osm.mjs <snapshot.json> <source-directory> --site bang_rakam
node web/tools/fetch-optical.mjs <source-directory> --site bang_rakam
<python-with-numpy-and-openimageio> -I web/tools/commune/run_all.py 2 --site bang_rakam
```

Set `FLOOD_BUILD_DIR`, `FLOOD_SOURCE_DIR` and `FLOOD_WEB_DIR` to explicit local build, source and web directories. Inspect `<build>/bang_rakam/out/` and run `finish.py` checks before copying its `index.json`, `commune_*.webp`, and tile layout/props files to `web/public/scene/bang_rakam/`. Then:

```text
node web/tools/build-infrastructure.mjs <snapshot.json> web/public/scene/bang_rakam/infrastructure.json --site bang_rakam
node web/tools/build-site-context.mjs <snapshot.json> --site bang_rakam
node web/tools/build-parcel-atlas.mjs --site bang_rakam
```

The context step retains mapped water outlines and holes for the raster worker, anchors source buildings at polygon centroids, supplements missing houses using the original seeded layouts, removes generic actors from mapped schools, and suppresses inherited illustrative graves. It trims orchard trees if necessary to retain the tile-size budget. Bridge candidates ending in water are rejected by the props generator. An unnamed mapped dam is not reclassified as an operational sluice. Detailed Thai models remain a later phase.

`fetch-site-catalog.mjs <output.json> --site bang_rakam` acquires public ASF catalogue times/footprints only. The committed fixture inputs pin the selected catalogue and OSM positions. `make-contract-fixture.mjs <output-directory> --site bang_rakam` writes a labelled fixture to an explicit output directory and refuses to overwrite an existing site or the source `data/` directory. Normal data sync adds the fixture only when the real registry has no Bang Rakam entry; it never replaces a real export. `aoi-frame.schema.json` is a fixture-only nullable-relation proposal, not a change to the data team's schema. No reference-comparison results or radar images are fabricated; the required fixture backdrop filenames contain an empty transparent pixel and are not rendered as radar.

An optional schema check uses the data team's schema directory and a Python environment with `jsonschema`:

```text
python web/test/check-site-export.py --data web/public/data --schemas <schema-directory> --frame-schema web/fixtures/bang_rakam/aoi-frame.schema.json
```

The frame override is rejected for non-fixture exports. See [base-scene review](https://github.com/hungkhuu404/Nasa_prep/blob/cb6a2031615264b177c460fad19400b3c99557e8/docs/plans/bang_rakam_base_review.md) for measured performance, scope, provenance and outstanding data questions.

## Original Thai identity models (BR-IDENTITY-003)

Run from the repo root with Blender 5.3 and a local reviewed output directory:

```text
<blender> -b --factory-startup -t 2 --python web/tools/blender/thai/build_identity.py -- --out <absolute-raw-directory>
node web/tools/compress-identity.mjs <raw-directory> <review-compressed-directory> <gltf-transform-4.5.1-cli.js>
<blender> -b --factory-startup -t 2 --python web/tools/blender/render_tree_impostors.py -- --source <absolute-raw-directory> --out <absolute-atlas-review-directory> --names thai_borassus thai_tamarind
```

The Blender tool uses only built-in geometry and vertex colours; it exports 13 model presets and a Cycles contact sheet. `--only <model...>` rebuilds a subset; `--skip-contact` omits the contact sheet. Raw output stays outside public/. Inspect the Cycles images and budget report before copying only compressed GLBs to public/models/ and the two PNG atlases plus index to public/impostors/thai/. The compressor refuses in-place raw replacement and checks the 400 KB cap and meshopt extension. Install the pinned CLI in an isolated local tool directory; it is not an application dependency. Regenerate thai-manifest.json hashes after a reviewed model change. Source/cultural limits and measurements: [identity review](https://github.com/hungkhuu404/Nasa_prep/blob/cb6a2031615264b177c460fad19400b3c99557e8/docs/plans/bang_rakam_identity_review.md).
