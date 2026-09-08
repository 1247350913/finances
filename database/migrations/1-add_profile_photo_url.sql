-- Migration 001: add profile_photo_url to public.users.
-- Run this against an already-live database (dev and prod). Safe to re-run.

alter table public.users add column if not exists profile_photo_url text;
