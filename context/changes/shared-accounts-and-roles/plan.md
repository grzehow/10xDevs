# Shared Accounts and Roles Implementation Plan

## Overview

Replace the starter's open signup with two pre-created shared accounts (operator, admin), expose the signed-in account's role on every request, and rewrite the smoke test to sign in with a seeded account instead of registering one. Roadmap item F-01; it unblocks every later slice.

## Current State Analysis

- Auth is the unmodified starter: email/password signup and signin through `@supabase/ssr` (`src/pages/api/auth/signup.ts`, `src/pages/api/auth/signin.ts`).
- `src/middleware.ts:7-17` resolves `context.locals.user` from `supabase.auth.getUser()`; there is no notion of a role.
- `supabase/config.toml` allows signups (`[auth] enable_signup = true`, `[auth.email] enable_signup = true`) and references `./seed.sql` under `[db.seed]`, but the file does not exist. There are no migrations.
- `scripts/smoke.mjs:40-44` creates a fresh user through `/api/auth/signup`; every later step signs in as that user. The CI `smoke` job runs a fresh `supabase start`, which applies the seed.
- Signup is linked from `src/pages/auth/signin.astro:17`, `src/components/Topbar.astro:27` and `src/components/Welcome.astro:36`.
- Auth UI copy is English; the repo rule is Polish user-facing copy.

## Desired End State

- `operator@noc.local` and `admin@noc.local` exist in local Supabase after `supabase start` / `supabase db reset`, with `app_metadata.role` of `operator` and `admin`.
- No signup path exists: the app routes are gone (404) and GoTrue signup is disabled in `config.toml`.
- `context.locals.role` is `"operator" | "admin" | null`. A signed-in user without a recognised role is treated as signed out (`user` and `role` both `null`), so protected routes redirect to sign-in.
- Sign-in page, sign-in form, Topbar and dashboard are in Polish; the dashboard shows which account is signed in.
- `npm run smoke` passes locally and in CI by signing in with the seeded operator account.

### Key Discoveries:

- `supabase/config.toml` `[db.seed] sql_paths = ["./seed.sql"]` — seed runs on `supabase start` and `db reset`, so CI needs no secrets.
- `app_metadata` is only writable with service-role/SQL access and is embedded in the JWT, so F-02 RLS can read it as `auth.jwt() -> 'app_metadata' ->> 'role'` without a lookup table.
- `src/env.d.ts` declares `App.Locals`; the role field goes there.

## What We're NOT Doing

- No `accounts`/roles table and no migration (role lives in `app_metadata`).
- No admin-only routes or role-based route guards yet — S-04 adds the weights screen and its guard. `PROTECTED_ROUTES` stays `["/dashboard"]`.
- No explanatory message for role-less accounts; they just land signed out.
- No provisioning script, service-role key or GitHub secrets. Cloud accounts are created by hand (README).
- No translation of `Welcome.astro` or other untouched pages beyond removing the signup link.
- No password change / reset flow.

## Implementation Approach

Seed first (harmless on its own), then add the role to the request, then remove signup, disable it in `config.toml` and rewrite the smoke test in one phase — disabling GoTrue signup earlier would break the current smoke test.

## Critical Implementation Details

- **Seeding `auth.users` by SQL**: GoTrue fails sign-in with "Database error querying schema" if `confirmation_token`, `recovery_token`, `email_change_token_new` and `email_change` are `NULL`; set them to `''`. Each user also needs an `auth.identities` row (provider `email`) or password sign-in fails. `crypt`/`gen_salt` live in the `extensions` schema.
- **Role freshness**: middleware calls `getUser()`, which hits the auth server, so `locals.role` is fresh on every request. RLS in F-02 reads `auth.jwt()` claims, which can lag a DB role change by up to `jwt_expiry` (1 h); re-login forces a sync. Acceptable for two fixed accounts.

## Phase 1: Seeded shared accounts

### Overview

Create both accounts in local Supabase through the seed file.

### Changes Required:

#### 1. Seed file

**File**: `supabase/seed.sql` (new)

**Intent**: Insert the operator and admin users with confirmed emails, dev-only passwords and their role in `raw_app_meta_data`, plus matching `auth.identities` rows. Header comment states the passwords are local-dev only.

**Contract**: accounts `operator@noc.local` / `Operator-Dev-Passw0rd!` (role `operator`) and `admin@noc.local` / `Admin-Dev-Passw0rd!` (role `admin`). Per user:

