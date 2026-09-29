<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Persisted Weights Implementation Plan

- **Plan**: context/changes/persisted-weights/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- Master at `0a18945`: `astro sync`, `npm run lint`, `astro check` and `npm run build` all pass.
- DB criteria were verified off-plan because there is no local Docker. 1.1 and 1.2 were checked on the linked cloud project with `db push` and `db query --linked`. 2.1 ran in the CI smoke job (17/17). 2.2 was a break-check on throwaway PR #11, where tests 3 and 6 went red.
- The migration matches the plan's contract exactly: table, CHECK, seeds, both policies, `revoke all`, then `grant select, update`.
- The test has 17 assertions, which matches `plan(17)`. It covers every Phase 2 §1 bullet.
- The planned savepoint was replaced by a restoring UPDATE, which is justified: rolling back to a savepoint would also undo pgTAP's own records. The restore runs before any later exact-value check.

## Findings

### F1 — AGENTS.md still calls the weights fixed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AGENTS.md:25
- **Detail**: The line says "Scoring is fixed: `score = severity_weight + 3.0 * customers + 1.0 * services`" and hardcodes the severity weights. Since F-02, all six values are editable rows in the DB. An agent reading it for S-01 could hardcode the constants, which is exactly the outcome F-02 is meant to prevent. The plan didn't list this line.
- **Fix**: Reword it to say the formula shape is fixed, the six values are the defaults stored in `scoring_weights` (seeded by the migration), and S-01 must read them from the DB. Keep the tie-break rule and the worked example.
- **Decision**: FIXED (AGENTS.md:25 reworded: formula fixed, weights are DB rows with defaults)

### F2 — `.gitignore` ignores all of `.claude/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: .gitignore:33 (commit 349685e)
- **Detail**: 45 files under `.claude/` are tracked: the 10x-cli manifest, settings.json, the 10x-* skills, and the new-migration and verify skills. Edits to them still commit. But any new file is now silently ignored, including skills added by the next 10x-cli sync, new commands, and new references. The manifest would then list hashes for skills that aren't in the repo. This was your working-tree edit, which I committed in the chore commit. The plan didn't include it.
- **Fix A ⭐ Recommended**: Narrow the entry to the files that are actually local (`.claude/settings.local.json`, plus `.claude/prompts/` if those are private)
  - Strength: Keeps the lint fix, because the lint errors came from `.kiro/` and the untracked skill scripts, which are ignored separately. New tracked skills also keep working.
  - Tradeoff: You have to decide whether `.claude/prompts/` belongs in the repo.
  - Confidence: HIGH. `git status --ignored` shows only prompts/ and settings.local.json being hidden right now.
  - Blind spot: Your reason for ignoring the whole folder.
- **Fix B**: Keep it as is, deliberately
  - Strength: No further change.
  - Tradeoff: New skills and settings have to be added with `git add -f` every time.
  - Confidence: MEDIUM.
  - Blind spot: How 10x-cli sync behaves when its files are ignored.
- **Decision**: FIXED via Fix A (.gitignore ignores only .claude/settings.local.json, prompts/, skills/; ESLint ignores .claude/ and .kiro/ via globalIgnores)

### F3 — Promised PRD sentence is missing

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/prd.md (after the Access Control table, ~line 283)
- **Detail**: The Phase 3 §2 contract asked for one sentence saying the score components reveal the weight values anyway. The sentence is in AGENTS.md but not in the PRD.
- **Fix**: Add a sentence such as: "Operator zna wartości wag pośrednio: rozwinięta pozycja pokazuje trzy składniki wyniku."
- **Decision**: FIXED (sentence added under the PRD Access Control table)

### F4 — `value` accepts NaN, Infinity and negatives

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260929120000_scoring_weights.sql:8
- **Detail**: The plan deliberately left range validation to S-04. However, `numeric` accepts `'NaN'`, which Postgres sorts above every number. A NaN weight would break the rule that repeated uploads produce identical ordering. Only the admin can write, and today there's no UI to do it, so this can't happen yet.
- **Fix**: Carry it into S-04's plan as a required constraint, e.g. `check (value >= 0 and value <> 'NaN' and value <> 'Infinity')`, rather than editing the applied migration now.
- **Decision**: FIXED (CHECK requirement recorded in roadmap S-04 Risk)

### F5 — Admin UPDATE grant covers the `key` column

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260929120000_scoring_weights.sql:24
- **Detail**: The admin can `update … set key = …`. The six-value CHECK plus the primary key make every rename collide, so all six keys still exist. Even so, a column-level `grant update (value)` would state the intent directly.
- **Fix**: Handle it with F4 in S-04's migration: `revoke update … ; grant update (value) on public.scoring_weights to authenticated;`
- **Decision**: FIXED (grant update (value) recorded in roadmap S-04 Risk)
