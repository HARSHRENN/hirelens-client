# HireLens handover brief

Updated 15 Nov 2026. Owner: Aryan Chandwani, AlphacodeAI.

## 1. What HireLens is

HireLens is an AI recruitment SaaS. Any recruiter can sign up, get a free trial (3 to 7 days, set by the admin) and their own private workspace at `/u/<username>`. One platform admin holds the keys (AI, email), sets the plan, price, tax and trial, and sees every recruiter's numbers and invoices at `/admin`. A no-account demo runs at `/demo`.

| Item | Where |
| --- | --- |
| Live site | https://hirelens-orpin.vercel.app (`/signup`, `/login`, `/demo`, `/admin`) |
| Source | GitHub `cyberpaapi/hirelens` (private), branch `main`. Each push deploys to production. |
| Hosting | Vercel project `hirelens` |
| Database, login, files | Supabase, connected through Vercel → Storage |
| Email | Resend (key entered in `/admin`) |

It covers the client's original 8-point brief and the 15 Nov additions: Panelists, the ticked tracker, client-format resumes, recruiter analytics, custom levels, self-rating, budget ranges, match colour bands, the matching fix and billing. It also has the SaaS layer: sign-up, separate workspaces, the admin panel, automatic emails, free maps and no WhatsApp API.

## 2. Getting started

Node 22+.

```
git clone https://github.com/cyberpaapi/hirelens.git && cd hirelens
npm install
npm run dev          # UI only at http://localhost:5173/app/ ; /demo works fully
npx vercel link && npx vercel env pull .env.local && npx vercel dev   # UI + /api against the real database
npm run typecheck    # must pass before every push
npm run build        # runs the database migration (if connected), then builds out/
```

## 3. Deploying your own copy

