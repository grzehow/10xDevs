-- Weights admin (S-04). Builds on scoring_weights (F-02), which stays untouched.
-- Access: admin saves all six weights through update_scoring_weights() and reads the history; operator sees neither.
-- Role comes from the JWT (`app_metadata.role`), as in F-02. History stores that role, never an email or user id.

-- A weight is a non-negative number up to 1000 with at most two decimals.
-- NaN and Infinity sort above every finite numeric, so `<= 1000` rejects them too.
alter table public.scoring_weights
  add constraint scoring_weights_value_range check (value >= 0 and value <= 1000 and value = round(value, 2));

-- Only `value` is editable; `key` is the row identity and must never change.
revoke update on public.scoring_weights from authenticated;
grant update (value) on public.scoring_weights to authenticated;

create table public.scoring_weight_changes (
  id bigint generated always as identity primary key,
  key text not null references public.scoring_weights (key),
  old_value numeric not null,
  new_value numeric not null,
  account text not null,
  changed_at timestamptz not null default now()
);

alter table public.scoring_weight_changes enable row level security;

-- Rows are written only by the trigger below; no role gets INSERT, UPDATE or DELETE.
revoke all on public.scoring_weight_changes from anon, authenticated;
grant select on public.scoring_weight_changes to authenticated;

create policy scoring_weight_changes_select_admin on public.scoring_weight_changes
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- One history row per changed weight. SECURITY DEFINER because no caller may insert into the history table.
-- Without a JWT (SQL editor, service role, data-fix migration) the account falls back to the database role.
create function public.log_scoring_weight_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.scoring_weight_changes (key, old_value, new_value, account)
  values (
    old.key,
    old.value,
    new.value,
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', current_user)
  );
  return null;
end;
$$;

revoke execute on function public.log_scoring_weight_change() from public, anon, authenticated;

create trigger scoring_weights_log_change
  after update on public.scoring_weights
  for each row
  when (old.value is distinct from new.value)
  execute function public.log_scoring_weight_change();

-- Saves all six weights in one statement: a CHECK violation on any value aborts the whole save.
-- SECURITY INVOKER, so RLS and the column grant still apply; the explicit role check gives a clear 42501.
-- The WHERE clause keeps the UPDATE valid under pg_safeupdate, which PostgREST sessions enforce.
create function public.update_scoring_weights(
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
end;
$$;

revoke execute on function public.update_scoring_weights(numeric, numeric, numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.update_scoring_weights(numeric, numeric, numeric, numeric, numeric, numeric)
  to authenticated;
