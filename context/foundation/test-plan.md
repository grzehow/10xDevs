# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-06

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`, `scripts/`
(18 commits/30d; excluded `context/`, `.claude/`, `dist/`, `node_modules/`, lockfiles).

Oracle rule: expected scores and orderings come from the PRD formula and
hand-derived fixtures (e.g. `major, 2 customers, 5 services = 21.0`), never
from calling the code under test.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                         | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A malformed CSV (missing column, empty cell, wrong separator) is partially accepted; the operator ranks an incomplete queue without knowing it  | High   | High       | interview Q1; PRD Guardrails + US-02 + FR-006; roadmap S-03 still `proposed`                                                                  |
| 2   | Uploading the same file twice with unchanged weights yields different order or scores (tie-break by higher severity not applied, unstable sort) | High   | Medium     | interview Q4; PRD NFR reproducibility; hot-spot dir `src/lib/` (ranking, 7 commits/30d)                                                       |
| 3   | `number_of_customers` and `number_of_services` are read transposed; every score silently changes, no error                                      | High   | Medium     | AGENTS.md domain rules; roadmap S-01 Risk                                                                                                     |
| 4   | Abuse — authorization: the operator account reaches `/admin/*` or writes weights via the API/DB, not only via the UI                            | High   | Medium     | PRD Access Control + US-03 AC; hot-spot dirs `src/components/auth/` (8), `src/pages/auth/` (6), `src/pages/api/` (5), `src/middleware.ts` (3) |
| 5   | Scoring uses stale or hard-coded weights; an admin's saved change does not apply on the next upload                                             | High   | Medium     | PRD FR-009 + US-03; roadmap F-02, S-04                                                                                                        |
| 6   | Abuse — untrusted input: hostile values (negative/non-numeric counts, unknown severity, oversized file) are scored instead of rejected          | Medium | Medium     | PRD FR-006; CSV upload is the only user-input path                                                                                            |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                               | Must challenge                                                         | Context `/10x-research` must ground                                                                                                | Likely cheapest layer                                  | Anti-pattern to avoid                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| #1   | Any invalid row (including one after valid rows) rejects the whole file; an error alert renders and no partial list is ever rendered. Per-case messages naming the problem belong to S-03 | "Parser didn't throw" means the file was fully valid                   | Where parsing runs (client vs server), the upload error contract (`/dashboard` form POST), what exists today vs what S-03 will add | unit (parser) + integration (`/dashboard` upload POST) | Happy-path-only fixtures; asserting error text copied from code |
| #2   | Two runs over the same file produce byte-identical serialized output, including tied scores                                                                                               | One test with distinct scores proves stability                         | Sort comparator, tie-break source, output serialization                                                                            | unit + one integration across the upload path          | Expected order computed with the function under test            |
| #3   | A fixture with customers ≠ services yields the hand-derived PRD score                                                                                                                     | Symmetric fixtures (customers = services) can catch a swap             | Header-based vs position-based column mapping                                                                                      | unit                                                   | Fixtures where both counts are equal                            |
| #4   | An operator session is denied on every admin route and on the weights write, at API and RLS level                                                                                         | A hidden button means no access                                        | Admin route guard, weights save RPC, RLS policies, what pgTAP and smoke already cover                                              | pgTAP + API integration                                | Testing only the UI redirect                                    |
| #5   | After a weight change, the next upload's score reflects the new value without restart                                                                                                     | Defaults equal to seeded values hide a constants fallback              | Where scoring reads weights, any caching                                                                                           | integration with non-default weights                   | Fixtures using default weights                                  |
| #6   | Each hostile value is rejected, never scored                                                                                                                                              | DB CHECK constraints protect uploaded values (they cover weights only) | Server-side validation vs any client-side checks                                                                                   | unit + integration                                     | Client-only validation tests                                    |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                               | Goal (one line)                                                               | Risks covered | Test types                    | Status      | Change folder                  |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------- | ------------- | ----------------------------- | ----------- | ------------------------------ |
| 1   | CSV ingestion contract                   | Prove a bad file is rejected whole and columns map correctly                  | #1, #3, #6    | unit + upload API integration | planned     | testing-csv-ingestion-contract |
| 2   | Ranking reproducibility and live weights | Prove byte-identical ordering and that saved weights apply on the next upload | #2, #5        | unit + integration            | not started | —                              |
| 3   | Access split at API and RLS              | Prove the operator cannot reach or write anything admin-only                  | #4            | pgTAP + API integration       | not started | —                              |

Status vocabulary: `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. Test-base profile: **sparse** —
`node:test` over 2 files in `src/lib/`, 2 pgTAP files in
`supabase/tests/database/`, plus the live-HTTP `scripts/smoke.mjs`.

| Layer                     | Tool                                  | Version      | Notes                                                                                                                        |
| ------------------------- | ------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| unit                      | `node:test` (built-in type stripping) | Node ≥ 22.18 | `npm test` over `src/**/*.test.ts`                                                                                           |
| integration (upload POST) | none yet — see Phase 1                | —            | No upload API route: the upload is a form POST to `/dashboard`. Plan picks the harness; prefer `node:test` over a new runner |
| database / RLS            | pgTAP via `supabase test db`          | Supabase CLI | Needs local Supabase (Docker); runs in CI `smoke` job                                                                        |
| live smoke                | `scripts/smoke.mjs`                   | n/a          | Auth flow + CSV upload + admin weight round-trip; no filter argument                                                         |
| e2e / browser             | none — not planned                    | —            | Playwright MCP available; adds no signal over API integration for current risks                                              |

**Stack grounding tools (current session):**

- Docs: Cloudflare docs MCP — available, not needed for runner choice; Context7 not available in current session; checked: 2026-10-06
- Search: WebSearch — available, not used; Exa.ai not available in current session; checked: 2026-10-06
- Runtime/browser: Playwright MCP — available, not used (see e2e row); checked: 2026-10-06
- Provider/platform: Cloudflare API MCP — not used for gates; checked: 2026-10-06

## 5. Quality Gates

| Gate                         | Where                                        | Required?                 | Catches                                                       |
| ---------------------------- | -------------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| lint + `astro check` + build | local + CI `ci` job                          | required                  | syntactic / type drift                                        |
| unit (`npm test`)            | local + CI `ci` job                          | required                  | scoring and parsing logic regressions                         |
| upload POST (unit + smoke)   | local + CI `ci` (unit) / CI `smoke` (render) | required after §3 Phase 1 | partial acceptance, column mapping, hostile input             |
| pgTAP (`supabase test db`)   | CI `smoke` job                               | required                  | RLS and weight constraint regressions; extended in §3 Phase 3 |
| live smoke (`npm run smoke`) | CI `smoke` job                               | required                  | broken end-to-end auth / upload / admin path                  |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: next to the module in `src/lib/`, named `<module>.test.ts`.
- **Reference test**: `src/lib/ranking.test.ts`.
- **Run locally**: `npm test`.

### 6.2 Adding a test for CSV rejection / column mapping

- **Rejection / mapping fixtures**: `src/lib/ranking.test.ts`. Put valid rows **before** the bad row, so a skipped
  row would still return a list. Assert `{ ok: false }`, never error copy.
- **Upload guards** (size, body, `file` field): `src/lib/upload.test.ts`. Build a `Request` with `FormData`/`File` and
  count weights-loader calls — a rejected file must make 0.
- **Render-only rules**: `scripts/smoke.mjs`. On error assert `role="alert"` and no `data-ticket-id=`; for the
  breakdown match whole component lines such as `/2 × 3,0 =\s*6,0/`.
- **Mapping rule**: always customers ≠ services and, at unit level, non-default `customer`/`service` weights. Expected
  scores are hand-derived from the PRD formula.
- **Reference tests**: "one invalid row after valid rows rejects the whole file", "rejects hostile counts and
  severities", "customers and services map to their own weights" (`ranking.test.ts`); "rejects a file over MAX_BYTES",
  "rejects a valid row followed by an invalid one" (`upload.test.ts`); "dashboard rejects file with a bad row",
  "dashboard renders asymmetric customers and services" (`smoke.mjs`).
- **Run**: `npm test`; smoke via the CI `smoke` job (or `npm run smoke` against a running server).

### 6.3 Adding a reproducibility or live-weights test

- TBD — see §3 Phase 2 (byte-identical ordering with ties; non-default weights fixture).

### 6.4 Adding a database / RLS test

- **Location**: `supabase/tests/database/<area>.test.sql` (pgTAP).
- **Reference test**: `supabase/tests/database/weights_admin.test.sql`.
- **Run**: `supabase test db` (needs local Supabase; otherwise CI only).
- Operator-denial-at-API pattern: TBD — see §3 Phase 3.

### 6.5 Per-rollout-phase notes

(Appended by each phase's final sub-phase.)

- 2026-10-06 Phase 1 (testing-csv-ingestion-contract): shipped valid-then-invalid, hostile-value and asymmetric
  non-default-weight fixtures in `ranking.test.ts`; upload guards moved from `dashboard.astro` into `src/lib/upload.ts`
  with `upload.test.ts`; two smoke steps for the error render and the asymmetric breakdown. Break-check: `return` →
  `continue` in the `ranking.ts` row loop turns 4 tests red. Left out: per-case messages (S-03), oversized-file smoke,
  chunked-body limits (platform behaviour).

## 7. What We Deliberately Don't Test

- **Performance (3 s / 200-ticket NFR)** — files are small and scoring is a weighted sum. Re-evaluate if real files exceed ~200 rows or scoring gains external calls. (Source: Phase 2 interview Q5.)
- **Visual / snapshot tests** — two shared accounts, layout rarely matters, snapshots break without catching ranking bugs. Re-evaluate if the UI becomes the source of operator errors. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-06
- Stack versions last verified: 2026-10-06
- AI-native tool references last verified: 2026-10-06

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
