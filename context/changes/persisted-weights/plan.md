# Persisted Weights Implementation Plan

## Overview

Move the six scoring weights out of the PRD and into the database, so S-01 scores uploads with them and S-04 can edit them later. The work is one table seeded with the PRD defaults, RLS policies (both accounts read, only the admin updates), pgTAP tests of the access split in CI, and a doc update that words the operator rule to match what the database actually enforces.

## Current State Analysis

- The repo has no migrations yet: `supabase/migrations/` does not exist. This is the first one.
- F-01 stores the role in `auth.users.raw_app_meta_data.role` (`supabase/seed.sql:11-15`) and reads it in the middleware from `user.app_metadata.role` (`src/middleware.ts:15-16`). RLS can read the same value with `auth.jwt() -> 'app_metadata' ->> 'role'`.
- The CI `smoke` job already starts local Supabase and tears it down afterwards (`.github/workflows/*.yml`, `smoke` job). A DB test step can sit between those.
- Weights exist only as prose: PRD `## Business Logic` and AGENTS.md "Domain rules". Nothing reads them from code.
- AGENTS.md and PRD `## Access Control` both say the operator cannot read weights. The chosen design lets the operator SELECT them for scoring (the score components reveal them anyway), so the wording has to change (Phase 3).

## Desired End State

After `npx supabase db reset`, `public.scoring_weights` holds exactly six rows: `warning 1.0, minor 5.0, major 10.0, critical 15.0, customer 3.0, service 1.0`. The access rules are:

- **Admin:** can SELECT and UPDATE the table.
- **Operator:** can SELECT all six rows (for scoring) and cannot change anything.
- **Anon and role-less signed-in users:** see zero rows and cannot change anything.
- **Nobody:** can INSERT, DELETE or TRUNCATE, so all six keys always exist.

`supabase test db` proves all of this locally and in CI. The docs describe the operator boundary as it now works.

### Key Discoveries:

- Supabase's default privileges on `public` may or may not grant `anon`/`authenticated` table access, depending on project settings. The migration must not depend on either: revoke everything, then grant exactly what the policies need.
- The roadmap requires the defaults to reach the cloud project, which only runs migrations (not `seed.sql`). So the seed rows go **in the migration**, not in `supabase/seed.sql`.
- The JWT role claim can lag a role change by up to `jwt_expiry = 3600` s (`supabase/config.toml:158`). Roles never change in this product, so this is accepted, as it was for F-01.

## What We're NOT Doing

- No weight-change history table or trigger. S-05 adds it, with S-04.
- No value range validation (negative numbers, upper bound). This is an open roadmap question owned by S-04. The column is only `not null`.
- No TypeScript loader. S-01 is the first consumer: it calls `supabase.from("scoring_weights").select("key, value")` itself and fails closed (error, no scoring) unless it gets all six keys. An empty result from RLS must never silently score with no weights.
- No `security definer` read function. The operator's read is a plain SELECT policy; the "no weights screen" boundary is a route/UI concern owned by S-04.
- No scoring in SQL. The formula stays in TS, inside S-01.
- No admin UI and no route guards (S-04).
- No generated DB types (`supabase gen types`). Add them when a second table makes them worth it.

## Implementation Approach

A single migration creates everything the database needs. The table is keyed by weight name, so each row matches one editable value and one future history entry. Both accounts get a SELECT policy keyed on the JWT role; only the admin gets an UPDATE policy. SQL tests pin the boundary, because this is the security boundary and a policy regression must fail CI.

## Critical Implementation Details

- **Fail-closed role predicate:** policies compare `(auth.jwt() -> 'app_metadata' ->> 'role')` with `=` / `in (...)`. A missing claim yields `null`, which is never true, so role-less users see nothing, matching F-01's middleware.
- **Numeric type:** use `numeric`, not `float8`. That keeps the "byte-identical ordering on repeat upload" rule simple: the same stored value always serializes to the same JSON number.

## Phase 1: Weights table and policies

### Overview

A single migration that creates, seeds and locks down the weights.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260929120000_scoring_weights.sql`

**Intent**: Create the table with the six PRD defaults and enable RLS with per-operation, per-role policies. This follows the AGENTS.md migration convention.

**Contract**:

- `public.scoring_weights(key text primary key check (key in ('warning','minor','major','critical','customer','service')), value numeric not null)`
- The six rows are inserted in the migration, with the values from PRD `## Business Logic`.
- `alter table … enable row level security`. Policies:
  - `scoring_weights_select_operator_admin`: `for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('operator', 'admin'))`
  - `scoring_weights_update_admin`: `for update to authenticated`, with `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` in both `using` and `with check`
  - No INSERT or DELETE policies.
- Grants, explicit and independent of project defaults: `revoke all on public.scoring_weights from anon, authenticated;` then `grant select, update on public.scoring_weights to authenticated;`

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh DB: `npx supabase db reset`
- `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) from public.scoring_weights"` returns 6 after reset
- `npx astro sync && npm run lint && npx astro check && npm run build` passes

#### Manual Verification:

- In Supabase Studio, the table shows RLS enabled with exactly two policies (select for operator+admin, update for admin)

**Implementation Note**: When the automated checks pass, pause for manual confirmation before Phase 2.

---

## Phase 2: RLS tests in CI

### Overview

pgTAP tests that fail when the access split regresses, run in the existing CI smoke job.

### Changes Required:

#### 1. pgTAP test file

**File**: `supabase/tests/database/scoring_weights.test.sql`

**Intent**: Pin every side of the boundary as a separate assertion, so a failure names exactly which rule broke.

**Contract**: Wrapped in `begin; select plan(N); … select * from finish(); rollback;`, with `create extension if not exists pgtap with schema extensions` at the top. Each role is simulated with `set local role authenticated|anon` plus `set local request.jwt.claims` carrying `app_metadata.role`. The assertions:

