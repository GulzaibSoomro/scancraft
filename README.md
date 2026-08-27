# ScanCraft

Security inspection for AI-built web apps. Paste a live URL → get a plain-English audit with copy-paste fixes.

## Stack decisions

| Piece | Choice | Why |
| --- | --- | --- |
| Frontend / API | **Next.js 14 App Router on Vercel** | Matches the brief. Preview + early full scans finish inside serverless limits. |
| Jobs | **`scans` table + status polling** (no Redis/BullMQ) | Enough for MVP volume. Revisit if scan duration or concurrency grows. |
| DB / Auth | **Supabase** | Profiles, history, GitHub OAuth for repo scans, RLS dogfooding. |
| Deviation | None so far | If full scans exceed ~60s on Vercel later, move the runner to a long-lived Node worker and keep the Next.js API as the queue front. |

## Phase status

### Phase 1 — scaffold ✅
- Next.js 14 + TypeScript + Tailwind
- Design tokens: paper `#EDF1F5`, ink `#1D3557`, critical / warning / pass, IBM Plex fonts, 28px blueprint grid
- Supabase clients + database schema with RLS
- Shared `Finding` / `CheckModule` types and empty check registry

### Phase 2 — auth + dashboard shell ✅
- Landing page (plain language; preview CTA placeholder)
- Email signup/login + GitHub OAuth
- `/auth/callback` session exchange
- Protected `/dashboard` with empty shell + sign out
- Middleware redirects for auth pages ↔ dashboard

### Phase 3 — first checks + preview scan ✅
- Check modules: exposed API keys, Supabase RLS, security headers, CORS
- Preview runner (`POST /api/preview-scan`) with SSRF guards + rate limit
- Landing page preview form + inspection report UI (stamp, severity filters)

### Phase 4 — scan submission + polling + storage ✅
- `POST /api/scans` queues a scan (project create/reuse + free-tier gate)
- `POST /api/scans/[id]/run` runs checks and writes `findings`
- `GET /api/scans/[id]` for status polling
- Dashboard form (URL, platform, GitHub URL, active-probe consent)
- `/dashboard/scans/[id]` polls until complete and shows the inspection report

### Phase 5 — results dashboard polish ✅
- Inspection report title strip (project, platform, timestamp, actions)
- Stamp moved to left column with severity filters
- Markdown export + copy
- Project scan history timeline (`/dashboard/projects/[id]`)

### Phase 6 — remaining check modules ✅
- env files, source maps, HTTPS/mixed content, admin routes
- Firebase open rules, Supabase REST exposure
- Consent-gated XSS + injection probes
- Outdated deps via public GitHub + OSV

### Phase 7 — Stripe billing ✅
- Checkout + Customer Portal APIs
- Webhook syncs `profiles.subscription_tier` (`free` | `pro`)
- `/pricing` and `/dashboard/billing`
- Free tier still gated at 1 full scan/month; Pro unlimited

### Phase 8 — PDF export ✅
- Client-side inspection PDF via jsPDF (blueprint-style header + stamp + findings)
- Gated to Pro; Markdown export stays free for everyone
- Preview reports link to Pro for PDF

### Phase 9 — scheduled re-scans + alerts ✅
- Pro weekly re-scan toggle per project
- Cron: `GET /api/cron/scheduled-scans` (Vercel daily; due = next_auto_scan_at ≤ now)
- Diff new critical/warning findings vs previous scan
- Slack webhook + optional Resend email alerts
- Alert prefs on `/dashboard/billing`

## Build sequence — complete

All planned phases are implemented. Deferred: client-only-auth static analysis, IDOR with test credentials.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` → `.env.local` and fill in URL + anon + service role keys.
4. Enable Email + GitHub providers under Authentication → Providers.
5. `npm install` then `npm run dev`.

```bash
cd scancraft
cp .env.example .env.local
npm run dev
```

## Build sequence (pause after each phase)

1. ✅ Scaffold
2. ✅ Auth + empty dashboard shell
3. ✅ First check modules + preview scan
4. ✅ Scan submission + polling + storage
5. ✅ Results dashboard polish + Markdown export + project history
6. ✅ Remaining check modules
7. ✅ Stripe billing
8. ✅ PDF export
9. ✅ History + scheduled re-scans (pro)

### Auth setup notes

1. Supabase → Authentication → Providers → enable **Email** and **GitHub**.
2. GitHub OAuth app callback URL: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
3. Site URL / redirect allow list should include `http://localhost:3000/auth/callback` and your production `/auth/callback`.
4. Repo-read scopes for deeper scans will be requested later when the user connects a repo — signup only needs basic GitHub identity.

## Assumptions

- Project lives in `/scancraft` because the parent folder name is not npm-safe.
- `preview_scans` table added for anonymous free scans (no login) so we don't invent fake `projects` rows for guests.
- `is_preview` on `scans` kept for authenticated limited runs if needed later.
- No `scancraft_ui.jsx` was present in the repo; UI tokens follow the written design spec.
