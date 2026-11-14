# BANG-6 — S6 source migration and verification

Owner: Bằng (levienbang). Implementation actor: Codex. Date: 2026-11-14, Asia/Ho_Chi_Minh. Baseline product main: `0a93cff78927241e91761ea0a94517467b5b76e6`. Consumer: S6/S7 data team.

## Scope and source

Selected comparison functions, DSWx/landcover helpers, UTC/posthoc tools and public/internal text renderer are imported from Bằng's local handoff. The source is identified below by SHA-256 rather than an invented Git revision. The S4/S5 implementation remains the existing `pipeline/core/science.py`; this migration does not alter the scientific method, thresholds, site frame, contract or published data.

| Source in Bằng handoff | Source SHA-256 | Destination | Destination SHA-256 |
| --- | --- | --- | --- |
| `bang_work/pipeline/validate/validation.py` | `08302893cc1a5caa4783328ea26bb4ceffbc8e180c7609d7e5f8f9fc4fe587e0` | `pipeline/validate/validation.py` | `08302893cc1a5caa4783328ea26bb4ceffbc8e180c7609d7e5f8f9fc4fe587e0` |
| `bang_work/pipeline/validate/dswx.py` | `71b82a302a0b24e69d7e5c464d9a550edea3fe4c107c499cee6558c7f4718397` | `pipeline/validate/dswx.py` | `72d4013f4e1a358237179950326bc56445b72771ef69d7b9ce4a73206fb565ed` |
| `bang_work/pipeline/validate/landcover.py` | `2359db8a0dca4cb4a88f396ff5c04e1cd0e9c4061d55c86e513fcc18e2ad79e0` | `pipeline/validate/landcover.py` | `5fc9a8a1458384022708d298e8efd5d349c24ca1768c829f0a4a8963de80f6bb` |
| `bang_work/pipeline/validate/add_posthoc.py` | `febae79353c2b578555608183723c3b4636b269d2b203a0596e769f2cc334e04` | `pipeline/validate/add_posthoc.py` | `febae79353c2b578555608183723c3b4636b269d2b203a0596e769f2cc334e04` |
| `bang_work/pipeline/validate/make_limits_text.py` | `fc4c059cc9c696e5184603234e6b2b49050f87e05de43f85e45c06e8868aa044` | `pipeline/validate/make_limits_text.py` | `fc4c059cc9c696e5184603234e6b2b49050f87e05de43f85e45c06e8868aa044` |
| `bang_work/pipeline/validate/run_bang4_validate.py` | `0ac9b13c25da04bb06f40be260e12a1d301753567d742a5532b4b73580639052` | `pipeline/validate/run_s6.py` | `2dabdc8047478dd64b9725218e20be7cc4cbb249c062c8b271112fae181c3964` |

The BANG-1 synthetic vectors and tests are imported from the same handoff's `bang1/` directory; 59 business cases plus 3 fixture checks cover the original H3 helper behavior. They are explicitly separate from the current pixel method's `tests/core/test_pixel_dual.py`. The existing S6/aggregation tests are imported with repo-relative module lookup. New runner tests cover incompatible grids, duplicate IDs, invalid shapes/states, protected output destinations and configuration paths.

## Adaptations

- Replace workspace defaults/environment-variable discovery with an explicit offline `run_s6.py` CLI. Resolve the repo's existing S5 implementation without requiring a sibling H4A checkout.
- Reject incompatible/duplicate cell IDs and metrics that disagree with the supplied cube. Permit a different DSWx column order only after aligning by cell_id.
- Protect published `data/` and `web/public/` and require a new/empty local output directory. S7 remains the publisher.
- Record input file SHA-256 and source SHA-256 in `input_snapshot.json` for every successful comparison. Preserve the historical H3 gate and the meaning of the post-hoc pixel comparison.
- Keep UTC Z formatting and subsecond precision. Optional stable-control cell is supplied explicitly; optional figures use writable local cache directories.
- Reader TOML relative paths now resolve from the supplied configuration file, independent of caller cwd. Legacy machine-specific launcher/gate scripts and raw data are not copied.
- Pin S6 raster/plot dependencies in `requirements-s6.txt`, retaining the core requirements. Update README and documentation index to reflect implemented S6.

## Verification

- Python suite: **152 passed, 1 skipped**. The skip is the optional real BANG-2 CSV test because its separate reader config/data are not distributed in Git. Fourteen existing affine deprecation warnings remain; these are not test failures.
- Offline replay through the integrated CLI on the available local pixel snapshot: all fields of validation.json, including PH-01 before/after, equal the active S7 comparison. Schema check: 0 errors. Both report figures are generated. Inputs and published files are not overwritten.
- Same snapshot: 2,344 cells and 20 acquisitions. Metrics SHA-256 is `2be917c3e99f1c5fd2ba369eb41be30f6df378e330860b35d50fae609b0f9ba2`. Replayed cube SHA-256 is `93ec52fc96a4a0f238b9b11221d6f315cbd461da8068ba9b37c063b6ea79cf53`.
- The replayed cube hash differs from the S7 provenance's `0a7949…`; prior per-cell comparisons align, but this task does not claim byte identity of those two NPZ files. Exact S7 cube identity still requires its original file or matching native-array fingerprints.
- `git diff --check` passes. No web implementation, contract, published data, secret, token, raster cache or runtime output is included in this change.

## Delivery state

Implementation and local validation complete; this change is submitted for review through BANG-6. No merge or deployment is part of the migration. Bang Rakam grid selection and observations remain separate work. [Runner and test commands](../s6-comparison.md).
