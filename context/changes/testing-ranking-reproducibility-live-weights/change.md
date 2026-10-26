---
change_id: testing-ranking-reproducibility-live-weights
title: Test rollout phase 2 — ranking reproducibility and live weights
status: implementing
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Ranking reproducibility and live weights".
Risks covered: #2 same file uploaded twice yields different order or scores, #5 scoring uses stale or hard-coded weights after an admin save. Test types planned: unit + integration.
Risk response intent:

- #2: two runs over the same file produce byte-identical serialized output, including tied scores; one test with distinct scores does not prove stability, and the expected order must not be computed with the function under test.
- #5: after a weight change, the next upload's score reflects the new value without a restart; fixtures must use non-default weights so a constants fallback can't hide behind seeded values.
  After creating the folder, follow the downstream continuation rule.
