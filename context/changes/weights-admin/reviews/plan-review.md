<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Weights Admin Implementation Plan

- **Plan**: context/changes/weights-admin/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
6/6 paths ✓ (src/pages/admin/ is new, as planned), 3/3 symbols ✓ (WEIGHT_KEYS exists but is not exported; plan exports it), brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — History trigger blocks any weight update made without a login token

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migration (scoring_weight_changes.account)
- **Detail**: `account text not null` comes from the JWT `app_metadata.role` claim. An update from the Studio SQL editor, the service role or a data-fix migration has no claim, so the history insert fails and aborts the weight update itself.
- **Fix**: `account = coalesce(<jwt role>, current_user)`, plus one pgTAP assertion for an update with no login token.
- **Decision**: FIXED

### F2 — No automated test covers the admin save from the page to the database

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Smoke and docs
- **Detail**: Form fields → `p_*` arguments → redirect is covered only by manual check 2.4. A customer↔service swap would pass every automated check.
- **Fix**: Smoke signs in as the seeded admin, saves `major=12`, uploads `major,2,5`, expects `23,0`, then restores the defaults. Admin credentials come from `SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD`, defaulting to the seed values.
  - Strength: Catches wiring and argument-order bugs in CI on the real runtime.
  - Tradeoff: One more pair of credentials to keep in sync with seed.sql; it writes history rows against a cloud project.
  - Confidence: MED — the cookie jar and form POST already exist.
  - Blind spot: The cookie-jar reset between the two sign-ins is not tested yet.
- **Decision**: FIXED

### F3 — Phase 1 can't be marked done locally

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria 1.1, 1.2
- **Detail**: Without Docker, `supabase db reset` / `test db` can't run locally, and the plan didn't say Phase 1 needs a pushed branch and a CI run.
- **Fix**: 1.1/1.2 are verified by the CI `smoke` job on the pushed branch, and the implementation note says to push at the end of Phase 1.
- **Decision**: FIXED
