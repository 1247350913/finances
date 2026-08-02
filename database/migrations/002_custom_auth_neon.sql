-- Custom auth tables for Neon Postgres.
-- This migration intentionally coexists with legacy Supabase auth wiring during transition.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text unique,
  password_hash text not null,
  email_verified boolean not null default false,
  verify_otp_hash text,
  verify_otp_expires_at timestamptz,
  reset_otp_hash text,
  reset_otp_expires_at timestamptz,
  auth_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on public.users (email);
create index if not exists idx_users_username on public.users (username);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row
execute procedure public.set_updated_at_timestamp();

-- Keep heartbeat table available for backend health checks.
create table if not exists public.heartbeat (
  id int primary key,
  checked_at timestamptz default now()
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;
