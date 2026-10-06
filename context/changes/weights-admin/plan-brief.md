# Weights Admin — Plan Brief

> Full plan: `context/changes/weights-admin/plan.md`

## What & Why

S-04 (US-03, FR-008, FR-009): the admin sees the six scoring weights and changes them so the new values apply from the next CSV upload and survive restarts. Every change is recorded as a history row, which S-05 will display.

## Starting Point

`public.scoring_weights` (F-02) holds six rows with admin-only UPDATE under RLS, but no range check and a table-wide update grant. The F-02 review requires S-04 to fix both. The middleware only checks sign-in, not role, and there is no admin screen or history table.

## Desired End State

From `/dashboard` the admin opens `/admin/weights`, edits any weight in Polish number format (`2,5`) and saves all six at once. The next upload ranks with the new values. Bad input shows per-field Polish errors and saves nothing. The operator is redirected away, and the database rejects out-of-range values, NaN, Infinity, key renames and non-admin saves on its own.

## Key Decisions Made

| Decision       | Choice                                                         | Why (1 sentence)                                                                        |
| -------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Route          | Separate `/admin/weights`, with an admin-only middleware guard | Clean role boundary that S-05 history can join under `/admin`.                          |
| Save           | One form, one `update_scoring_weights()` RPC (security invoker) | All six save or none do; RLS still applies, and non-admins get an explicit error.       |
| Range          | `0 ≤ value ≤ 1000`, at most 2 decimals, as a DB CHECK          | Blocks NaN/Infinity/negatives (the review requirement) and fat-fingered huge values.     |
| Decimal input  | Comma or dot, ≤ 2 places, normalised to a decimal string        | Natural for Polish users; strings keep `numeric` exact, with no float drift.            |
| Key protection | `grant update (value)` only                                    | A weight's key can't be renamed (F-02 review).                                          |
| History        | `scoring_weight_changes` filled by a definer trigger; admin-only SELECT | App code can't forget or forge it; records account role and time, never a person. |

## Scope

**In scope:** one migration (CHECK, column grant, history table + trigger, RPC), pgTAP tests, a form parser with unit tests, the middleware admin guard, the `/admin/weights` page, a dashboard link for the admin, smoke steps for both redirects and an admin save → re-upload round trip, an AGENTS.md rule.

**Out of scope:** the history screen (S-05), undo or a reason field, concurrent-edit detection, a React island or API route, any formula or key change.

## Architecture / Approach

```
admin ─POST─▶ /admin/weights.astro ─parseWeightsForm─▶ rpc update_scoring_weights(6 strings)
                                                         │ role≠admin → 42501
                                                         ▼
                                 scoring_weights  [CHECK 0..1000, 2dp · update(value) only · RLS]
                                                         │ after update when value changed
                                                         ▼
                                 scoring_weight_changes  [trigger insert · admin SELECT only]
operator ─GET /admin/*─▶ middleware ─▶ 302 /dashboard
```

## Phases at a Glance

| Phase             | What it delivers                                        | Key risk                                                                 |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Database       | Migration + pgTAP: range, grant, RPC, history           | No local Docker, so the pgTAP suite is verified only in the CI smoke job |
| 2. Admin screen   | Parser + tests, guard, page, dashboard link, smoke, docs | `1000` shown as `1 000` would fail re-submit; formatter must not group   |

**Prerequisites:** F-02 migration applied (local CI and cloud); the cloud project needs `npx supabase db push` before deploying Phase 2.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- Two admin tabs saving at once: last write wins, and history shows both. Accepted.
- A weight change mid-incident re-orders only the next upload; the PRD accepts this.
- The 1000 ceiling is a judgement call; raising it later is a one-line migration.

## Success Criteria (Summary)

- The admin changes `major` to 12, and the next upload of `major,2,5` scores 23,0, also after a restart.
- The operator can't reach the screen or save weights, even by calling the database directly.
- Every saved change leaves exactly one history row per changed weight.
