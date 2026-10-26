# Ranking Reproducibility and Live Weights Tests — Plan Brief

> Full plan: `context/changes/testing-ranking-reproducibility-live-weights/plan.md`
> Research: `context/changes/testing-ranking-reproducibility-live-weights/research.md`

## What & Why

This is rollout Phase 2 of the test plan. It proves two things. Uploading the same file twice renders the same ranked list (risk #2). The upload right after an admin saves weights uses every saved value (risk #5). Both guard against future regressions: research found no current defect.

## Starting Point

`rankTickets` is pure and its tie order is pinned by four unit tests. Nothing compares two renders of `/dashboard`. Weights are read from the DB on every upload, but the smoke round-trip changes only `major`. A fallback to defaults for `customer` or `service` would pass it.

## Desired End State

The smoke fails if:

- two renders of one file differ,
- the order differs from the hand-derived one,
- the next upload ignores any of the three saved weights.

`npm test` fails if `rankUpload` caches weights between calls. Test-plan §6.3 explains how to add more of these tests.

## Key Decisions Made

| Decision                           | Choice                                                                         | Why (1 sentence)                                                                                    | Source      |
| ---------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------- |
| New `rankTickets` unit test for #2 | None                                                                           | Existing tests already pin every tie level with hand-derived orders                                 | Plan (user) |
| #2 surface                         | Smoke: upload twice and compare the `<ol>` slices, plus one hand-derived order | The rendered list is the only unprotected output                                                    | Research    |
| Float-equal tie                    | Unit only                                                                      | Default weights are integers, so the smoke can't produce one                                        | Plan        |
| #5 weights changed                 | `major` 12, `customer` 4, `service` 2 (expected 30,0; lines 8,0 and 10,0)      | Distinct from defaults and from each other, so fallback (28/25), swap (36) and stale (28) each fail | Plan        |
| Smoke history rows                 | Accept 6 per run (was 2)                                                       | Needed to catch a fallback on any weight; CI uses a fresh Supabase                                  | Plan (user) |
| No-memoization proof               | Unit test with two loaders                                                     | Cheapest way to rule out a cache in `upload.ts`                                                     | Research    |
| Phases                             | 2, tests then CI and cookbook                                                  | Same shape as rollout Phase 1                                                                       | Plan (user) |

## Scope

**In scope:**

- One new smoke step and the three-weight admin round-trip in `scripts/smoke.mjs`
- One unit test in `src/lib/upload.test.ts`
- Updated admin-steps notes in `AGENTS.md` and the smoke header
- Test-plan §6.3 and §6.5

**Out of scope:**

- Production code changes
- New `rankTickets` tests
- A float-equal smoke fixture
- Whole-page comparison
- Reducing the number of history rows

## Architecture / Approach

The smoke covers what only the live runtime can show: the rendered list, and the path from form save to RPC to DB read to score. The injected `loadWeights` seam from Phase 1 lets a unit test rule out caching cheaply. Every expected value is derived by hand from the PRD formula.

## Phases at a Glance

| Phase                    | What it delivers                                                                  | Key risk                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Tests and docs        | Reproducibility step, three-weight round-trip, no-memoization test, updated notes | Smoke steps unproven until CI runs                                                         |
| 2. CI proof and cookbook | Green CI `smoke` on the PR, test-plan §6.3/§6.5                                   | A cloud run with edited weights fails the reproducibility step (default-weight assumption) |

**Prerequisites:** the Phase 1 rollout is merged (it is, `98570e9`). CI `smoke` is used for live verification because there's no local Docker.
**Estimated effort:** about 1 session across 2 phases.

## Open Risks & Assumptions

- The reproducibility step assumes the operator section runs with the PRD default weights, as the existing `19,0` and `21,0` steps do.
- Astro may add per-request markup outside the `<ol>`. Comparing only the slice avoids depending on it.

## Success Criteria (Summary)

- One file uploaded twice gives the same list in the PRD order, proven on the live runtime.
- A saved change to any of `major`, `customer` or `service` shows up in the very next upload, or a test fails.
- The next contributor can add a reproducibility or live-weights test from §6.3 alone.
