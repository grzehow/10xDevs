-- Access split on public.scoring_weights (F-02). Each assertion names one rule.
-- Roles are simulated like PostgREST does: SET ROLE plus request.jwt.claims, which auth.jwt() reads.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Seed
select results_eq(
  $$ select key, value from public.scoring_weights order by key $$,
  $$ values ('critical'::text, 15.0::numeric), ('customer', 3.0), ('major', 10.0),
            ('minor', 5.0), ('service', 1.0), ('warning', 1.0) $$,
  'seed: six PRD default weights'
);

-- Operator: reads everything, changes nothing
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"operator"}}';

select results_eq(
  $$ select key, value from public.scoring_weights order by key $$,
  $$ values ('critical'::text, 15.0::numeric), ('customer', 3.0), ('major', 10.0),
            ('minor', 5.0), ('service', 1.0), ('warning', 1.0) $$,
  'operator: select returns all six weights'
);
update public.scoring_weights set value = 99 where key = 'major';
select is((select value from public.scoring_weights where key = 'major'), 10.0::numeric,
  'operator: update changes nothing');
select throws_ok($$ insert into public.scoring_weights values ('warning', 2) $$, '42501', null,
  'operator: insert denied');
select throws_ok($$ delete from public.scoring_weights $$, '42501', null,
  'operator: delete denied');

-- Admin: reads and updates, cannot insert or delete
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"admin"}}';

select results_eq(
  $$ select key, value from public.scoring_weights order by key $$,
  $$ values ('critical'::text, 15.0::numeric), ('customer', 3.0), ('major', 10.0),
            ('minor', 5.0), ('service', 1.0), ('warning', 1.0) $$,
  'admin: select returns all six weights'
);
update public.scoring_weights set value = 12 where key = 'major';
select is((select value from public.scoring_weights where key = 'major'), 12::numeric,
  'admin: update changes a weight');
-- Restore instead of a savepoint: rolling back to a savepoint would also undo pgTAP's own bookkeeping.
update public.scoring_weights set value = 10.0 where key = 'major';
select throws_ok($$ insert into public.scoring_weights values ('warning', 2) $$, '42501', null,
  'admin: insert denied');
select throws_ok($$ delete from public.scoring_weights $$, '42501', null,
  'admin: delete denied');

-- Anon: no privileges at all
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select * from public.scoring_weights $$, '42501', null, 'anon: select denied');
select throws_ok($$ update public.scoring_weights set value = 99 $$, '42501', null, 'anon: update denied');
select throws_ok($$ insert into public.scoring_weights values ('warning', 2) $$, '42501', null,
  'anon: insert denied');
select throws_ok($$ delete from public.scoring_weights $$, '42501', null, 'anon: delete denied');

-- Signed in without a role claim: fails closed
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';

select is_empty($$ select * from public.scoring_weights $$, 'no role: select sees nothing');
update public.scoring_weights set value = 99 where key = 'major';
select throws_ok($$ insert into public.scoring_weights values ('warning', 2) $$, '42501', null,
  'no role: insert denied');
select throws_ok($$ delete from public.scoring_weights $$, '42501', null, 'no role: delete denied');

reset role;
select is((select value from public.scoring_weights where key = 'major'), 10.0::numeric,
  'no role: update changes nothing');

select * from finish();
rollback;
