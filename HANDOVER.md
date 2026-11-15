# HireLens handover brief

As of 15 Nov 2026. Owner: Aryan Chandwani, AlphacodeAI. A live, commentable copy of this brief: https://claude.ai/artifact/UUqXjBxTbTqZ6W8qNMh2Ap

## What's in this repo

| Path | Contents |
| --- | --- |
| `src/`, `api/`, `site/`, `scripts/` | The app, the API functions, the landing site and the build script |
| `demo-kit/` | Demo script, sample JD, calibration notes, 8 test resumes in different formats, and `make_demo.py` to regenerate them |
| `docs/HireLens handover brief.pdf` | This brief as a PDF |
| `HANDOVER.md` | This brief |

## 1. What HireLens is

A working AI recruitment web app plus a landing site, built for AlphacodeAI's recruitment-platform quote (₹1.75L, 4 weeks, paid 20/40/40). It is live, runs on Vercel and deploys automatically from GitHub.

| Item | Where |
| --- | --- |
| Landing site | https://hirelens-orpin.vercel.app |
| App | https://hirelens-orpin.vercel.app/app |
| Admin | https://hirelens-orpin.vercel.app/admin |
| Source | GitHub `cyberpaapi/hirelens`, branch `main` (private). This repo. |
| Hosting | Vercel project `hirelens` on Aryan's account. Each push to `main` deploys to production. |
| Claude preview | A single-file build is also published as a claude.ai artifact (built-in Claude AI, shared database). |

**Scope delivered.** The client's 8-point brief is covered:

1. JD creation and a resume drop box (PDF, DOCX, DOC, RTF, TXT, images and scanned PDFs)
2. A match % per profile
3. WhatsApp and email templates, plus a quick Google Meet
4. A candidate tracker with experience, CTC, notice period, distance and remarks
5. A dashboard with technology split and L1/L2/select/reject/hold
6. Job sharing to LinkedIn, Instagram, X and Facebook
7. Calibration call notes with translation
8. Shortlist highlighting and an ideal candidate profile

The 15 Nov additions are also in: Panelists, a tracker with tick-to-select rows and columns, client-format resumes, Admin recruiter and panelist analytics, Billing with a free trial and invoices, job budget ranges, match colour bands and the matching fix. They go beyond the original quote and should be priced as a change request.

**Stack.** Vite 8, React 19 and TypeScript, with Vercel serverless functions in `api/` (Node, ESM). There is no database or login yet: on the web, data lives in each browser's localStorage.

## 2. Getting started

You need Node 22 or newer and npm.

```
git clone https://github.com/cyberpaapi/hirelens.git && cd hirelens
npm install
npm run dev              # app at http://localhost:5173/app/
npm run typecheck        # must pass before every push
npm run build            # web build into out/: / = site, /app = app, /admin = app
npm run build:artifact   # one self-contained HTML in dist-artifact/ for a claude.ai artifact
```

- **Plain `npm run dev` has no API.** The `api/` functions only run on Vercel. Locally, use `npx vercel dev` after `npx vercel link`. Without it, parsing, scoring and the UI still work (AI falls back to rules), but AI reads, WhatsApp API, email and geocoding fail.
- **After `npm run build`, restart any static server** pointed at `out/`, because `scripts/assemble.mjs` deletes and recreates it.
- **Sample data loads by itself** on a first visit to the web build. Admin → Data has *Add sample data* and *Delete all data*. Sample records use example.com emails and dummy numbers.

## 3. Deploying on your own Vercel

`vercel.json` already sets the build command, the output folder (`out`), the `/admin` and `/app` rewrites, and a 60-second limit on the API functions.

1. **Put the code in your own GitHub repo.** `cd hirelens && git init && git add -A && git commit -m "HireLens"`, create an empty private repo, then `git remote add origin <url> && git push -u origin main`. If Aryan adds you to `cyberpaapi/hirelens` instead, clone that and skip this step.
2. **Import it in Vercel.** New Project → pick the repo → Framework Preset = Other. Leave the build and output settings blank; they come from `vercel.json`.
3. **Add environment variables** (Settings → Environment Variables, Production). Only the AI key is needed for a working demo.
4. **Deploy.** Check `/`, `/app`, `/admin`, then Admin → *Test AI connection*.
5. **Optional: a custom domain** under Settings → Domains.

