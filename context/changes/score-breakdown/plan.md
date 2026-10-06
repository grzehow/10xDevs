# Score breakdown Implementation Plan

## Overview

Roadmap S-02 (US-01, FR-005): the operator can expand any row of the ranked list and see the three components of its score. Each one is shown as value × weight = points. The collapsed list stays terse: rank, id, score.

## Current State Analysis

- `rankTickets` computes `score = weights[severity] + weights.customer * customers + weights.service * services` inline and returns `RankedTicket { rank, ticketId, severity, customers, services, score }`. Component points are not kept (`src/lib/ranking.ts:57`).
- `dashboard.astro` renders the ranked list as a server-rendered `<ol>`, one `<li data-ticket-id>` per ticket with rank, id and score (`src/pages/dashboard.astro:70-80`). The weights are loaded inside `rankUpload()` but are not returned to the template (`src/pages/dashboard.astro:29-35`).
- Scores are formatted with `scoreFormat` (pl-PL, 1–2 fraction digits) (`src/pages/dashboard.astro:12`).
- The smoke test finds rows by `data-ticket-id="SMOKE-HIGH"` / `"SMOKE-LOW"` and checks for `19,0` (`scripts/smoke.mjs:75-79`).

## Desired End State

After an upload, each row is a native disclosure. Collapsed, it shows `rank. ticket_id score`. Expanded, it shows:

- `Krytyczność: major = 10,0`. Severity has no multiplier, so its weight is its points.
- `Klienci: 2 × 3,0 = 6,0`
- `Usługi: 5 × 1,0 = 5,0`

For the PRD example (major, 2 customers, 5 services) the three components add up to the displayed `21,0`.

### Key Discoveries:

- The `data-ticket-id` attribute on the row element is part of the smoke contract (`scripts/smoke.mjs:76`). Keep it on the `<li>`.
- Ordering and ties use `key = Math.round(score * 1e9)` (`src/lib/ranking.ts:58`). The score must still be computed as exactly the same float sum, or tie behaviour changes.
- The operator is allowed to see the weight values: "Operator zna wartości wag pośrednio: rozwinięta pozycja pokazuje trzy składniki wyniku" (`context/foundation/prd.md:285`).

## What We're NOT Doing

- No React island, no client-side script. Expansion uses native `<details>`/`<summary>`.
- No "expand all" control, no remembering which rows are open.
- No Playwright setup. Browser verification stays manual.
- No change to the CSV format, scoring formula, ordering or error messages (S-03 owns the messages).
- No visual redesign of the dashboard beyond what the disclosure needs.
- No precision beyond 2 decimals in the breakdown. `scoreFormat` caps at 2 fraction digits, so with weights of 3+ decimals (possible once S-04 lands) the rounded lines can miss the shown total by 0,01. The defaults are unaffected. S-04 can constrain weight precision if that matters.

## Implementation Approach

Put the component points in the domain function, where the score is already computed, and unit-test them there. The template then only formats what it gets: points from the ticket, weights from `rankUpload()`.

## Critical Implementation Details

- **Score equality**: compute the three points first, then set `score` as their sum in the same order (`severity + customers + services`). That gives exactly the same float as today's inline expression, so ranking and the determinism tests stay byte-identical.

## Phase 1: Component points in the ranking

### Overview

`rankTickets` returns each ticket's three component points alongside the score.

### Changes Required:

#### 1. Ranking domain

**File**: `src/lib/ranking.ts`

**Intent**: Keep the per-component points that the score is built from, so the UI can show them without redoing the formula.

**Contract**: `RankedTicket` gains `points: { severity: number; customers: number; services: number }`, where `severity = weights[severity]`, `customers = weights.customer * customers` and `services = weights.service * services`. `score` equals `points.severity + points.customers + points.services`, summed in that order. Ordering is unchanged.

#### 2. Unit tests

**File**: `src/lib/ranking.test.ts`

**Intent**: Lock the breakdown to the PRD example and to the score.

