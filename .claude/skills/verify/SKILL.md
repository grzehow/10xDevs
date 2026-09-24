---
name: verify
description: Run the full local equivalent of this repo's CI (astro sync, lint, astro check, build) and report what failed. Pass "smoke" to also run the live auth-flow smoke check against a local Supabase. Use before claiming work is done, before committing, or when asked whether CI will pass.
---

# Verify

This repo has no `typecheck` script and no `test` script, so `npm run lint` passing tells you nothing about whether CI passes. CI (`.github/workflows/ci.yml`) runs `astro sync` → `lint` → `astro check` → `build`. Reproduce it exactly.

## Standard run (no Docker needed)

Run these in order, from the repo root, and stop at the first failure:

```
npx astro sync
npm run lint
npx astro check
npm run build
```

- `astro sync` regenerates `.astro/types.d.ts`, which is gitignored but is in `tsconfig.include`. Skipping it makes `astro check` fail for reasons that have nothing to do with the change under test.
- `npm run build` needs `SUPABASE_URL` and `SUPABASE_KEY` present, but they are `optional: true` in the env schema — the build will succeed without them and degrade at runtime instead. Do not read a green build as proof that auth works.
- Lint failures are frequently Prettier violations surfaced as ESLint errors. `npm run lint:fix` resolves those; do not hand-edit formatting.

Report the first failing step with its actual output. Do not summarize a failure as "minor" or fix unrelated findings while you are in here.

## With `smoke` ($ARGUMENTS contains "smoke")

`scripts/smoke.mjs` drives the real auth flow over HTTP: 8 assertions from `home renders` through `dashboard redirects after signout`. It needs a running server and a reachable Supabase, and it has no filter argument — it is all-or-nothing.

1. `npx supabase start` (Docker, ~7 GB RAM). If it is already running, skip.
2. Write both env files. Cloudflare's workerd reads `.dev.vars`, not `.env`, and `npm run preview` runs on workerd — so `.env` alone silently yields an auth-disabled app:
   - `SUPABASE_URL` = the API URL from `npx supabase status -o env`
   - `SUPABASE_KEY` = the anon key from the same output
   - put both in `.env` **and** `.dev.vars`
3. `npm run build`
4. `npm run preview -- --port 4321` in the background; poll until it answers.
5. `BASE_URL=http://localhost:4321 npm run smoke`
6. Stop the preview server. Leave Supabase running unless the user asked otherwise (restarting it costs minutes).

If a smoke assertion fails, name the assertion verbatim — the step names map directly to the auth flow stage that broke.
