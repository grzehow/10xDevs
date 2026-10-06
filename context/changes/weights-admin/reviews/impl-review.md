<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Weights Admin Implementation Plan

- **Plan**: context/changes/weights-admin/plan.md
- **Scope**: Full plan (Phases 1 and 2 of 2)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Smoke test can leave a non-local database with changed weights

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:48-50, 102, 133-134
- **Detail**: `saveWeights()` always posts the six PRD defaults, so against any database whose admin has customised a weight, the first admin step resets all six and the restore step leaves them at defaults. AGENTS.md only says the run "writes two history rows", which understates this. Separately, the comment "steps never abort the run, so the restore step always executes" holds only for assertion failures: a `fetch` rejection or Ctrl-C between "saves major=12" and "restores defaults" exits with `major` stuck at 12. CI uses a throwaway local Supabase, so it is harmless there.
- **Fix A ⭐ Recommended**: Only run the admin steps when `BASE_URL` is localhost / 127.0.0.1 or `SMOKE_ALLOW_WRITE=1` is set, and wrap every step in try/catch so a thrown error records a FAIL and the restore still runs
  - Strength: Small change; makes the dangerous case opt-in and the failure path honest.
  - Tradeoff: Smoke against a cloud project no longer exercises the admin save unless asked.
  - Confidence: HIGH — the loop is already one place to wrap.
  - Blind spot: Whether you ever run smoke against the cloud project.
- **Fix B**: Read the current weights from GET `/admin/weights` before the admin steps and restore exactly those
  - Strength: Smoke becomes safe on any database.
  - Tradeoff: Needs HTML parsing in a zero-dependency script, and a thrown error can still skip the restore.
  - Confidence: MED — parsing the input values is simple but couples smoke to the markup.
  - Blind spot: pl-PL formatting (`2,5`) must round-trip through the form.
- **Decision**: FIXED (Fix B: smoke reads the current weights, restores them exactly, never writes unless the read succeeded; every step is also wrapped in try/catch so a thrown error is recorded and the restore still runs. AGENTS.md wording updated. Verified by CI only.)

### F2 — The "anon rpc denied" test would pass without the EXECUTE revoke

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/database/weights_admin.test.sql:66-67
- **Detail**: With the anon JWT `{"role":"anon"}` there is no `app_metadata`, so even if `revoke execute ... from anon` were removed, the function's own role check raises the same `42501`. The revoke and the matching revoke on the trigger function are therefore unprotected. The "no role claim" case (`{"role":"authenticated"}`) is also untested for the RPC and for history SELECT.
- **Fix**: Add `has_function_privilege` assertions: anon cannot execute `update_scoring_weights(...)`, authenticated cannot execute `log_scoring_weight_change()`; add a no-role-claim RPC denial and an empty history SELECT; bump `plan(N)` to match. Verified only in CI.
- **Decision**: FIXED (4 assertions added: has_function_privilege for anon on update_scoring_weights and authenticated on the trigger function, plus no-role-claim RPC denial and empty history; plan(26) -> plan(30). Verified by CI only.)

### F3 — Page behaviour the plan did not describe

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/admin/weights.astro:43, 48
- **Detail**: Validation errors return HTTP 400, which the plan does not mention. On an RPC error the form re-renders with the normalised values, so `2,5` comes back as `2.5`, where the plan says "keep the submitted values". Both are harmless and re-submittable.
- **Fix**: Accept, and optionally add one line to the plan.
- **Decision**: SKIPPED (accepted as is)

### F4 — A failed save is invisible in the logs

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/admin/weights.astro:42-44
- **Detail**: `result.error` is discarded and a failed save returns HTTP 200 with the generic message, so a revoked role (42501), parser/DB drift (23514) and a network failure look identical.
- **Fix**: `console.error(result.error.code)` (never the message or values) and set status 500 on that branch.
- **Decision**: FIXED (weights.astro logs only the error code via console.error with a scoped no-console suppression and returns status 500 on a failed save; lint and astro check clean)

### F5 — No focus or length hint after a validation error

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/admin/weights.astro:86-121
- **Detail**: Labels, `aria-invalid` and `aria-describedby` are in place. After a 400 the page reloads with no focus on the first invalid field, and the inputs have no `maxlength`.
- **Fix**: `autofocus` on the first input that has an error, and `maxlength="7"`.
- **Decision**: FIXED (maxlength=7 on all six inputs; focus on the first aria-invalid field via a one-line page script, because jsx-a11y/no-autofocus rejects the autofocus attribute; lint, astro check and build pass)

### F6 — Parser edge cases are not pinned by tests

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/weights-form.test.ts
- **Detail**: Not covered: NBSP and tab trimming, non-ASCII digits (`"٣"`, `"１２"`), `"007"`, `"0,00"`, `"1000,00"`, a File value in a field. None is broken today; the ASCII-only `\d` guarantee is unpinned.
- **Fix**: Add a few table-driven cases.
- **Decision**: FIXED (2 tests added: accepts 007, 0,00, 1000,00, NBSP/tab padding; rejects non-ASCII digits and treats a File value as empty. 7 -> 9 tests; break-check with \p{Nd} turned the ASCII-digit test red)

### F7 — The save function does not check that six rows were updated

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261005120000_weights_admin.sql:82-91
- **Detail**: If a `scoring_weights` row were ever missing, the save would report success while writing fewer than six. Nothing can delete a row today (only superuser/service role).
- **Fix**: Optional: `get diagnostics` plus a raise. Needs a new migration, since the applied one should not be edited.
- **Decision**: FIXED (new migration 20261006100613_update_weights_row_check.sql replaces update_scoring_weights with a row_count = 6 check and restated grants; pgTAP case added with a deleted row expecting P0001, plan(30) -> plan(31). Verified by CI only; needs another `supabase db push` for the cloud project.)

### F8 — AGENTS.md states a convention as if the database enforced it

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:31
- **Detail**: "Saves go through `update_scoring_weights()`, never direct UPDATEs" is convention only: the grant still lets the admin `UPDATE (value)` directly. The CHECK and the history trigger still apply either way.
- **Fix**: Say "should" and name what is enforced (CHECK, column grant, trigger).
- **Decision**: FIXED (AGENTS.md reworded: saves SHOULD go through update_scoring_weights(); names what the database actually enforces)

### F9 — Roadmap flip is uncommitted

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md
- **Detail**: S-04 was flipped to `in-progress` in the working tree but is not in any commit. `/10x-archive` will set it to `done` anyway. `package.json` / `package-lock.json` (Supabase CLI bump) and `context/changes/score-breakdown/` are also uncommitted and unrelated to this change.
- **Fix**: Commit the roadmap flip, or leave it for `/10x-archive`.
- **Decision**: FIXED (roadmap.md S-04 in-progress flip goes into the review-fixes commit; package.json/lockfile and score-breakdown/ stay out)
