# H7 data status — 15 November 2026

Tân confirmed the Tân Hội 22-acquisition catalogue as the final H7 catalogue. Quân's QUAN-8 H7A catalogue was checked against CMR at 12:51 on 15 November 2026, Asia/Ho_Chi_Minh. It contains 7 acquisitions on 047D, 7 on 083A and 8 on 148D, with no new, missing or replacement CRIDs compared with the prior catalogue. Its SHA-256 is `1dfbe7e71969a20a52371f2ba13df1f43dfd787457c8e0efb18789920ccab2a4`.

QUAN-10 H7 checked the exports at product revision `94a2d071329228fb9ae0692a053d63d5fb0d5e85`. The 48 data files in the handoff match that revision's Git blobs. Its report records passing schema and S7 checks, per-cell and totals recounts, and matching acquisition identities. This check did not rerun GCOV processing or derive the S6 scores from DSWx rasters. The H7 package SHA-256 is `769a121d59610e3f00f6e711f959183d704cfcb35166d0d667ffaac525cbd4be`.

Tân also approved the Q1 fallback for Bang Rakam's 31 October 105D scene after P3 failed. The [PR #15 merge commit](https://github.com/hungkhuu404/Dancing_with_The_Paddies/commit/07edb7e4c70c7eb4cbec1e06ffd3c16de57a1ca7) records that decision. Bang Rakam's historical first-read and freeze times remain unconfirmed.

These are data and method decisions, not evidence of independent accuracy or a new scientific freeze. The 75% pixel rule and asymmetric 50% temporal filter were selected post-hoc against DSWx-S1, which is not ground truth. Tân Hội's `meta.method.frozen_utc` remains null, and its validation freeze refers to historical H3. The two site exports and their metadata are unchanged by this status update.

The QUAN-10 report leaves final web acceptance, including overlay and initial transfer, to Quốc. The >30-day layer remains excluded from the video under DEC-PLAN-016; H7 confirmation does not change this decision. The report does not confirm delivery of the handoff package to the team.
