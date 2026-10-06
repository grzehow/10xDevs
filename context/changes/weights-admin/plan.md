# Weights Admin Implementation Plan

## Overview

S-04: the admin opens `/admin/weights`, sees the six current scoring weights, edits any of them and saves all six in one transaction. The new values apply from the next CSV upload (the dashboard already reads weights per upload) and survive restarts because they live in `public.scoring_weights`. Every changed value writes one history row (key, old, new, time, account role), which S-05 will display. The operator cannot open the screen, and RLS keeps blocking any write regardless of the UI.

## Current State Analysis

- `public.scoring_weights` (`supabase/migrations/20260929120000_scoring_weights.sql`) holds six rows, `value numeric not null` with no range check. `authenticated` has table-wide `select, update`, so the `key` column is updatable too. Policies: SELECT for operator and admin, UPDATE for admin only.
- The F-02 implementation review recorded two required fixes for this slice (`context/changes/persisted-weights/reviews/impl-review.md:72-90`, roadmap S-04 Risk): block NaN/Infinity/negatives with a CHECK, and narrow the grant to `update (value)`.
- `src/middleware.ts:4` has only `PROTECTED_ROUTES = ["/dashboard"]` (sign-in check). The role (`"operator" | "admin"`) is already on `context.locals.role`, and a user without a known role is treated as signed out (`src/middleware.ts:17`).
- `src/pages/dashboard.astro` shows the pattern to follow: a native form POST back to the same `.astro` page, `createClient()` null-checked, Polish copy, `Intl.NumberFormat("pl-PL")` for numbers.
- `src/lib/ranking.ts` `parseWeights` already fails closed on missing or non-finite weights; scoring rounds sort keys to 1e-9, so fractional weights with ≤ 2 decimals stay deterministic.
- pgTAP tests live in `supabase/tests/database/` and run in the CI `smoke` job (`supabase test db`). Node unit tests run via `npm test` (`src/**/*.test.ts`).
- No history table exists yet. The roadmap says S-04 writes history rows and S-05 only displays them.

## Desired End State

The admin signs in, follows a link from `/dashboard` to `/admin/weights`, and sees six fields pre-filled with the current values in Polish format (`2,5`). Submitting valid values saves all six at once, redirects back with a confirmation, and the next upload ranks with the new values. Invalid input (empty, not a number, more than 2 decimals, below 0 or above 1000) re-renders the form with the submitted values and a Polish message per field, and nothing is saved. Each changed value appears as one row in `public.scoring_weight_changes`. The operator who opens `/admin/weights` is redirected to `/dashboard`; an anonymous visitor goes to `/auth/signin`. In the database, out-of-range values, NaN, Infinity and key renames are rejected even for the admin.

### Key Discoveries:

- In Postgres, `numeric` NaN and Infinity sort above every finite number, so `value <= 1000` alone rejects both. No separate `<> 'NaN'` clauses are needed.
- With a column-level grant, PostgREST UPDATE still works for `value`; an UPDATE touching `key` fails with `42501`.
- RLS turns an operator UPDATE into a silent zero-row no-op (`supabase/tests/database/scoring_weights.test.sql:27`). So the save function must raise an explicit error for non-admins, or the UI would report "saved" when nothing changed.
- Nobody may INSERT into the history table directly, so the trigger function must be `security definer` with `set search_path = ''`.

## What We're NOT Doing

- History screen (S-05). This slice only writes rows, and the admin can SELECT them so S-05 has nothing to add on the DB side.
- Undo/revert of a change, a "reason" field, or per-person attribution (PRD: account and time only).
- Optimistic concurrency between two admin tabs. Last write wins, and history records both writes.
- A React island or JSON API route. The page is `.astro` with a native POST, like `/dashboard`.
- Changing the scoring formula, the six keys, or adding/removing weights.
- Locking weights during an incident. Changes apply from the next upload, as the PRD requires.

## Implementation Approach

The database owns every rule that protects ranking integrity: range and precision (CHECK), which column may change (column grant), who may write (RLS plus an explicit role check), atomicity (one UPDATE inside one function call), and history (trigger). The UI only parses Polish input, shows errors and calls the function. This keeps the security boundary testable in pgTAP and leaves the page as thin as the dashboard.

