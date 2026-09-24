---
project: noc-priority
researched_at: 2026-09-24
recommended_platform: Cloudflare Workers (Static Assets)
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3 (output "server") + React 19, @astrojs/cloudflare 14.3
  runtime: Cloudflare workerd (nodejs_compat); Supabase external (Auth + Postgres)
---

## Recommendation

**Deploy on Cloudflare Workers (Workers Paid plan, $5/month).**

It is the only candidate that needs zero migration: `@astrojs/cloudflare` 14.3.1, `wrangler.jsonc` and the manual
`npm run build && npx wrangler deploy` flow are already in the repo. It scored 10/10 on the agent-friendly criteria and
is the cheapest option that passes every criterion, which matters because the interview put cost first. The traffic is
request/response only, the users are in one region, and Supabase stays external, so nothing needs a persistent process
or a co-located database. Take the $5 Paid plan instead of Free: the Free plan's 10 ms CPU cap per request is a real
failure mode for CSV parsing plus server rendering on a cold isolate, and this tool is used exactly when the network is
on fire.

Note: `tech-stack.md` says `cloudflare-pages`. The installed adapter (v14) no longer supports Pages, so the target is
**Workers with Static Assets**, as `wrangler.jsonc` already configures.

## Platform Comparison

Scoring: Pass = 2, Partial = 1, Fail = 0. Researched 2026-09-24 against official docs.

| Platform           | CLI-first                      | Managed/Serverless        | Agent-readable docs | Stable deploy API | MCP / Integration      | Total | Realistic cost (EU, this workload)      |
| ------------------ | ------------------------------ | ------------------------- | ------------------- | ----------------- | ---------------------- | ----- | --------------------------------------- |
| Cloudflare Workers | Pass                           | Pass                      | Pass                | Pass              | Pass                   | 10    | $0 Free / $5 Paid                       |
| Render             | Partial (rollback API/UI only) | Pass                      | Pass                | Pass              | Pass                   | 9     | $7 Starter (Free spins down, fails PRD) |
| Vercel             | Pass                           | Pass                      | Pass                | Pass              | Partial (public beta)  | 9     | $20 Pro (Hobby is non-commercial only)  |
| Netlify            | Partial (no CLI rollback)      | Pass                      | Pass                | Pass              | Pass                   | 9     | $20 Pro (EU function region needs Pro)  |
| Fly.io             | Pass                           | Partial (Dockerfile, VMs) | Pass                | Pass              | Partial (experimental) | 8     | ~$0.5–3 pay-as-you-go, card required    |
| Railway            | Partial (rollback UI only)     | Pass                      | Pass                | Pass              | Partial (beta)         | 8     | $5 Hobby (includes $5 usage)            |

No hard filter removed a platform (no persistent connections, and every platform runs JS/TS). The cost-first answer
pushed Vercel and Netlify down; single region and external Supabase made edge networks and co-located databases
neutral.

- **Cloudflare Workers**: `wrangler deploy`, `wrangler rollback`, `wrangler versions upload/deploy` and
  `wrangler tail` are GA. Docs are at [llms.txt](https://developers.cloudflare.com/llms.txt). MCP servers exist at
  `mcp.cloudflare.com` (API, Builds, Observability, Docs); the docs don't state their GA/beta status (checked
  2026-09-24). The Free plan gives 100k requests/day with 10 ms CPU per request; Paid is $5 with 10M requests and 30M
  CPU-ms. Workers Builds (Git integration, PR preview URLs) has no explicit status label.
- **Render**: a native Node web service in Frankfurt, always on for $7 Starter. The Free tier takes about a minute to
  wake after 15 minutes idle, which breaks the "ranking under 3 s" target. The CLI (v2.28) deploys and tails logs, but
  rollback happens only in the dashboard or via the API. The MCP server looks GA; there's `llms.txt` plus `.md` pages.
- **Vercel**: the strongest DX. The Hobby plan bans commercial use (an internal company tool counts), so the real floor
  is $20/month. Functions default to `iad1` and must be pinned to `fra1`. The MCP server is in public beta.
- **Netlify**: runs Astro 7 fine (`@astrojs/netlify` 8.x). Functions default to Ohio, and EU regions need Pro ($20).
  When a Free plan runs out of credits, every site on the team is paused. There's no CLI rollback command.
- **Fly.io**: the cheapest always-available container option. It brings a Dockerfile, VM sizing (plan on 512 MB),
  rollback via `fly deploy --image`, an experimental `fly mcp server`, and no free tier for new orgs.
- **Railway**: $5 Hobby with an Amsterdam region and `railway up`/`logs`. Rollback is dashboard-only with 72 h image
  retention, and the MCP server is in beta.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

