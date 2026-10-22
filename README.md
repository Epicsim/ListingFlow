# ListingFlow

ListingFlow helps individual real estate agents turn the visitors they already bring – from their social
profiles, website or their own ads – into seller inquiries and booked consultations.

```
Agent creates a campaign → shares its link → homeowner submits an inquiry
→ homeowner (optionally) opens the agent's booking link → agent records the consultation → tracks the outcome
```

It does **not** create traffic, buy ads, scrape prospects, generate valuations or connect to the MLS. Every
estimate is prepared by the agent, and the public pages say so.

The product name lives in one place: [`src/config/brand.ts`](src/config/brand.ts) (or set `NEXT_PUBLIC_APP_NAME`).

---

## Quick start (local mode – no accounts needed)

Requirements: Node.js 20.9+ (tested on 22).

```bash
npm install
npm run dev
```

Open http://localhost:3000, choose **Get started**, create an account, fill in your profile and publish your
first page.

With no Supabase variables set, the app runs in **local mode**:

- Data is stored in an embedded Postgres database ([PGlite](https://pglite.dev)) in `./.data/` (gitignored).
- The **same SQL migrations and row-level security policies** used in production are applied automatically.
- Sign-in is a development-only email + password login stored in that local database.
- A "Local mode" badge is shown in the app. Local mode refuses to start on Vercel.

### Demo data (optional)

Stop `npm run dev` first (the local database can only be open in one process), then:

```bash
npm run db:seed-demo
```

This creates a demo agent with clearly fictional leads, campaigns, consultations and outbox previews. The
sign-in details are defined at the top of [`scripts/seed-demo.ts`](scripts/seed-demo.ts) and printed by the
script. Use `npm run db:seed-demo -- --reset` to recreate it. The seed only ever writes to the local database.

To start over completely, stop the server and delete the `.data/` folder.

## Scripts

| Command                  | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `npm run dev`            | Development server on http://localhost:3000                         |
| `npm run build` / `start`| Production build / server                                            |
| `npm run lint`           | ESLint (Next.js + React Compiler rules)                             |
| `npm run typecheck`      | Generates route types, then `tsc --noEmit`                          |
| `npm test`               | Vitest: unit tests + database tests against real Postgres (PGlite)  |
| `npm run check`          | lint + typecheck + tests + build                                    |
| `npm run db:migrate`     | Applies `supabase/migrations` to the configured database            |
| `npm run db:seed-demo`   | Local-only fictional demo account                                   |

---

## Running with Supabase (production)

1. **Create a Supabase project.**
2. **Auth settings** (Authentication → URL Configuration):
   - Site URL: your app URL, e.g. `https://app.example.com`
   - Redirect URLs: add `https://app.example.com/auth/callback` (and `http://localhost:3000/auth/callback` for local testing)
   - Email confirmation can stay on; sign-up then asks the agent to confirm by email. Supabase's built-in email
     sender is rate limited – configure custom SMTP in Supabase for real use.
3. **Environment** – copy `.env.example` to `.env.local` (or set them in your host) and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API)
   - `SUPABASE_DB_URL` – the **transaction pooler** connection string (port 6543). Server-only secret.
   - `APP_SECRET` – `openssl rand -base64 48`
   - `NEXT_PUBLIC_SITE_URL` – your public URL
4. **Apply the database schema:** `npm run db:migrate`
5. **Deploy** (e.g. Vercel) with the same variables. No Supabase Storage bucket is needed – branding images are
   stored in Postgres and served with long-lived cache headers.

> The Supabase mode code path is covered by tests that run the production `postgres` driver over a real
> Postgres wire connection, but it has **not** yet been exercised against a live Supabase project (none was
> available while building). Do a sign-up → publish → submit → dashboard pass after your first deploy.

### Password recovery

The sign-in page links to **Forgot your password?** In Supabase mode, a reset request opens a confirmation
page with the same wording for existing and unknown accounts. Supabase Auth sends the recovery email; these
emails are separate from the app's inquiry Outbox and its `EMAIL_DELIVERY` setting.

Open the recovery link in the same browser where you requested it so the PKCE verifier cookie is available.
The exact allowlisted `/auth/callback` URL verifies the link and routes recovery sessions to `/reset-password`.
Choose a password of 8–200 characters and confirm it; after saving, the account stays signed in. Expired links,
missing sessions and provider failures offer a retry path. Local mode explains that email recovery is unavailable.

### Email delivery (optional)

Messages are always written to the in-app **Outbox**. They are sent only when all of these are set:

```
EMAIL_DELIVERY=live
RESEND_API_KEY=...
EMAIL_FROM="Your Name <notifications@your-verified-domain.com>"
```

Otherwise they stay as **"Preview only – not sent"**. A message is marked "Accepted by email provider" only
after Resend accepts it (that is not proof of inbox delivery); failures are recorded with an error code.
Keep delivery off in development.

What can be emailed: the new-inquiry alert to the agent, an acknowledgment to the homeowner (a direct reply to
their request), and one-off follow-ups the agent writes from a lead's page. **Automated marketing sequences are
intentionally not built** – they need sender setup, consent and unsubscribe handling, and background jobs first.

---

## How it works

**Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4, zod, Vitest,
Supabase Auth + Postgres (production) / PGlite (local + tests).

### Data access and security

- All data access is server-side SQL ([`src/lib/data`](src/lib/data)). There is no browser database client.
- Every request runs inside a transaction that switches to a Supabase API role and sets the JWT claims
  ([`src/lib/db/run-as.ts`](src/lib/db/run-as.ts)):
  - `authenticated` + the agent's id for dashboard pages – **row-level security** limits every query to that agent's rows;
  - `anon` for public pages – no table access at all, only `get_public_campaign` / `get_public_asset`;
  - `service_role` only for the server steps that have no signed-in agent: saving a validated public
    submission, recording a booking click, and updating email delivery status.
- Child rows reference parents through composite `(id, agent_id)` foreign keys, so the database refuses to link
  one agent's records to another agent's contacts or campaigns even if application code were wrong.
- Agents can't edit what homeowners submitted (inquiries, consent records) or forge visitor activity / "sent" emails.
- Privileged credentials (`SUPABASE_DB_URL`, `APP_SECRET`, `RESEND_API_KEY`) are only read on the server.

### Public inquiry pipeline ([`src/lib/inquiry-service.ts`](src/lib/inquiry-service.ts))

1. Honeypot field + signed form token (rejects instant bot posts and expired pages).
2. Server-side validation with field-level errors (zod), text normalization.
3. Rate limit: 6 submissions / 10 min per connection, stored as a keyed hash of the IP (never the IP) in a
   database table, so it works on serverless hosts with many instances.
4. `submit_inquiry` (one transaction): matches or creates the **contact** by email for that agent, always
   stores a new **inquiry** with its own campaign and UTM attribution, records **consent** (exact wording,
   time, page, source) only when the optional box was ticked, logs activity, and adds a "respond" reminder
   for returning homeowners.
5. **Idempotency:** a retry of the same form with the same contents returns the original inquiry; editing a
   field or loading the page again creates a new inquiry linked to the same contact – nothing is silently dropped.
6. The confirmation page is shown only after the commit, and only says "received" for a valid saved reference.
   No personal data is put in URLs or logs.

### Booking vs. consultations

The thank-you page links to the agent's existing scheduler through `/p/<slug>/book`, which records a
**booking-link click** and redirects. A click is never counted as a consultation. Agents record consultations
on the lead page (in their own time zone; stored as UTC) and mark them attended / no-show / canceled.

The `appointments` table already has `source = 'booking_webhook'`, `external_provider` and `external_event_id`
(unique per agent) so a future, **signature-verified** scheduler webhook can upsert bookings idempotently.
That webhook is **not implemented**; the app says so in Settings.

### Metrics

Every number on the dashboard is a count of stored rows ([`src/lib/data/metrics.ts`](src/lib/data/metrics.ts)):
new inquiries/leads in the range, leads awaiting follow-up right now (status "new" or a due reminder),
consultations recorded (excluding canceled), consultations attended, and booking-link clicks (shown separately).

### Project layout

```
supabase/migrations/       schema, RLS policies, public SECURITY DEFINER functions
supabase/local/            stand-ins for Supabase roles/auth used only by PGlite
src/app/(auth)/            sign-up, sign-in, password reset (Supabase)
src/app/onboarding/        short profile setup
src/app/(app)/             agent dashboard: overview, leads, campaigns, outbox, settings
src/app/p/[slug]/          public landing page, thank-you page, booking redirect
src/lib/data/              SQL repositories (used by pages, actions and tests)
src/lib/db/                drivers, role switching, migrations
tests/unit, tests/db       unit tests; database tests incl. RLS isolation and the production driver
```

## Testing

`npm test` runs 100+ tests, including:

- inquiry validation, persistence, consent recording and DB constraints;
- agent-to-agent isolation and public (anon) restrictions for every table;
- duplicate/retry handling and repeat-inquiry attribution;
- booking clicks vs. recorded consultations, and dashboard metrics from stored rows;
- spam trap, form-token timing, rate limiting, "no success if the save fails", email preview vs. sent;
- the production postgres.js driver over a real Postgres socket.

## Known limitations

- Supabase mode is untested against a live project (see note above).
- Rate limiting trusts the platform's `x-forwarded-for`; self-hosting behind your own proxy needs that proxy to set it.
- No CAPTCHA (honeypot + timing + rate limit only); add Cloudflare Turnstile if spam appears.
- No account deletion / data export UI yet; deleting the auth user cascades all of an agent's data.
- No unsubscribe flow or automated sequences (by design, until those are built properly).
- Homeowners can't withdraw marketing consent through the app yet; agents should honor replies manually.
