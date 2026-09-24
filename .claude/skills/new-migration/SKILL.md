---
name: new-migration
description: Create a Supabase migration in supabase/migrations/ with this repo's timestamp naming and its mandatory RLS policy shape. Use when adding or altering a table, column, or policy, or when asked for a migration or schema change.
---

# New migration

`supabase/migrations/` does not exist yet in this repo — create it on the first migration. The weights table, the weight-change history table, and the two shared accounts are all still owed.

## Naming

`supabase/migrations/YYYYMMDDHHmmss_short_description.sql` — UTC timestamp, then a snake_case description. Get the timestamp from the clock, never by incrementing an existing file's.

## Required shape

Every migration that creates a table must, in the same file:

1. Create the table.
2. `alter table ... enable row level security;`
3. Add **granular** policies — one per operation (`select`, `insert`, `update`, `delete`) per role, never a single `for all` catch-all, and never `using (true)` without a stated reason in a comment.

The access split this app enforces:

- **operator** — cannot read weights, cannot change weights, cannot read weight history. Policies must deny, not merely omit.
- **admin** — full read/write on weights; append-only on weight history.
- Weight history rows record the account and a timestamp, never a person's identity.
- Uploaded tickets are never persisted. If a migration creates a tickets table, stop and confirm with the user first — it contradicts the PRD.

## After writing

1. `npx supabase start` if it is not already running.
2. `npx supabase db reset` to replay every migration from scratch, which is the only way to catch an ordering or idempotency mistake.
3. Verify the policies actually block what they should — query the table as each role rather than assuming the policy text is correct.

Report the migration filename and the reset output.
