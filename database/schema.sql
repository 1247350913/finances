-- Neon starter schema (no Supabase auth/RLS dependencies)
-- Safe to run on a fresh Neon database.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row
execute procedure public.set_updated_at_timestamp();

create table if not exists public.profiles (
  id uuid primary key references public.users(id) on delete cascade,
  email text,
  username text unique,
  created_at timestamptz default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  institution text,
  account_type text,
  card_image_data_url text,
  parser_file_name text,
  parser_source text,
  archived boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.entry_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.entry_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  group_id uuid not null references public.entry_groups(id) on delete cascade,
  name text not null,
  coin_symbol text,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.entry_account_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null references public.entry_accounts(id) on delete cascade,
  year integer not null,
  value text not null,
  created_at timestamptz default now(),
  unique (account_id, year)
);

create table if not exists public.account_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  statement_date date not null,
  file_name text not null,
  file_data_url text not null,
  parsed_result text,
  created_at timestamptz default now(),
  unique (account_id, statement_date)
);

create table if not exists public.entry_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  start_year integer,
  end_year integer,
  overview_widgets jsonb,
  overview_chart_settings jsonb,
  overview_caption_md text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (
    (start_year is null and end_year is null)
    or (
      start_year is not null
      and end_year is not null
      and start_year between 1900 and 2500
      and end_year between 1900 and 2500
      and start_year <= end_year
    )
  )
);

drop trigger if exists entry_settings_set_updated_at on public.entry_settings;
create trigger entry_settings_set_updated_at
before update on public.entry_settings
for each row
execute procedure public.set_updated_at_timestamp();

create table if not exists public.heartbeat (
  id int primary key,
  checked_at timestamptz default now()
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;
