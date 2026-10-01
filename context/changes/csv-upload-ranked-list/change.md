---
change_id: csv-upload-ranked-list
title: Csv upload ranked list
status: implementing
created: 2026-09-30
updated: 2026-10-01
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-10-01: Manual checks 2.3–2.6 passed against the cloud project. Every bad-file case shows the same generic message. Per-case messages are deferred to S-03 (`csv-error-messages`), marked `TODO(S-03)` in `src/pages/dashboard.astro`.
- 2026-10-01: In this shell `NODE_ENV=production` makes `astro dev` time out at startup. Run it with `NODE_ENV` unset.
