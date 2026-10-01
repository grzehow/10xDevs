<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: CSV Upload and Ranked List

- **Plan**: context/changes/csv-upload-ranked-list/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- Automated: `npx astro sync && npm run lint && npm test && npx astro check && npm run build` passes (12/12 tests, 0 type errors). PR #14 checks `ci`, `smoke` and `Workers Builds: noc-priority` all pass on `61e57f3`.
- Manual: 2.3–2.6 were confirmed by the user on 2026-10-01 against the cloud project (recorded in `change.md`).
- Plan drift: every planned change in both phases matches the plan, with nothing missing. Extras are a `TODO(S-03)` comment, the verify skill's description and smoke step count, and `session: false` (F2).
- Checked and clean: no XSS (`ticketId` only goes through escaped expressions, no `set:html`); unauthenticated POSTs are redirected by middleware before `rankUpload`; `checkOrigin` covers CSRF; no path renders a 500; the work is O(n log n).

## Findings

### F1 — Request body is read fully before the size check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:20-24
- **Detail**: `formData()` reads the whole request into memory, and only then is `file.size` compared to `MAX_BYTES`. A signed-in client could send a body near the Workers request limit, against a 128 MB isolate. So the cap limits what gets parsed, not memory use. The exposure is limited to the two shared accounts.
- **Fix**: Before calling `formData()`, reject with the file error when the `Content-Length` header exceeds `MAX_BYTES` plus 64 KiB of multipart overhead.
- **Decision**: FIXED

### F2 — Unplanned `session: false` in astro.config.mjs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: astro.config.mjs:12-14
- **Detail**: Commit `61e57f3` was added after the plan was written. It fixes the Workers Builds preview failure (the `SESSION` KV binding had no namespace id, code 10021), which also failed on PRs #12 and #13. It is harmless, since nothing uses Astro sessions, but it is a site-wide config change that the plan doesn't mention.
- **Fix**: Add a dated note to `change.md` recording the change and its reason, so the archive explains it.
- **Decision**: FIXED

### F3 — An oversized count renders the score as "∞"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/ranking.ts:21
- **Detail**: `COUNT = /^\d+$/` puts no limit on digits. Verified: with a 400-digit `number_of_customers`, the score becomes `Infinity` and renders as `∞` instead of the file being rejected. The ordering stays deterministic: `Infinity - Infinity` is `NaN`, which is falsy, so the comparator falls through to severity.
- **Fix**: Change the pattern to `/^\d{1,9}$/` and add a rejection test.
- **Decision**: FIXED

### F4 — The Polish score format is never checked on workerd

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs (upload step)
- **Detail**: The smoke step checks order only. The `pl-PL` rendering (`21,0`) was only checked by hand under `astro dev`. Whether workerd in production has full ICU isn't covered by any automated check.
- **Fix**: Extend the smoke `bodyCheck` to require a formatted score in the response (e.g. `SMOKE-HIGH` gives `19,0`).
- **Decision**: FIXED
