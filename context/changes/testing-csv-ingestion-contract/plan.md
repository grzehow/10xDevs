# CSV Ingestion Contract Tests Implementation Plan

## Overview

Rollout Phase 1 of `context/foundation/test-plan.md` covers risks #1 (partial acceptance), #3 (customers/services transposition) and #6 (hostile input). The work fills the parser fixture gaps, moves the upload handling out of `dashboard.astro` so `node:test` can reach its guards, and adds two smoke steps for the rules that only exist in the template.

## Current State Analysis

From `research.md`:

- All CSV rules live in `rankTickets` (`src/lib/ranking.ts:42-76`). The row loop is all-or-nothing: each check returns `{ ok: false }` early (`:52,54,55`).
- The upload is a native form POST to `/dashboard`. The size, body and `File` guards sit in the frontmatter function `rankUpload` (`src/pages/dashboard.astro:17-36`), which no test reaches.
- Of the 15 rejected fixtures (`src/lib/ranking.test.ts:79-99`), 3 are file-level, 11 have the bad row as the only data row, and 1 (duplicate id) has a second row.
- Risk #3 is covered at unit level by the asymmetric PRD test (`ranking.test.ts:16-32`). The smoke upload uses symmetric counts `1,1` (`scripts/smoke.mjs:111`), so a customers/services swap in the template (`dashboard.astro:88-95`) goes undetected.
- Error rendering: `<p role="alert">` vs `<ol>`, mutually exclusive (`dashboard.astro:65-70`). Named-problem messages are S-03 and out of scope.

## Desired End State

- `npm test` fails if any invalid row placed after valid rows is skipped instead of rejecting the file.
- `npm test` fails if any non-ASCII-digit, signed, exponent or hex count, prototype-key severity, or quoted severity/count is scored.
- `npm test` fails if any upload guard (Content-Length, broken body, missing/non-file field, oversized file) lets the file through. It also fails if a rejected file reaches the weights loader.
- `npm run smoke` fails if a bad file renders any ticket, or if the rendered customers and services lines are swapped.
- Test-plan §6.2 tells the next contributor where to add a rejection or mapping test.

### Key Discoveries:

- `src/lib/weights-form.ts:1` imports a sibling as `./ranking.ts`. Use the same `.ts`-suffixed relative import so `node --test` type stripping resolves it. `@/` aliases don't resolve under plain Node.
- Cells are trimmed before validation (`ranking.ts:46`), so `" 1"` is valid. Whitespace is not a hostile-count case.
- Quotes are not stripped. `"major"` and `"2"` are rejected, but a quoted ticket id like `"T1"` is a valid non-empty id and is accepted (`ranking.ts:54`). Assert only quoted severity and counts as rejected.
- A Node `Request` built with a `FormData` body does not reliably expose `content-length` in `headers`. The Content-Length guard test must set the header explicitly.

## What We're NOT Doing

- Per-case error messages or reason codes in `rankTickets` (S-03, roadmap `csv-error-messages`).
- Asserting Polish copy. Tests assert `role="alert"` presence, list absence and error kind.
- Oversized-file smoke steps. The unit tests cover the guards, and a 1 MiB+ upload per CI run adds cost without new signal.
- Testing chunked requests without Content-Length against the Workers body limit. That's platform behaviour (research, risk #6 inference).
- Astro container API, a new test runner, or Playwright.
- Header-by-name parsing or quoted-field support. The format is fixed (`csv-upload-ranked-list/plan.md:32`).

## Implementation Approach

Two phases. Phase 1 is everything `npm test` can prove: new fixtures in the existing parser suite, plus `rankUpload` moved into `src/lib/upload.ts` with its own suite. The page keeps only the Polish copy and rendering. Phase 2 adds the two template-only assertions to the live smoke and records the patterns in the test plan.

Oracle rule (test-plan §1): expected scores are hand-derived from the PRD formula with the default weights, never computed by calling the code under test.

## Phase 1: Unit coverage and extracting upload handling

### Overview

Close the parser fixture gaps and move upload handling into a pure, testable module without changing behaviour.

### Changes Required:

#### 1. Parser fixtures: invalid row after valid rows (risk #1)

**File**: `src/lib/ranking.test.ts`

**Intent**: Add a test where each invalid row kind follows one or more valid rows, so a `return` → `continue` regression in the row loop fails instead of returning a shorter list. Add a blank line between two valid rows.

**Contract**: Each fixture asserts `deepEqual(rankTickets(text, W), { ok: false })`. Use the existing `csv()` helper and `W`. Cases (valid rows first, bad row last or in the middle):

- 3 cells, 5 cells
- unknown severity
- negative count, empty count
- empty ticket id
- bad row in the middle: `A,minor,0,0` / `B,urgent,0,0` / `C,minor,0,0`
- blank middle line: `T1,minor,0,0\n\nT2,minor,0,0`

- Behavior asserted: one invalid row anywhere rejects the whole file.
- Regression caught: skipping bad rows (likely when S-03 adds per-row reasons).
- Research source: research.md risk #1 gap; `ranking.ts:51-67`.
- Edge case: bad row in the middle and blank middle line.
- Anti-pattern avoided: single-row-only fixtures.

