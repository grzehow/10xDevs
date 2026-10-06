# Score breakdown — Plan Brief

> Full plan: `context/changes/score-breakdown/plan.md`

## What & Why

Roadmap S-02 (US-01, FR-005). The operator can expand any ranked row and see the three components of its score. Without this the operator can't check whether the ranking makes sense, and that check is the product's explainability guardrail.

## Starting Point

`rankTickets` (`src/lib/ranking.ts:57`) computes the score inline and throws the component points away. The dashboard renders a flat `<ol>` of rank, id and score (`src/pages/dashboard.astro:70-80`).

## Desired End State

Collapsed rows stay terse (rank, id, score). Expanding a row shows `Krytyczność: major = 10,0`, `Klienci: 2 × 3,0 = 6,0` and `Usługi: 5 × 1,0 = 5,0`, which add up to the displayed `21,0`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Component display | value × weight = points | The operator can verify the arithmetic, and the PRD already lets them see the weight values. |
| Expand mechanism | Native `<details>` | Zero JS and built-in keyboard and screen-reader support inside a server-rendered page. |
| Where points come from | `rankTickets` returns `points` | The domain math stays unit-testable, and the score stays the identical float sum. |
| Verification | Unit tests + smoke assertion | Covers both the math and the rendered page with the existing test runners. |

## Scope

**In scope:** `points` on `RankedTicket`, a `<details>` per row with three Polish-labelled lines, unit tests, and a smoke check for the breakdown hooks.

**Out of scope:** React island or script, expand-all, Playwright, changes to formula, ordering or CSV format, error messages (S-03).

## Architecture / Approach

`rankTickets` computes the three points, then sums them into `score` in the same order as today. `rankUpload()` also returns the weights it loaded. The template formats points and weights with the existing pl-PL `scoreFormat`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Component points in the ranking | `points` on every ranked ticket, unit-tested | Changing the float sum order would shift tie behaviour |
| 2. Expandable rows on the dashboard | `<details>` breakdown + smoke check | Losing `data-ticket-id` on `<li>` breaks the smoke test |

**Prerequisites:** S-01 code present on this branch (merge `9ca8317`).
**Estimated effort:** ~1 session, 2 small phases.

## Open Risks & Assumptions

- Smoke needs a running server plus a reachable Supabase. With no Docker locally, that means the cloud project.

## Success Criteria (Summary)

- Expanding the PRD example row shows 10,0 + 6,0 + 5,0 = 21,0.
- Collapsed list unchanged in density, and ranking stays byte-identical.
- CI (lint, test, check, build, smoke) is green.
