# HireLens

AI recruitment SaaS. Recruiters sign up for their own workspace: job descriptions, AI resume matching, a candidate tracker, panel interviews, WhatsApp and email outreach, automatic interview invites and reminders, a hiring dashboard, and billing with a free trial. One platform admin sets the keys, the plan and the trial for everyone.

See `HANDOVER.md` for the full brief.

## Pages

| Path | Who | What |
| --- | --- | --- |
| `/` | Everyone | Landing site |
| `/signup`, `/login`, `/forgot`, `/reset`, `/verify` | Everyone | Accounts |
| `/u/<username>` | A signed-in recruiter | Their own workspace (jobs, tracker, pipeline, outreach, panelists, billing, settings) |
| `/admin` | The platform admin (username `admin` + password) | Keys, plan and trial, every recruiter's numbers, invoices, email usage |
| `/demo` | Everyone | Sample workspace in the browser, no account, AI off |

## Layout

```
src/            React app (Vite + TypeScript)
  App.tsx       routing: account pages, signed-in gate, workspace shell
  auth/         sign-up, login, verify, forgot, reset
  admin/        platform admin panel
  views/        workspace pages
  lib/          store (Supabase / demo / artifact), cloud (API client), ai, parse, match, geo, integrations
api/            Vercel functions: auth, app, admin, ai, cron (+ _lib helpers, schema)
shared/         invoice maths and PDF, used by browser and server
site/           landing page
scripts/        migrate.mjs (database schema on every build), assemble.mjs
```

## Stack and costs (all free tiers)

- **Hosting:** Vercel (5 functions; daily cron at 08:00 IST).
- **Database, login, resume files:** Supabase (Postgres with row-level security, Auth, Storage).
- **Email:** Resend (100 a day, 3,000 a month on the free plan; the app stays under both).
- **Maps:** OpenStreetMap Nominatim and Photon, no key, cached in the database.
- **WhatsApp:** wa.me links only; no WhatsApp API.
- **AI:** OpenAI by default (or Anthropic or Gemini). The admin's key, held on the server.

## Run and build

```
npm install
npm run dev              # UI at http://localhost:5173/app/ (the /api functions need `npx vercel dev`)
npm run typecheck
npm run build            # migrates the database if connected, then builds out/
npm run build:artifact   # single-file claude.ai preview
```

## Fresh client-owned setup

Use the existing application code with a new Vercel project and new Supabase
project owned by the client. Start with no migrated users, records or resumes.

1. Sign up or sign in to Supabase using the client's account and create a project.
2. In that project's SQL Editor, run `supabase/schema.sql`. This is a snapshot of
   `api/_lib/schema.js`; regenerate it when changing the schema. It creates the
   application tables and row-level security policies, not sample users or data.
3. Create a separate Vercel project under the client's account. Deploy local
   sources without linking GitHub if repository pushes are not desired.
4. Connect the new Supabase project through Vercel Marketplace, or configure
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and
   `POSTGRES_URL_NON_POOLING` from the new project. Use a separate Supabase project
   for preview/development before the client begins using production.
5. Set a new `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` and `CRON_SECRET` in
   the new Vercel project. Never reuse the inherited admin credentials.
6. Set `APP_URL` to the intended deployment origin and configure the client's AI
   provider and Resend sender in `/admin`. A Gmail address alone does not provide
   a verified sending domain for Resend.
7. Deploy, check signup/login and create a test recruiter. `/demo` automatically
   loads fictional sample data in browser storage. A signed-in test workspace
   can load sample data from Settings; keep this in the development database.
8. Verify job/candidate saving, resume upload/download, AI matching, and email
   delivery before client use. Test emails must use explicitly agreed recipients.

The build currently runs the schema migration automatically when a database URL
is configured. Check the selected Vercel project and database before deploying.
The old project uses Supabase reference `xszucqaezqgzvsbdkist`; do not copy that
project's connection values into the fresh setup.

For local API development, use `vercel dev` after linking the **new** project and
providing Development environment variables. Plain `npm run dev` serves only
the frontend. Secrets and `.vercel` project links are excluded from Git.
