# Database Workflow (Dev vs Prod)

## Goal
Use two separate Supabase projects:
- Dev project: used for daily local coding and tests.
- Prod project: used only for reviewed, stable migrations.

Do not share one Supabase project between local development and production.

## Environment setup
1. For local development, copy `.env.development.example` to `.env.development` and fill in your DEV Supabase URL/key.
2. For production hosting, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your host's env settings with PROD values.

Vite uses `.env.development` for `pnpm dev` and production env variables for production builds/deploys.

## Schema strategy
- Keep `database/schema.sql` as a rerunnable bootstrap/reference file.
- Apply changes as incremental migrations (recommended with Supabase CLI), then promote them to production.

## Recommended migration flow
1. Make schema change in DEV project first.
2. Verify app behavior against DEV project.
3. Capture migration SQL.
4. Review migration.
5. Apply same migration to PROD project.

## If using Supabase CLI
Use one linked project at a time.

- Link to dev project:
  `supabase link --project-ref <DEV_PROJECT_REF>`
- Push local migrations to dev:
  `supabase db push`

After validation:
- Link to prod project:
  `supabase link --project-ref <PROD_PROJECT_REF>`
- Push the exact same migration set:
  `supabase db push`

## SQL editor fallback
If you are applying SQL manually in Supabase SQL Editor:
- Run migration SQL in DEV first.
- Validate app flows.
- Run the same SQL in PROD.

Avoid `drop table` in production unless intentionally performing destructive maintenance.