## Critical Implementation Details

- **Parse to strings, not floats.** `weights-form.ts` normalises `"2,5"` to the decimal string `"2.5"`, and the page passes those strings to the RPC. `numeric` parses them exactly, so `0,1` is stored as `0.1` and never as a binary float.
- **Format without grouping.** Use `Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2, useGrouping: false })` for pre-filled values, or `1000` renders as `1 000` and fails the parser on re-submit.
- **Post/Redirect/Get on success.** Redirect to `/admin/weights?saved=1`, so a browser refresh does not re-submit the form and write duplicate history rows.

## Phase 1: Database: range, column grant, history and atomic save

### Overview

One new migration plus a pgTAP file. After this phase the admin can already save all six weights atomically through the RPC, and every rule is covered by tests.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261005120000_weights_admin.sql`

**Intent**: Tighten `scoring_weights`, add the history table and trigger, and add the atomic save function, with RLS on every new table. Do not edit the applied F-02 migration.

**Contract**:

- `alter table public.scoring_weights add constraint scoring_weights_value_range check (value >= 0 and value <= 1000 and value = round(value, 2))`.
- `revoke update on public.scoring_weights from authenticated; grant update (value) on public.scoring_weights to authenticated;`
- `public.scoring_weight_changes`: `id bigint generated always as identity primary key`, `key text not null references public.scoring_weights(key)`, `old_value numeric not null`, `new_value numeric not null`, `account text not null` (the JWT `app_metadata.role`, never an email or user id), `changed_at timestamptz not null default now()`. RLS enabled; `revoke all` from anon and authenticated, then `grant select` to authenticated; one SELECT policy for `role = 'admin'`. No INSERT, UPDATE or DELETE grant or policy for anyone.
- Trigger function `public.log_scoring_weight_change()`: `security definer`, `set search_path = ''`, inserts one row from `old`/`new` with `account = coalesce(auth.jwt() -> 'app_metadata' ->> 'role', current_user)`, so an update without a JWT (Studio SQL editor, service role, a data-fix migration) is still recorded instead of aborting on `not null`. Attached as `after update on public.scoring_weights for each row when (old.value is distinct from new.value)`. Revoke EXECUTE from public.
- `public.update_scoring_weights(p_warning numeric, p_minor numeric, p_major numeric, p_critical numeric, p_customer numeric, p_service numeric) returns void`, `security invoker`, `set search_path = ''`. It raises `insufficient_privilege` (`42501`) unless the JWT role is `admin`, then runs one `update public.scoring_weights set value = case key when 'warning' then p_warning … end`. A CHECK violation on any value aborts the whole statement. `revoke execute … from public, anon; grant execute … to authenticated`.

#### 2. pgTAP tests

**File**: `supabase/tests/database/weights_admin.test.sql`

**Intent**: Pin every new rule so a regression fails CI. Follow the structure of `scoring_weights.test.sql` (SET ROLE plus `request.jwt.claims`, restore values instead of savepoints).

**Contract**: Assertions, each named after the rule it checks:

- CHECK rejects `-1`, `1000.01`, `'NaN'`, `'Infinity'` and `1.234` (`23514`), and accepts `0`, `1000` and `2.5`.
- Admin `update … set key = 'x'` throws `42501`.
- Admin RPC with one changed value writes exactly one history row with the right key, old and new values, and `account = 'admin'`. A call that changes nothing writes no rows. A direct update with no JWT claims (after `reset role`) succeeds and writes a history row whose `account` is the database role.
- A RPC call with one out-of-range value leaves all six weights unchanged (atomicity).
- Operator RPC throws `42501` and changes nothing; anon RPC throws `42501`.
- Admin can SELECT history; the operator sees zero rows; anon is denied. Admin and operator `insert into scoring_weight_changes` throws `42501`.
- The existing `scoring_weights.test.sql` still passes unchanged.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh DB (CI `smoke` job on the pushed branch, or `npx supabase db reset` where Docker exists)
- pgTAP suite passes (CI `smoke` job runs `supabase test db` on the pushed branch)
- Full local CI passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`

