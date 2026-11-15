# Landing-map radar illumination (WEB-ATLAS-SWEEP-014)

Human owner: AIVIETNAM-AIO-LeWann, verified against the authenticated GitHub account. Actor: Codex. Consumer: visitors to the geographic landing page. Primary repository: Dancing_with_The_Paddies; hosting project: `floodcalendar`. Baseline main: `abc04d600b4b6a9e880650a5e7759d7ed2e12143`. Branch: `feature/radar-sweep-reveal`.

## Behaviour and implementation

The overview previously displayed only a thin moving line. The decorative scan now illuminates existing land, coastlines and rivers as the beam crosses them, with a concentrated head and short fading trail. Muted green/teal colours and the original 11-second cadence remain. This is not radar intensity, detected water, coverage or processing progress.

`ui/atlasSweep.js` builds the SVG alpha mask and highlight paths; `ui/atlasSweep.css` controls synchronized mask/beam movement. `locationAtlas.js` supplies the exact same geographic paths to the base and highlight. `atlas.css` drops the superseded pseudo-element beam and viewport-height animation. No new JS animation loop, WebGL pass, dependency, observation, schema or geographic asset is added.

The light does not intercept pointer events. Existing site selection, keyboard focus, physical island geometry and labels remain independent. Reduced-motion and forced-colour modes disable the decoration; hidden/flying chooser states pause its movement.

## Selected import and parity

The user clarified the primary product repository after the effect was first prepared locally against the secondary Nasa preview. Only four UI files are transferred. The two existing files had matching source/target baseline contents apart from line endings; feature source content is frozen in a separate read-only snapshot. Source paths and hashes distinguish this uncommitted feature from its pinned baseline. No workspace, history, environment, node_modules, workflow, deployment commands or data exports are copied.

The isolated primary and preview feature working trees hold identical versions of these four files. The release scope is the product PR and merge after green CI, followed by its existing production deployment. The secondary preview implementation remains staged locally; publishing or merging that separate repository is outside this release. Each repository keeps its own hosting configuration and coordination documents. GitHub PR/commit history is authoritative for the current product merge/deployment state.

## Verification and state

- Node 24.22.3, matching the CI major; this product's own lockfile installed with scripts disabled.
- Public-input guard: 48 committed inputs verified at the baseline, no synthetic substitution.
- Existing tests: 171 passed, 0 failed. Production build passed, with existing large-bundle advisories.
- Built-public-data guard: all 48 committed inputs and outputs verified.
- Desktop 1440×900 and mobile 390×844 browser checks: no console errors or mobile overflow; both site buttons remain available; focus and pointer hit-testing pass.
- Mask/beam phases match at northern, middle and southern positions. Highlight land/coast paths exactly equal the base paths. Hoàng Sa/Trường Sa labels retained. Reduced-motion/forced-colours hide the light.
- Actual production-build entry into both Tân Hội and Bang Rakam passed. Returning to the chooser restarts the scan without a stale flying state; Continue exploring restores the loaded scene. No browser errors occurred in either complete loop.
- `git diff --check` passed. Hosting workflow, deployment commands, README, contract and source data unchanged.

These are pre-release checks, recorded before opening the product PR. Release requires the same checks in GitHub CI, no merge conflicts, then confirmation of the resulting main deployment. No stub needed.
