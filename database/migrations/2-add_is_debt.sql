alter table public.entry_accounts
add column if not exists is_debt boolean not null default false;
