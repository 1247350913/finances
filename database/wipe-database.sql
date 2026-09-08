-- Wipe database script for Finances (Neon Postgres)
-- WARNING: This drops ALL application tables, types, and functions.
-- Run this before running schema.sql if you want a completely fresh database.

drop table if exists public.account_statements cascade;
drop table if exists public.entry_account_values cascade;
drop table if exists public.entry_accounts cascade;
drop table if exists public.entry_groups cascade;
drop table if exists public.entry_settings cascade;
drop table if exists public.accounts cascade;
drop table if exists public.profiles cascade;
drop table if exists public.user_app_settings cascade;
drop table if exists public.user_app_blobs cascade;
drop table if exists public.users cascade;
drop table if exists public.profiles cascade;
drop table if exists public.heartbeat cascade;

-- Clean up any custom triggers/functions
drop function if exists public.set_updated_at_timestamp cascade;
