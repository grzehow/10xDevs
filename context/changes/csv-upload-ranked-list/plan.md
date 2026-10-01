# CSV Upload and Ranked List Implementation Plan

## Overview

S-01, the north star: a signed-in operator uploads a CSV of tickets on `/dashboard` and sees them ranked by descending priority, with the score and rank on every row. Scoring uses the six weights from `public.scoring_weights` (F-02) and never falls back to constants in code. The work is a pure ranking module with its own `node:test` suite, plus the upload form and ranked list on `/dashboard`.

## Current State Analysis

- `/dashboard` (`src/pages/dashboard.astro`) is a placeholder that shows the account label and a sign-out form. It is protected by `PROTECTED_ROUTES` (`src/middleware.ts:4`), and `Astro.locals.role` is `"operator" | "admin"` (`src/env.d.ts`).
- `public.scoring_weights` holds six rows (`warning, minor, major, critical, customer, service`), readable by both roles through RLS (`supabase/migrations/20260929120000_scoring_weights.sql`). F-02 settled the consumer contract: S-01 calls `supabase.from("scoring_weights").select("key, value")` itself and fails closed unless it gets all six keys (`context/changes/persisted-weights/plan.md:36`).
- `createClient()` returns `null` when env vars are missing (`src/lib/supabase.ts:6`), so the page must handle a null client.
- There is no CSV parser, no unit test runner and no `test` script. CI runs Node 22 (`.github/workflows/ci.yml:16`). Node 22.18+ strips TypeScript types natively, and `tsconfig` already allows `.ts` import extensions (`astro/tsconfigs/base.json:10`), so `node --test` can run `.ts` tests with no test framework. The only package change is pinning `@types/node`, which is currently present only transitively.
- The PRD fixes the formula and the first tie-break: `score = severity_weight + customer_weight × customers + service_weight × services`, and higher severity wins a tie. Worked example: `major, 2, 5 = 21.0`.

## Desired End State

An operator (or the admin) on `/dashboard` picks a `.csv` file and submits. The page reloads with the tickets listed by score (highest first), then severity (highest first), then `ticket_id` ascending. Each row shows rank, `ticket_id` and score, and nothing else. Uploading the same file again with unchanged weights renders byte-identical list markup. A bad file, or weights that can't be loaded, shows one Polish error message and no list, and the upload form stays available. Nothing about the upload is persisted.

### Key Discoveries:

- The F-02 fail-closed contract rules out an empty RLS result being read as "no weights" and scored as zero (`context/changes/persisted-weights/plan.md:36`).
- Middleware already turns a user without a role into a signed-out user, so the page only ever sees `operator` or `admin` (`src/middleware.ts:17`).
- `scripts/smoke.mjs` signs in as the seeded operator and has no multipart support yet (`scripts/smoke.mjs:24`).
- AGENTS.md and `.claude/skills/verify/SKILL.md` both say there is no `test` script. Both must be updated once one exists (`AGENTS.md:7`, `AGENTS.md:15`).

## What We're NOT Doing

- Per-case error messages (missing column, empty cell, wrong separator, unknown severity). That's S-03. S-01 rejects the whole file with one generic message.
- Expanding a row to show the three score components. That's S-02. The list stays terse: rank, id, score.
- A weights screen or history (S-04, S-05).
- Persisting uploads, keeping the list across sessions, or any action on tickets.
- A header-by-name parser, a headerless or positional mode, or quoted CSV fields. The format is fixed.
- A React island or a JSON API route. The page is `.astro` with a native form POST.
- Scoring in SQL, or a TS weights loader shared with S-04 (YAGNI until S-04 needs one).

## Implementation Approach

Keep every decision in one pure, framework-free module, `src/lib/ranking.ts`, so the risky rules (column order, ties, validation, determinism) are unit-tested without a server or Supabase. `/dashboard` then only moves data around: read the form, load the weights, call the module, render. A plain form POST back to the same page avoids an API route and client state for a list that is shown once and thrown away.

## Critical Implementation Details

- **Excel-style input.** Real exports often start with a UTF-8 BOM and use CRLF line endings. Strip a leading `﻿`, split on `\r?\n`, trim every cell, and ignore trailing empty lines before comparing the header. If you skip this, a valid file fails the exact-header check and shows up as a "bad file".
- **Tests and ESLint.** `node:test`'s `test()` returns a promise, and `strictTypeChecked` flags it as floating. Write tests so no promise floats (for example `void test(...)`, or top-level `await`), rather than disabling the rule.
- **Erasable TS only in `ranking.ts`.** Node's type stripping rejects `enum`, `namespace` and parameter properties. Use string unions and `as const` objects.

## Phase 1: Ranking core

### Overview

A pure module that parses, validates, scores and sorts, with a `node:test` suite, a `test` script and a CI step.

### Changes Required:

#### 1. Ranking module

**File**: `src/lib/ranking.ts`

**Intent**: Turn CSV text plus weights into a ranked list, or a single failure. This module holds every scoring and ordering rule.

