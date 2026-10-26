# Ranking Reproducibility and Live Weights Tests Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md` covers two risks:

- **#2:** the same file uploaded twice gives a different order or score.
- **#5:** scoring uses stale or hard-coded weights after an admin save.

The ranking function is already pinned by unit tests. What isn't covered is the rendered list and the weights path for `customer` and `service`. This plan adds:

- one smoke step that compares two renders of the same upload,
- an extended admin smoke round-trip that changes three weights instead of one,
- one unit test proving `rankUpload` reads weights on every call.

## Current State Analysis

From `research.md`:

- `rankTickets` is pure, with a total three-level comparator: score descending, then severity descending, then `ticket_id` code-point ascending (`src/lib/ranking.ts:69-74`). Duplicate ids are rejected (`:54`).
- Four unit tests pin the tie order with hand-written expected ids (`src/lib/ranking.test.ts:55,59,66,163`). The float-equal tie (`:59`) is among them.
- No test compares two renders. The serialized output is the `<ol>` on `/dashboard` (`src/pages/dashboard.astro:60-90`), formatted with pl-PL.
- Weights are read from the DB on every request (`dashboard.astro:18-22`, `src/lib/upload.ts:18-26`). There's no cache and no constants fallback. Risk #5 therefore guards against a future regression.
- The smoke round-trip (`scripts/smoke.mjs:176-193`) changes only `major`. A defaults fallback for `customer` or `service` would pass it. A customer↔service swap would not pass, because the seeded values differ (expected 23, swapped 29).
- No test calls `rankUpload` twice with different weights.

## Desired End State

- `npm run smoke` fails if two uploads of the same file render different `<ol>` content.
- It also fails if the rendered order differs from the hand-derived order, including the severity tie-break and the `ticket_id` code-point tie-break.
- It fails if the upload after an admin save doesn't use all three saved values (`major`, `customer`, `service`), whether through a stale value, a defaults fallback or a swap.
- `npm test` fails if `rankUpload` reuses weights from an earlier call.
- The test-plan §6.3 entry explains how to add a reproducibility or live-weights test.

### Key Discoveries:

- Default weights are integers (`supabase/migrations/20260929120000_scoring_weights.sql:11-18`). With them, the operator-section smoke can't produce a float-equal tie, so that tie stays covered only at unit level (`ranking.test.ts:59`).
- `saveWeights(overrides)` merges overrides into the weights the form displayed and posts all six (`smoke.mjs:69-73`). `saveWeights()` restores the originals byte for byte.
- The history trigger writes one `scoring_weight_changes` row per changed weight (`supabase/migrations/20261005120000_weights_admin.sql:33`). Changing three weights and restoring them adds 6 rows per run instead of 2.
- The admin-steps note lives in two places: `AGENTS.md:55` (Tripwires) and `scripts/smoke.mjs:8-9`. Both say `major` goes to 12 and the run adds two history rows.

## What We're NOT Doing

- New `rankTickets` unit tests for #2. The existing four tests already pin every tie level with hand-derived orders (user decision).
- A float-equal tie in the smoke. The operator section runs with integer default weights, so the case can't occur there. It's covered by `ranking.test.ts:59`.
- Production code changes. Today's code isn't defective for either risk (research).
- Comparing the whole page. Only the `<ol>…</ol>` slice is compared, so the step doesn't depend on any per-request markup Astro or the adapter might add.
- Avoiding the extra history rows. Accepted at 6 rows per run (user decision).

## Implementation Approach

The work is in two phases, the same shape as rollout Phase 1:

1. Write the tests and docs and verify locally. That covers the unit test, the break-check and the full CI equivalent; the smoke script only gets a parse check.
2. Prove the new smoke steps in the PR's CI `smoke` job, then write the cookbook.

Oracle rule (test-plan §1): every expected score and order below is derived by hand from the PRD formula and the stated weights. None is computed by calling the code under test.

## Phase 1: Tests and docs

### Overview

Add the render-reproducibility smoke step, extend the admin live-weights round-trip to three weights, add the no-memoization unit test, and update the two notes that describe the admin steps.

### Changes Required:

#### 1. Smoke: same file twice renders the same list (risk #2)

**File**: `scripts/smoke.mjs`

