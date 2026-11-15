# Radar-sweep selected-file provenance

Target: Dancing_with_The_Paddies main `abc04d600b4b6a9e880650a5e7759d7ed2e12143`, branch `feature/radar-sweep-reveal`.

Source baseline: Nasa_prep main `1b713bd1cc05f80b696b18eb65e3e77f585149d0`. Source feature content was locally authored on `feature/radar-sweep-reveal`, uncommitted, then frozen in a separate read-only snapshot. There is no reviewed source feature commit yet; these hashes pin transferred content. The existing baseline files matched before the patch apart from line endings. Only these four UI files were selected.

| Source and target path | SHA-256 of transferred content |
|---|---|
| `web/src/ui/atlas.css` | `8f063de88a61c8e1244e3b688f9f716a731ab84d00cf2e4bbbd88605b7c3020f` |
| `web/src/ui/locationAtlas.js` | `3c2d8627c4a5f1ba94e4af9b9187d6df1aa421f894a863f473f0fe37ca1b518d` |
| `web/src/ui/atlasSweep.js` | `1b8c696c195e152e3ac724fcd6defc5cbf104e0ee22b1da2efa3a5a907075f8c` |
| `web/src/ui/atlasSweep.css` | `6514b27c1a83a2d910033f448897d9fceea895f3619a6bb3c049dd30b1579650` |

The product retains its own `floodcalendar` production workflow and package commands; the Nasa preview retains `flood-calendar`. Data, schemas, credentials and hosting rules are not imported or changed. The four feature files in both isolated working trees match. This is local parity, not a claim that the secondary preview is merged or deployed. The current product PR/commit history records product release state; publishing the separate preview repository is outside this release.

Validation and consumer: [WEB-ATLAS-SWEEP-014](../plans/atlas-sweep.md). No stub, observation or asset dependency.
