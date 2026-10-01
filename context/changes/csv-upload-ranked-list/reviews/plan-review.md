<!-- PLAN-REVIEW-REPORT -->

# Plan Review: CSV Upload and Ranked List

- **Plan**: context/changes/csv-upload-ranked-list/plan.md
- **Mode**: Deep
- **Date**: 2026-09-30
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths ✓, symbols ✓ (checkOrigin, PROTECTED_ROUTES, scriptsConfig), brief↔plan ✓, Progress↔Phase ✓

Checked and fine: Astro `security.checkOrigin` defaults to true (`node_modules/astro/dist/core/config/schemas/defaults.js:44`) and smoke already sends `Origin` (`scripts/smoke.mjs:30`). `void test(...)` passes `no-floating-promises` (`ignoreVoid` default). `PROTECTED_ROUTES` also guards POST.

## Findings

### F1 — Unquoted test glob misses nested tests on Linux CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 — Test script and CI
- **Detail**: npm runs scripts through `sh -c`. Without globstar, `**` acts like `*`, so `src/**/*.test.ts` expands to `src/*/*.test.ts`. On Windows, cmd passes the pattern literally. Behaviour differs by OS.
- **Fix**: Quote the pattern: `node --test "src/**/*.test.ts"`, so Node's own glob expands it.
- **Decision**: FIXED

### F2 — smoke.mjs will fail lint on FormData/Blob

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2 — Smoke step
- **Detail**: The `scriptsConfig` globals (`eslint.config.js:73-78`) are only console, process, fetch and URLSearchParams, so multipart smoke code fails with `no-undef`.
- **Fix**: Add `eslint.config.js` to Phase 2 and add `FormData` and `Blob` to the `scriptsConfig` globals.
- **Decision**: FIXED

### F3 — Non-multipart POST to /dashboard throws

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1 — Dashboard page, POST flow step 1
- **Detail**: `Astro.request.formData()` rejects on an empty or non-form body. The plan promises every POST returns 200 with page content, but this renders a 500.
- **Fix**: Wrap `formData()` in try/catch, and a failure shows the file error.
- **Decision**: FIXED

### F4 — node:test types come only from a transitive @types/node

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2
- **Detail**: `@types/node` is present only via @types/sax, vite and sharp (`package-lock.json:3439`, `:3472`). `astro check` on the test file depends on those packages.
- **Fix**: Add `@types/node` as a pinned devDependency in Phase 1.
- **Decision**: FIXED

### F5 — Float sums can break the severity tie-break

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 — Sort
- **Detail**: Once S-04 allows fractional weights, scores that are equal on paper (`0.1+0.1+0.1` vs `0.3`) differ by ~1e-16, so the sort never reaches the severity rule.
- **Fix**: Compare `Math.round(score * 1e9)` and display the unrounded score.
- **Decision**: FIXED
