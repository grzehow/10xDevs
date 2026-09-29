# Shared Accounts and Roles — Plan Brief

> Full plan: `context/changes/shared-accounts-and-roles/plan.md`

## What & Why

NOC Priority has exactly two shared accounts (operator, admin) and no signup (PRD `## Access Control`, FR-001, FR-007). This change replaces the starter's open registration with those two pre-created accounts and makes the signed-in account's role available on every request, so later slices (weights, RLS) can enforce the split.

## Starting Point

Unmodified starter auth: public signup and signin, `locals.user` only, no roles, no seed file. The smoke test and CI create their test user through `/api/auth/signup`.

## Desired End State

Local Supabase seeds `operator@noc.local` and `admin@noc.local`. Signup is gone from the app and disabled in GoTrue. `locals.role` is `operator | admin | null`, and a user without a recognised role is treated as signed out. Auth pages are in Polish, and the smoke test signs in with the seeded operator.

## Key Decisions Made

| Decision           | Choice                                               | Why (1 sentence)                                                                           |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Role storage       | `auth.users.raw_app_meta_data.role`                  | No table or extra query, users can't edit it, and F-02 RLS reads it from the JWT.          |
| Unknown role       | Treat as signed out                                  | Fails closed; only the two known accounts get in.                                          |
| Provisioning       | `supabase/seed.sql` locally/CI, manual SQL for cloud | CI needs no new secrets; cloud setup is a documented one-off.                              |
| Polish copy        | Only pages this change touches                       | Follows the copy rule without scope creep into pages S-01 will replace.                    |
| Signup at Supabase | Disabled in `config.toml` too                        | Removing app routes alone would still allow registering against the API with the anon key. |

## Scope

**In scope:** seed file, role in middleware and `App.Locals`, dashboard shows account, delete signup/confirm-email pages + API + form, disable GoTrue signup, smoke rewrite, Polish copy on sign-in/Topbar/dashboard, README account setup.

**Out of scope:** roles table/migrations, admin-only route guards (S-04), message for role-less accounts, provisioning script or CI secrets, password reset, translating Welcome.

## Architecture / Approach

Middleware reads `user.app_metadata.role` from the already-fetched user and sets `locals.user`/`locals.role` together, or nulls both. Accounts come from SQL inserts into `auth.users` + `auth.identities`. Signup removal, GoTrue disable and the smoke rewrite ship in one phase so CI never sees a half state.

## Phases at a Glance

| Phase                                        | What it delivers                                  | Key risk                                                                 |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Seeded shared accounts                    | Both accounts exist after `db reset`              | Raw `auth.users` inserts need `''` token columns and identity rows       |
| 2. Role on the request                       | `locals.role`, fail-closed guard, dashboard label | RLS JWT claims can lag a role change by up to 1 h (F-02)                 |
| 3. Remove signup, rewrite smoke, Polish copy | No signup anywhere, green smoke on seeded login   | Smoke and CI break if signup goes without the rewrite in the same commit |

**Prerequisites:** local Supabase running (`npx supabase start`).
**Estimated effort:** ~1 session across 3 small phases.

## Open Risks & Assumptions

- Seed passwords are committed; they are local-dev only and must never be used in the cloud project.
- The cloud project needs manual steps (create users, disable signup, set roles) before the first deploy.

## Success Criteria (Summary)

- Operator and admin can sign in; nobody can register.
- Every request knows whether it is the operator or admin account.
- `npm run smoke` and CI pass without the signup endpoint.
