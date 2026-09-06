-- Neon starter schema (no Supabase auth/RLS dependencies)
-- Safe to run on a fresh Neon database.
-- Users/auth live in the separate auth-service, not here. user_id columns below are
-- opaque uuids issued by auth-service — there is no local FK to enforce, and deleting a
-- user there does not cascade-delete rows here.

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

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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
  user_id uuid not null,
  name text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.entry_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  group_id uuid not null references public.entry_groups(id) on delete cascade,
  name text not null,
  coin_symbol text,
  is_debt boolean not null default false,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.entry_account_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null references public.entry_accounts(id) on delete cascade,
  year integer not null,
  value text not null,
  conversion_rate text,
  created_at timestamptz default now(),
  unique (account_id, year)
);

create table if not exists public.account_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  statement_date date not null,
  file_name text not null,
  file_data_url text not null,
  parsed_result text,
  created_at timestamptz default now(),
  unique (account_id, statement_date)
);

create table if not exists public.entry_settings (
  user_id uuid primary key,
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