CLI alternative without GitHub: `npm i -g vercel`, then `vercel` (preview) and `vercel --prod`.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | AI resume reading, JD writing, calibration summary, translation, OCR | Default provider. Models `gpt-5.6-terra`, and `gpt-5.6-luna` for quick tasks |
| `AI_PROVIDER` | Switching provider | `openai` (default), `anthropic` or `gemini` |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Other providers | Only the one you select |
| `AI_MODEL` | Model override | Blank = provider default |
| `GOOGLE_MAPS_API_KEY` | Distances for any address | Geocoding API. Without it, a built-in list of Indian cities and metro areas is used |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` | Server WhatsApp send, bulk send | Meta WhatsApp Cloud API. Business-initiated messages need approved templates. Without these, the app uses wa.me links |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email with attachments (tracker, client pack, invoices) | `EMAIL_FROM` must be on a domain verified in Resend. Without these, the app opens Gmail drafts |
| `ALLOWED_ORIGIN` | Locking the API to one site | Set it if the frontend is hosted on another domain |

**Keys typed in Admin override env vars.** They are stored only in that browser's localStorage and sent as headers (`x-ai-key`, `x-wa-token`, `x-resend-key`, `x-maps-key`) to `/api/*`. `api/_util.js` strips quotes, spaces and a `Bearer ` prefix from pasted keys. API errors show the first 8 and last 4 characters of the key that was sent.

**Cost warning.** With a server env key and no login, anyone with the URL can spend your AI credits. Keep the demo URL private or add auth.

## 4. Architecture

One React codebase ships two ways: a web build on Vercel that calls its own `/api` functions, and a single-file claude.ai artifact that uses Claude's built-in AI and shared database.

```
GitHub main ──push──> Vercel build (npm run build → out/) ──serves──> Web app in browser ──> /api functions ──> OpenAI / Anthropic / Gemini,
                                                                       (store, localStorage,     (ai, whatsapp,     Meta WhatsApp, Resend,
                                                                        IndexedDB, Admin keys)    email, geocode,    Google Maps
                                                                                                  webhook)
Artifact build (build:artifact → one HTML) ──> claude.ai artifact (built-in Claude, shared db)
```

- **Two builds from one source.** `vite.config.ts` reads the mode. Web: base `/app/`, `__TARGET__ = 'web'`. Artifact: `vite-plugin-singlefile`, `__TARGET__ = 'artifact'`. Code branches on `TARGET` from `lib/runtime.ts`.
- **Store.** `lib/store.ts` keeps everything in memory and exposes it through `useSyncExternalStore`. On the web it writes to localStorage keys `hl-data-v1`, `hl-config-v1`, `hl-secrets-v1`, plus `hl-me` and `hl-cols`. In the artifact it syncs with the host db.
- **Routing.** Hash routes like `#dashboard` or `#job-<id>-share`, because artifacts only pass `#[a-z0-9-]`. `/admin` is a Vercel rewrite to the app that opens the Admin view.
- **AI.** `lib/ai.ts` sends prompts to `/api/ai` (web) or the artifact's built-in model. Resume fields come back as JSON; the score is always computed locally in `lib/match.ts`.
- **Outreach without APIs.** wa.me links, Gmail compose links, Google Calendar template links, `meet.new`, and share-intent URLs. APIs are optional upgrades.
- **PDFs and zips** are made in the browser with jsPDF and JSZip.

## 5. Codebase map

| Path | What it does |
| --- | --- |
| `src/App.tsx` | Shell: sidebar nav, "Working as" role switch, auto-seed of sample data (`hl-seeded-v2`), billing check on load, route → view |
| `src/lib/types.ts` | All data types (Job, Candidate, Interview, Panelist, Billing, AppConfig, Secrets) and the stage list built from custom levels |
| `src/lib/store.ts` | The store: `jobs`, `candidates`, `templates`, `panelists`, `config`, `secrets`, `me`. `put` / `remove` / `setConfig` / `setSecrets`, export/import/wipe |
| `src/lib/runtime.ts` | `TARGET` and `cap()` for artifact host features |
| `src/lib/ai.ts` | `complete` / `completeJson` |
| `src/lib/parse.ts` | Resume text: pdfjs-dist, mammoth (DOCX), RTF, AI OCR for images and scans |
| `src/lib/match.ts` | Field extraction, weighted score, colour bands, self-rating %, employment helpers |
| `src/lib/geo.ts` | Offline Indian gazetteer and distance; Google geocode on web |
| `src/lib/integrations.ts` | wa.me / Gmail / Calendar links, server send, webhook, job post, share creative, file save |
| `src/lib/clientResume.ts` | Client-format resume PDF (contacts redacted, agency watermark) |
| `src/lib/files.ts` | Original resume files in IndexedDB |
| `src/lib/analytics.ts` | Recruiter and panelist statistics |
| `src/lib/billing.ts` | Trial and invoice generation, invoice PDF, amount in words |
| `src/lib/sample.ts` | Demo data and message templates |
| `src/lib/router.ts` | Hash routes and `/admin` |
| `src/views/` | Dashboard, Jobs, JobForm, JobDetail (+ Share, Calibration, IdealProfile), Candidates (tracker), CandidateDrawer + CandidateExtras, Pipeline, Outreach, Panelists, Admin + AdminTeam, Billing |
| `src/components/` | `ui.tsx` (shared controls) and `TopBar.tsx` |
| `src/styles/app.css` | All styling: GetLayers "Kelder" tokens (mist `#f5f8fc`, navy `#06142e`, blue ramp, lime `#ddf545`, Funnel Display) and match colours |
| `api/` | `ai.js`, `whatsapp.js`, `email.js`, `geocode.js`, `webhook.js`, `_util.js` |
| `site/index.html` | Landing page (GSAP + ScrollTrigger, light theme); `APP_URL` / `ADMIN_URL` filled at build |
| `scripts/assemble.mjs` | Builds `out/` |
| `vercel.json`, `.env.example` | Deploy config and env vars |

**Conventions to keep.**

- Ids contain no underscores (artifact hashes only pass `[a-z0-9-]`).
- `useStore` selectors must return stable values. A selector that builds a new array, or reads `Date.now()`, loops React (error #185). Select the raw map and wrap it in `useMemo`.
- API keys never go into the shared db.

## 6. Features by page

| Page | What it does | Code |
| --- | --- | --- |
| Dashboard | Daily / Weekly / Fortnightly / Monthly / Custom From–To; status filter (All, Shortlisted, Rejected, Offered, Joined, Declined); screening funnel; profiles by technology; upcoming interviews; by-job table; recent activity | `Dashboard.tsx` |
| Jobs | Cards with budget-range chip; AI writes or reads the JD; budget from–to (LPA) | `Jobs.tsx`, `JobForm.tsx` |
| Job detail | Resume drop zone; Details; Share (posts, 1080² creative, webhook); Ideal candidate; Calibration call (notes, captions and recording on web, AI summary, translation) | `JobDetail.tsx`, `Share.tsx`, `IdealProfile.tsx`, `Calibration.tsx` |
| Tracker | Row and column ticks drive Export, Mail tracker, Share with client and bulk actions; filters incl. recruiter and From/To; bulk stage changes, WhatsApp all, Email all (BCC draft); client pack zip | `Candidates.tsx` |
| Candidate drawer | Shortlist / Hold / Reject + stage; Overview (employment timeline, current company, companies worked), Message, Interviews (panelists, Calendly links, Meet, feedback), Self rating, Remarks, Resume | `CandidateDrawer.tsx`, `CandidateExtras.tsx` |
| Pipeline | Kanban by stage incl. custom levels | `Pipeline.tsx` |
| Outreach | Templates and message history | `Outreach.tsx` |
| Panelists | Contact, Calendly link, expertise; interviews taken, selects, rejects, hold, average rating, feedback | `Panelists.tsx` |
| Admin | Recruiter analytics, panelist analytics, recruiters, interview levels, match colours, weights, API keys, data | `Admin.tsx`, `AdminTeam.tsx` |
| Billing | 3–7 day trial with countdown; automatic invoice at trial end, then monthly; PDF, email, mark paid | `Billing.tsx`, `lib/billing.ts` |

**Match %** (`lib/match.ts`): skills 40, experience 25, CTC 15, location 10, notice 10 (editable). Experience, CTC, location and notice count only in proportion to must-have skills matched, so a resume with no skill overlap scores 0% (this fixed the client's "non-match shows 65%" report). Bands: green ≥ 70, orange 40–69, red < 40 (editable).

**Roles.** "Working as" switches between Super admin and each recruiter: it sets who owns new uploads and hides Admin and Billing for recruiters. It is a demo switch, not security.

## 7. Demo kit

Follow `demo-kit/DEMO SCRIPT.md` (about 15 minutes). Every person and company in the files is fictional. Before any demo, add the AI key in Admin and run the job and resume steps once on the demo network. AI reads take 5–20 seconds per resume.

## 8. Limits, open issues and next steps

**Agreed exclusions (need a change request):** the Calendly API is not integrated (link only), and email automation is out of scope (mass email = one BCC Gmail draft).

**Known limits**

- Data is per browser on the web build; recruiters do not see each other's work.
- No login; anyone with the URL can use the server AI key.
- Original resume files live only in that browser's IndexedDB.
- The WhatsApp API needs Meta-approved templates for business-initiated messages.
- GST: AlphacodeAI has no GSTIN, so GST cannot legally be charged yet. Set tax to 0 or add a GSTIN.
- Billing generates invoices but does not take payments.
- The app JS is about 2.5 MB (pdfjs, mammoth); lazy-load to trim it.

**Suggested next steps, in order**

- [ ] Replace localStorage with Supabase (Postgres) behind `src/lib/store.ts`
- [ ] Add Supabase Auth or Clerk with real super admin / recruiter roles
- [ ] Store original resumes in Supabase Storage or S3
- [ ] Server-only AI keys and rate limits on `/api/ai`
- [ ] Candidate consent and retention under the DPDP Act
- [ ] Razorpay payment links on invoices, if wanted
- [ ] Lazy-load pdfjs and mammoth

**Who to ask:** Aryan Chandwani (AlphacodeAI) owns the client relationship, the quote, and the GitHub and Vercel accounts.
