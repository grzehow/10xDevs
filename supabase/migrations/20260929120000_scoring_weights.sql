-- Scoring weights (F-02). One row per weight; defaults from PRD `## Business Logic`.
-- Seeded here, not in seed.sql, because the cloud project only runs migrations.
-- Access: operator + admin SELECT (scoring), admin UPDATE; nobody INSERTs or DELETEs, so all six keys always exist.
-- Role comes from the JWT (`app_metadata.role`, set in F-01); a missing claim is null and matches no policy.

create table public.scoring_weights (
  key text primary key check (key in ('warning', 'minor', 'major', 'critical', 'customer', 'service')),
  value numeric not null
);

insert into public.scoring_weights (key, value)
values
  ('warning', 1.0),
  ('minor', 5.0),
  ('major', 10.0),
  ('critical', 15.0),
  ('customer', 3.0),
  ('service', 1.0);

alter table public.scoring_weights enable row level security;

-- Grants are explicit so they do not depend on the project's default privileges.
revoke all on public.scoring_weights from anon, authenticated;
grant select, update on public.scoring_weights to authenticated;

create policy scoring_weights_select_operator_admin on public.scoring_weights
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('operator', 'admin'));

create policy scoring_weights_update_admin on public.scoring_weights
  for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
