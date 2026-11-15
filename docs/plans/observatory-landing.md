# Observatory landing (WEB-ATLAS-008)

Human owner: AIVIETNAM-AIO-QP09; implementation actor: Codex. Consumer: the shared location entry and both landscape sites. Product baseline: c675216, after product PR #14. Develop on feat/observatory-landing, then mirror the reviewed frontend to an isolated Nasa preview branch. No automatic merge or backend/data changes are included.

## Experience and acceptance

The opening screen replaces the tilted extruded land slab with a north-up physical coastline composition. Large Newsreader typography, a restrained silt accent, a real HH radar crop and two horizontal entry actions establish the product before entering a landscape. Copy directly states the three questions: arrival, duration and recession. Hover and keyboard focus connect each action to its geographic marker. Tân Hội shows its published acquisition count and dates; Bang Rakam remains explicitly Data pending, with an illustrative landscape and no radar preview.

The map reveals gently, an explicitly illustrative sweep crosses the overview, and the selected location expands before the existing landscape descent. Skip flight, preparation cancellation, returning to the chooser, Continue exploring, tour invitation and data deep links retain their existing lifecycle. The map retains its final zoom until release, avoiding a full-map flash between scenes. Reduced motion removes the sweep, entrance animations and zoom. Site actions remain available when geography fails. Desktop, phone, portrait tablet and short landscape use different spatial arrangements; both archipelago labels stay inside the viewport.

The chooser is SVG and compositor animation rather than a continuously rendered Three.js scene. It has no WebGL canvas, requestAnimationFrame loop or per-frame allocations, and does not preload landscape meshes. The streamed 3D engine is unchanged.

## Geographic sources and limits

- [Natural Earth land](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/), minor islands, physical geographic labels and 1:50 million river centre lines are pinned at ca96624a56bd078437bca8184e78163e5039ad19. Input URLs and SHA-256 hashes are in web/public/atlas/manifest.json. [Public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/) are linked on the page.
- Physical land is clipped to 91–123 E, 2–27 N and simplified with topology preservation. Source islands remain small polygons; they are not enlarged into invented land. Crop edges are excluded from drawn coastlines. The file contains 582 polygons, including source geometry in both archipelago groups.
- Hoàng Sa (Paracel Islands) and Trường Sa (Spratly Islands) labels use centroids of the source's physical island-group label regions, with the original Natural Earth IDs retained. These are group-label anchors, not surveyed island locations, administrative borders or territorial outlines. No political or maritime boundary/claim layer is drawn.
- 1:10 million is cartographic scale, not ten-metre accuracy. Coordinate rounding is storage precision, not positional accuracy. This is a regional overview, not a legal or navigational map.
- The Tân Hội image is the last published HH backdrop identified by meta.json; its date is read from the same acquisition. It is a decorative preview of actual radar, not a new classification or flood-depth product. Bang Rakam never borrows this image as its own. All scene and hydrological data remain unchanged. No AI imagery or new asset dependency is added.

## Reproduction

Run from the repository root with Node 24 and Python with Shapely 2.2.0. GIS is only a build-tool dependency, not a browser or normal web-build requirement.

```text
node web/tools/build-atlas.mjs --cache .cache/atlas-source --python <python-with-shapely>
npm --prefix web test
npm --prefix web run build
node web/scripts/verify-published-data.mjs
```

The Node tool fetches pinned public inputs to the requested cache and invokes build-atlas.py. Python clips/unions source geometry, preserves small polygons, derives coastlines and label anchors, and writes only region.json and manifest.json to the selected output. Use --out <review-directory> to inspect before replacing the committed assets. Raw global sources stay in ignored cache.

## Verification

154 Node tests pass, including projection directions/corners, both source island groups, ring closure, omission of artificial crop-edge coastlines and pinned source hashes. Production build and the existing 28-real-input/exact-output verification pass. Existing large 3D/map chunk warnings remain; those modules are unchanged.

Edge headless with the NVIDIA preference flag exercises both real entry flows, keyboard preview, fixture honesty, reduced motion, cancellation, Skip flight, tour invitation, return/resume and failed geography. No page errors are observed. Bounds checks cover 375×667, 375×812, 768×1024, 844×390, 1280×720 and 1920×1080, including both island labels and all site actions. Desktop, phone, short phone, tablet, landscape, keyboard, reduced-motion, mid-flight and both destination screenshots are opened for visual review. Captures and local logs are under .cache/observatory-landing/qa/.

Cold local preview resource bodies total approximately 583 KB encoded / 1.12 MB decoded, plus the 8 KB HTML document. The geography JSON is 672,516 bytes before HTTP compression. Display-cadence sampling over 180 frames averages approximately 6.94 ms with a longest frame of 8.3 ms on this Edge run. This measures the landing screen, not a new acceptance claim for streamed-world FPS or all devices. No model or scene-tile data is changed. Browser/server helpers close their own processes after checks.

## Dependencies and remaining review

Source geography is a small-scale physical overview; cartographic copy and the overall design remain subject to human review. Bang Rakam observations are still pending and remain separately labelled. The existing standalone map, method, calendar, sound and 3D scene are intentionally outside this visual change. Merge only after linked product and Nasa CI/preview review; do not deploy main directly.
