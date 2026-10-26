<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Ranking Reproducibility and Live Weights Tests

- **Plan**: context/changes/testing-ranking-reproducibility-live-weights/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Evidence: every planned change matches the plan, and no production code changed. CI `smoke` on PR #18 passed all 22 steps. Locally, `node --check` passes, and the full chain passes with 36/36 tests and 0 lint errors (`10xDevs/` excluded from lint, see F3).

## Findings

### F1 — "Six history rows" is an upper bound

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: AGENTS.md:55, scripts/smoke.mjs:8-9, context/foundation/test-plan.md §6.3/§6.5
- **Detail**: The history trigger fires only `when (old.value is distinct from new.value)` (`supabase/migrations/20261005120000_weights_admin.sql:58`). If an original weight is already 12, 4 or 2, a run adds fewer than six rows. The old "two rows" text had the same imprecision.
- **Fix**: Reword to "up to six" in the three places.
- **Decision**: FIXED — reworded to "up to six" in AGENTS.md, smoke.mjs header, test-plan §6.3/§6.5

### F2 — Test-plan §2 risk table edited outside the Phase 2 list

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:59,62
- **Detail**: The Risk Response Guidance rows for #2 and #5 were rewritten during planning: smoke is now the cheapest layer, and the anti-patterns "comparing a page that renders nothing" and "changing only one weight" are new. Phase 2 lists only §6.3, §6.5 and §3. The edit matches research.md, adds no section, and the plan's References cite §2 (#2, #5). Benign.
- **Fix**: None needed; accept as a planning-time refinement.
- **Decision**: FIXED — plan References now records the §2 #2/#5 refinement as a planning-time edit

### F3 — `npm run lint` fails locally because of an untracked nested repo copy

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: 10xDevs/ (untracked)
- **Detail**: An untracked `10xDevs/` folder at the repo root, a nested copy of the project, is not in `.gitignore`. ESLint therefore lints it and reports about 1,800 errors (CRLF line endings and unresolved types). The 1.4 and 2.2 gates were green only with `--ignore-pattern '10xDevs/**'`. CI never sees the folder, so this isn't caused by the change, but the plan's command fails as written on this machine.
- **Fix**: Delete the stray `10xDevs/` folder, or move it outside the repo.
- **Decision**: FIXED — folder (clean clone of origin/master at 98570e9) deleted by the user; plain `npm run lint` no longer sees it
