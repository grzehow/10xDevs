<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Shared Accounts and Roles

- **Plan**: context/changes/shared-accounts-and-roles/plan.md
- **Mode**: Deep
- **Date**: 2026-09-29
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding
10/10 paths ✓, 4/4 symbols ✓ (enable_signup ×2, sql_paths, UserAppMetadata), brief↔plan ✓, Progress↔Phase ✓ (14/14)

## Findings

### F1 — Docs that will go stale are not in the change list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — §6 README
- **Detail**: README.md:115 claims migrations for the shared accounts; AGENTS.md:52 tripwire says smoke signs up and "none are seeded yet"; Welcome.astro:64 still says "sign up" and escapes the 3.2 grep.
- **Fix**: Add AGENTS.md:52 and README.md:115 to Phase 3; drop "sign up" from Welcome.astro:64.
- **Decision**: FIXED

### F2 — "Role freshness" note is only half right

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — Role freshness
- **Detail**: `getUser()` hits the auth server, so `locals.role` is fresh per request; only RLS `auth.jwt()` (F-02) lags up to `jwt_expiry` (1 h).
- **Fix**: Reword the note accordingly.
- **Decision**: FIXED

### F3 — app_metadata.role is `any`, so the strict lint rules will flag it

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — §2 Middleware
- **Detail**: `UserAppMetadata` has `[key: string]: any`; direct use trips unsafe-any under `strictTypeChecked`.
- **Fix**: Read as `unknown`, narrow by equality to "operator" / "admin".
- **Decision**: FIXED

### F4 — Phase 1 manual check expects a redirect that doesn't happen

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Manual Verification (1.3)
- **Detail**: signin.ts:20 redirects to `/`, not `/dashboard`.
- **Fix**: Reword 1.3.
- **Decision**: FIXED
