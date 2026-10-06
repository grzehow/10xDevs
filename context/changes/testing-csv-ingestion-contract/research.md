---
date: 2026-10-06T14:21:10+02:00
researcher: Claude (Opus 5.5)
git_commit: f491e57
branch: master
repository: 10xDevs
topic: "Ground test-plan Phase 1 (CSV ingestion contract): risks #1, #3, #6"
tags: [research, testing, csv, ranking, dashboard, upload]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5)
---

# Research: Ground test-plan Phase 1 — CSV ingestion contract

**Date**: 2026-10-06T14:21:10+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: f491e57 (working tree has unrelated uncommitted `.claude/` changes; cited files are unmodified)
**Branch**: master
**Repository**: 10xDevs

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (risks #1 partial acceptance, #3 customers/services transposition, #6 hostile input). For each risk: real failure path, existing tests, cheapest useful layer, and corrections to the response guidance. Also ground where parsing runs, the upload error contract, and header- vs position-based column mapping.

Scope inspected: `src/lib/ranking.ts`, `src/lib/ranking.test.ts`, `src/pages/dashboard.astro`, `src/middleware.ts`, `scripts/smoke.mjs`, `astro.config.mjs`, `package.json`, `context/changes/csv-upload-ranked-list/{change,plan,plan-brief}.md`, PRD US-02/FR-006, roadmap S-03. Research was done locally (single-area scope; no sub-agents needed). No tests were run.

## Summary

- **There is no upload API.** The upload is a native multipart form POST to `/dashboard`, handled in the `.astro` frontmatter (`src/pages/dashboard.astro:17-38`). "Upload API integration" in the test plan means "HTTP POST `/dashboard` → rendered HTML". This was a deliberate S-01 decision (`context/changes/csv-upload-ranked-list/plan.md:33`).
- **Parsing is server-side only.** The client has just `accept=".csv,text/csv"` and `required` on the input (`dashboard.astro:57`); there is no client JS. All validation is in the pure function `rankTickets` (`src/lib/ranking.ts:42-76`), plus size checks in the page (`dashboard.astro:19,27`).
- **Error contract:** on any bad file the page returns HTTP 200 with one generic Polish message in `<p role="alert">` (`dashboard.astro:8-9,65-69`) and no `<ol>`. `rankTickets` returns a bare `{ ok: false }` with no reason (`ranking.ts:14`). **Risk #1's "message naming the problem" is not implemented** — it is roadmap S-03 (`csv-error-messages`, status `proposed`), tracked by `TODO(S-03)` at `dashboard.astro:6-7`. Phase 1 can prove whole-file rejection; it cannot prove a named-problem message without implementing S-03.
- **Column mapping is exact-header + positional.** The header must equal the literal `ticket_id,severity,number_of_customers,number_of_services` (`ranking.ts:22,47`); rows are then destructured by position (`ranking.ts:53`). A swapped header is rejected; a swap in the destructuring line would be caught by the existing asymmetric PRD test (`ranking.test.ts:16-32`).
- **Risk #3 is already covered at unit level**; risk #1 and #6 are largely covered at unit level, with specific gaps listed below. **Nothing exercises the page's size guards or the "error ⇒ no list" render rule except the live smoke happy path.**

## Detailed Findings

### Where parsing runs and the request path

1. `src/middleware.ts:4,25` — `/dashboard` is in `PROTECTED_ROUTES`; anonymous requests redirect to `/auth/signin` before the frontmatter runs.
2. `dashboard.astro:19` — rejects when `Content-Length` > `MAX_BYTES + 65_536` (1 MiB + 64 KiB) before buffering the body. Requests without a `Content-Length` header (`?? 0`) skip this check.
3. `dashboard.astro:22-26` — `formData()` wrapped in try/catch; a parse failure returns `FILE_ERROR`.
4. `dashboard.astro:27` — the `file` field must be a `File` with `size <= MAX_BYTES` (1,048,576).
5. `dashboard.astro:29-32` — weights are loaded from `scoring_weights` and validated by `parseWeights` (`ranking.ts:28-40`); any failure returns `WEIGHTS_ERROR`, and no scoring happens.
6. `dashboard.astro:34-35` — `rankTickets(await file.text(), weights)`; `ok: false` → `FILE_ERROR`.
7. `dashboard.astro:38-40,65-70` — `error` and `ranked` are mutually exclusive by construction (`outcome` is either `{error}` or `{tickets, weights}`), so the error path renders no `<ol>`.

Weights reach scoring only through the DB, never constants — consistent with AGENTS.md; the DB CHECK constraints apply to weights only, nothing in the upload path touches the DB with uploaded values.

### Risk #1 — malformed CSV partially accepted

**Failure path grounded:** `rankTickets` is all-or-nothing. In the inspected loop (`ranking.ts:51-67`) each of the three row checks returns `{ ok: false }` immediately (`:52` cell count, `:54` empty/duplicate id or unknown severity, `:55` count format), discarding `scored`. The only success return is after the loop (`:75`). A partial list can therefore only appear if a future change replaces one of those `return`s with `continue` (e.g. while implementing S-03 per-row reasons) — that is the concrete regression to guard.

**Existing coverage** (`ranking.test.ts:79-99`): 15 rejected inputs — empty file, header only, swapped header, 1001 rows, duplicate id, empty id, unknown severity, uppercase severity, negative / decimal / empty / 10-digit count, 3 and 5 cells, semicolon separator.

**Gap:** of the 15 rejected inputs, 3 are file-level (empty, header only, 1001 rows) and 11 have the bad row as the only data row. The single multi-row exception is the duplicate-id case (`:86`), where the second row is the bad one. No case has a **valid row followed by an invalid one** for cell count, severity or count format — exactly the shape where a `continue`-style regression would return `ok: true` with a shorter list. The existing assertion `deepEqual(..., { ok: false })` would catch it only if such fixtures exist.

**Also untested:** a blank line in the middle of the file (`"T1,minor,0,0\n\nT2,minor,0,0"`). Trailing blank lines are dropped (`ranking.ts:44`), but a middle blank line splits to `[""]`, length 1, and is rejected at `:52` — correct today, unasserted.

**Correction to response guidance:** "a message naming the problem" belongs to S-03 and is not implemented (`dashboard.astro:6-9`; roadmap S-03 `proposed`; `csv-upload-ranked-list/change.md:14`). For Phase 1, the provable contract is: any invalid row ⇒ `{ ok: false }` ⇒ page shows `role="alert"` and **no** `data-ticket-id` element. Asserting the Polish copy would be "error text copied from code" — assert the presence of `role="alert"` and the absence of the list instead.

**Cheapest layer:** unit (`rankTickets`) for valid-then-invalid fixtures; the "no list on error" render rule needs the page (see Harness).

### Risk #3 — customers/services transposed

**Failure path grounded:** two places could swap them.

- Header: `HEADER` constant (`ranking.ts:22`) is compared exactly after trim (`:47`). A file with swapped headers is rejected, not silently re-mapped — test `ranking.test.ts:84`.
- Positional destructuring: `[ticketId, severity, customersRaw, servicesRaw]` (`ranking.ts:53`) and `points.customers = weights.customer * customers` (`:61`).

**Existing coverage:** `ranking.test.ts:16-32` asserts the exact PRD example (`major, 2, 5` → points `{10, 6, 5}`, score 21) with **customers ≠ services**; swapping `:53` would give 10 + 3·5 + 1·2 = 27 and fail. `:51-53` (`T1,minor,1,0` vs `T2,minor,0,1`) also catches it via ordering. The response guidance's anti-pattern (symmetric fixtures) is already avoided at unit level.

**Gap at render level:** the page renders `t.customers × weight.customer` and `t.services × weight.service` separately (`dashboard.astro:88-95`). A swap in the template (e.g. using `t.services` in the customers line) would not be caught by unit tests. The smoke step `scripts/smoke.mjs:106-131` uses `SMOKE-HIGH,critical,1,1` — **symmetric** counts, which cannot detect a template swap in counts (it does match the `1 × 3,0 = 3,0` line, so a weight swap would be caught). The second upload step (`smoke.mjs:145-159`, `major,2,5`) checks only the total score.

**Verdict:** the risk is real but largely mitigated by design; remaining exposure is the template. Cheapest new signal: one asymmetric fixture asserted on the rendered customers/services component lines.

### Risk #6 — hostile input scored instead of rejected

**Server-side checks grounded** (all server-side; there is no client validation beyond `accept`/`required`):

| Input                                                               | Rejected at                                           | Unit-tested?        |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ------------------- |
| negative count `-1`                                                 | `COUNT = /^\d{1,9}$/` (`ranking.ts:24,55`)            | yes (`test:90`)     |
| decimal / empty count                                               | same                                                  | yes (`:91-92`)      |
| > 9 digits (overflow guard)                                         | same                                                  | yes (`:93`)         |
| non-numeric `abc`, `+1`, `1e3`, `0x10`, non-ASCII digits            | same (`\d` without `u` flag is ASCII-only)            | **no**              |
| unknown / uppercase severity                                        | `isSeverity` via `Object.hasOwn` (`:26,54`)           | yes (`:88-89`)      |
| prototype keys as severity (`constructor`, `__proto__`, `toString`) | `Object.hasOwn` returns false for inherited keys      | **no**              |
| quoted field `"major"`                                              | quotes are not stripped, so it isn't a known severity | **no**              |
| > 1000 rows                                                         | `ranking.ts:45`                                       | yes (`:85`)         |
| file > 1 MiB                                                        | `dashboard.astro:27` (`file.size`)                    | **no** (page-level) |
| body > 1 MiB + 64 KiB with `Content-Length`                         | `dashboard.astro:19`                                  | **no** (page-level) |
| non-multipart / garbage body                                        | try/catch `dashboard.astro:22-26`                     | **no** (page-level) |
| missing `file` field / field is a string                            | `instanceof File` (`dashboard.astro:27`)              | **no** (page-level) |

**Correction to response guidance:** the "must challenge" item (DB CHECKs protect uploaded values) is confirmed false-by-design: uploaded values never reach the DB (`dashboard.astro:29-35`). The guidance's anti-pattern (client-only tests) doesn't apply because no client validation exists. The real gap is that **every size and body guard lives in `.astro` frontmatter that no test reaches**.

**Inference, not verified:** a chunked request without `Content-Length` bypasses `dashboard.astro:19`, and `formData()` then buffers the whole body before the `file.size` check. The upper bound is the platform request-body limit (Cloudflare Workers), not app code. This is a resource-use edge, not a scoring path — the oversized file is still rejected at `:27`. Flag for the plan; don't test against the platform.

**Out of scope but adjacent:** `ticket_id` content is unrestricted (any non-empty, comma-free string). It renders through Astro expressions (`dashboard.astro:73,81`), which escape by default, so HTML in an id is not an injection path (from Astro's documented behaviour, not tested here).

### Harness for "upload API integration"

Constraints observed:

- `npm test` = `node --test "src/**/*.test.ts"` with Node type stripping (`package.json` scripts). It cannot import `.astro` files, and `dashboard.astro` imports `@/` aliases that plain Node doesn't resolve.
- The live smoke (`scripts/smoke.mjs`) already does multipart POSTs to `/dashboard` (`smoke.mjs:43-47,106-131`) but needs a running server and a reachable Supabase, has no filter argument, and every step adds to one sequential run. Locally there is no Docker (user memory), so it would run against the cloud project.

Options for the plan to choose between (not decided here):

1. **Extract the frontmatter's `rankUpload` into `src/lib/`** as a function taking the `Request` and a weights loader, then unit-test it with Node's built-in `Request`/`FormData`/`File`. This covers size, body and `instanceof File` guards and the error/tickets exclusivity, with no server. It's a small production refactor, and the page keeps only rendering.
2. **Add smoke steps** for one bad file (valid row followed by an invalid one ⇒ `role="alert"`, no `data-ticket-id`), one oversized file, and one asymmetric fixture checking the customers/services lines. That's real-runtime signal, but slow, cloud-only locally, and it adds no isolation.
3. Astro's container API (`experimental_AstroContainer`) — **unverified** for this setup (Cloudflare adapter, middleware locals, Supabase client). Its import graph also isn't compatible with plain `node --test` type stripping. Not recommended without a spike.

The render-only rules (no `<ol>` on error, component lines show the right count) only exist in the template, so a few smoke assertions are needed for them in any option.

## Code References

- `src/lib/ranking.ts:14` — `RankResult` has no failure reason (S-03 would add one)
- `src/lib/ranking.ts:16-17` — `MAX_ROWS = 1000`, `MAX_BYTES = 1_048_576`
- `src/lib/ranking.ts:22,47` — exact-header check
- `src/lib/ranking.ts:24` — `COUNT` regex, 1–9 ASCII digits
- `src/lib/ranking.ts:26` — `isSeverity` via `Object.hasOwn`
- `src/lib/ranking.ts:43-45` — BOM strip, CRLF split, trailing blank lines dropped, row cap
- `src/lib/ranking.ts:51-67` — all-or-nothing row loop; positional destructuring at `:53`
- `src/lib/ranking.test.ts:16-32` — asymmetric PRD example (21.0)
- `src/lib/ranking.test.ts:79-99` — rejected inputs table
- `src/pages/dashboard.astro:6-9` — generic `FILE_ERROR`, `TODO(S-03)`
- `src/pages/dashboard.astro:17-36` — `rankUpload`: size guards, formData, weights, scoring
- `src/pages/dashboard.astro:65-70` — `role="alert"` vs `<ol>` render
- `src/pages/dashboard.astro:84-95` — score component lines (customers / services)
- `scripts/smoke.mjs:106-131,145-159` — the only HTTP uploads today, both valid files

## Architecture Insights

- Every validation rule sits in one pure module (`ranking.ts`). The page only moves data between the request, the DB and the template. This was the explicit S-01 design (`csv-upload-ranked-list/plan.md:38`), and it's why most of Phase 1 is cheap unit work.
- The format is fixed by design: no header-by-name parsing, no quoted fields, no positional/headerless mode (`csv-upload-ranked-list/plan.md:32`, `plan-brief.md:34`). Tests should treat quoted fields as _rejected_, not as unsupported-yet.

## Historical Context (from prior changes)

- `context/changes/csv-upload-ranked-list/plan-brief.md:21-24` — form POST rather than an API route; exact header chosen to catch the swap; reject the whole file with one generic message. **Supported** by the current code.
- `context/changes/csv-upload-ranked-list/change.md:14` — per-case messages deferred to S-03. **Supported**: the TODO is still present and S-03 is `proposed`.
- `context/changes/csv-upload-ranked-list/change.md:17` — `Content-Length` early rejection and the 9-digit cap were added in impl review. **Supported** (`dashboard.astro:19`, `ranking.ts:24`).

## Related Research

Not applicable. No prior `research.md` exists for CSV ingestion under `context/changes/` or `context/archive/`.

## Open Questions

1. ~~Does Phase 1 include S-03's named-problem messages?~~ **Resolved 2026-10-06 (user):** no. Phase 1 proves whole-file rejection and that no list is rendered; message naming stays with S-03. Backported to test-plan §2 (#1 guidance) and §4 (upload POST row).
2. **Which harness to use: extracting `rankUpload` (option 1), smoke steps (option 2), or both?** That decision belongs in `/10x-plan`.
3. **Test-plan wording:** §2/§4 say "upload API". The real surface is the `/dashboard` form POST. This is a candidate backport to the Risk Response Guidance and the §4 Stack row.