#### 2. Parser fixtures: hostile values (risk #6)

**File**: `src/lib/ranking.test.ts`

**Intent**: Extend the rejected-input coverage with the forms research found untested. Each one is a single row after a valid row.

**Contract**: Each asserts `{ ok: false }`.

- Counts: `abc`, `+1`, `1e3`, `0x10`, `١` (Arabic-Indic digit), `"2"` (quoted).
- Severity: `constructor`, `__proto__`, `toString`, `hasOwnProperty`, `"major"` (quoted).

- Behavior asserted: only 1–9 ASCII digits are accepted as counts, and only the four literal severities (own keys).
- Regression caught: `Number()`/`parseInt` replacing the regex, adding a `u` flag that turns `\d` Unicode-aware, `in` replacing `Object.hasOwn`, or quote stripping added without a decision.
- Research source: research.md risk #6 table.
- Edge case: prototype keys and non-ASCII digits.
- Anti-pattern avoided: relying on DB CHECKs (they cover weights only).

#### 3. Asymmetric mapping with non-default weights (risk #3)

**File**: `src/lib/ranking.test.ts`

**Intent**: Add one test where customers ≠ services and the `customer` and `service` weights differ from the defaults, asserting the hand-derived points. This rules out a constants fallback masking a swap.

**Contract**: Weights `{ ..., major: 10, customer: 4, service: 0.5 }`, row `T1,major,2,5`. Expected points `{ severity: 10, customers: 8, services: 2.5 }` and score `20.5`. Swapped, it would be `10 + 20 + 1 = 31`.

- Behavior asserted: column 3 multiplies by `customer` and column 4 by `service`.
- Regression caught: positional or weight swap.
- Research source: research.md risk #3; `ranking.ts:53,61-62`.
- Edge case: non-integer result.
- Anti-pattern avoided: equal counts, default weights only.

#### 4. Move upload handling into `src/lib/upload.ts`

**File**: `src/lib/upload.ts` (new), `src/pages/dashboard.astro`

**Intent**: Move the body of the frontmatter `rankUpload` into a pure function so its guards are unit-testable. The page keeps the Polish strings and maps the error kind to them. Behaviour, check order and limits stay identical.

**Contract**:

- `export async function rankUpload(request: Request, loadWeights: () => Promise<Weights | null>): Promise<{ error: "file" | "weights" } | { tickets: RankedTicket[]; weights: Weights }>`
- Check order, unchanged from `dashboard.astro:19-35`: Content-Length > `MAX_BYTES + 65_536` → `formData()` try/catch → `file` must be a `File` with `size <= MAX_BYTES` → `loadWeights()` (null → `"weights"`) → `rankTickets`.
- `loadWeights` is called only after the file guards pass, so a rejected file never reaches the DB.
- The page builds `loadWeights` from `createClient` and `parseWeights`, null-checking the client (AGENTS.md). It maps `"file"` → `FILE_ERROR` and `"weights"` → `WEIGHTS_ERROR`. Move the `TODO(S-03)` comment so it stays next to `FILE_ERROR`.
- Import siblings as `./ranking.ts` (as in `weights-form.ts:1`).

#### 5. Upload handling tests

**File**: `src/lib/upload.test.ts` (new)

**Intent**: Prove each guard rejects the upload as `"file"` and never calls the weights loader. Also prove the happy path and a valid-then-invalid file end to end through the function.

**Contract**: Build requests with Node's `Request`, `FormData` and `File`. Use a loader stub that counts calls and returns `W`. Cases:

- `content-length` header set to `MAX_BYTES + 65_537` with a small body → `{ error: "file" }`, loader calls 0.
- Non-multipart body (`text/plain` "hello") → `"file"`, 0 calls.
- Multipart without a `file` field → `"file"`, 0 calls.
- `file` field as a string → `"file"`, 0 calls.
- `File` of `MAX_BYTES + 1` bytes, no explicit content-length → `"file"`, 0 calls.
- `File` of exactly `MAX_BYTES` bytes: passes the size guard (boundary). It's an invalid CSV, so expect `"file"` but loader calls 1.
- Loader returns null → `{ error: "weights" }`.
- Valid then invalid row (`T1,major,2,5` / `T2,urgent,0,0`) → `"file"`.
- Asymmetric valid file `T1,major,2,5` → tickets with score 21 and points `{10, 6, 5}`.

- Behavior asserted: hostile or oversized uploads are rejected server-side before scoring or any DB read.
- Regression caught: reordering guards, dropping the size check, scoring a partial file.
- Research source: research.md risk #6 table (page-level rows); `dashboard.astro:19-35`.
- Edge case: exact `MAX_BYTES` boundary.
- Anti-pattern avoided: client-only validation tests; asserting Polish copy.

### Success Criteria:

#### Automated Verification:

