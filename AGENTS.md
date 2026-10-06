# CLAUDE.md

Rules for any AI agent working in this repo.

## Verify before claiming done

There is no `typecheck` script. A clean `npm run lint` does **not** mean CI passes. Run, in order (or use `/verify`):

```
npx astro sync && npm run lint && npm test && npx astro check && npm run build
```

`npm test` runs `node:test` over `src/**/*.test.ts` using Node's built-in type stripping (Node ≥ 22.18).

`npx astro sync` is required after a fresh clone or dependency change: `.astro/types.d.ts` is generated and gitignored but sits in `tsconfig.include`, so `astro check` fails without it.

The other executable check is `npm run smoke` (`scripts/smoke.mjs`) — a live-HTTP walk through the auth flow and a CSV upload. It needs a running server and a reachable Supabase, and has no filter argument, so single-case runs are impossible.

## Environment: two files, and silent degradation

- You need `.env` (node/astro) **and** `.dev.vars` (Cloudflare workerd — what `npm run dev` and `npm run preview` actually run on). `.env` alone leaves the app auth-disabled with no error. Both copy from `.env.example`: `SUPABASE_URL`, `SUPABASE_KEY`.
- Both vars are `optional: true` in the `astro.config.mjs` env schema, and `createClient()` in `@/lib/supabase` **returns `null`** when either is missing. Null-check every call; never write `createClient(...).auth`.
- Local Supabase: `npx supabase start`; ports and auth settings are in `supabase/config.toml`, which already disables email confirmation. A cloud project still needs that toggled off manually.

## Domain rules (NOC Priority)

- The scoring formula is fixed: `score = severity_weight + customer_weight * customers + service_weight * services`. The six weights are editable rows in `public.scoring_weights`; S-01 reads them from the DB, never from constants. Defaults: `warning 1.0 / minor 5.0 / major 10.0 / critical 15.0`, `customer 3.0`, `service 1.0`. Ties are broken by higher severity (`major, 2 customers, 5 services = 21.0`). A repeated upload with unchanged weights must produce byte-identical ordering.
- CSV columns, in this exact order: `ticket_id, severity, number_of_customers, number_of_services`. **Customers comes before services** — transposing them is easy and silently changes every score.
- Uploaded tickets are never persisted. Only weights, weight-change history, and the two accounts live in the database. No upload history.
- Two shared accounts (operator, admin) — no signup flow, no per-person accounts. The operator may SELECT `scoring_weights` (for scoring; the score components reveal the values anyway) but cannot change weights and has no weights or history screen; RLS enforces the read/write split (only admin UPDATEs, nobody INSERTs or DELETEs). The six default weights live in `supabase/migrations/20260929120000_scoring_weights.sql`, not in code. Weight history records account + timestamp, never a person.
- Weights are numbers from 0 to 1000 with at most 2 decimals, enforced by a DB CHECK. Saves should go through `update_scoring_weights()` (admin-only, all six weights in one transaction). The database enforces only the CHECK, the `update (value)` column grant and the history trigger, so a direct `UPDATE (value)` by the admin is possible but skips the all-or-nothing save. `scoring_weight_changes` history rows are written by that trigger, never by app code. `/admin/*` is admin-only via `ADMIN_ROUTES` in `src/middleware.ts`.
- Every row shows its score, and expanding a row shows all three score components. The collapsed list stays terse: id, score, rank.
- The app is read-only on tickets: no close/assign/comment/manual override, no ITSM integration, no incident grouping.
- `tech-stack.md` flags a privacy tension about customer and service names reaching external services. Resolved: the CSV carries counts only, never names. Do not re-raise it.

## Conventions

- Merge classes with `cn()` from `@/lib/utils`; never concatenate class strings.
- `.astro` for static and layout, React only where interactivity is needed. No Next.js directives (`"use client"`).
- File naming splits by kind: components PascalCase (`SignInForm.tsx`, `Banner.astro`), shadcn/ui primitives lowercase (`src/components/ui/button.tsx`), `src/lib/` kebab-case (`config-status.ts`), routes lowercase-kebab.
- Add shadcn/ui components with `npx shadcn@latest add <name>` (style `new-york`).
- API routes live at `src/pages/api/<area>/<verb>.ts` and export uppercase handlers typed as `APIRoute`.
- Route protection is the `PROTECTED_ROUTES` array in `src/middleware.ts`; the resolved user arrives as `context.locals.user`.
- Supabase migrations: `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`. Always enable RLS, with granular per-operation, per-role policies.
- User-facing copy is Polish — see `@src/lib/config-status.ts`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `chore:`). CI runs on push and PR to `master`.

## Tripwires

- `.gitignore` is also the ESLint ignore file (`includeIgnoreFile` in `eslint.config.js`). Adding a path there silently drops it from linting.
- Prettier runs as an ESLint rule, so formatting drift surfaces as lint **errors**, and `prettier-plugin-tailwindcss` reorders Tailwind classes on write. `printWidth` is 120.
- ESLint runs `strictTypeChecked` + `stylisticTypeChecked`: expect floating-promise, unsafe-`any` and unnecessary-condition errors. Prefix intentionally unused identifiers with `_`.
- `wrangler.jsonc` is JSONC with trailing commas — a strict JSON parser will choke on it.
- `.claude/skills/10x-*` is managed by `@przeprogramowani/10x-cli` (hashes in `.claude/.10x-cli-manifest.json`). Hand-editing one conflicts on the next sync.
- `scripts/smoke.mjs` (and the CI `smoke` job) signs in as the seeded operator and admin from `supabase/seed.sql` (overridable via `SMOKE_EMAIL` / `SMOKE_PASSWORD` and `SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD`). A seed change must keep those credentials in sync with the defaults in `scripts/smoke.mjs`, or CI breaks. The admin steps read the current weights, set `major` to 12 and write the originals back, so a run against a cloud project leaves the weights as found and adds two `scoring_weight_changes` rows.
- Deploy is manual: `npm run build`, then `npx wrangler deploy`; secrets via `npx wrangler secret put`. No deploy workflow exists.
- Known mismatches, deliberately unfixed: `context/foundation/tech-stack.md` says `cloudflare-pages` but `wrangler.jsonc` targets Cloudflare **Workers**; `CLAUDE.md.scaffold` tells you to validate with zod (not a dependency) and to export `prerender = false` (unnecessary under `output: "server"`, and no route does it).

## Reference

- `@README.md` — setup walkthrough
- `@context/foundation/prd.md` — requirements, non-goals, deadline
- `@context/foundation/tech-stack.md` — stack decisions


<!-- BEGIN @przeprogramowani/10x-cli -->


<!-- END @przeprogramowani/10x-cli -->
