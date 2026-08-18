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

- Use `database/schema.sql` as the single Neon starter schema for fresh databases.
- This file is Supabase-free and can be run directly in Neon SQL runner.

## Fresh database bootstrap

1. Open Neon SQL editor on DEV branch.
2. Run the full `database/schema.sql` file.
3. Start the app and verify auth + core flows.
4. Repeat on PROD branch when ready.

## Ongoing updates

- Keep editing `database/schema.sql` as the canonical schema.
- When you need strict audit/history later, re-introduce migrations from this clean baseline.

Avoid destructive statements in production unless intentionally performing maintenance.