- 6 seeded rows with the exact PRD values
- Operator: SELECT returns the six exact key/value pairs; UPDATE affects zero rows; INSERT and DELETE are denied or affect zero rows
- Admin: SELECT returns the six exact rows; UPDATE changes a value; INSERT and DELETE are denied
- Anon: SELECT is denied (no grant); UPDATE, INSERT and DELETE are denied
- Authenticated without a role claim: SELECT sees 0 rows; UPDATE, INSERT and DELETE are denied or affect zero rows
- The admin UPDATE runs inside `savepoint … ; rollback to savepoint …`, so every other exact-value assertion sees the seeded values regardless of order

#### 2. CI step

**File**: `.github/workflows/ci.yml` (`smoke` job)

**Intent**: Run the DB tests while local Supabase is already up.

**Contract**: A new step, `run: supabase test db`, goes after "Start local Supabase" and before the build. The `-x` exclusion list stays as it is, because the DB container is not excluded.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` passes locally, with all assertions green
- Temporarily adding an operator UPDATE policy makes the test fail (revert afterwards)
- CI `smoke` job passes on the PR, including the new step

#### Manual Verification:

- The CI log shows the `supabase test db` output with the expected assertion count

**Implementation Note**: When the automated checks pass, pause for manual confirmation before Phase 3.

---

## Phase 3: Reword the operator rule

### Overview

Make the written rules match the enforced boundary. The operator can read the weights (RLS SELECT, used for scoring; visible anyway as score components), cannot change them, and has no weights or history screen.

### Changes Required:

#### 1. Agent rules

**File**: `AGENTS.md` ("Domain rules")

**Intent**: Replace "The operator cannot read or change weights or view weight history" with the accurate rule.

**Contract**: The new wording says the operator may SELECT `scoring_weights` (for scoring), cannot change weights, and has no weights or history screen; RLS enforces the read/write split. Record the six defaults' home: they live in the migration, not in code.

#### 2. PRD access table

**File**: `context/foundation/prd.md` (`## Access Control`)

**Intent**: Remove every PRD statement that the operator has no access to weights.

**Contract**:

- Access table (`prd.md:279`): split the row: "Podgląd wag (ekran wag)" is operator: nie, and "Użycie wag do liczenia wyniku" is operator: tak. Add one sentence explaining that the score components reveal the weight values anyway.
- Access Control prose (`prd.md:269-271`): "…i nie ma dostępu do wag" becomes "nie widzi ekranu wag i ich nie zmienia".
- US-03 acceptance criterion (`prd.md:130`): "Konto operatorskie nie ma dostępu do wag ani do historii ich zmian" becomes "Konto operatorskie nie zmienia wag i nie widzi ekranu wag ani historii ich zmian".

#### 3. Roadmap and README

**Files**: `context/foundation/roadmap.md` (F-02 Outcome), `README.md` (Supabase setup)

**Intent**: Align the F-02 outcome wording with the new rule, and tell cloud setup to run migrations.

**Contract**: In the roadmap, the F-02 Outcome no longer says "poza zasięgiem konta operatorskiego" without qualification. In the README, add the cloud steps: `npx supabase link --project-ref <ref>`, then `npx supabase db push` to apply the weights migration.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- A grep for "cannot read or change weights" in `AGENTS.md` and for "nie ma dostępu do wag" in `context/foundation/prd.md` returns nothing

#### Manual Verification:

- AGENTS.md, the PRD and the roadmap state the same operator boundary, and it matches the migration's policies

---

## Testing Strategy

### Integration Tests:

- `supabase/tests/database/scoring_weights.test.sql` is the only new test. It runs against real Postgres with real RLS, locally and in CI.
- Existing `npm run smoke` must stay green. It doesn't touch weights, but it runs in the same job.

### Manual Testing Steps:

1. `npx supabase db reset`, then `npx supabase test db`.
2. In Studio's SQL editor, confirm the policies and grants on `scoring_weights`.

## Migration Notes

- This is the first migration in the repo. The cloud project needs `npx supabase link` + `npx supabase db push` (documented in Phase 3) before S-01 deploys.
- Rollback: drop the table. No other object depends on it yet.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-02)
- PRD: `context/foundation/prd.md` (`## Business Logic`, `## Access Control`, FR-009, NFR reproducibility)
- Prior change: `context/changes/shared-accounts-and-roles/plan.md` (role in `app_metadata`)
- Role read: `src/middleware.ts:15-16`, `supabase/seed.sql:11-15`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Weights table and policies

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh DB: `npx supabase db reset` — 2d9173b
- [x] 1.2 `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) from public.scoring_weights"` returns 6 after reset — 2d9173b
- [x] 1.3 `npx astro sync && npm run lint && npx astro check && npm run build` passes — 2d9173b

#### Manual

- [x] 1.4 In Supabase Studio, the table shows RLS enabled with exactly two policies (select for operator+admin, update for admin) — 2d9173b

### Phase 2: RLS tests in CI

#### Automated

- [ ] 2.1 `npx supabase test db` passes locally, with all assertions green
- [ ] 2.2 Temporarily adding an operator UPDATE policy makes the test fail (revert afterwards)
- [ ] 2.3 CI `smoke` job passes on the PR, including the new step

#### Manual

- [ ] 2.4 The CI log shows the `supabase test db` output with the expected assertion count

### Phase 3: Reword the operator rule

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 A grep for "cannot read or change weights" in `AGENTS.md` and for "nie ma dostępu do wag" in `context/foundation/prd.md` returns nothing

#### Manual

- [ ] 3.3 AGENTS.md, the PRD and the roadmap state the same operator boundary, and it matches the migration's policies
