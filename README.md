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
| `npm run digest:run`     | Local-only agent digest previews; stop the dev server first          |

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

### Stripe subscriptions (US$20/month)

The plan is **USD 20.00 per month**, with no trial, discount codes or annual plan. Agents subscribe in
**Settings → Billing**, pay on Stripe's hosted checkout, and use **Manage billing** to update their payment method
or cancel at the end of the billing period. Payment history includes the initial paid invoice and renewals.
No card details pass through ListingFlow. Checkout is disabled until configured; local mode never accepts live keys.
With `BILLING_MODE=live` on the Supabase backend, workspace pages and actions require an active subscription with
its latest invoice paid and a current billing period. Unpaid/expired accounts go to Billing; profile, billing and
account settings remain accessible. Public seller pages, submissions and booking links pause until payment is
current. Local development, disabled billing and sandbox mode stay free. See [sandbox setup](docs/stripe-sandbox.md).

1. Install/connect the Stripe integration or open your Stripe Dashboard. Start in a **Stripe sandbox**.
2. Set `STRIPE_SECRET_KEY` to a sandbox server key in your gitignored `.env.local`. Prefer a restricted key
   (`rk_test_`) with the required permissions; `sk_test_` also works. Run `npm run billing:setup`.
   This creates or reuses the product, USD 20 monthly Price and a billing portal configuration with cancellation
   enabled and plan changes disabled. It creates no customers, subscriptions or charges. Copy the printed
   `STRIPE_PRICE_ID` and `STRIPE_PORTAL_CONFIGURATION_ID` into your environment. Existing dashboard Prices also work
   if they match USD 20/month with quantity one and interval count one.
3. For local testing, run `npm run billing:listen`. It uses the sandbox key to retrieve the local webhook
   signing secret, saves it in `.env.local` without printing it, and forwards events to localhost:3000.
   Keep the listener running. Set `BILLING_MODE=test` and restart the app. Test cards only.
4. For deployment, register a **snapshot webhook endpoint**, using API version **2026-09-30.endive**, at
   `https://your-app.example/api/stripe/webhook`. Subscribe to:
   - `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`;
   - `invoice.paid`, `invoice.payment_failed`;
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Put that endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`. Use the endpoint secret for the same Stripe mode.
5. Apply the migration with `npm run db:migrate`. Keep **`billing_private` out of Supabase's exposed Data API
   schemas** (the default exposes `public`, not this schema). Billing writes use server-side SQL as the verified
   agent under RLS, including after signature verification for webhooks; `asService` is not used for billing.
6. Before real charges, repeat setup with the live key and matching live Price/portal/webhook secrets, set
   `BILLING_MODE=live`, and use the Supabase backend with `NEXT_PUBLIC_SITE_URL=https://...`. Fill in your business
   contact details on the legal pages. Live mode is explicitly rejected with the local backend or an HTTP site URL.

**Retry and receipt behavior:**

- A random checkout UUID is generated on the server and saved before Stripe is contacted. A database lock and a
  unique constraint allow only one unresolved checkout/subscription per agent and Stripe mode, including across tabs
  and multiple app servers. The amount, Price, origin and expiry come from the server, never browser form inputs.
- Stripe receives a stable `Idempotency-Key` scoped to that agent and checkout. A retry returns the saved receipt,
  resumes the same Checkout Session, or shows payment pending; it does not create another subscription.
- Checkout keys and the first paid receipt are retained for the life of the account, with no automatic pruning.
  Stripe can forget an idempotency key after 24 hours. An attempt with no saved Session ID is therefore **never
  recreated after 22 hours**: it stays blocked until an operator reconciles it against Stripe. Do not delete the
  row to retry it. Check Stripe request logs/metadata and attach the original Session through a verified webhook,
  or confirm and expire the original attempt before allowing a new key. Sessions expire after 23 hours.