**Intent**: Add a step to the operator section, after the Phase 1 rollout steps and before "signout clears session". It uploads the same file twice and checks two things: the two rendered lists are byte-identical, and they show the hand-derived order.

**Contract**:

- Step name: `dashboard renders the same list for the same file`.
- The step's run function makes two POST `/dashboard` uploads of one CSV. It returns status 200 only if both requests returned 200.
- `bodyCheck` passes only if all three hold:
  - the `<ol`…`</ol>` slices of the two responses are non-empty and identical,
  - the `data-ticket-id` values in the first slice appear in exactly the expected order,
  - each slice contains 6 tickets.
- Fixture with PRD default weights, rows deliberately out of order:
  - `REPRO-b,minor,1,1`
  - `REPRO-W,warning,2,0`
  - `REPRO-M,major,0,5`
  - `REPRO-a,minor,1,1`
  - `REPRO-C,critical,0,0`
  - `REPRO-B,minor,1,1`
- Hand-derived scores: C = 15 + 0 + 0 = 15, M = 10 + 0 + 5 = 15, B/a/b = 5 + 3 + 1 = 9, W = 1 + 6 + 0 = 7.
- Expected order: `REPRO-C, REPRO-M, REPRO-B, REPRO-a, REPRO-b, REPRO-W`.
  - C before M because of the severity tie-break.
  - B, a, b in that order because of the code-point tie-break (`B` < `a` < `b`). `localeCompare` would give a different order.

What the step covers:

- Behavior asserted: two uploads of the same file render the same list, in the PRD order, on the real runtime.
- Regression caught: unstable or non-deterministic sorting, a locale-dependent id comparison, or per-request state leaking into the list.
- Research source: research.md sections "What serialized output means" and "Existing coverage for #2 beyond unit".
- Edge case: a three-way tie on score and severity, plus a two-way score tie broken by severity.
- Anti-pattern avoided: expected order computed with the function under test, and two empty pages counting as equal.

#### 2. Smoke: next upload uses every saved weight (risk #5)

**File**: `scripts/smoke.mjs`

**Intent**: Change the existing admin round-trip so the save sets three weights to non-default values. The next upload then checks the total and both multiplier lines against hand-derived values.

**Contract**:

- The step "admin saves major=12" becomes `admin saves major=12, customer=4, service=2`. It calls `saveWeights({ major: 12, customer: 4, service: 2 })`. The expected 302 to `/admin/weights?saved=1` is unchanged.
- The step "upload ranks with the new weights" keeps the upload `SMOKE-WEIGHTS,major,2,5`. Its `bodyCheck` requires:
  - `data-ticket-id="SMOKE-WEIGHTS"`,
  - `30,0`, which is 12 + 4×2 + 2×5,
  - `/2 × 4,0 =\s*8,0/` and `/5 × 2,0 =\s*10,0/`.
- The expected values are now constants, not derived from `original`. All three weights involved are set by the step itself.
- Distinct failure values:
  - `customer` falls back to 3: 28.
  - `service` falls back to 1: 25.
  - customer↔service swap: 36.
  - stale `major` of 10: 28.
- "admin restores original weights" stays as it is.

What the step covers:

- Behavior asserted: the very next upload after a save, with no restart, scores with all three saved values.
- Regression caught: a cache between save and upload, a constants fallback for any of the three weights, and the form→RPC argument swap.
- Research source: research.md sections "Existing coverage for #5" and "Cheapest additions for #5".
- Edge case: values that differ from both the defaults and each other.
- Anti-pattern avoided: default weights, changing only one weight, and forgetting to restore.

#### 3. Unit: `rankUpload` reads weights on every call (risk #5)

**File**: `src/lib/upload.test.ts`

**Intent**: Call `rankUpload` twice with the same file and two loaders that return different weights. Assert the second result reflects the second loader. This rules out memoization inside the extracted function.

**Contract**:

- New test `reads weights on every call`.
- First call: loader returns the default weights, upload `T1,major,2,5`. Expect score 21.
- Second call: a loader stub returning `{ warning: 1, minor: 5, major: 12, critical: 15, customer: 4, service: 2 }`, the same upload. Expect `points: { severity: 12, customers: 8, services: 10 }`, score 30, and that loader called once.
- Reuse the existing `loader()` stub and `upload()`/`csvFile()` helpers.

What the test covers:

