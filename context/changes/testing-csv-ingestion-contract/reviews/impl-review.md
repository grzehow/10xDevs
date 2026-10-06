<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: CSV Ingestion Contract Tests

- **Plan**: context/changes/testing-csv-ingestion-contract/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict                            |
| ------------------- | ---------------------------------- |
| Plan Adherence      | PASS (1 observation)               |
| Scope Discipline    | PASS                               |
| Safety & Quality    | PASS (1 observation, pre-existing) |
| Architecture        | PASS                               |
| Pattern Consistency | WARNING (2 observations)           |
| Success Criteria    | WARNING                            |

Re-run on d5ad050: `node --check scripts/smoke.mjs` OK, `astro sync` OK, lint 0 errors (1 pre-existing warning), `npm test` 34/34, `astro check` 0 errors, build OK. PR #17 CI: `ci` pass, `smoke` pass, Workers Builds pass. Manual rows 1.5 and 2.4 were confirmed by the user in-session.

## Findings

### F1 — The bad-row smoke step also passes when weights fail to load

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:132-146
- **Detail**: The step's check is `role="alert"` and no `data-ticket-id=`. `WEIGHTS_ERROR` renders in the same `<p role="alert">` (`src/pages/dashboard.astro:25,52`). So if the operator's `scoring_weights` read failed, the step would stay green without the file ever being validated. The unit test `upload.test.ts` "rejects a valid row followed by an invalid one" covers the rejection itself, so the gap is in the smoke step only.
- **Fix A ⭐ Recommended**: Add `data-error={outcome.error}` (`file` or `weights`) to the alert `<p>` and assert `data-error="file"` in the step.
  - Strength: Tells the two errors apart without asserting Polish copy, which matches the plan's anti-pattern rule and the existing `data-component` / `data-ticket-id` hooks.
  - Tradeoff: A one-attribute template change in `dashboard.astro`. The plan said "template unchanged", but that was about the Phase 1 extraction.
  - Confidence: HIGH — the same `data-*` hook pattern is already used in this template.
  - Blind spot: None significant.
- **Fix B**: Assert that the step's body doesn't contain the `WEIGHTS_ERROR` text.
  - Strength: Changes only the test file.
  - Tradeoff: Ties the smoke step to Polish copy, which the plan explicitly rules out. Any copy edit silently weakens the check.
  - Confidence: MED — it works today but is brittle.
  - Blind spot: S-03 will rewrite these messages.
- **Decision**: FIXED (Fix A) — `data-error` on the alert in dashboard.astro, smoke asserts `data-error="file"`; local gates green, CI smoke pending on push

### F2 — `rankUpload` result has no `ok` discriminant, unlike its siblings

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/upload.ts:6
- **Detail**: Returns `{ error } | { tickets, weights }`, and the page narrows with `"error" in` / `"tickets" in`. Its siblings use `ok`: `RankResult` (`ranking.ts:14`) and the weights-form result. It works and the review found no behaviour issue.
- **Fix**: Change to `{ ok: false; error: "file" | "weights" } | { ok: true; tickets; weights }`, narrow on `outcome.ok` in the page, and update the `deepEqual` literals in `upload.test.ts`.
- **Decision**: FIXED — `ok` discriminant on the `rankUpload` result; dashboard narrows on `outcome.ok` and the `failed` kind feeds both the copy and `data-error`; local gates green

### F3 — Stale "upload API" wording left in test-plan §3/§4

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:73, :88
- **Detail**: §3 Phase 1's Test types cell still reads "unit + upload API integration", and §4's integration row still says "none yet — see Phase 1". §5 was renamed and §6.2 now documents the harness, so these two cells contradict them. The `complete` cell padding is also off.
- **Fix**: Change §3 Test types to "unit + upload POST (unit + smoke)", point §4's tool cell at `node:test` (`src/lib/upload.test.ts`) plus `scripts/smoke.mjs`, and re-align the row.
- **Decision**: FIXED — §3 Phase 1 Test types now "unit + upload POST (unit + smoke)" and re-aligned; §4 integration row names `node:test` + `scripts/smoke.mjs`

### F4 — `loadWeights()` rejection becomes a 500, not the weights error

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/upload.ts:18
- **Detail**: If the loader throws (a network failure inside the Supabase call) instead of returning null, the rejection propagates and Astro renders a 500. This is identical to the pre-extraction code at f491e57, and supabase-js `.select()` normally resolves with `{ error }`, so it isn't a regression. It's now cheap to cover, though.
- **Fix**: Wrap `await loadWeights()` in try/catch → `{ error: "weights" }`, and add one test with a throwing stub.
- **Decision**: FIXED — try/catch around `loadWeights()` maps a throw to `{ ok: false, error: "weights" }`; new test "reports a weights failure when the loader throws"; 35/35 green

### F5 — `const URL` shadows the global in upload.test.ts

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/upload.test.ts:8
- **Detail**: Harmless today, but anyone later adding `new URL(...)` in this file gets a string.
- **Fix**: Rename to `DASHBOARD_URL`.
- **Decision**: FIXED — renamed to `DASHBOARD_URL`
