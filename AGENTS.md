<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ListingFlow project notes

- Read `README.md` first: architecture, security model and how to run locally (local mode needs no accounts).
- All data access goes through `src/lib/data/*` with an explicit `Tx` and runs under a Supabase role via
  `asUser` / `asAnon` / `asService` (`src/lib/db`). Never query tables from client code, and keep
  `asService` (bypasses RLS) limited to public submission (including its post-commit plan enrollment),
  booking-click, unsubscribe, email-delivery and agent-only daily-digest steps.
- Schema changes: add a new file in `supabase/migrations/` (never edit an applied one), enable RLS on new
  tables, revoke from `anon`, grant only what `authenticated` needs, and add tests in `tests/db/`.
- SQL parameters: cast every parameter (`$1::uuid`), counts to `::int`, and JSON/arrays through text
  (`$1::text::jsonb`) so the PGlite and postgres.js drivers behave identically.
- Never log personal data (names, emails, addresses, phone numbers); log error codes only.
- Emails: never label a preview or queued message as sent/delivered; real sending requires `EMAIL_DELIVERY=live`.
  Emails to homeowners must end with `withUnsubscribeLink` (`src/lib/email/unsubscribe.ts`).
- Legal pages live in `src/app/(legal)`; keep them true to what the code does and bump `legalUpdated` in
  `src/config/brand.ts` when they change. No analytics/ads/tracking without adding a real cookie opt-in first.
- Before finishing a change run `npm run check` (lint, typecheck, tests, build).