- Behavior asserted: weights come from each call's loader.
- Regression caught: a module-level weights cache in `upload.ts`.
- Research source: research.md "Existing coverage for #5", row for `upload.test.ts`.
- Anti-pattern avoided: default weights on both calls.

#### 4. Admin-steps notes

**Files**: `AGENTS.md`, `scripts/smoke.mjs`

**Intent**: Keep the two descriptions of the smoke's admin side effects accurate. They now say three weights change and six history rows are added per run.

**Contract**:

- `AGENTS.md:55` (Tripwires): change "set `major` to 12 … adds two `scoring_weight_changes` rows" to say it sets `major`, `customer` and `service` to 12, 4 and 2, writes the originals back, and adds six rows.
- `scripts/smoke.mjs:8-9`: make the same change to the header comment.

### Success Criteria:

#### Automated Verification:

- New unit test passes: `npm test`
- Break-check: cache the loaded weights in a module-level variable in `src/lib/upload.ts`, confirm `npm test` fails on `reads weights on every call`, then revert
- Smoke script still parses: `node --check scripts/smoke.mjs`
- Full local CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`

#### Manual Verification:

- The fixture and expected values in both smoke steps match the hand derivations in this plan, and neither is computed from code under test

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: CI proof and test-plan cookbook

### Overview

Run the new smoke steps live in the PR's CI `smoke` job, then record the shipped patterns in the test plan.

### Changes Required:

#### 1. Test-plan cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.3 TBD with the recipe that shipped, and append a dated Phase 2 note to §6.5. §3 Status is updated to `complete` only after Progress is fully checked. No new sections.

**Contract**: §6.3 covers:

- Render reproducibility goes in `scripts/smoke.mjs`. Upload twice, compare the `<ol>` slices, and assert one hand-derived id order with a code-point tie.
- Live weights goes in the admin round-trip. Change every weight under test to a non-default, distinct value, assert the total and the component lines, and always restore.
- Memoization goes in `src/lib/upload.test.ts`, with two calls and different loaders.
- Float-equal ties stay at unit level (`ranking.test.ts`), because the default weights are integers.
- List the reference test names and the run commands.

The §6.5 note records what shipped, the break-check result, and that the smoke now adds 6 history rows per run.

### Success Criteria:

#### Automated Verification:

- CI `smoke` job is green on the PR, including the new reproducibility step and the three-weight round-trip
- Full local CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`

#### Manual Verification:

- test-plan §6.3 reads as a usable recipe for someone who hasn't seen this change

---

## Testing Strategy

### Unit Tests:

- `upload.test.ts`: `reads weights on every call`, with two loaders and non-default weights on the second call.

### Integration Tests:

- `scripts/smoke.mjs`:
  - The same file twice gives an identical `<ol>` and the hand-derived order.
  - After saving `major`, `customer` and `service`, the next upload scores 30,0 and shows component lines 8,0 and 10,0. The weights are then restored.

### Manual Testing Steps:

1. Optional, since CI runs it: `npm run build && npm run preview`, then run `npm run smoke` with the cloud credentials set. Expect 6 new `scoring_weight_changes` rows afterwards.

## References

- Research: `context/changes/testing-ranking-reproducibility-live-weights/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (#2, #5), §6
- Prior pattern: `context/changes/testing-csv-ingestion-contract/plan.md` (Phase 1 rollout)
- Admin round-trip origin: `context/changes/weights-admin/plan.md:158`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tests and docs

#### Automated

- [x] 1.1 New unit test passes: `npm test` — 6a28a10
- [x] 1.2 Break-check: cache the loaded weights in a module-level variable in `src/lib/upload.ts`, confirm `npm test` fails on `reads weights on every call`, then revert — 6a28a10
- [x] 1.3 Smoke script still parses: `node --check scripts/smoke.mjs` — 6a28a10
- [x] 1.4 Full local CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build` — 6a28a10

#### Manual

- [x] 1.5 The fixture and expected values in both smoke steps match the hand derivations in this plan, and neither is computed from code under test — 6a28a10

### Phase 2: CI proof and test-plan cookbook

#### Automated

- [x] 2.1 CI `smoke` job is green on the PR, including the new reproducibility step and the three-weight round-trip
- [x] 2.2 Full local CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`

#### Manual

- [x] 2.3 test-plan §6.3 reads as a usable recipe for someone who hasn't seen this change
