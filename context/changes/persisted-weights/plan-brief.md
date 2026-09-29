# Persisted Weights — Plan Brief

> Full plan: `context/changes/persisted-weights/plan.md`

## What & Why

The six scoring weights (severity `warning/minor/major/critical`, plus per-customer and per-service multipliers) move from PRD prose into the database. S-01 scores uploads with them, and S-04 edits them later (FR-009). Doing this first means scoring never gets built on hard-coded constants that would need rewriting.

## Starting Point

F-01 put the account role in `app_metadata.role`, which the middleware and the JWT both carry. The repo has no migrations and no weights table, and the weights exist only as text in the PRD and AGENTS.md.

## Desired End State

After `db reset`, `scoring_weights` holds the six PRD defaults. Both accounts can SELECT the table (for scoring); only the admin can UPDATE it, and nobody can INSERT or DELETE. pgTAP tests in CI fail if that boundary regresses, and the docs describe the boundary as enforced.

## Key Decisions Made

| Decision         | Choice                                                         | Why (1 sentence)                                                                                          |
| ---------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Operator scoring | RLS SELECT policy for operator + admin; TS scores              | Same data a definer function would expose, with no definer code; S-01 fails closed unless it gets 6 keys. |
| Operator rule    | Reworded: reads weights, cannot change them, no weights screen | Score components reveal the weights anyway; the docs now match what RLS enforces.                         |
| Table shape      | One row per weight, `key` PK with CHECK on six keys            | S-04 edits map to single rows, and S-05 history reads "major: 10 → 12".                                   |
| Default values   | Inserted by the migration, not `seed.sql`                      | The cloud project runs migrations only, so seed-only defaults would leave an empty table.                 |
| Value type       | `numeric not null`, no range check                             | Exact values keep rankings byte-identical; range validation is an open question for S-04.                 |
| Write policies   | Admin UPDATE only; no INSERT/DELETE for anyone                  | All six keys always exist, so scoring can never miss one.                                                 |
| Grants           | `revoke all` from anon/authenticated, then `grant select, update` to authenticated | Independent of Supabase project defaults; anon gets nothing. |
| RLS testing      | pgTAP via `supabase test db` in the CI smoke job               | Tests the security boundary where it lives, with no new npm dependency.                                   |

## Scope

**In scope:** one migration (table, seed rows, policies, explicit grants), a pgTAP test file, a CI step, and updated wording in AGENTS.md, the PRD, the roadmap and the README.

**Out of scope:** weight history (S-05), range validation and the admin UI (S-04), a TS loader or generated DB types, and scoring in SQL.

## Architecture / Approach

```
S-01 upload (operator|admin) ──select──────▶ scoring_weights  [RLS select: operator, admin]
S-04 admin screen (admin)    ──select/update─▶ scoring_weights  [RLS update: admin only]
```

## Phases at a Glance

| Phase                         | What it delivers                              | Key risk                                                     |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| 1. Weights table and policies | Seeded table + per-role RLS + explicit grants | Grants must not depend on Supabase project defaults          |
| 2. RLS tests in CI            | pgTAP suite covering all four callers (admin UPDATE in a savepoint)         | Simulated JWT claims in tests must match the real claim path |
| 3. Reword the operator rule   | AGENTS.md, PRD, roadmap and README agree      | Wording drifts from the actual policies                      |

**Prerequisites:** F-01 (PR #8) merged into `master`, and local Supabase running.
**Estimated effort:** ~1 session across 3 small phases.

## Open Risks & Assumptions

- The PRD access table changes meaning: the operator gets "no weights screen" rather than "no read access". This was agreed during planning.
- The cloud project needs `npx supabase db push` before the S-01 deploy.
- JWT role claims can lag a role change by up to 1 h. Roles never change here, so this is accepted.

## Success Criteria (Summary)

- A fresh database starts with the PRD weights, and the operator cannot see or change the table.
- Both accounts can fetch the weights for scoring, and nobody else can.
- CI fails if any of those rules regress.
