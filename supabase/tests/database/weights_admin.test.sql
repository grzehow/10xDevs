-- Weights admin rules (S-04): value range, column grant, history trigger, atomic save RPC. Each assertion names one rule.
-- Roles are simulated like PostgREST does: SET ROLE plus request.jwt.claims, which auth.jwt() reads.
-- History starts empty and only the admin RPC writes to it until the no-JWT and CHECK sections at the end,
-- so earlier assertions can count rows exactly. The file rolls back, so changed weights never leak.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Admin: column grant and atomic save
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"admin"}}';

select throws_ok($$ update public.scoring_weights set key = 'x' where key = 'major' $$, '42501', null,
  'admin: updating key denied by column grant');

select lives_ok($$ select public.update_scoring_weights(1, 5, 12, 15, 3, 1) $$,
  'admin rpc: saves six weights');
select results_eq(
  $$ select key, old_value, new_value, account from public.scoring_weight_changes $$,
  $$ values ('major'::text, 10.0::numeric, 12::numeric, 'admin'::text) $$,
  'admin rpc: one changed value writes exactly one history row with key, old, new and role');
select is((select value from public.scoring_weights where key = 'major'), 12::numeric,
  'admin rpc: changed value is saved');

select lives_ok($$ select public.update_scoring_weights(1, 5, 12, 15, 3, 1) $$,
  'admin rpc: unchanged values succeed');
select is((select count(*) from public.scoring_weight_changes), 1::bigint,
  'admin rpc: unchanged values write no history');

select throws_ok($$ select public.update_scoring_weights(2, 6, 13, 1000.01, 4, 2) $$, '23514', null,
  'admin rpc: one out-of-range value rejects the whole call');
select results_eq(
  $$ select key, value from public.scoring_weights order by key $$,
  $$ values ('critical'::text, 15.0::numeric), ('customer', 3.0), ('major', 12.0),
            ('minor', 5.0), ('service', 1.0), ('warning', 1.0) $$,
  'admin rpc: out-of-range call leaves all six weights unchanged');

-- Admin: reads history, cannot write it
select is((select count(*) from public.scoring_weight_changes), 1::bigint,
  'admin: can select history');
select throws_ok(
  $$ insert into public.scoring_weight_changes (key, old_value, new_value, account)
     values ('major', 1, 2, 'admin') $$,
  '42501', null, 'admin: insert into history denied');

-- Operator: no history, no writes, no save
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"operator"}}';

select is_empty($$ select * from public.scoring_weight_changes $$, 'operator: history sees nothing');
select throws_ok(
  $$ insert into public.scoring_weight_changes (key, old_value, new_value, account)
     values ('major', 1, 2, 'operator') $$,
  '42501', null, 'operator: insert into history denied');
select throws_ok($$ select public.update_scoring_weights(2, 6, 13, 16, 4, 2) $$, '42501', null,
  'operator rpc: denied');
select results_eq(
  $$ select key, value from public.scoring_weights order by key $$,
  $$ values ('critical'::text, 15.0::numeric), ('customer', 3.0), ('major', 12.0),
            ('minor', 5.0), ('service', 1.0), ('warning', 1.0) $$,
  'operator rpc: changes nothing');

-- Anon: no privileges at all
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select public.update_scoring_weights(2, 6, 13, 16, 4, 2) $$, '42501', null,
  'anon rpc: denied');
select throws_ok($$ select * from public.scoring_weight_changes $$, '42501', null,
  'anon: history select denied');

-- Superuser view: the denied calls above wrote no history
reset role;
select is((select count(*) from public.scoring_weight_changes), 1::bigint,
  'denied rpc calls write no history');

-- No JWT (Studio SQL editor, service role, data-fix migration): still recorded, as the database role
set local request.jwt.claims = '';
update public.scoring_weights set value = 9 where key = 'warning';
-- current_user is type name (collation "C"), so compare with an explicit COLLATE; results_eq would fail on the mix.
select ok(
  (select account from public.scoring_weight_changes where key = 'warning') = (current_user::text collate "default"),
  'no jwt: update succeeds and history records the database role as account');
update public.scoring_weights set value = 1.0 where key = 'warning';

-- Value range CHECK (superuser, so only the constraint can reject). Restore instead of a savepoint.
select throws_ok($$ update public.scoring_weights set value = -1 where key = 'minor' $$, '23514', null,
  'check: negative value rejected');
select throws_ok($$ update public.scoring_weights set value = 1000.01 where key = 'minor' $$, '23514', null,
  'check: value above 1000 rejected');
select throws_ok($$ update public.scoring_weights set value = 'NaN' where key = 'minor' $$, '23514', null,
  'check: NaN rejected');
select throws_ok($$ update public.scoring_weights set value = 'Infinity' where key = 'minor' $$, '23514', null,
  'check: Infinity rejected');
select throws_ok($$ update public.scoring_weights set value = 1.234 where key = 'minor' $$, '23514', null,
  'check: more than two decimals rejected');
select lives_ok($$ update public.scoring_weights set value = 0 where key = 'minor' $$,
  'check: zero accepted');
select lives_ok($$ update public.scoring_weights set value = 1000 where key = 'minor' $$,
  'check: 1000 accepted');
select lives_ok($$ update public.scoring_weights set value = 2.5 where key = 'minor' $$,
  'check: two-decimal value accepted');
update public.scoring_weights set value = 5.0 where key = 'minor';

select * from finish();
rollback;
