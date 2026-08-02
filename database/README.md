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
- Keep `database/schema.sql` as a rerunnable bootstrap/reference file.
- Apply changes as incremental SQL migrations, then promote the same reviewed migrations to production.

## Recommended migration flow
1. Make schema change in DEV project first.
2. Verify app behavior against DEV project.
3. Capture migration SQL.
4. Review migration.
5. Apply same migration to PROD project.

## Applying migrations
Use your preferred Postgres migration runner against Neon.

Recommended:
- Apply migration SQL to DEV first.
- Validate app behavior.
- Apply the same migration SQL to PROD.

## SQL editor fallback
If you are applying SQL manually in Neon SQL editor:
- Run migration SQL in DEV first.
- Validate app flows.
- Run the same SQL in PROD.

Avoid `drop table` in production unless intentionally performing destructive maintenance.
