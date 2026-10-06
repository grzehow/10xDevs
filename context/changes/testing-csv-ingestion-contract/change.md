---
change_id: testing-csv-ingestion-contract
title: Test rollout phase 1 — CSV ingestion contract
status: implemented
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "CSV ingestion contract".
Risks covered: #1 malformed CSV partially accepted, #3 customers/services columns transposed, #6 hostile input scored instead of rejected. Test types planned: unit + upload API integration.
Risk response intent:

- #1: any invalid row rejects the whole file with a message naming the problem; no partial list is ever rendered.
- #3: a fixture with customers != services yields the hand-derived PRD score (major, 2 customers, 5 services = 21.0).
- #6: negative/non-numeric counts, unknown severity and oversized files are rejected server-side, never scored.
  After creating the folder, follow the downstream continuation rule.