It passes all five criteria, costs the least, and is already wired up: adapter, `wrangler.jsonc` with observability
on, `.dev.vars` convention, and the deploy notes in AGENTS.md. `astro dev`/`astro preview` already run in workerd, so
local and production behave the same. There is nothing to migrate before the 2026-11-04 deadline.

#### 2. Render

The best non-edge fallback: an always-on Node process in Frankfurt, no cold starts, a GA MCP server, and docs available
as markdown. The gaps: rollback isn't in the CLI, it costs $7 instead of $5, and moving requires swapping to
`@astrojs/node` (standalone) and dropping the `.dev.vars`/wrangler setup.

#### 3. Fly.io

Cheapest container hosting with a full CLI loop. More to operate: a Dockerfile, VM memory sizing, a cold-start vs
always-on trade-off, and an experimental MCP server. It needs the same adapter swap as Render.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **The 10 ms CPU cap on the Free plan.** CSV parsing of up to 200 rows, React SSR of the ranked list, and
   cookie/JWT handling all run in one request. On a cold isolate that can exceed 10 ms and return error 1102, most
   likely during a rare outage when nothing is warm.
2. **Missing secrets fail silently.** `SUPABASE_URL`/`SUPABASE_KEY` are `optional: true` and `createClient()` returns
   `null`. A deploy without `wrangler secret put` goes green with auth disabled, and nothing alerts.
3. **workerd is not Node.** `nodejs_compat` covers most APIs, but a CSV or other library that uses `fs`, native
   streams or Node-only built-ins fails at runtime, not at build time.
4. **Rollback is code-only.** `wrangler rollback` does not revert Supabase migrations on the weights or weight-history
   tables.
5. **Round trips to Supabase dominate latency.** The Worker runs near the user, but every `getUser()` and weight read
   travels to the Supabase region. A non-EU Supabase project adds that latency to every request.

### Pre-Mortem — How This Could Fail

The team went live on the Free Workers plan because "10k requests a month is nothing". Traffic sat near zero for
weeks. The Supabase free project paused for inactivity, and nobody noticed because nobody logged in. On the night of a
major outage the operator opened the tool and saw the "auth unavailable" banner while the project woke up. Once it
did, uploading 150 tickets returned error 1102: parsing plus server rendering on a cold isolate went over 10 ms of CPU.
The operator went back to ranking by hand. The next day someone ran `wrangler rollback`, which changed nothing because
the problem wasn't in the code. Then someone rotated a secret with `wrangler secret put`, which immediately deployed a
new version and pushed half-finished work to production. The wrong assumptions were treating Workers as "Node in the
cloud", optimising $5/month for a tool whose whole value is concentrated in rare critical moments, and having no check
that the deployed URL can actually sign in and rank a file.

### Unknown Unknowns

- **`@astrojs/cloudflare` v13+ dropped Pages support.** `tech-stack.md` still says `cloudflare-pages`. Any Pages
  tutorial (`wrangler pages deploy`, Pages Functions) is wrong for this repo; the target is Workers + Static Assets.
- **`astro dev` and `astro preview` already run in workerd via the Cloudflare Vite plugin.** `wrangler dev` is
  redundant. `.dev.vars` is still what those commands read. `Astro.locals.runtime` is gone; the repo already reads env
  via `astro:env/server`, which is correct.
- **`wrangler secret put` creates and deploys a new version immediately.** To stage a secret without deploying, use
  `wrangler versions secret put`.
- **`*.workers.dev` and version preview URLs are public by default.** The login page is reachable by anyone.
  Cloudflare Access (free for small teams) can gate the whole hostname for an internal NOC tool.
- **The Worker is named `10x-astro-starter` in `wrangler.jsonc`.** That becomes the public `workers.dev` subdomain,
  so rename it before the first deploy.
- **Supabase free projects pause after a period of inactivity.** Not a Cloudflare issue, but fatal for a tool used
  mainly during rare outages. Verify the current Supabase policy and either upgrade or keep the project active.

## Operational Story

- **Preview deploys**: `npx wrangler versions upload` creates a non-live version with its own preview URL. Workers
  Builds (Git integration, no explicit status label as of 2026-09-24) can post preview URLs on PRs. Preview URLs are
  public unless the hostname is behind Cloudflare Access. Preview builds use the same secrets as production unless
  overridden.
- **Secrets**: production secrets live in Workers Secrets (`npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY`),
  and locally in `.dev.vars` plus `.env`, both gitignored. Anyone with Workers edit rights on the Cloudflare account
  can overwrite them, but nobody can read them back. Rotate by creating a new Supabase key, running `wrangler secret
put` (this deploys), then revoking the old key in Supabase.
- **Rollback**: `npx wrangler deployments list`, then `npx wrangler rollback <version-id>`. It takes effect in
  seconds and works on the last 100 versions. It does not revert Supabase migrations; write migrations
  forward-compatible, or ship a new fix-forward migration.
