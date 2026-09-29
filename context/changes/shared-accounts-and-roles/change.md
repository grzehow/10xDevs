---
change_id: shared-accounts-and-roles
title: Shared accounts and roles
status: implementing
created: 2026-09-29
updated: 2026-09-29
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-29: Local Supabase is unavailable (no Docker), so verification runs against the cloud project. The operator and admin users were created there by the admin API, with generated passwords that aren't in the repo. Check 1.1 (`db reset`) was replaced by that.
- 2026-09-29: Check 2.2 (smoke still passes) is deferred to 3.3. After Phase 2, the user that smoke signs up has no role, so it's treated as signed out. Phase 3 rewrites smoke to sign in as the operator.
