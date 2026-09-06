-- Finances Neon schema (fresh, single source of truth — no incremental migrations).
-- Run this directly on a fresh Neon database, for both dev and prod branches.
--
-- Users/auth are managed by the shared auth-service (see ../../auth-service), but that
-- service is configured to store this app's users in THIS SAME Neon database (its
-- NEON_URI_FINANCES must equal this app's DATABASE_URL), so user data stays app-specific
-- rather than living in some separate shared auth database. auth-service creates the
-- users / user_app_blobs / user_app_settings tables itself on first connect via
-- `CREATE TABLE IF NOT EXISTS`; they're declared here too so a fresh database is fully
-- usable (with real FKs from finances' own tables) before auth-service ever connects.
-- If you change user columns, keep this in sync with auth-service's src/store/postgres.ts.

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

-- ── auth-service tables (owned by auth-service, mirrored here for FKs) ───────────────

create table if not exists public.users (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null,
  username              text,
  birth_date            date,
  password_hash         text not null,
  email_verified        boolean not null default false,
  verify_otp_hash       text,
  verify_otp_expires_at timestamptz,
  reset_otp_hash        text,
  reset_otp_expires_at  timestamptz,
  auth_version          integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists users_email_key on public.users (email);
create unique index if not exists users_username_key on public.users (username) where username is not null;

create table if not exists public.user_app_blobs (
  user_id          uuid not null references public.users(id) on delete cascade,
  app_id           text not null,
  encryption_salt  text not null,
  blob_iv          text not null,
  blob_tag         text not null,
  blob_ciphertext  text not null,
  blob_version     integer not null default 1,
  updated_at       timestamptz not null default now(),
  primary key (user_id, app_id)
);

create table if not exists public.user_app_settings (
  user_id      uuid not null references public.users(id) on delete cascade,
  app_id       text not null,
  content_root text,
  updated_at   timestamptz not null default now(),
  primary key (user_id, app_id)
);

-- ── finances' own tables ──────────────────────────────────────────────────────────────

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
  is_debt boolean not null default false,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.entry_account_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null references public.entry_accounts(id) on delete cascade,
  year integer not null,
  value text not null,
  conversion_rate text,
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