#### Manual Verification:

- The cloud project has the migration applied (`npx supabase db push`), and the six weights still read 1/5/10/15/3/1

**Implementation Note**: The user's machine has no Docker, so 1.1 and 1.2 can only be checked by pushing the branch and opening (or updating) the PR so the CI `smoke` job runs. Do that at the end of Phase 1, before starting Phase 2; the cloud push is the manual check. After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Admin weights screen

### Overview

The parser module with unit tests, the admin-only route guard, the `/admin/weights` page, a dashboard link for the admin, a smoke step, and the doc updates.

### Changes Required:

#### 1. Form parser

**File**: `src/lib/weights-form.ts`, `src/lib/weights-form.test.ts`

**Intent**: Turn six raw form strings into normalised decimal strings, or per-field Polish errors. All input rules in one pure, tested module.

**Contract**:

- `parseWeightsForm(form: FormData): { ok: true; values: Record<WeightKey, string> } | { ok: false; errors: Partial<Record<WeightKey, string>>; raw: Record<WeightKey, string> }`. Reuse the six keys from `ranking.ts` (export `WEIGHT_KEYS` there instead of duplicating them).
- Accepted: trimmed `^\d{1,4}([.,]\d{1,2})?$` with a value ≤ 1000. `,` becomes `.`. Error copy distinguishes empty, not a number / more than 2 decimals, and above 1000.
- Tests: `"2,5"` → `"2.5"`, `"2.5"` → `"2.5"`, `"0"` and `"1000"` accepted, `"1000,01"`, `"-1"`, `"1,234"`, `""`, `"abc"`, `"1e3"` and `" "` rejected with the right message, a missing field rejected.

#### 2. Admin route guard

**File**: `src/middleware.ts`

**Intent**: Only the admin reaches `/admin/*`.

**Contract**: Add `ADMIN_ROUTES = ["/admin"]`. Signed out → `/auth/signin` (same as protected routes). Signed in with `role !== "admin"` → `/dashboard`.

#### 3. Weights page

**File**: `src/pages/admin/weights.astro`

**Intent**: Show and save the six weights.

**Contract**:

- GET: `select("key, value")` from `scoring_weights`, then `parseWeights()` (fail closed with a Polish load error, as on the dashboard). Six labelled `<input inputmode="decimal">` fields in Polish (`warning`, `minor`, `major`, `critical`, plus per-customer and per-service multipliers), each with an associated `<label>` and an error bound by `aria-describedby`. A note says that changes apply from the next upload. A `role="status"` confirmation shows when `?saved=1`.
- POST: `parseWeightsForm()`. On error, re-render with the raw values and the field errors. On success call `supabase.rpc("update_scoring_weights", { p_warning, … })`. On an RPC error, show one generic Polish save error and keep the submitted values. On success, `Astro.redirect("/admin/weights?saved=1")`.
- A link back to `/dashboard`. Styling follows `dashboard.astro`; merge any conditional classes with `cn()`.

#### 4. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Give the admin a way in. The operator sees nothing new.

**Contract**: When `role === "admin"`, render a "Wagi reguły" link to `/admin/weights`.

#### 5. Smoke and docs

**Files**: `scripts/smoke.mjs`, `AGENTS.md`, `context/foundation/roadmap.md`

**Intent**: Keep the access split under the live smoke test, and record the new rules.

**Contract**:

- Smoke, operator part: add "weights screen redirects anonymous user" (`/admin/weights` → 302 `/auth/signin`) before sign-in, and "weights screen redirects operator" (→ 302 `/dashboard`) after the operator signs in. Operator credentials stay unchanged.
- Smoke, admin part (after the operator signs out; clear the cookie jar first): sign in as the seeded admin (`SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD`, defaulting to `admin@noc.local` / `Admin-Dev-Passw0rd!` from `supabase/seed.sql`), POST the form with the six defaults except `major=12` (→ 302 `/admin/weights?saved=1`), upload `major,2,5` on `/dashboard` and expect `23,0`, POST the defaults again to restore `major=10`, then sign out. This is the only automated check that the form fields reach the right `p_*` arguments (a customer↔service swap passes every other test). Against a cloud project it writes two real history rows.
- AGENTS.md domain rules: weights are numbers from 0 to 1000 with at most 2 decimals, enforced by a DB CHECK; saves go through `update_scoring_weights()`; history rows are written by a trigger, never by app code. Tripwires: extend the smoke/seed sync rule to the admin credentials.