1. **Push and import.** Push the repo to your GitHub, then in Vercel: New Project → the repo → Framework **Other**. Leave the build settings alone; `vercel.json` sets them.
2. **Connect the database.** Vercel → project → **Storage → Create Database → Supabase** (free) → connect to the project, all environments. This adds `SUPABASE_URL`, the anon and service keys and `POSTGRES_URL_*` automatically.
3. **Add environment variables:** `ADMIN_EMAILS` (the admin's email) and `CRON_SECRET` (any long random string). Then redeploy. The build creates every table on its own.
4. **Sign up as the admin.** Go to `/signup` and use the `ADMIN_EMAILS` address. Then open `/admin` → **Keys and plan**:
   - Add the OpenAI key and press *Test AI*.
   - Add the Resend key and a "Send from" address on a domain verified in Resend, then press *Send me a test email*.
   - Set the trial, plan, price, tax and seller.
5. **Done.** Recruiters can now sign up at `/signup`.

**Until Resend is set,** sign-ups are confirmed without an email, and password reset is off.

## 4. Architecture

```
Browser ──(Supabase JS, user's own token)──> Supabase Postgres (row-level security: owner = auth.uid())
   │                                          Supabase Storage (private "resumes" bucket, folder per user)
   └──(Bearer token)──> /api/* on Vercel ──(service role)──> same database
                           ├─ auth.js   sign-up, verify, forgot (emails via Resend)
                           ├─ app.js    me, profile, geocode, send-email, interview-invite, billing, files, webhook
                           ├─ admin.js  overview, settings, users, invoices, tests, migrate (admin only)
                           ├─ ai.js     AI calls with the platform key, per-user daily cap
                           └─ cron.js   daily 02:30 UTC = 08:00 IST: reminders + invoices
```

- **Tenancy.** Every workspace object is a JSON document in `docs(owner, coll, id, data)`; `coll` is jobs, candidates, templates, panelists or config. Row-level security lets a signed-in, active user read and write only rows where `owner = auth.uid()`. Suspending a user cuts that off.
- **Server-only tables.** `platform_settings` (keys, plan, limits), `usage_log` (emails, AI calls) and `geocache` have no policies, so only the server can read them. The `admin_user_stats` view gives per-recruiter counts to the admin.
- **Schema.** `api/_lib/schema.js` is idempotent. It runs on every build (`scripts/migrate.mjs`, never fails the build) and from Admin → System.
- **Auth.** Supabase Auth with email and password. `/api/auth` creates the user with `generateLink` and sends our own email through Resend, linking to `/verify?token_hash=…`; the browser calls `verifyOtp`. This avoids Supabase's own mailer and redirect-URL settings entirely.
- **Keys.** Keys never reach a browser. The admin panel shows only a fingerprint.
- **Three modes in one codebase** (`src/lib/runtime.ts`):
  - `cloud`: the real product.
  - `demo`: localStorage, AI off.
  - `artifact`: the claude.ai preview.

  `src/lib/store.ts` hides the difference.
- **Match %** is computed in code (`src/lib/match.ts`): skills 40, experience 25, CTC 15, location 10, notice 10. The non-skill parts scale with the share of must-have skills matched, so a non-matching resume scores near 0%. Bands: green ≥ 70, orange 40–69, red < 40 (each workspace can edit them).

## 5. Codebase map

| Path | What it does |
| --- | --- |
| `src/App.tsx` | Routing by path, the signed-in gate, the workspace shell and nav |
| `src/auth/AuthPages.tsx` | Sign-up (live username check), login, verify, forgot, reset |
| `src/admin/AdminApp.tsx` | Platform admin: overview, recruiters, invoices, keys and plan, system |
| `src/views/*` | Workspace pages: Dashboard, Jobs, JobDetail (+ Share, Calibration, IdealProfile), Candidates (tracker), CandidateDrawer + CandidateExtras (interviews, self-rating, files), Pipeline, Outreach, Panelists, Billing, Settings |
| `src/lib/cloud.ts` | Public config, Supabase client, `api()` helper, sign-out |
| `src/lib/store.ts` | The store and its three backends |
| `src/lib/integrations.ts` | wa.me, Gmail, Calendar links; server email; interview invite; share posts and creative |
| `src/lib/files.ts` | Original resumes: Supabase Storage in cloud, IndexedDB otherwise |
| `api/_lib/*` | `http` (routing), `supa` (clients, `requireUser`), `settings`, `mail` (Resend + caps), `ics`, `geocode` (OSM), `ai`, `billing` (invoices), `reminders`, `schema`, `migrate` |
| `shared/invoice.js` | Invoice maths, amount in words and PDF, for browser and server |
| `site/index.html` | Landing page (light, GSAP) |

## 6. Automatic emails (Resend free tier)

| Email | When | Where |
| --- | --- | --- |
| Confirm account / reset password | Sign-up, forgot password | `api/auth.js` |
| Interview invite with an `.ics` calendar file, panel in CC | When a recruiter schedules a round (toggle in Settings, tick box per round) | `CandidateExtras.tsx` → `api/app.js` |
| Interview reminder | 08:00 IST on the day, for rounds later that day | `api/_lib/reminders.js` via cron |
| Invoice with PDF | When a trial ends, then monthly | `api/_lib/billing.js` via cron and the Billing page |
| Hand-sent email, tracker mail, client pack | When a recruiter presses send | `api/app.js` `send-email` |

**Caps:** 100 emails a day and 3,000 a month for the platform, 40 hand-sent emails a day per recruiter, and 300 AI calls a day per recruiter. All are editable in `/admin`. Bulk email still goes through the recruiter's own Gmail (BCC), so the free allowance is kept for automated mail.

## 7. Demo

Follow `demo-kit/DEMO SCRIPT.md`. For a SaaS walk-through:
- Show sign-up at `/signup`, then the empty workspace and *Load sample data*.
- Schedule a round to show the invite email arriving with its calendar file.
- Open `/admin` to show recruiters, usage and invoices. Admin → System → *Raise due invoices now* shows billing.

## 8. Limits and next steps

- **Vercel Hobby is for non-commercial use.** A paid SaaS should move to Vercel Pro ($20/month), which also allows reminders more than once a day.
- **Supabase free projects pause** after 7 days without use. Upgrade, or keep traffic flowing.
- **Payments are not taken in the app.** Invoices are raised and emailed; the admin marks them paid. Next step: a Razorpay payment link on each invoice.
- **No lockout after the trial.** Unpaid accounts keep working until the admin suspends them.
- **GST:** AlphacodeAI has no GSTIN yet, so set tax to 0 or add the GSTIN before charging GST.
- **Not built:** recruiter teams (several users in one workspace), the Calendly API (link only) and the WhatsApp API (removed by request).
- **Next steps:** payment links, team seats, DPDP consent and retention for candidate data, lazy-loading pdfjs and mammoth.
