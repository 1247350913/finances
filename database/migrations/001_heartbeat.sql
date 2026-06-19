create table if not exists public.heartbeat (
  id int primary key,
  checked_at timestamptz default now()
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;

create policy "Public heartbeat read"
on public.heartbeat
for select
using (true);