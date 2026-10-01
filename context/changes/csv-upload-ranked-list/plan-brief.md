# CSV Upload and Ranked List — Plan Brief

> Full plan: `context/changes/csv-upload-ranked-list/plan.md`

## What & Why

S-01, the north star: a signed-in operator uploads a CSV of tickets and gets them ranked by descending priority, with the score and rank on every row. This is the PRD's main success criterion. Until it works, no other requirement matters.

## Starting Point

F-01 gave `/dashboard` a resolved `operator | admin` role, and F-02 put the six scoring weights in `public.scoring_weights`, readable by both roles through RLS. The dashboard is still a placeholder. The repo has no CSV parser, no unit test runner and no `test` script.

## Desired End State

On `/dashboard`, the operator picks a `.csv` file and submits. The page reloads with an ordered list of rank, `ticket_id` and score, computed from the current DB weights. The same file with the same weights gives byte-identical output. A bad file, or weights that can't be loaded, shows one Polish error message and no list, and the form stays ready for a re-upload.

## Key Decisions Made

| Decision      | Choice                                                                | Why (1 sentence)                                                                   |
| ------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Architecture  | Native form POST to `/dashboard`, scored server-side, `.astro` render | No API route, React or client state for a list that is shown once and thrown away. |
| Tie-break     | Score desc → severity desc → `ticket_id` asc (code-unit compare)      | Same ticket set gives the same order even if the file's rows are shuffled.         |
| Header row    | Exactly `ticket_id,severity,number_of_customers,number_of_services`   | Catches the customers/services swap the roadmap flags as the main silent risk.     |
| Bad files     | Reject the whole file, one generic Polish message                     | Never ranks a partial queue; S-03 refines messages per case later.                 |
| Duplicate IDs | Reject the file                                                       | No double-counted incident, and the `ticket_id` tie-break stays unambiguous.       |
| Size limit    | ≤ 1 MB and ≤ 1000 data rows                                           | Bounds Worker CPU/memory with headroom above the PRD's 200 tickets.                |
| Weights       | Read per upload; fail closed unless all six keys are finite numbers   | F-02 contract: never score with missing or zero weights.                           |
| Tests         | `node:test` on `.ts` via Node's type stripping, plus `npm test` in CI | Pins the ranking rules with no test framework; only `@types/node` gets pinned.     |

## Scope

**In scope:** `src/lib/ranking.ts` (parse, validate, score, sort) and its test file; a `test` script and CI step; the upload form, ranked list and error states on `/dashboard`; one smoke upload step; doc updates saying a test script now exists.

**Out of scope:** per-case error messages (S-03), expanding rows to show components (S-02), a weights screen or history (S-04/S-05), persisting uploads, ticket actions, quoted CSV fields, and header-by-name parsing.

## Architecture / Approach

```
form POST (multipart) ─▶ dashboard.astro ─▶ scoring_weights (RLS select) ─▶ parseWeights
                                        └─▶ rankTickets(csv, weights) ─▶ <ol> rank · id · score
```

All the rules live in the pure module, and the page only moves data around.

## Phases at a Glance

| Phase                           | What it delivers                                             | Key risk                                              |
| ------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| 1. Ranking core                 | Tested parse/score/sort module, `npm test` in CI             | Excel BOM/CRLF input failing the exact-header check   |
| 2. Upload and list on dashboard | Form POST, weights read, list/error render, smoke step, docs | Smoke multipart upload through the session cookie jar |

**Prerequisites:** F-02 migration applied (local: already; cloud: `npx supabase db push` before deploy). Node ≥ 22.18 for native TS type stripping.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Node's type stripping needs 22.18+. CI's `node-version: 22` resolves to the latest 22.x, and local is Node 24.
- Score formatting uses the `pl-PL` locale (`21,0`). That's a display choice only; ordering uses the raw numbers.
- Every POST returns HTTP 200 and errors are page content. This is fine for an internal tool and keeps re-upload simple.

## Success Criteria (Summary)

- The operator uploads a file and the top row is the highest-priority ticket, with ties resolved deterministically.
- The same file gives the same list every time; a bad file gives a clear Polish error and never a partial list.
- CI fails if any ranking rule or the upload path regresses.
