# Bang Rakam 48×48 — BANG-10 review of QUAN-9 S6

Bằng reproduced S6 from the QUAN-9 inputs and independently recomputed agreement for 8 pairs over 2,304 cells. The replay matched the original validation file in commit `d88a801` byte for byte. The comparison is post-hoc. Bằng's historical first-read and freeze timestamps for Bang Rakam remain unconfirmed.

Before pairing, exclude the 15 of 27 DSWx-S1 passes with zero valid cells in the study AOI. For each NISAR acquisition, select the nearest of the 12 eligible DSWx-S1 passes by UTC within 3 days inclusive. This yields 8 pairs. Pairing against all 27 passes before applying the coverage criterion would yield 7 pairs with usable data.

The metadata clarification applied after BANG-10 changes only `pairing` in `data/bang_rakam/validation.json`. The two hashes identify the files before and after this edit.

- BANG-10 replay and original validation SHA-256: `d01dd99b97cf4a8e37b1515af72786ceaf3dab995bc31fe5bf2a035418819f79`
- Validation with clarified pairing SHA-256: `29c82565920670fde5636c4a7475d50b8e39952d6aad1903c544a8844b3a1993`

Tân approved the Q1 fallback for acquisition 105D on 31 October after P3 failed. The decision is recorded in the [PR #15 merge commit](https://github.com/hungkhuu404/Dancing_with_The_Paddies/commit/07edb7e4c70c7eb4cbec1e06ffd3c16de57a1ca7). This approval does not change the post-hoc comparison or establish historical freeze times. See [H7 data status](h7-data-status.md) for the later handoff and remaining web acceptance.
