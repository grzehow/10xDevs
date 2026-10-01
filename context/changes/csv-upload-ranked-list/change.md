---
change_id: csv-upload-ranked-list
title: Csv upload ranked list
status: impl_reviewed
created: 2026-09-30
updated: 2026-10-01
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-10-01: Manual checks 2.3–2.6 passed against the cloud project. Every bad-file case shows the same generic message. Per-case messages are deferred to S-03 (`csv-error-messages`), marked `TODO(S-03)` in `src/pages/dashboard.astro`.
- 2026-10-01: In this shell `NODE_ENV=production` makes `astro dev` time out at startup. Run it with `NODE_ENV` unset.
- 2026-10-01: Unplanned addition, commit `61e57f3`: `session: false` in `astro.config.mjs`. The Cloudflare adapter enables Astro sessions by default and adds a `SESSION` KV binding with no namespace id, which `wrangler preview` rejects (code 10021). That failed the Workers Builds check on PRs #12–#14. Nothing uses Astro sessions; auth lives in Supabase cookies.
- 2026-10-01: Impl review fixes: `Content-Length` early rejection on `/dashboard`, counts capped at 9 digits, smoke checks the `19,0` formatted score.
