# MIG-WEB-ENTRANCE-003: Location entrance and current controls

Human owner: Quoc (frontend). Actor: Codex. Consumer: product visitors and reviewers. Branch: migration/location-entrance, based on f25b47d of the existing ui/integrated-map branch. Source is the final head 5efd783 of Nasa_prep PR #17, now merged as 2ff0da2. Per-file provenance records the selected files and one product adaptation.

## Scope

31 selected UI/atlas files bring the regional location chooser, curved entrance flight, skip/reduced motion, transparent landscape/map controls, compact Light beside Sources, visible Guided tour and parcel-masked observation sweep. No new framework or dependency is needed. Natural Earth geometry is public domain with its pinned manifest and builder. Uniform graphic extrusion is not terrain. Bang Rakam remains Data pending; no observations or new landscape are fabricated.

The real-data loader, allowlisted sync, package/lockfile, existing infrastructure test, workflow, root README, contract and public observations are preserved. Source fixture files, fallback generators, deployment commands and unrelated Blender/data tooling are not copied. The one adaptation replaces a raw renderer exception with a readable message and retains the map fallback.

## Modules

- web/src/entry.js, ui/locationAtlas.js, atlas.css: location choice, asynchronous world preparation, regional zoom, skip and geographic SVG fallback.
- ui/entryState.js, entryRules.js: readiness/render gate, publication guard, direct-link bypass, geographic projection and bounded camera path.
- ui/surfaces.css, icons.js, blockCore.js and existing chrome/card/map modules: shared compact controls and block facts in the same-tab map.
- world/nisar.js, world/paths.js, scene/shaderlib.js, farfield.js, tiles.js and water.js: cancelable scan, matched parcel delays and temporary emphasis only for selected W observations. Radar and Arrival views retain their own encoding.
- public/atlas/ and tools/build-atlas.mjs: pinned regional geography, asset provenance and rebuild tool. Other source generators remain deferred.

## Verification

- 97/97 Node tests pass; production build passes with the existing large-chunk warning. Landscape chunk approximately 722 kB (296 kB gzip), map 1,092 kB (299 kB gzip), shared Three.js 620 kB (157 kB gzip). No package changes.
- Edge checks pass for desktop, tablet, phone and landscape chooser bounds; complete flight; skip; visible tour start/end; compact Light and keyboard input; observation sweep; matching-block inset map; camera-preserving return; shared links; reduced motion; cancellation and unavailable registry. No application exceptions or failed public resources in those checks. Screenshots opened for visual review.
- Confirmed Intel UHD D3D11 low tier: entrance/arrival RAF sample approximately 35.5 FPS, longest 125 ms, one frame over 100 ms. This is a smoke sample, not full traversal or a 50 FPS claim for Intel. No new controlled high-tier benchmark is claimed for this migration.
- A separate final no-WebGL check verifies the readable message and real observation-map link after the product adaptation.
- Local chooser readiness measured 1.2 seconds; scene readiness 34.5 seconds while repeatedly resizing during preparation. Warm-up remains variable; no latency guarantee is made. Skip completed in 170 ms in that run.
- Initial import preserved 318 other tracked files byte for byte. The documentation index is subsequently updated intentionally; all 317 other protected tracked files were unchanged at that local checkpoint. The subsequent integration intentionally retains main's newer metadata and updates the documentation; product-specific real-data guards remain intact. Source/import hashes are checked again before handoff.

Local evidence is held outside Git in runtime/map-redesign/entrance-migration: test/build logs, atlas-local/results.json and screenshots, atlas-low/results.json, fallback-final.json and image, protected-before.json and imported.json. Owned preview servers and browsers are closed. No secrets, private input, build output, environments or old Git history are imported.

## Integration state and limits

The integration branch combines the frontend lineage of PRs #1 and #3 with product main a6fbb05, including Quan S0/S7 and the public v1 export. The only data merge conflict was meta.json: current main was retained, changing only generated_utc compared with the earlier web snapshot. The consolidated migration PR targets main and supersedes those frontend PRs; the separate pipeline and H5 PRs are excluded. CI/merge status is recorded on the PR. No deployment host or workflow is added.

Validation/H5 is still an open separate product PR, not part of this migration. H7 and Bang Rakam observations are not supplied here. Existing lack of validation is disclosed by the product build; no validation score is generated. Contract remains 1.0.0. S1-S6 and data-team changes are outside this UI task. No deploy workflow or host is added.

Rollback is limited to the imported/adapted paths and these task documents, after checking for subsequent user changes. Never reset the checkout or alter the source repository.
