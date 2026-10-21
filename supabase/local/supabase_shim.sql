-- Local-only shim that reproduces the parts of a Supabase database that the
-- ListingFlow migrations rely on: the anon/authenticated/service_role roles,
-- the auth schema with auth.users and auth.uid(), and Supabase's default grants.
--
-- It is applied ONLY to the embedded PGlite database used in local mode and in
-- tests. Never run it against a Supabase project, which already provides all of
-- this (with a much richer auth.users table managed by Supabase Auth).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- Minimal stand-in for Supabase's auth.users. Local mode stores a scrypt
-- password hash here; Supabase manages its own table and credentials.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  created_at timestamptz not null default now()
);

-- Same contract as Supabase's auth.uid(): the "sub" claim of the request JWT.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants these by default on objects created in the public schema.
-- Reproducing them locally ensures the migrations' explicit revokes and RLS
-- policies are what actually protect the data, exactly as in production.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