- New parser fixtures pass: `npm test`
- Upload handling tests pass: `npm test`
- Mutation check: temporarily change `return { ok: false }` at `ranking.ts:54` to `continue`, confirm `npm test` fails, then revert
- Full local CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`

#### Manual Verification:

- `dashboard.astro` frontmatter contains no guard logic, only the loader, the error-kind → copy mapping and render data

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Smoke assertions for render rules and test-plan cookbook

### Overview

Prove the two template-only rules on the real runtime and record the shipped patterns in the test plan.

### Changes Required:

#### 1. Smoke step: a bad file renders no list (risk #1)

**File**: `scripts/smoke.mjs`

**Intent**: In the operator section, after "dashboard ranks uploaded csv", add a step that uploads a valid row followed by an invalid one. Assert the page shows an alert and no ticket.

**Contract**: Step name `dashboard rejects file with a bad row`. CSV `header\nSMOKE-OK,minor,0,0\nSMOKE-BAD,urgent,0,0\n`. Expect status 200. `bodyCheck`: `text.includes('role="alert"')` and `!text.includes("data-ticket-id=")`.

- Behavior asserted: no partial list is rendered.
- Regression caught: the template rendering `ranked` alongside `error`, or partial acceptance anywhere in the path.
- Research source: research.md risk #1; `dashboard.astro:65-70`.
- Anti-pattern avoided: asserting the Polish copy.

#### 2. Smoke step: asymmetric component lines (risk #3)

**File**: `scripts/smoke.mjs`

**Intent**: Add an operator step uploading `SMOKE-ASYM,major,2,5`. Assert the rendered customers and services lines carry the right counts.

**Contract**: Assumes the PRD default weights, the same assumption the existing `19,0` step makes (`smoke.mjs:118-127`). `bodyCheck`: `text.includes("21,0")`, `/2 × 3,0 =\s*6,0/` and `/5 × 1,0 =\s*5,0/`. Swapped counts would render `5 × 3,0` and `2 × 1,0`.

- Behavior asserted: rendered breakdown maps customers to column 3 and services to column 4.
- Regression caught: `t.customers`/`t.services` swapped in `dashboard.astro:88-95`.
- Research source: research.md risk #3 render gap.
- Anti-pattern avoided: the symmetric `1,1` fixture.

#### 3. Test-plan cookbook and gate wording

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 TBD with the shipped patterns. Append Phase 1 notes to §6.5. Rename the §5 gate row from "upload API integration" to the upload POST. Set §3 Phase 1 status to `complete` only after Progress is fully checked.

**Contract**: §6.2 covers:

- Where rejection fixtures go (`ranking.test.ts`, valid rows first).
- Where guard tests go (`upload.test.ts`, loader-call counting).
- Where render rules go (`smoke.mjs`, alert and no `data-ticket-id`).
- The rule: always asymmetric counts with non-default weights for mapping.
- Run commands.

§6.5 gets a dated Phase 1 note. No new sections.

### Success Criteria:

#### Automated Verification:

- Smoke script still parses: `node --check scripts/smoke.mjs`
- Full local CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`
- CI `smoke` job is green on the PR, including the two new steps

#### Manual Verification:

- test-plan §6.2 reads as a usable recipe for someone who hasn't seen this change

---

## Testing Strategy

### Unit Tests:

- `ranking.test.ts`: invalid rows after valid rows, hostile counts and severities, asymmetric mapping with non-default weights.
- `upload.test.ts`: each guard → `"file"` with zero loader calls, the size boundary, weights failure, end-to-end partial and asymmetric files.

### Integration Tests:

- `scripts/smoke.mjs`: the bad file renders an alert and no list; the asymmetric breakdown lines render correctly.

### Manual Testing Steps:

1. Locally, smoke needs the cloud project (no Docker): `npm run build && npm run preview`, then `BASE_URL=http://localhost:4321 SMOKE_EMAIL=… SMOKE_PASSWORD=… SMOKE_ADMIN_EMAIL=… SMOKE_ADMIN_PASSWORD=… npm run smoke`. Optional, since CI runs it.

## References

- Research: `context/changes/testing-csv-ingestion-contract/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (#1, #3, #6), §6
- Prior design: `context/changes/csv-upload-ranked-list/plan.md:28-42`
- Sibling import pattern: `src/lib/weights-form.ts:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Unit coverage and extracting upload handling

#### Automated

- [x] 1.1 New parser fixtures pass: `npm test`
- [x] 1.2 Upload handling tests pass: `npm test`
- [x] 1.3 Mutation check: temporarily change `return { ok: false }` at `ranking.ts:54` to `continue`, confirm `npm test` fails, then revert
- [x] 1.4 Full local CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`

#### Manual

- [x] 1.5 `dashboard.astro` frontmatter contains no guard logic, only the loader, the error-kind → copy mapping and render data

### Phase 2: Smoke assertions for render rules and test-plan cookbook

#### Automated

- [ ] 2.1 Smoke script still parses: `node --check scripts/smoke.mjs`
- [ ] 2.2 Full local CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`
- [ ] 2.3 CI `smoke` job is green on the PR, including the two new steps

#### Manual

- [ ] 2.4 test-plan §6.2 reads as a usable recipe for someone who hasn't seen this change
