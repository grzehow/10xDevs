<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Persisted Weights Implementation Plan

- **Plan**: context/changes/persisted-weights/plan.md
- **Mode**: Deep
- **Date**: 2026-09-29
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

7/7 existing paths ✓ (the `supabase/migrations`, `supabase/tests` dirs are new and correctly absent), 4/4 symbols ✓ (seed.sql role, middleware role, `jwt_expiry` at config.toml:158, AGENTS.md phrase), brief↔plan ✓

## Findings

### F1: The security-definer function exposes the same data a SELECT policy would

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM (real tradeoff; pause to reason through it)
- **Dimension**: Lean Execution
- **Location**: Phase 1 (function), Phase 2 (function assertions)
- **Detail**: The reworded rule lets the operator read all six values, which the score components show anyway. `get_scoring_weights()` adds definer code, search_path hardening, grant work and about 4 test assertions, but it protects no extra data. The boundary that's left ("no weights screen") is a UI concern for S-04.
- **Fix A ⭐ Recommended**: Use a SELECT policy for operator and admin plus an UPDATE policy for admin, and drop the function. S-01 fails closed unless it gets 6 keys.
  - Strength: Less SQL and no definer code to get wrong.
  - Tradeoff: The doc wording changes again.
  - Confidence: HIGH (same data exposure).
  - Blind spot: S-01 must own the 6-keys check.
- **Fix B**: Keep the function.
- **Decision**: FIXED (Fix A)

### F2: plpgsql RETURNS TABLE (key, value) conflicts with the column names

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Phase 1 Contract
- **Detail**: The OUT params shadow the columns, so an unqualified select raises "column reference is ambiguous".
- **Fix**: Qualify the columns with a table alias.
- **Decision**: FIXED (moot: F1 Fix A removed the function)

### F3: The PRD still says the operator has no access to weights, in 2 more places

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: End-State Alignment
- **Location**: Phase 3 §2
- **Detail**: prd.md:130 (US-03 acceptance criterion) and prd.md:269-271 (Access Control prose) were not covered.
- **Fix**: Add both places to the Phase 3 §2 contract, plus a grep check in 3.2.
- **Decision**: FIXED

### F4: The plan relies on Supabase's default table grants instead of granting explicitly

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Phase 1 Contract, grants
- **Detail**: The plan revokes only INSERT/DELETE/TRUNCATE and assumes the default privileges still grant the rest.
- **Fix**: `revoke all … from anon, authenticated; grant select, update … to authenticated;`
- **Decision**: FIXED

### F5: `supabase db push` needs `supabase link` first

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §3, Migration Notes
- **Fix**: Document `link`, then `db push`.
- **Decision**: FIXED

### F6: Loose criteria and placeholders

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Plan Completeness
- **Location**: 1.2, Phase 2 §2, 3.1
- **Fix**: A runnable psql command for 1.2, name `ci.yml`, and make the 3.1 text match its Progress title.
- **Decision**: FIXED

### F7: The admin UPDATE assertion changes a value that later exact-value checks depend on

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW (quick decision; fix is obvious and narrowly scoped)
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1
- **Fix**: Wrap the admin UPDATE in a savepoint and roll back to it.
- **Decision**: FIXED
