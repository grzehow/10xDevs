-- THROWAWAY: break-check for PR #10. Never merge.
create policy scoring_weights_update_operator_break on public.scoring_weights
  for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'operator')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'operator');