- **Approval**: a human approves production deploys (`wrangler deploy`, `wrangler versions deploy`), secret rotation,
  plan/billing changes, any Supabase migration against the cloud project, and anything that deletes data. An agent may
  run unattended: `npm run build`, `wrangler versions upload` (non-live), `wrangler tail`, `wrangler deployments list`
  and `wrangler versions list`.
- **Logs**: for runtime, `npx wrangler tail --format pretty` (live) and Workers Observability in `wrangler.jsonc`
  (already `enabled: true`), also readable through the Cloudflare Observability MCP server. For the pipeline, GitHub
  Actions logs via `gh run view --log`.

## Risk Register

| Risk                                                                                | Source           | Likelihood | Impact | Mitigation                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ---------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free-plan 10 ms CPU cap exceeded on CSV parse + SSR (error 1102)                    | Devil's advocate | M          | H      | Use Workers Paid ($5). Before launch, upload a 200-row CSV and read CPU time in Observability or `wrangler tail`.                                                     |
| Deploy without secrets → auth silently disabled in production                       | Devil's advocate | M          | H      | After every deploy, run `npm run smoke` against the deployed URL (once it signs in with a shared account), or at least check the sign-in page shows no config banner. |
| npm dependency uses Node-only APIs and fails in workerd at runtime                  | Devil's advocate | M          | M      | Prefer pure-JS or Web-API libraries (or a hand-written CSV parser). Always test with `npm run preview`, which runs workerd.                                           |
| Rollback reverts code but not Supabase schema                                       | Devil's advocate | L          | M      | Keep migrations additive/backwards-compatible; fix forward with a new migration instead of rolling back the schema.                                                   |
| Supabase project in a far region adds latency to every request                      | Devil's advocate | L          | M      | Create the cloud Supabase project in an EU region (e.g. Frankfurt); check the 3 s target end-to-end.                                                                  |
| Supabase free project paused by inactivity; tool dead when an outage hits           | Pre-mortem       | M          | H      | Confirm the current Supabase pause policy. Upgrade, or run a scheduled keep-alive ping (e.g. a GitHub Actions cron hitting a lightweight endpoint).                   |
| No monitoring; broken production found only during an outage                        | Pre-mortem       | M          | H      | Add a scheduled check (GitHub Actions cron) that loads the deployed sign-in page and alerts on failure.                                                               |
| `wrangler secret put` deploys whatever version is current                           | Unknown unknowns | M          | M      | Rotate with `wrangler versions secret put` then deploy explicitly, or only rotate from a clean `master` build.                                                        |
| Following Pages tutorials despite Workers target (adapter v14 has no Pages support) | Unknown unknowns | M          | L      | Treat `wrangler.jsonc` + `wrangler deploy` as the source of truth; ignore `wrangler pages *` commands.                                                                |
| Public `workers.dev` / preview URLs expose the login page to the internet           | Unknown unknowns | H          | L      | Put the hostname behind Cloudflare Access (free tier), or at least disable preview URLs if unused.                                                                    |
| Default Worker name `10x-astro-starter` becomes the public hostname                 | Unknown unknowns | H          | L      | Rename `name` in `wrangler.jsonc` to `noc-priority` before the first deploy.                                                                                          |
| MCP servers and Workers Builds have no explicit GA label                            | Research finding | L          | L      | Treat both as conveniences; the wrangler CLI is the primary operational path.                                                                                         |

## Getting Started

Validated against the installed versions: `astro` 7.3.2, `@astrojs/cloudflare` 14.3.1, `wrangler` 4.131.1.

1. Rename the Worker: set `"name": "noc-priority"` in `wrangler.jsonc`. This sets the `noc-priority.<account>.workers.dev`
   hostname. Upgrade the account to Workers Paid ($5) in the dashboard, the one step that isn't in the CLI.
2. Authenticate: `npx wrangler login`, then `npx wrangler whoami` to confirm the account.
3. Build and verify locally in workerd: `npx astro sync && npm run lint && npx astro check && npm run build`, then
   `npm run preview` (it reads `.dev.vars`; no `wrangler dev` needed with adapter v14).
4. Set production secrets from the EU-region cloud Supabase project: `npx wrangler secret put SUPABASE_URL` and
   `npx wrangler secret put SUPABASE_KEY`. Turn off email confirmation in that project's Auth settings.
5. Deploy and watch: `npx wrangler deploy`, then `npx wrangler tail --format pretty` while signing in and uploading a
   200-row CSV. Confirm there's no config banner and CPU time is well under the limit.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
