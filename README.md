# HireLens

Recruitment workspace built by AlphacodeAI: job descriptions, AI resume matching, candidate tracker, WhatsApp and email outreach, Google Meet scheduling, social job posts, calibration-call notes and a hiring dashboard.

## What maps to the brief

| # | Requirement | Where |
|---|---|---|
| 1 | JD creation + drop box for resumes in any format | Jobs → New job (AI writes or reads the JD) · Job → Profiles drop zone (PDF, DOCX, DOC, TXT, images, scanned PDFs via AI) |
| 2 | Match summary (100%, 70%, 50%…) | Score per profile from five weighted parts (skills, experience, CTC, location, notice); weights in Admin |
| 3 | WhatsApp, email templates, quick Google Meet | Candidate → Message (templates, wa.me / Gmail, or API send) · Candidate → Interview (Calendar + Meet) · Outreach page |
| 4 | Tracker: name, total/relevant exp, current/expected CTC, notice, location + distance, remarks | Tracker page (sortable, filterable, CSV export) · Candidate → Remarks |
| 5 | Totals, technology bifurcation, L1/L2/select/reject/hold, dashboard | Dashboard |
| 6 | Share JD on LinkedIn, Instagram, X, Facebook | Job → Share job (prefilled posts, 1080² creative, automation webhook for auto-posting) |
| 7 | Calibration call, recording, note taker, translation (good to have) | Job → Calibration call (notes/transcript, live captions + recording on the deployed app, AI summary → requirement, translation into 10 Indian languages) |
| 8 | Shortlist highlighted + ideal candidate profile | Lime marker on shortlisted rows · Job → Ideal candidate (built from the shortlist, surfaces the next-closest profiles) |

## Layout

```
src/            React app (Vite + TypeScript)
  lib/          store (artifact db or localStorage), ai, parse, match, geo, integrations
  views/        Dashboard, Jobs, JobDetail (+ Share, Calibration, IdealProfile), Tracker, Pipeline, Outreach, Admin
api/            Vercel functions: ai, whatsapp, email, geocode, webhook (keys from Admin header or env)
site/           Landing page (GetLayers "Kelder" prompt, adapted; GSAP + ScrollTrigger)
deploy/         Ready-to-upload Vercel bundle: / (site), /app (app), /api (functions)
```

## Run and build

```
npm install
npm run dev                # app at http://localhost:5173/app/
npm run build              # dist/ for the web (base /app/)
npm run build:artifact     # one self-contained HTML for a claude.ai artifact
```

## Keys

Typed in **Admin** (stored only in that browser, sent as headers to `/api/*`), or set as Vercel env vars (see `.env.example`):

- AI: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`, `AI_PROVIDER`, `AI_MODEL`
- WhatsApp Cloud API: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` (business-initiated messages need Meta-approved templates)
- Email: `RESEND_API_KEY`, `EMAIL_FROM` (verified domain)
- Maps: `GOOGLE_MAPS_API_KEY` (Geocoding API)

## Before going live

- Data on the web build lives in each browser's localStorage. For a team, plug a database (Supabase/Postgres) into `src/lib/store.ts`; the store already has one put/remove/subscribe seam.
- Add login (Supabase Auth or Clerk) before exposing candidate data.
- Get candidate consent and set a retention period under the DPDP Act.
