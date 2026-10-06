-- Follow-up to weights_admin (S-04): update_scoring_weights() now fails loudly unless it updated all six weights.
-- The applied weights_admin migration stays untouched; this replaces the function with the same signature.
-- Nothing can delete a weight row today (only superuser/service role), so this guards against a future gap
-- making a save report success while writing fewer than six values.

create or replace function public.update_scoring_weights(
  p_warning numeric,
  p_minor numeric,
  p_major numeric,
  p_critical numeric,
  p_customer numeric,
  p_service numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated integer;
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'only admin can update scoring weights' using errcode = 'insufficient_privilege';
  end if;

  update public.scoring_weights
  set value = case key
    when 'warning' then p_warning
    when 'minor' then p_minor
    when 'major' then p_major
    when 'critical' then p_critical
    when 'customer' then p_customer
    when 'service' then p_service
  end
  where key in ('warning', 'minor', 'major', 'critical', 'customer', 'service');

  get diagnostics updated = row_count;
  if updated <> 6 then
    -- Raising rolls the whole statement back, so a partial save never persists.
    raise exception 'expected to update 6 scoring weights, updated %', updated;
  end if;
end;
$$;

-- CREATE OR REPLACE keeps existing privileges; restated so this file is correct on its own.
revoke execute on function public.update_scoring_weights(numeric, numeric, numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.update_scoring_weights(numeric, numeric, numeric, numeric, numeric, numeric)
  to authenticated;