**Contract**:

- `type Severity = "warning" | "minor" | "major" | "critical"` and a severity order (`critical` highest), used for ties.
- `type Weights = Record<Severity | "customer" | "service", number>`.
- `parseWeights(rows: { key: string; value: unknown }[]): Weights | null` returns `null` unless there are exactly the six known keys, each with a finite number (numeric values may arrive as numbers or numeric strings, so both are accepted when finite). This is the F-02 fail-closed rule.
- `rankTickets(csv: string, weights: Weights): { ok: true; tickets: RankedTicket[] } | { ok: false }`, where `RankedTicket = { rank: number; ticketId: string; severity: Severity; customers: number; services: number; score: number }`. The components are returned now so S-02 can show them without touching this module.
- Validation (any failure rejects the whole file, `{ ok: false }`):
  - Header, after BOM strip and cell trim, is exactly `ticket_id,severity,number_of_customers,number_of_services`.
  - At least 1 and at most 1000 data rows.
  - Every row has exactly 4 cells, split on `,`.
  - `ticket_id` is non-empty and unique within the file.
  - `severity` is exactly one of the four lowercase values.
  - Both counts match `^\d+$` (non-negative integers).
- Score: `weights[severity] + weights.customer × customers + weights.service × services`.
- Sort: score desc, compared as `Math.round(score * 1e9)`. This way, float sums that are equal on paper (e.g. `0.1+0.1+0.1` vs `0.3`, once S-04 allows fractional weights) still reach the severity tie-break. The displayed `score` stays unrounded. Then severity rank desc, then `ticket_id` ascending by code-unit comparison (`a < b`, not `localeCompare`, so the order doesn't depend on locale). Ranks are 1..n with no shared ranks.
- Export the limits (`MAX_ROWS = 1000`, `MAX_BYTES = 1_048_576`) so the page and the tests use the same numbers.

#### 2. Tests

**File**: `src/lib/ranking.test.ts`

**Intent**: Pin every rule that would silently change a ranking if it regressed.

**Contract**: `node:test` + `node:assert/strict`, importing `./ranking.ts`. Cases:

- The PRD example: `major, 2, 5` scores `21` with the default weights.
- Customers vs services: the file `T1,minor,1,0` / `T2,minor,0,1` ranks T1 first (5+3=8 vs 5+1=6).
- A header with the two count columns swapped is rejected.
- Equal scores go to higher severity. Build the tie by hand: `major,0,5` = 15 vs `critical,0,0` = 15, so critical ranks first.
- Equal score and severity go to `ticket_id` ascending, independent of row order in the file.
- Rejects: an empty file, a header-only file, 1001 rows, a duplicate `ticket_id`, an unknown or uppercase severity, a negative or decimal or empty count, a row with 3 or 5 cells, and a semicolon-separated file.
- Accepts: a BOM, CRLF line endings, a trailing newline and whitespace around cells.
- Determinism: two runs over the same input `deepStrictEqual`, and a shuffled copy of the rows gives the same result.
- `parseWeights`: 6 valid rows → weights; 5 rows, an unknown key, or a non-finite value → `null`.

#### 3. Test script and CI

**File**: `package.json`, `package-lock.json`, `.github/workflows/ci.yml`

**Intent**: Make the suite runnable locally and required in CI.

**Contract**: add `"test": "node --test \"src/**/*.test.ts\""`. The glob is quoted so Node expands it on every OS. Unquoted, Linux `sh` reads `**` as `*` and misses nested files. Also add `@types/node` as a pinned devDependency (exact version, matching the installed 24.x), so the `node:test` types don't depend on a transitive package. In the `ci` job, add `- run: npm test` after `npm run lint`.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including every case listed above
- `npx astro sync && npm run lint && npx astro check && npm run build` passes

**Implementation Note**: After automated verification passes, continue to Phase 2. This phase has no manual checks.

---

## Phase 2: Upload and ranked list on `/dashboard`

### Overview

Wire the module into the dashboard: the form POST, the weights read, rendering, the error states, a smoke step and doc updates.

### Changes Required:

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: On POST, read the uploaded file, load the weights through the session's Supabase client, rank, and render. On GET, render just the form. Keep the account label and sign-out form.

**Contract**:

- `<form method="POST" enctype="multipart/form-data">` with `<input type="file" name="file" accept=".csv,text/csv" required>` and a labelled submit button (Polish copy, e.g. "Wgraj plik CSV" / "Uszereguj").
- POST flow, in order, where any failure sets one error state and renders no list:
  1. Wrap `await Astro.request.formData()` in try/catch, because an empty or non-form body throws and would render a 500. A failure shows the file error. Then `formData.get("file")` must be a `File` with `size` ≤ `MAX_BYTES`. Check this before calling `.text()`.
  2. `createClient(...)` must be non-null, and `from("scoring_weights").select("key, value")` must return no error and pass `parseWeights`. Otherwise show the weights error.
  3. `rankTickets(text, weights)`. On `{ ok: false }`, show the file error.
- Two Polish messages, kept together as constants in the page:
  - File: `Nie udało się przetworzyć pliku. Sprawdź, czy ma nagłówek ticket_id,severity,number_of_customers,number_of_services i poprawne wartości.`
  - Weights: `Nie udało się wczytać wag reguły. Spróbuj ponownie za chwilę.`

  Render the error with `role="alert"`.

- The list is an `<ol>` of rank, `ticket_id` and score. Format the score with a fixed formatter (`Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 2 })`), so `21` renders as `21,0` and the output is deterministic. Add `data-ticket-id` on each item for smoke.
- Return status 200 in every POST case. The error is page content, not an HTTP failure, which keeps smoke and the re-upload flow simple.
- Use `cn()` for any conditional classes. Keep the existing page styling. No React.

#### 2. Smoke step

**File**: `scripts/smoke.mjs`, `eslint.config.js`

**Intent**: Prove the whole path (session → RLS weights read → ranking → render) against a live server in CI.

**Contract**: extend `request()` to accept a `multipart` `FormData` body (let `fetch` set the boundary) and return the response text. Add one step after "dashboard renders for signed-in user": POST `/dashboard` with a 2-row CSV where the second row outranks the first (e.g. `SMOKE-LOW,warning,0,0` then `SMOKE-HIGH,critical,1,1`). Expect 200 and a body where `data-ticket-id="SMOKE-HIGH"` appears before `data-ticket-id="SMOKE-LOW"`. Keep the existing seeded-operator defaults unchanged. In `eslint.config.js`, add `FormData: true` and `Blob: true` to the `scriptsConfig` globals, or lint fails with `no-undef`.

#### 3. Docs

**File**: `AGENTS.md`, `.claude/skills/verify/SKILL.md`, `README.md`

**Intent**: Stop telling agents there is no test script.

**Contract**:

- AGENTS.md "Verify before claiming done": the sequence becomes `npx astro sync && npm run lint && npm test && npx astro check && npm run build`, with a note that `npm test` runs `node:test` over `src/**/*.test.ts` using Node's built-in type stripping (Node ≥ 22.18). Drop "There is no unit test suite yet".
- Add `npm test` to the verify skill's standard run.
- Add `npm test` to the README scripts list.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint && npm test && npx astro check && npm run build` passes
- CI `ci` and `smoke` jobs pass on the PR, including the new upload step

#### Manual Verification:

- Signed in as the operator against the cloud project, uploading a CSV with the PRD example row (`major,2,5`) shows score `21,0`, and the list is ordered by score, then severity, then `ticket_id`
- Uploading the same file twice gives an identical list
- A file with swapped count columns, a duplicate `ticket_id`, or a semicolon separator shows the Polish file error with no list, and uploading a correct file right after works without signing in again
- The list shows only rank, id and score; there are no ticket actions anywhere

**Implementation Note**: After automated verification passes, pause for the human to confirm the manual checks.

---

## Testing Strategy

### Unit Tests:

- `src/lib/ranking.test.ts` covers the formula, column order, all three tie-break levels, every rejection case, input normalization, determinism and `parseWeights`.

### Integration Tests:

- The smoke upload step covers session → RLS read → ranking → HTML in CI against local Supabase.

### Manual Testing Steps:

1. Sign in as the operator, upload a valid file, and check the order and scores by hand against the formula.
2. Upload the same file again and compare.
3. Upload each broken variant, then upload a valid file.

## Performance Considerations

The workload is at most 1000 rows, parsed and sorted in memory: O(n log n), well under the NFR's 3 s for 200 rows. There is one weights query per upload and no caching, because weights must apply from the next upload onward.

## Migration Notes

None. There's no schema change. The cloud project already needs F-02's migration (`npx supabase db push`) before this deploys.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (US-01, FR-002–FR-004, `## Business Logic`, NFRs)
- Weights contract: `context/changes/persisted-weights/plan.md:36`
- Weights table and RLS: `supabase/migrations/20260929120000_scoring_weights.sql`
- Middleware and roles: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Ranking core

#### Automated

- [x] 1.1 `npm test` passes, including every case listed above — d4976b8
- [x] 1.2 `npx astro sync && npm run lint && npx astro check && npm run build` passes — d4976b8

### Phase 2: Upload and ranked list on `/dashboard`

#### Automated

- [x] 2.1 `npx astro sync && npm run lint && npm test && npx astro check && npm run build` passes
- [ ] 2.2 CI `ci` and `smoke` jobs pass on the PR, including the new upload step

#### Manual

- [x] 2.3 Signed in as the operator against the cloud project, uploading a CSV with the PRD example row (`major,2,5`) shows score `21,0`, and the list is ordered by score, then severity, then `ticket_id`
- [x] 2.4 Uploading the same file twice gives an identical list
- [x] 2.5 A file with swapped count columns, a duplicate `ticket_id`, or a semicolon separator shows the Polish file error with no list, and uploading a correct file right after works without signing in again
- [x] 2.6 The list shows only rank, id and score; there are no ticket actions anywhere
