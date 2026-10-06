# CSV Ingestion Contract Tests — Plan Brief

> Full plan: `context/changes/testing-csv-ingestion-contract/plan.md`
> Research: `context/changes/testing-csv-ingestion-contract/research.md`

## What & Why

This is rollout Phase 1 of the test plan. It proves that a bad CSV is rejected as a whole, that customers and services can't be swapped silently, and that hostile values are rejected on the server and never scored (risks #1, #3, #6). The parser is already all-or-nothing. These tests make sure it stays that way when S-03 adds per-case messages.

## Starting Point

`rankTickets` (`src/lib/ranking.ts`) holds every CSV rule and has a good unit suite. Most rejected fixtures, though, put the bad row as the only row. The upload guards (size, body, file field) live in `dashboard.astro` frontmatter and are untested. The smoke upload uses symmetric counts `1,1`.

## Desired End State

`npm test` fails on:

- a skipped bad row,
- an unrejected hostile count or severity,
- a weakened upload guard,
- a rejected file that reaches the weights DB read.

`npm run smoke` fails if a bad file renders any ticket or the customers/services lines are swapped. Test-plan §6.2 documents the patterns.

## Key Decisions Made

| Decision                                 | Choice                                                                          | Why (1 sentence)                                                           | Source           |
| ---------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| Risk #1 scope                            | Whole-file rejection plus no list rendered; named messages left to S-03         | Messages aren't implemented, and asserting copy is an anti-pattern         | Research (user)  |
| Integration surface                      | `/dashboard` form POST, not an API                                              | No upload API route exists                                                 | Research         |
| Harness                                  | Move `rankUpload` into `src/lib/upload.ts` and unit-test it, plus 2 smoke steps | Guards run in the fast `ci` job; render rules get real-runtime proof       | Plan (user)      |
| Error contract of the extracted function | Returns `{ error: "file" \| "weights" }`; the page maps it to Polish copy       | Tests assert the kind, not the copy                                        | Plan             |
| "Never scored" proof                     | Count weights-loader calls; rejected files make 0                               | The loader is the first step after the guards, so 0 calls means no scoring | Plan             |
| Mapping fixtures                         | Asymmetric counts and non-default weights                                       | Equal counts or default weights can hide a swap or constants fallback      | Test plan / Plan |
| Phase granularity                        | 2 phases (unit, then smoke + cookbook)                                          | User asked to merge                                                        | Plan (user)      |

## Scope

**In scope:**

- New parser fixtures: bad row after valid rows; hostile counts and severities; asymmetric mapping with non-default weights
- `src/lib/upload.ts` with `upload.test.ts`
- 2 smoke steps
- Test-plan §5/§6 updates

**Out of scope:**

- S-03 reason codes and messages
- Copy assertions
- Oversized-file smoke
- Chunked-body platform limits
- Astro container API
- New runners
- Quoted-field support

## Architecture / Approach

The page becomes thin: it builds a weights loader from Supabase, calls `rankUpload(request, loadWeights)`, maps the error kind to copy, and renders. Everything that can reject an upload is in `src/lib/` and covered by `node --test`. The live smoke checks only what the template alone can break.

## Phases at a Glance

| Phase                                           | What it delivers                                    | Key risk                                            |
| ----------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| 1. Unit coverage and extracting upload handling | New fixtures, `upload.ts` and tests, mutation check | The refactor changes guard order or behaviour       |
| 2. Smoke + cookbook                             | 2 smoke steps, test-plan §6.2/§6.5/§5               | Smoke assumes default weights in the target project |

**Prerequisites:** Node ≥ 22.18. The CI `smoke` job is used for Phase 2 verification (no local Docker).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- The smoke asymmetric step assumes PRD default weights, as the existing `19,0` step does. A cloud project with edited weights fails both steps.
- A Node `Request` with a `FormData` body may not expose `content-length`, so the guard test sets the header explicitly.

## Success Criteria (Summary)

- A bad row anywhere in the file, or any hostile value, gives an alert and no list. This is proven in unit tests and on the live runtime.
- Swapping customers and services, in the parser or the template, fails a test.
- The next contributor can add a rejection or mapping test from §6.2 alone.
