create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text unique,
  created_at timestamptz default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  account_type text,
  card_image_data_url text,
  parser_file_name text,
  parser_source text,
  created_at timestamptz default now()
);

create table if not exists public.entry_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.entry_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.entry_groups(id) on delete cascade,
  name text not null,
  coin_symbol text,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.entry_account_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.entry_accounts(id) on delete cascade,
  year integer not null,
  value text not null,
  created_at timestamptz default now(),
  unique (account_id, year)
);

create table if not exists public.account_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  statement_date date not null,
  file_name text not null,
  file_data_url text not null,
  created_at timestamptz default now(),
  unique (account_id, statement_date)
);

create table if not exists public.entry_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_year integer,
  end_year integer,
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

alter table public.entry_accounts add column if not exists coin_symbol text;
alter table public.accounts add column if not exists card_image_data_url text;
alter table public.accounts add column if not exists parser_file_name text;
alter table public.accounts add column if not exists parser_source text;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.entry_groups enable row level security;
alter table public.entry_accounts enable row level security;
alter table public.entry_account_values enable row level security;
alter table public.entry_settings enable row level security;
alter table public.account_statements enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can manage own accounts" on public.accounts;
drop policy if exists "Users can manage own entry groups" on public.entry_groups;
drop policy if exists "Users can manage own entry accounts" on public.entry_accounts;
drop policy if exists "Users can manage own entry account values" on public.entry_account_values;
drop policy if exists "Users can manage own entry settings" on public.entry_settings;
drop policy if exists "Users can manage own account statements" on public.account_statements;

create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Users can manage own accounts"
on public.accounts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own entry groups"
on public.entry_groups
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own entry accounts"
on public.entry_accounts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own entry account values"
on public.entry_account_values
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own entry settings"
on public.entry_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own account statements"
on public.account_statements
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.accounts to authenticated;
grant select, insert, update, delete on table public.entry_groups to authenticated;
grant select, insert, update, delete on table public.entry_accounts to authenticated;
grant select, insert, update, delete on table public.entry_account_values to authenticated;
grant select, insert, update, delete on table public.entry_settings to authenticated;
grant select, insert, update, delete on table public.account_statements to authenticated;
