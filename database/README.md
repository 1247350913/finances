# Database Workflow (Dev vs Prod)

## Goal

Use two separate Neon databases:

- Dev database: used for daily local coding and tests.
- Prod database: used only for reviewed, stable migrations.

Do not share one Neon database between local development and production.

## Environment setup

1. For local development, copy `.env.development.example` to `.env.development` and set `DATABASE_URL` to your DEV Neon DB.
2. For production hosting, configure `DATABASE_URL` in your host's env settings with PROD values.

Vite uses `.env.development` for `pnpm dev` and production env variables for production builds/deploys.

## Schema strategy

- `database/schema.sql` is the single source of truth. There are no incremental migration
  files — run the full file fresh on dev and prod whenever the schema changes.
- This file includes the `users` / `user_app_blobs` / `user_app_settings` tables that
  auth-service also creates on connect (`CREATE TABLE IF NOT EXISTS`). Auth-service's
  `NEON_URI_FINANCES` env var must point at THIS SAME database (not a separate one), so
  user/profile data stays app-specific instead of living in some shared auth database.
  If you change user columns here, mirror the change in auth-service's
  `src/store/postgres.ts`.

## Fresh database bootstrap

1. Open Neon SQL editor on the target branch (dev or prod).
2. Run the full `database/schema.sql` file.
3. Point auth-service's `NEON_URI_FINANCES` at the same connection string as this app's
   `DATABASE_URL`.
4. Start the app and verify auth + core flows.

## Ongoing updates

- Keep editing `database/schema.sql` directly (it's idempotent — `create table if not
  exists` / `create index if not exists`) and re-run it on each environment.

Avoid destructive statements in production unless intentionally performing maintenance.