### Success Criteria:

#### Automated Verification:

- Parser unit tests pass: `npm test`
- Full local CI passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`
- CI `smoke` job passes on the PR, including the new weights-screen redirect and admin save steps

#### Manual Verification:

- The admin changes `major` from 10 to 12, sees the confirmation, and a re-upload of `major,2,5` now scores 23,0
- Entering `2,5`, `1000,01`, an empty field and `abc` shows the right per-field messages and saves nothing
- The operator opening `/admin/weights` lands on `/dashboard` and sees no weights link there
- One history row exists per changed weight after a save (checked in Supabase Studio)
- The form is usable by keyboard alone, and errors are announced next to their fields

**Implementation Note**: After automated verification passes, pause for manual confirmation from the human.

---

## Testing Strategy

### Unit Tests:

- `weights-form.test.ts`: comma/dot, boundaries 0 and 1000, too many decimals, empty, non-numeric, scientific notation, missing fields.

### Integration Tests:

- pgTAP `weights_admin.test.sql`: CHECK bounds, column grant, RPC role gate and atomicity, trigger output, history RLS.
- Smoke: anonymous and operator redirects from `/admin/weights`; admin saves `major=12`, an upload of `major,2,5` scores `23,0`, then the defaults are restored.

### Manual Testing Steps:

1. Sign in as admin, open the dashboard, follow "Wagi reguły".
2. Change `major` to `12`, save, then upload a CSV with `major,2,5`. Expect `23,0`.
3. Submit `1000,01` and expect a per-field error with all values kept.
4. Restore `major` to `10`.
5. Sign in as operator and open `/admin/weights`. Expect a redirect to `/dashboard`.

## Performance Considerations

None. Six rows, one statement per save.

## Migration Notes

The CHECK is added to a table that holds only the six PRD defaults, all in range, so it applies without a data fix. The cloud project needs `npx supabase db push` before deploying Phase 2.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-04)
- Prior plan: `context/changes/persisted-weights/plan.md`
- Required DB fixes: `context/changes/persisted-weights/reviews/impl-review.md:72-90`
- Page pattern: `src/pages/dashboard.astro`
- Test pattern: `supabase/tests/database/scoring_weights.test.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database: range, column grant, history and atomic save

#### Automated

- [ ] 1.1 Migration applies on a fresh DB (CI `smoke` job on the pushed branch, or `npx supabase db reset` where Docker exists)
- [ ] 1.2 pgTAP suite passes (CI `smoke` job runs `supabase test db` on the pushed branch)
- [x] 1.3 Full local CI passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build` — 11df301

#### Manual

- [ ] 1.4 The cloud project has the migration applied (`npx supabase db push`), and the six weights still read 1/5/10/15/3/1

### Phase 2: Admin weights screen

#### Automated

- [ ] 2.1 Parser unit tests pass: `npm test`
- [ ] 2.2 Full local CI passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`
- [ ] 2.3 CI `smoke` job passes on the PR, including the new weights-screen redirect and admin save steps

#### Manual

- [ ] 2.4 The admin changes `major` from 10 to 12, sees the confirmation, and a re-upload of `major,2,5` now scores 23,0
- [ ] 2.5 Entering `2,5`, `1000,01`, an empty field and `abc` shows the right per-field messages and saves nothing
- [ ] 2.6 The operator opening `/admin/weights` lands on `/dashboard` and sees no weights link there
- [ ] 2.7 One history row exists per changed weight after a save (checked in Supabase Studio)
- [ ] 2.8 The form is usable by keyboard alone, and errors are announced next to their fields