```sql
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', <uuid>, 'authenticated', 'authenticated', 'operator@noc.local',
  extensions.crypt('Operator-Dev-Passw0rd!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"role":"operator"}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (gen_random_uuid(), <uuid>, <uuid>::text, 'email',
  jsonb_build_object('sub', <uuid>::text, 'email', 'operator@noc.local', 'email_verified', true), now(), now(), now());
```

Use fixed literal UUIDs for deterministic values. This seed is reset-only: run it through `npx supabase db reset`, not directly against an existing database.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` completes without errors
- `npx astro sync && npm run lint && npx astro check && npm run build` passes

#### Manual Verification:

- Signing in at `/auth/signin` as `operator@noc.local` and as `admin@noc.local` both succeed (redirect to `/`) and `/dashboard` then renders

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Role on the request

### Overview

Resolve the role in middleware and fail closed on unknown roles.

### Changes Required:

#### 1. Locals type

**File**: `src/env.d.ts`

**Intent**: Add the role to `App.Locals`.

**Contract**: `role: "operator" | "admin" | null`.

#### 2. Middleware

**File**: `src/middleware.ts`

**Intent**: After `getUser()`, read `user.app_metadata.role`; if it is `operator` or `admin`, set `locals.user` and `locals.role`, otherwise set both to `null`. Protected-route check stays on `locals.user`.

**Contract**: invariant — `locals.user !== null` implies `locals.role !== null`. `UserAppMetadata` has an `any` index signature, so read the value as `unknown` and narrow by equality to `"operator"` / `"admin"` to satisfy `strictTypeChecked`.

#### 3. Dashboard shows the account

**File**: `src/pages/dashboard.astro`

**Intent**: Show which shared account is signed in (`Konto operatorskie` / `Konto administracyjne`) and translate the page copy to Polish.

**Contract**: page reads `Astro.locals.role`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint && npx astro check && npm run build` passes
- `npm run smoke` still passes (signup still exists in this phase)

#### Manual Verification:

- Dashboard shows "Konto operatorskie" for the operator and "Konto administracyjne" for the admin
- A user created in Studio without a role signs in but is redirected from `/dashboard` to `/auth/signin`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Remove signup, rewrite smoke, Polish copy

### Overview

Delete every signup path, disable signup in Supabase, move the smoke test to the seeded account, translate the touched auth UI and update the README — all in one change so CI stays green.

### Changes Required:

#### 1. Delete signup

**Files**: `src/pages/api/auth/signup.ts`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/components/auth/SignUpForm.tsx` (delete)

**Intent**: Remove the signup flow entirely.

**Contract**: `/auth/signup`, `/auth/confirm-email`, `POST /api/auth/signup` return 404.

#### 2. Remove signup links

**Files**: `src/pages/auth/signin.astro`, `src/components/Topbar.astro`, `src/components/Welcome.astro`

**Intent**: Drop the "Sign up" links. Translate sign-in page and Topbar copy to Polish (`Zaloguj się`, `Wyloguj się`, `Niezalogowany`, `Panel`). Welcome keeps its English text apart from the removed link and dropping "sign up" from the feature blurb at `Welcome.astro:64`.

#### 3. Sign-in form copy

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Polish labels, placeholders, validation messages and button text (`E-mail`, `Hasło`, `Podaj adres e-mail`, `Podaj poprawny adres e-mail`, `Podaj hasło`, `Logowanie...`, `Zaloguj się`). Server-side `Supabase is not configured` in `signin.ts` becomes `Supabase nie jest skonfigurowany`.

#### 4. Disable GoTrue signup

**File**: `supabase/config.toml`

**Intent**: Set `[auth] enable_signup = false` and `[auth.email] enable_signup = false` so nobody can register directly against the Supabase API with the anon key. Seed inserts are unaffected.

#### 5. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Replace the signup step with sign-in as the seeded operator; credentials default to the seed values, overridable via `SMOKE_EMAIL` / `SMOKE_PASSWORD` for a cloud run. Add a step asserting `POST /api/auth/signup` returns 404. Keep the other steps.

**Contract**: step list — home 200; dashboard anon → 302 `/auth/signin`; signup endpoint → 404; wrong password → 302 `/auth/signin?error=`; correct password → 302 `/`; dashboard 200; signout → 302 `/`; dashboard → 302 `/auth/signin`.

#### 6. README

**File**: `README.md`

**Intent**: Replace the signup route rows and the "due to be removed" note with the two shared accounts: local credentials from `seed.sql`, a reminder that the seed needs `supabase db reset` on an existing local stack, and cloud setup — create both users in Dashboard → Authentication → Add user (auto-confirm), disable signups, then run:

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = '<admin email>';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"operator"}' where email = '<operator email>';
```

