# Dancing production deployment

Task DEPLOY-014. Human owner AIVIETNAM-AIO-QP09; actor Codex. Baseline product main 8500bdf. Consumer: the product's official public website. Target is Cloudflare Pages project `floodcalendar`, URL https://floodcalendar.pages.dev, production branch `main`. The separate Nasa project `flood-calendar` and its workflows are unchanged.

## Release gate

The Web CI workflow retains Node 24, lockfile installation, committed-input verification, unit tests, production build and exact output verification. Only a successful push/manual run on main uploads an artifact and enters the production deployment job. PRs test/build without credentials or deployment. Manual runs on another branch cannot deploy. The deployment job downloads that run's tested artifact rather than rebuilding, uses lockfile-pinned Wrangler and targets the literal project `floodcalendar` with the tested commit SHA. Actions are pinned by commit. Main runs are not interrupted by a later push during deployment; superseded PR runs can be cancelled.

## Account setup

The project was created by its owner using Wrangler login and production branch main. The account containing `floodcalendar.pages.dev` was verified through project metadata. The non-secret repository Actions variable `CLOUDFLARE_ACCOUNT_ID` identifies that account. No account identifier or credentials are committed here.

A dedicated repository Actions secret `CLOUDFLARE_API_TOKEN` is required. Create a Cloudflare custom API token with Account / Cloudflare Pages / Edit on the account containing this project; restrict account resources accordingly. Save it directly in the product repository under Settings, Secrets and variables, Actions, New repository secret. Local Wrangler OAuth login is not copied into CI. The workflow fails explicitly if either required setting is absent.

References: [Cloudflare CI deployment](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/), [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Activation and verification

Add the token before merging the deployment PR. The first merge to main will test/build and deploy the verified artifact. If credentials are supplied later, rerun Web CI on main via Run workflow; the same test/build gate still applies. Confirm the production environment reports this commit, then check both locations, same-tab map, Calendar, Method, weather and tour/media assets at the new hostname. Keep the Nasa URL available during this transition. A prepared workflow or a successful PR check does not mean the new production site is live.

## Recovery

A failing test or data gate cannot publish. If a release is unhealthy, use Pages deployment history to roll back this project, or revert the product commit and allow main CI to rebuild/redeploy. Neither action requires changing the Nasa project. No data/schema, runtime feature, dependency or source-processing change is part of this task.

## Pre-merge verification

actionlint v1.7.12 validates the workflow (official release archive checked against its GitHub SHA-256; shellcheck is not installed and was disabled). 171/171 Node tests and the production build pass. Both publication guards verify exactly 48 approved files in public/data and dist/data. No runtime/data/schema/lockfile changes are included. The account was identified and the non-secret repository variable was configured; the dedicated API token and a successful main deployment remain required. Local Wrangler caches are ignored. A green PR run confirms the build path and skipped deployment, not production publishing.