- Signature-verified webhooks and the return page retrieve Stripe's current subscription and invoice records.
  Only a paid invoice creates an immutable receipt. Stripe invoice IDs deduplicate webhook retries and renewals.
  Current Stripe state is retrieved under the agent lock, so older webhook snapshots cannot undo a cancellation.
- An expired key is terminal. A canceled subscription or verified expired session allows a fresh checkout with
  a fresh key. An active, past-due or otherwise unresolved subscription blocks another subscription.
- Test receipts are clearly labeled. Unpaid, failed and pending invoices never appear as paid.
- Account deletion is blocked in both the action and the database while a checkout/subscription is unresolved.
  Close it through Stripe, wait for scheduled cancellation to finish, then refresh Billing. Deleting a closed
  account removes local receipts; Stripe retains its financial records under its own policies.

Without Stripe credentials, the database and provider-mocked integration tests run locally. A real Stripe sandbox
checkout and deployed webhook delivery still need to be exercised with your account before enabling live mode.

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

What can be emailed: the new-inquiry alert and daily digest to the agent, an acknowledgment to the homeowner
(a direct reply to their request), and follow-ups the agent reviews and sends from a lead's page.

Every email to a homeowner ends with a signed unsubscribe link (`/unsubscribe`, one click to confirm so link
scanners can't trigger it). Unsubscribing withdraws marketing consent, shows on the lead's page, and the database
refuses further follow-ups to that contact.

### Follow-up plans and drafts

Build plans in **Settings → Follow-up plans**, or add three starter plans to an empty list. Starters are
switched off until reviewed. Plans are checked from top to bottom; the first active plan matching the inquiry's
timeline and campaign is used. A repeat inquiry restarts the matching plan; a duplicate form retry does not.
Switching a plan off only stops new enrollments. Agents can also start or stop a plan on a lead's page.
Create a plan switched off and add at least one step before switching it on. Deleting its last step switches
it off; automatic matching ignores any legacy empty plans and continues to the next match.

**Plans create reminders and drafts. Nothing is sent until the agent presses Send on that specific draft.**
There is no automatic plan email or SMS sending. Text steps provide copyable messages for the agent to send.
Day 0 is immediate; later steps are due at 09:00 in the agent's time zone after the specified calendar days,
including weekends. Calls become text reminders when a homeowner prefers text.

Plans allow 12 steps, including at most 6 email drafts at least 2 days apart, and 20 plans per agent.
Email steps after Day 30 need marketing consent; otherwise they appear as skipped. Unsubscribed contacts get
no email steps. Booking a consultation, marking a lead booked/won/lost, unsubscribing or manually stopping a
plan cancels its remaining open tasks. Booking-link clicks don't stop a plan. Completed tasks and copied
drafts stay in history, even after the plan is edited or deleted. Booked/won/lost leads must change status
before another plan can start. A failed provider attempt leaves its email step open for review and retry.
Each open call, email or text step also has a **Skip** action. It cancels only that step, shows **Skipped by you**,
and completes the enrollment when no open steps remain. Stopped and completed enrollments cannot be reactivated;
start a new enrollment instead. Drafts use the source inquiry's campaign booking link, falling back to the
profile link (or the latest inquiry when no source was saved). Recording an old consultation's attended or
no-show outcome does not stop a newer plan; inserting a non-canceled appointment or rebooking it does.

### Agent daily digest and cron

**Settings → Preferences → Send me a daily digest** is on by default. When follow-ups are due/overdue or a
consultation is scheduled today, it summarizes those tasks (up to 10 lines), consultations needing an outcome,
booking-link clicks and new inquiries. It uses the agent's time zone and goes only to their notification email,
falling back to their contact email. With live billing, agents without paid access are skipped.

`vercel.json` schedules `GET /api/cron/daily-digest` at `0 13 * * *`. Configure a server-only `CRON_SECRET` in
the host environment; the route requires the exact `Authorization: Bearer <CRON_SECRET>` header, uses a
constant-time comparison, and refuses to run without a secret. It is never cached. On Vercel Hobby the job runs
once between 13:00 and 13:59 UTC, so delivery time varies by time zone. A missed run means no digest that day;
there is no backfill. A unique agent/local-date claim and the outbox row commit together, preventing duplicate
digest creation. Failed delivery is recorded and is not automatically resent that day.
The route sets a 60-second maximum duration, within Vercel Hobby's limit. The runner stops starting agents
after 45 seconds, leaving 15 seconds for in-flight work and a count of agents not reached. Only that count is
logged. On the daily Hobby schedule, agents not reached miss that day's digest; there is no next-day backfill.

For Vercel Pro later, change the schedule to `0 * * * *` and set `DIGEST_LOCAL_HOUR=7`. Hourly runs skip agents
before 7am locally and the date claim allows one digest per day, normally in their 7am hour. Leave the threshold
unset for Hobby. No code change is needed for this switch.

Locally, stop the dev server and run `LISTINGFLOW_BACKEND=local npm run digest:run`; run it again to confirm zero
additional previews that day. The script refuses live email delivery and remote backends. Cron and local runs
use the same digest function. Delivery remains a preview unless `EMAIL_DELIVERY=live` and the provider is configured.

### Legal pages and business details

Privacy, Terms, Cookie and Refund pages live in [`src/app/(legal)`](<src/app/(legal)>). Set
`NEXT_PUBLIC_BUSINESS_NAME`, `NEXT_PUBLIC_BUSINESS_ADDRESS` and `NEXT_PUBLIC_BUSINESS_EMAIL` before launch –
bracketed placeholders are shown until you do. The texts are a starting point written from what the code actually
does; have them reviewed for your jurisdiction, and bump `legalUpdated` in [`src/config/brand.ts`](src/config/brand.ts)
when they change (sign-ups record the version they accepted in Supabase user metadata).

Only strictly necessary cookies/storage are used, so the site shows a cookie *notice*, not a consent prompt. Adding
analytics or advertising tools requires a real opt-in first.

### Third-party services

| Service | Used for | Runs where |
| ------- | -------- | ---------- |
| Supabase | Postgres + sign-in (production) | Server; the browser only holds the session cookie |
| Resend | Email sending, only with `EMAIL_DELIVERY=live` | Server (HTTP API, no SDK) |
| Stripe | Optional USD 20/month subscription checkout, billing portal and paid invoice receipts | Server SDK and external Stripe-hosted pages |
| Inter font (`next/font/google`) | Typography | Downloaded at build time and self-hosted; visitors never contact Google |
| lucide-react | Icons | Bundled SVGs, no network |

There are no analytics, advertising, tracking or chat scripts. The agent's own booking link opens their scheduler.

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
    submission and its post-commit plan enrollment, recording a booking click, processing an unsubscribe,
    updating email delivery status and building the agent-only daily digest. Digest queries are limited to
    preferences, due tasks and summary counts; billing eligibility runs separately as each agent under RLS
    through the existing `has_paid_access` function, without giving the service role billing privileges.
  - Plan stop/completion triggers are private `SECURITY DEFINER` functions with an empty search path and no
    API-role execute grants. They change only rows tied to the triggering agent/contact/enrollment. This lets
    unsubscribe and future booking-webhook paths cancel tasks without granting agents access to system events.
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
- No data export UI yet. Agents delete their account in Settings → Preferences (`delete_own_account()`), which
  needs the migration owner to be allowed to delete from `auth.users` – verify once on a live Supabase project.
- Plans create reminders and reviewed drafts, with no automatic plan emails, SMS, reply detection, weekend shifting
  or plan analytics. The daily cron may miss a day; it does not backfill. Deployed cron timing and live digest delivery
  still need verification before launch. Unsubscribe is a link in the email body; one-click `List-Unsubscribe` headers
  aren't sent yet.
- Emails don't include the agent's postal address; agents in the US should add it to their template signature (CAN-SPAM).
