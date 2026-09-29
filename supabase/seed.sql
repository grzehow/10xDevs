-- Seeds the two shared accounts (operator, admin) for LOCAL DEVELOPMENT ONLY.
-- The passwords below are dev-only and must never be used in any hosted/production project.
-- Reset-only: runs via `npx supabase db reset`; do not execute directly against an existing database.
-- GoTrue fails sign-in ("Database error querying schema") if the token/email_change columns are NULL, hence ''.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
    'operator@noc.local', extensions.crypt('Operator-Dev-Passw0rd!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"role":"operator"}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
    'admin@noc.local', extensions.crypt('Admin-Dev-Passw0rd!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'email',
    jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'operator@noc.local', 'email_verified', true),
    now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'email',
    jsonb_build_object('sub', '22222222-2222-2222-2222-222222222222', 'email', 'admin@noc.local', 'email_verified', true),
    now(), now(), now());