Also fix `README.md:115`: the shared accounts come from `seed.sql`, not a migration.

#### 7. Agent rules

**File**: `AGENTS.md`

**Intent**: Rewrite the smoke tripwire (line 52): smoke now signs in as the seeded operator from `supabase/seed.sql`, so a seed change must keep those credentials in sync with `scripts/smoke.mjs`. Drop "none are seeded yet".

### Success Criteria:

#### Automated Verification:

- `npx astro sync && npm run lint && npx astro check && npm run build` passes
- No obsolete signup implementation or UI references remain: `grep -rn "signup\|SignUp\|confirm-email" src` returns nothing; `scripts/smoke.mjs` retains only the expected `POST /api/auth/signup` 404 assertion
- `npx supabase db reset` and `npm run build` complete; with `npm run preview -- --port 4321` running in a separate terminal, `BASE_URL=http://localhost:4321 npm run smoke` passes
- CI `ci` and `smoke` jobs pass on the PR

#### Manual Verification:

- Sign-in page, form validation, Topbar and dashboard read in Polish with no signup link anywhere
- `/auth/signup` shows the 404 page
- Signing in as admin and operator both work; signing out returns to signed-out state

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None — no unit test framework exists and the role logic is a single guard; the smoke test and manual checks cover it.

### Integration Tests:

- `scripts/smoke.mjs` (rewritten) covers sign-in with a seeded account, signup removal and route protection.

### Manual Testing Steps:

1. `npx supabase db reset`, `npm run dev`, sign in as `operator@noc.local` → dashboard shows "Konto operatorskie".
2. Sign out, sign in as `admin@noc.local` → "Konto administracyjne".
3. In Studio, add a user with no role, sign in → redirected back to `/auth/signin` from `/dashboard`.
4. Open `/auth/signup` → 404.

## Performance Considerations

None — role comes from the already-fetched user object, no extra round trip.

## Migration Notes

Existing local stacks need `npx supabase db reset` to pick up the seed (drops local data; there is none worth keeping). The cloud project needs the manual README steps before deploy.

## References

- Roadmap item: `context/foundation/roadmap.md` F-01
- Requirements: `context/foundation/prd.md` `## Access Control`, FR-001, FR-007
- Middleware: `src/middleware.ts:7-24`
- Smoke test: `scripts/smoke.mjs:38-54`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Seeded shared accounts

#### Automated

- [x] 1.1 `npx supabase db reset` completes without errors
- [x] 1.2 `npx astro sync && npm run lint && npx astro check && npm run build` passes

#### Manual

- [x] 1.3 Signing in at `/auth/signin` as `operator@noc.local` and as `admin@noc.local` both succeed (redirect to `/`) and `/dashboard` then renders

### Phase 2: Role on the request

#### Automated

- [ ] 2.1 `npx astro sync && npm run lint && npx astro check && npm run build` passes
- [ ] 2.2 `npm run smoke` still passes (signup still exists in this phase)

#### Manual

- [ ] 2.3 Dashboard shows "Konto operatorskie" for the operator and "Konto administracyjne" for the admin
- [ ] 2.4 A user created in Studio without a role signs in but is redirected from `/dashboard` to `/auth/signin`

### Phase 3: Remove signup, rewrite smoke, Polish copy

#### Automated

- [ ] 3.1 `npx astro sync && npm run lint && npx astro check && npm run build` passes
- [ ] 3.2 No obsolete signup implementation or UI references remain: `grep -rn "signup\|SignUp\|confirm-email" src` returns nothing; `scripts/smoke.mjs` retains only the expected `POST /api/auth/signup` 404 assertion
- [ ] 3.3 `npx supabase db reset` and `npm run build` complete; with `npm run preview -- --port 4321` running in a separate terminal, `BASE_URL=http://localhost:4321 npm run smoke` passes
- [ ] 3.4 CI `ci` and `smoke` jobs pass on the PR

#### Manual

- [ ] 3.5 Sign-in page, form validation, Topbar and dashboard read in Polish with no signup link anywhere
- [ ] 3.6 `/auth/signup` shows the 404 page
- [ ] 3.7 Signing in as admin and operator both work; signing out returns to signed-out state