**Contract**: Update the PRD-example `deepEqual` to include `points: { severity: 10, customers: 6, services: 5 }`. Add one test on the float-weights case that checks each point independently against the formula (`weights[severity]`, `weights.customer * customers`, `weights.service * services`), not against the sum.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro sync && npx astro check`

No manual verification: this phase has no user-visible change.

---

## Phase 2: Expandable rows on the dashboard

### Overview

Each ranked row becomes a `<details>` that shows the three components when opened.

### Changes Required:

#### 1. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Render the breakdown on demand and keep the collapsed row terse.

**Contract**:
- `rankUpload()` success variant becomes `{ tickets: RankedTicket[]; weights: Weights }`.
- Each `<li data-ticket-id={…}>` wraps a `<details>`. Its `<summary>` holds rank, id and score, as today.
- The body lists three lines, labelled in Polish:
  - `Krytyczność: <severity> = <points>`
  - `Klienci: <customers> × <customer weight> = <points>`
  - `Usługi: <services> × <service weight> = <points>`
- Weights and points use `scoreFormat`. Counts are plain integers.
- Each line carries `data-component="severity|customers|services"` as a stable hook for the smoke test.
- The summary shows a visible open/closed indicator: a `▸` glyph with `aria-hidden="true"`, rotated via `group-open:rotate-90` on `<details class="group">`, plus `cursor-pointer`. A flex `<summary>` loses the native triangle, so this indicator is the only cue that the row expands.
- Classes are merged with `cn()` where they are conditional, and the disclosure stays keyboard-operable (native).

#### 2. Smoke check

**File**: `scripts/smoke.mjs`

**Intent**: Catch the breakdown disappearing from the rendered page.

**Contract**: Extend the "dashboard ranks uploaded csv" `bodyCheck` so it also requires `<details`, all three `data-component` hooks, and `3,0`. For SMOKE-HIGH (critical, 1, 1) with default weights the customers line is `1 × 3,0 = 3,0`.

### Success Criteria:

#### Automated Verification:

- Full CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build`
- Smoke passes against a running server and Supabase: `npm run smoke`

#### Manual Verification:

- After uploading a CSV containing `T1,major,2,5`, the collapsed list shows only rank, id, score and a visible expand indicator.
- Expanding T1 shows `Krytyczność: major = 10,0`, `Klienci: 2 × 3,0 = 6,0`, `Usługi: 5 × 1,0 = 5,0`, with score `21,0`.
- A row can be opened and closed with the keyboard (Tab, then Enter/Space).

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual checks.

---

## Testing Strategy

### Unit Tests:

- The PRD example yields points 10 / 6 / 5.
- Points sum to the score for every ticket, including the float-weights case.

### Integration Tests:

- Smoke: the uploaded CSV renders `<details>` rows with all three component hooks and the expected customers points.

### Manual Testing Steps:

1. Sign in as operator and upload a CSV with `T1,major,2,5`.
2. Confirm the collapsed rows are terse, then expand T1 and check the three lines and the total.
3. Toggle a row with the keyboard.

## Performance Considerations

None. At most 1000 rows, all rendered on the server. Collapsed details cost nothing at runtime.

## Migration Notes

None. No schema or data change.

## References

- Roadmap: `context/foundation/roadmap.md` S-02
- PRD: `context/foundation/prd.md:164` (FR-005), `:285`
- Ranking: `src/lib/ranking.ts:57`
- Dashboard list: `src/pages/dashboard.astro:70-80`
- Smoke check: `scripts/smoke.mjs:75-79`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Component points in the ranking

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 2446389
- [x] 1.2 Lint passes: `npm run lint` — 2446389
- [x] 1.3 Type check passes: `npx astro sync && npx astro check` — 2446389

### Phase 2: Expandable rows on the dashboard

#### Automated

- [x] 2.1 Full CI equivalent passes: `npx astro sync && npm run lint && npm test && npx astro check && npm run build` — 8fa3eae
- [x] 2.2 Smoke passes against a running server and Supabase: `npm run smoke` — 8fa3eae

#### Manual

- [x] 2.3 After uploading a CSV containing `T1,major,2,5`, the collapsed list shows only rank, id, score and a visible expand indicator — 8fa3eae
- [x] 2.4 Expanding T1 shows `Krytyczność: major = 10,0`, `Klienci: 2 × 3,0 = 6,0`, `Usługi: 5 × 1,0 = 5,0`, with score `21,0` — 8fa3eae
- [x] 2.5 A row can be opened and closed with the keyboard (Tab, then Enter/Space) — 8fa3eae
