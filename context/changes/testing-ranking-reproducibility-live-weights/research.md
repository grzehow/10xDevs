---
date: 2026-10-06T15:49:35+02:00
researcher: Claude (Opus 5.5)
git_commit: 98570e9
branch: master
repository: 10xDevs
topic: "Ground test-plan Phase 2 (ranking reproducibility and live weights): risks #2, #5"
tags: [research, testing, ranking, weights, smoke, dashboard]
status: complete
last_updated: 2026-10-06
last_updated_by: Claude (Opus 5.5)
---

# Research: Ground test-plan Phase 2 — ranking reproducibility and live weights

**Date**: 2026-10-06T15:49:35+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 98570e9. The working tree has unrelated uncommitted `.claude/` changes and 8 files whose line endings were converted to LF. None of the cited files differ in content.
**Branch**: master
**Repository**: 10xDevs

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` for two risks:

- **#2:** the same file uploaded twice gives a different order or different scores.
- **#5:** scoring uses stale or hard-coded weights after an admin saves new ones.

For each risk, the research covers the failure path, the existing tests, the cheapest useful test layer and any corrections to the response guidance. It also grounds:

- the sort comparator and its tie-break chain,
- what "serialized output" means for this app,
- where scoring reads weights on each request,
- any caching between a weights save and the next upload.

Scope inspected:

- Code: `src/lib/ranking.ts`, `src/lib/ranking.test.ts`, `src/lib/upload.ts`, `src/lib/upload.test.ts`, `src/lib/supabase.ts`, `src/pages/dashboard.astro`, `src/pages/admin/weights.astro`, `src/middleware.ts`, `src/layouts/Layout.astro` and `src/components/*.astro` (grep only).
- Scripts and config: `scripts/smoke.mjs`, `wrangler.jsonc`.
- Database: the three files in `supabase/migrations/` and the two in `supabase/tests/database/`.
- Earlier change plans: `context/changes/persisted-weights/plan.md` and `context/changes/weights-admin/plan.md`.

I did this locally because the scope is two connected areas, so no sub-agents were needed. I ran no tests.

## Summary

- **Risk #2 is mostly covered already, at unit level.**
  - `rankTickets` is a pure function: it doesn't use the clock, randomness or locale (`ranking.ts:42-76`).
  - The comparator orders by rounded score, then severity, then `ticket_id` code-point ascending (`ranking.ts:69-74`). Duplicate ids are rejected (`:54`), so the order is total. Sort stability never matters.
  - Four existing tests pin this down:
    - "is deterministic and independent of row order" (`ranking.test.ts:163`) compares the whole `RankResult` across three permutations. The fixture has two score ties.
    - "float-equal scores still reach severity tie-break" (`:59`).
    - "equal score goes to higher severity" (`:55`).
    - "equal score and severity go to ticket_id ascending" (`:66`).
  - **What isn't covered is the rendered page.** "Serialized output" in this app is the HTML list that `/dashboard` renders (`dashboard.astro:60-90`), formatted with `Intl.NumberFormat("pl-PL")` (`:13`). No test compares two renders of the same upload.
- **Risk #5: weights are read from the DB on every upload, with no cache and no constants fallback.**
  - `dashboard.astro:18-22` builds `loadWeights` per request. It runs a Supabase `select` on `scoring_weights`, and `rankUpload` calls it after the file guards (`upload.ts:18-24`).
  - A null or thrown load renders `WEIGHTS_ERROR` rather than falling back to defaults.
  - Searching `src/` (non-test `.ts`, `.astro`, `.tsx`) found no default-weight literals and no module-level cache.
  - The defaults live only in the migration (`20260929120000_scoring_weights.sql:11-18`).
- **Existing #5 coverage proves only half of what the guidance asks.**
  - The smoke step "upload ranks with the new weights" (`smoke.mjs:176-192`) changes **only `major`** (to 12). The next upload in the same running server must score `12 + customer×2 + service×5`.
  - `customer` and `service` keep their seeded values, so a fallback to constants for those two weights would pass. The guidance's "must challenge" point holds for them.
- **Cheapest useful layers:**
  - **#2:** one smoke step that uploads the same file twice and compares the two rendered `<ol>` blocks byte for byte. The fixture should include tied and float-equal-tie rows. Unit coverage already exists.
  - **#5:** extend the existing admin smoke round-trip so it saves non-default values for `customer` and `service` too, and checks the next upload against them. Add one unit test proving `rankUpload` doesn't memoize weights between calls.

## Detailed Findings

### Sort comparator and tie-break chain (risk #2)

`ranking.ts:66-74`:

```ts
scored.push({ ticketId, severity, customers, services, points, score, key: Math.round(score * 1e9) });
...
scored.sort(
  (a, b) =>
    b.key - a.key ||
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    (a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0),
);
```

- Level 1 is the score, descending. It compares a key rounded to 1e-9, so float noise like `0.1+0.1+0.1` vs `0.3` counts as a tie (comment at `:64`). Test: `ranking.test.ts:59`.
- Level 2 is severity, descending, as the PRD requires (AGENTS.md domain rules). Test: `:55`.
- Level 3 is `ticket_id`, ascending by UTF-16 code unit (`<`/`>`, not `localeCompare`). The result doesn't depend on runtime ICU or locale data. Test: `:66` expects `["B", "a", "b"]`, which a `localeCompare` change would break.
- `ticket_id` is unique within a file (`ranking.ts:54`, test `:86`). So two rows can never compare equal, and the order doesn't depend on how stable the engine's sort is.
- Key precision: for scores far above 2^53 / 1e9 ≈ 9.0e6, `score*1e9` loses integer precision. Weights are capped at 1000 with 2 decimals (DB CHECK) and counts have at most 9 digits (`ranking.ts:24`). Under those limits, distinct scores differ by at least 0.01, so their keys still differ by about 1e7, far above the float spacing (≈2.6e5 at the maximum score of ≈2e12). This is not a reproducibility risk. Even a collapsed key would fall through to the deterministic severity and id levels. (Arithmetic inference; not tested.)

**Existing determinism test:** `ranking.test.ts:163-169` ranks six rows (`A minor 1,1`, `B major 0,5`, `C critical 0,0`, `D warning 3,2`, `E minor 1,1`, `F major 2,5`). With the default weights, A and E tie at 9, and B and C tie at 15. The test deep-compares the full `RankResult` (ranks, points, scores) from the original order, a repeat run, the reverse order and a shuffle. That answers the "one test with distinct scores proves stability" challenge, because the fixture has ties on two levels.

**Gap:** that test compares the function with itself. It proves the result doesn't depend on input order, not that the order is _correct_. The correct order comes from tests `:55`, `:59` and `:66` with hand-written expected ids, so the oracle rule is already met across the set. No new unit test is needed for #2 unless the plan wants one fixture that mixes every tie level with a hand-derived expected order. That would be a readability gain, not new protection.

### What "serialized output" means (risk #2)

- The app persists nothing about uploads (AGENTS.md). The only output is the HTML from POST `/dashboard`: the `<ol>` with one `<li data-ticket-id=…>` per ticket, holding the rank, id and formatted score, plus the expanded components (`dashboard.astro:60-90`).
- Scores and weights go through `Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 2 })` (`dashboard.astro:13`). Within one runtime build this is deterministic. It can differ between Node and workerd ICU builds, but byte identity only matters between two uploads on the same deployment.
- Grepping `Layout.astro`, `src/components/*.astro` and `dashboard.astro` for `new Date`, `Date.`, `Math.random`, `nonce`, `crypto`, `getFullYear` and `import.meta.env` found no matches. So nothing in the inspected templates varies per request. **Not verified:** whether Astro 7 or the Cloudflare adapter add per-request markup such as a CSP nonce. A byte comparison limited to the `<ol>…</ol>` slice avoids depending on that.
- **Correction to the response guidance:** "byte-identical serialized output" already holds for the `RankResult` object at unit level. The rendered list is the part with no protection. Assert at the smoke layer on the `<ol>` slice, not the whole page.

### Where scoring reads weights, and caching (risk #5)

Request path for an upload:

1. `middleware.ts:7-40` creates a Supabase client per request (`:8`) and checks the role. It holds no state between requests.
2. `dashboard.astro:18-22` defines `loadWeights()` inside the frontmatter, which runs once per request. It calls `createClient(Astro.request.headers, Astro.cookies)` and then `.from("scoring_weights").select("key, value")`, and returns `parseWeights(result.data)` or `null`.
3. `upload.ts:18-24` calls `loadWeights()` once per `rankUpload`, after the file guards. A throw or `null` returns `{ ok: false, error: "weights" }`. There is no fallback.
4. `upload.ts:26` passes the loaded weights to `rankTickets`. `ranking.ts:59-63` reads every point from the `weights` argument and nothing else.

Admin save path: `admin/weights.astro:28-42` POSTs to the RPC `update_scoring_weights` with all six values, then redirects to `/admin/weights?saved=1`. The RPC (`20261006100613_update_weights_row_check.sql:6-43`) updates all six rows in one statement and raises unless exactly 6 rows changed. So after a 302 the new values are committed.

Caching, inspected and found absent:

- No module-level variable holds weights. The grep for `cache`, `Cache-Control`, `prerender`, `globalThis` and `let … weights` in non-test `src` code matched only the local `let weights` in `upload.ts:18`.
- No HTTP caching applies. The upload is a POST. `wrangler.jsonc` declares no cache or KV bindings. The middleware sets no cache headers.
- No hard-coded defaults exist. Grepping non-test `src` for `15\.0`, `critical: 15` and `customer: 3` found nothing. The defaults sit only in `20260929120000_scoring_weights.sql:11-18`. That matches the decision recorded in `persisted-weights/plan.md:29,152`.

**Verdict on #5:** the risk describes a _future_ regression, not a current defect. Someone could add a defaults fallback when the weights load fails, or memoize weights in `src/lib` or at module level for speed. The guidance is still valid as protection against that regression. Today's code just shows the risk isn't currently realized.

### Existing coverage for #5

| Layer | Test                                                                                                                   | What it proves                                                                                                                                                                                                                                                 | Gap                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit  | "each point follows its own weight" (`ranking.test.ts:34`)                                                             | Every point uses the weight passed in, with all six weights non-default (`0.1/0.3/1.5/2/0.7/0.2`)                                                                                                                                                              | Covers only `rankTickets`, not the loading                                                                                                                                              |
| unit  | "customers and services map to their own weights" (`ranking.test.ts:136`)                                              | Non-default `customer: 4`, `service: 0.5`                                                                                                                                                                                                                      | Same                                                                                                                                                                                    |
| unit  | `upload.test.ts` (injected loader stub)                                                                                | Guards and the weights-error path                                                                                                                                                                                                                              | No test calls `rankUpload` twice with different loader results, so memoization inside `rankUpload` isn't ruled out by a test                                                            |
| unit  | `parseWeights` tests (`ranking.test.ts:175,180`)                                                                       | Rows → `Weights` mapping                                                                                                                                                                                                                                       | —                                                                                                                                                                                       |
| pgTAP | `weights_admin.test.sql:20-27` and others                                                                              | The RPC writes `major` 10→12 and records history                                                                                                                                                                                                               | DB only, no scoring                                                                                                                                                                     |
| smoke | "admin saves major=12" → "upload ranks with the new weights" → "admin restores original weights" (`smoke.mjs:176-193`) | On the real runtime, with no restart between save and upload, the next upload uses the saved `major`. The expected score is `12 + original.customer×2 + original.service×5`, taken from the values the form showed (`:187-191`), not from the code under test. | Only `major` changes. `customer` and `service` keep their seeded values, so a defaults fallback for those two would pass. Only the total score is checked, not the per-component lines. |

The weights-admin plan already named this smoke step as "the only automated check that the form fields reach the right `p_*` arguments" (`weights-admin/plan.md:158`). It still is.

**Cheapest additions for #5:**

1. **Smoke, extending the admin round-trip.** Save `major`, `customer` and `service` all at non-default values, for example `major=12`, `customer=4`, `service=0,5` (pl-PL form input, at most 2 decimals, range 0–1000 per the DB CHECK). Upload an asymmetric row and assert the total plus the `customer` and `service` component lines, all derived by hand from the saved values. Restore afterwards, as the existing step does. This catches a defaults fallback on any of the three weights. (A customer↔service swap in the RPC mapping is already caught today: with seeded 3 and 1 the expected score is 12+6+5 = 23 and a swap gives 12+2+15 = 29.)
2. **Unit.** Call `rankUpload` twice with loaders that return different weights, and assert the second result reflects the second weights. This is cheap, and it rules out memoization inside the extracted function. A cache added elsewhere in `src/lib` would still need the smoke check.

### Existing coverage for #2 beyond unit

- The smoke runs four uploads (`smoke.mjs:106-131`, the two Phase 1 steps after them, and `:178-192`), but never the same file twice in a row. No step compares renders.
- **Cheapest addition:** in the operator section, upload the same file twice with unchanged weights. Use a fixture with a score tie, a float-equal tie and a code-point id tie, and assert the two `<ol>…</ol>` slices are identical. Also assert that one hand-derived id order appears, so a page that renders nothing on both runs can't pass.

## Code References

- `src/lib/ranking.ts:19` — `SEVERITY_RANK` (the tie-break order)
- `src/lib/ranking.ts:54` — duplicate `ticket_id` is rejected, which makes the order total
- `src/lib/ranking.ts:59-66` — points from the `weights` argument; rounded sort key
- `src/lib/ranking.ts:69-74` — three-level comparator
- `src/lib/ranking.test.ts:55,59,66,163` — tie-break and determinism tests
- `src/lib/ranking.test.ts:34,136` — non-default weights at unit level
- `src/lib/upload.ts:18-26` — one weights load per call; no fallback
- `src/pages/dashboard.astro:13` — pl-PL score formatter
- `src/pages/dashboard.astro:18-22` — `loadWeights`, a DB read on each request
- `src/pages/dashboard.astro:60-90` — the rendered `<ol>`, which is the serialized output
- `src/pages/admin/weights.astro:28-42` — admin save via the RPC, then a 302
- `supabase/migrations/20261006100613_update_weights_row_check.sql:26-41` — six-row atomic update
- `supabase/migrations/20260929120000_scoring_weights.sql:11-18` — the only place the defaults are set
- `scripts/smoke.mjs:53-73` — `readWeights` / `saveWeights` helpers (form round-trip, pl-PL strings)
- `scripts/smoke.mjs:176-193` — current live-weights round-trip (`major` only)

## Architecture Insights

- Both risks reduce to the same seam: `rankUpload(request, loadWeights)` with an injected loader (the Phase 1 extraction). Unit tests can drive weights per call without a DB. The real DB read is in `dashboard.astro`, and only the smoke reaches it.
- The smoke's admin section is stateful against whatever project it targets. Any new weight change has to be restored in the same run, as `saveWeights()` already does (AGENTS.md tripwires: two `scoring_weight_changes` rows per run on a cloud project). Changing three weights instead of one adds more history rows per save, still two saves per run. The `weights_admin` history trigger records one row per _changed_ weight (`20261005120000_weights_admin.sql:33`), so a run would add 6 rows instead of 2.

## Historical Context (from prior changes)

- `context/changes/persisted-weights/plan.md:29,152` — the defaults live in the migration, not in code. **Supported** (grep found no literals in `src`).
- `context/changes/weights-admin/plan.md:158` — the smoke round-trip is the only automated check of the form → RPC mapping, and "a customer↔service swap passes every other test". **Supported**: no other test reaches the form → RPC mapping, and the round-trip does catch that swap because the seeded `customer` (3) and `service` (1) differ (expected 23, swapped 29). What it does not catch is a constants fallback for `customer`/`service`, since those keep their seeded values; finding #5.1 above closes that.
- `context/changes/testing-csv-ingestion-contract/` (Phase 1) — introduced the injectable `loadWeights` seam and the `data-*` assertion style in smoke. Reused here.

## Related Research

- `context/changes/testing-csv-ingestion-contract/research.md` — upload path and harness options (Phase 1).

## Open Questions

1. **Should Phase 2 keep a unit test for #2 at all?** The existing tests already cover the tie levels with hand-derived orders. This is a plan-scope call; the default is that the smoke render comparison is enough.
2. **Smoke history growth.** Changing three weights adds 6 `scoring_weight_changes` rows per run instead of 2, on any cloud project the smoke targets. That's acceptable or not depending on how often the smoke runs against the cloud project. It runs locally in CI against a fresh Supabase. This is a user decision for `/10x-plan`.
3. **Test-plan wording (candidate backports to §2):**
   - #2's guidance should name the rendered `<ol>` as the unprotected output (the `RankResult` object is already covered).
   - #5's "Context" should note that the existing smoke round-trip covers `major` only.
