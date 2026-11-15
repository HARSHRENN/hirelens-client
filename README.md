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
