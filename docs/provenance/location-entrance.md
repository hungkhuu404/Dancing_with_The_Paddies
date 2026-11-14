# Location entrance migration manifest

Task: MIG-WEB-ENTRANCE-003. Human owner: Quoc (frontend). Actor: Codex. Consumer: product web visitors and reviewers. Branch: migration/location-entrance. Product web baseline: f25b47d on ui/integrated-map; existing PRs #1 and #3 remain open. Product main observed at a6fbb05 includes the data team's S0/S7 and v1 export; this UI branch does not replace those changes. Source: Nasa_prep@5efd78308a1e82a51c6077c00f13bba0adf9ecf7, the final head of merged PR #17 (merge revision 2ff0da2). Source is read-only. No Git history, commit dates, deploy configuration or private input is imported. Source inheritance is recorded explicitly.

## Scope and retained product behavior

Regional location atlas, bounded entrance flight, skip/reduced motion, transparent shared controls, compact Light beside Sources, visible Guided tour, scan/parcel timing and observed-water emphasis. Natural Earth assets carry their public-domain manifest; the included builder is offline tooling requiring network only when explicitly rebuilding geographic source assets. Bang Rakam remains pending, not a data result.

Product-specific real-data loader, allowlisted sync, package/lockfile, infrastructure test, workflow, README, contract, pipeline/config/schema, public observations and prior provenance are preserved byte for byte. No fixture fallback or old deploy script is restored. Other source generators are deferred. Runtime artifacts and environments are not copied.

Dependencies: existing migrated web/CI and CONTRACT-001 1.0.0 public data. Entry condition: clean product web checkout and merged source revision. Completion: test/build and browser review, hashes/provenance verified. Full integration/merge must account for open product PRs; human review required. No commit, push, merge or deploy is performed by this local migration.

## Imported files

31 selected files; SHA-256 below records exact imported bytes.

| Destination (same relative source path) | Action | Source and imported SHA-256 |
| --- | --- | --- |
| `web/index.html` | update | `4297720f43f5f2da52e3179f230ec944c71b3101df8eb70b6f63a447be136009` |
| `web/map/index.html` | update | `4dd9342f32a5abb84875434bee98c587b6b85afff7e42619d4c116503e09db10` |
| `web/public/atlas/manifest.json` | add | `e20ff6d65630a6b2da0161dd0cb31db224b5de88b21b574ac59a046691fc6b35` |
| `web/public/atlas/region.json` | add | `7fba59969051c7d319bfc7364c5326217a5f4858a85764e79a82770cbf18a21f` |
| `web/src/entry.js` | add | `a436fb31e29f9b2c7ffde234e8d06bcffaa95eb4ac8da30c9a5ae482186f531b` |
| `web/src/main.js` | update | `eadf87ac40d68e517185eb2511c96734b2b02bac8e8adef51ce55df0b956f7ef` |
| `web/src/map/main.js` | update | `a5aaec7798dc737f24c98aae03de9fff016175cee10a6b2748f026700e8db597` |
| `web/src/scene/clouds.js` | update | `1c719a0f36b9ccfa2377e3c428928dd28c3bc1b077f806fc371d393b12e8e87b` |
| `web/src/scene/farfield.js` | update | `5db5c745fde9b83da50c747fbe3c3b3e71947f03640f0dac5bc9f8212a209fef` |
| `web/src/scene/shaderlib.js` | update | `c5519da4aa4105c32c0524671a94020a0ee3579741b7b5e0ae59400d63f654c3` |
| `web/src/scene/tiles.js` | update | `179b9ca9e2a3858468e83e99926d2f2ee701640abd7b490f68e142976158341d` |
| `web/src/scene/water.js` | update | `96e95dbc2136b3531f928c4168b69e1afb29f33d45eadb081c5427cdac0922a1` |
| `web/src/ui/atlas.css` | add | `97cfde3e9cb00de15c3dc579bacd4cf54fd93d9f740eaf8d932aafc6549d4d87` |
| `web/src/ui/blockCore.js` | add | `0897b25c117b7215d72ac1487204eb94e8b3c26f37148e32ab2da83d39fc6298` |
| `web/src/ui/card.js` | update | `00b6456a13f7b67f90915abe28a234d7be4a2970086aa937abe03c451ffe2106` |
| `web/src/ui/chrome.js` | update | `2e15347480565365f80d6fd9696d7460dd6b29533ec76e5a3b042ba2d4d4b1b3` |
| `web/src/ui/entryRules.js` | add | `a3b90ef33af5e1b10c20aedbe6faa0caaf19554c12a70c09e67f98d47441b504` |
| `web/src/ui/entryState.js` | add | `7482d65e60423fcecb3a5e73d29d72be333820c83c2c435d682ea5440d6ad3f5` |
| `web/src/ui/icons.js` | add | `ed253b6a43a0a1fea5a169a9967525004a22b2d2068fc6abebcf11a9a25b39df` |
| `web/src/ui/locationAtlas.js` | add | `c16b881c5a1c1dbf0cd6be5ac8c3f66dd3332c05d37ce1cc77bfd09dc8c572e1` |
| `web/src/ui/mapWorkspace.js` | update | `475318ec0cc80990fb6bbb5f833b67764d12150ae007e6c9027f26e2ff6d1b68` |
| `web/src/ui/surfaces.css` | add | `ae3b441dbc8a54f838089c7d80afa70563e492ebea537ad4fbed6fc11f5b7186` |
| `web/src/ui/timeOfDay.js` | update | `8f831f1a7cbf4ac323926b97ea5b6f88dede02b324db5b39df9a78c812ddde37` |
| `web/src/ui/timeline.js` | update | `1e8e09a64f65f156ebed722adefd0b150cf7d9382d67ac0dd5e8250c6e092efa` |
| `web/src/world/nisar.js` | update | `3d2960b1844cde63390376aea754dbd93f5b79fcb6676d6cf739bd66297e1158` |
| `web/src/world/paths.js` | update | `95147071c694c68c4e1b696533d63a9c2e5be70157084e99e41bdff3e4832a88` |
| `web/src/world/signature.js` | update | `473b4c024235f816bb1f5bee641849b57a65e0c8704e2eb78ca499ac6c08ad16` |
| `web/test/entry.test.mjs` | add | `d5006211177afbdce833bc2254c6cef8b9abb2329cad33eadb7acd6805ae282a` |
| `web/test/nisar.test.mjs` | add | `97b986dfe304c0b90894864df4da06966bc7f57167558dd2ea3e6cd21ac7fc5e` |
| `web/test/world.test.mjs` | update | `9c67738b8000acba45d815636140b439e5ab1c4cd5f981118b18ebea6e0f3723` |
| `web/tools/build-atlas.mjs` | add | `d94b8852321ccfa1277df62a3c48d69b37956c4955f5af8a44d6e64082831214` |

## Product adaptation

After the exact initial import above, `web/src/ui/locationAtlas.js` replaces the raw renderer exception shown to visitors with a short landscape-unavailable message and the existing observation-map action. Final SHA-256: `b687357d3004d022ff2a7576fe72ad0b050ee6276111e3c0953e00061b4da371`. No data substitution is introduced.

## Documentation follow-up

The documentation index `docs/README.md` is intentionally updated after the initial byte-preservation check to link this migration. All other 317 protected tracked files remain byte-identical. The module map and verification are in `docs/plans/location-entrance.md`.
