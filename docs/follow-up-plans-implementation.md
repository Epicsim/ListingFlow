# Follow-up plans and daily digest

Implemented October 22, 2026. This report covers only this task's changes. The existing working tree contained substantial unrelated uncommitted and untracked work, which was preserved. Nothing was committed, pushed or deployed, and no remote database migrations or service settings were changed.

## Built

- Settings → Follow-up plans: create/edit/delete plans and steps, timeline/campaign matching, on/off controls, priority buttons, editable off-by-default starter plans, variables and fictional previews.
- New inquiries independently start the first active matching plan after the inquiry commits. Repeat inquiries restart it; duplicate form retries do not. Existing tasks survive plan edits and deletion.
- Calendar-based reminders use Day 0 immediately and Day N at 09:00 in the agent's time zone, across DST and weekends. Calls become text reminders for homeowners who prefer text. Late email steps without consent, and all email steps for unsubscribed contacts, are recorded as skipped snapshots.
- Lead plan history shows due, done, canceled and skipped steps. Draft review stays in FollowUpComposer/saveFollowUpEmailAction/createFollowUpEmail with the existing unsubscribe footer and RLS. A preview or provider acceptance completes the task; a rejection leaves it open for manual retry. No plan job sends homeowner email or SMS.
- Database triggers stop plans on booked/won/lost status, unsubscribe and recorded consultations, preserving completed steps. Manual stops and repeat inquiries also cancel only open plan tasks. Booking-link clicks do not stop plans.
- Overview keeps its layout and adds task-type icons, real linked-email statuses and direct draft links. Canceled tasks are excluded from due lists, next-due queries and follow-up metrics.
- Agent-only daily digest: time-zone-aware due/overdue summaries, consultations today and needing outcomes, booking clicks and inquiries in the last 24 hours. Preference defaults on. Empty workdays are skipped; recipients are restricted to the profile's notification/contact address. A service-only agent/local-date claim commits atomically with the outbox row.
- Uncached bearer-authenticated cron, once-daily Hobby config, optional local-hour threshold for hourly Pro config, preview-only local command, updated demo data and factual legal/docs changes.

## Verification

- `LISTINGFLOW_BACKEND=local npm run check`: lint, route type generation/typecheck, 260 tests across 24 files, and production build pass. Tests include the production postgres.js driver over a local PGlite socket; no live Supabase database is involved.
- Browser walkthrough against a separate local database at `/private/tmp/listingflow-follow-up-walkthrough`: add starter plans, enable Selling soon, submit a fictional Soon inquiry, see four dated steps and dashboard links, review Day 1, save a preview and see the step completed, then record a consultation and see the remaining steps canceled.
- Native multipart HTML form requests, without executing page JavaScript: sign in, create a plan, add an email step and show server-side validation errors. The native server-action path works; variable insertion, live preview updates and clipboard copying are JavaScript enhancements. Without JavaScript, template text remains visible for manual copying.
- Mobile verification at 375px: lead plan card and plan editor fit the viewport (document width 375px); dark and light themes were inspected. The viewport override was reset afterward.
- `npm run digest:run` with local backend, isolated data directory and email delivery disabled: first run created 2 previews (one per eligible fictional agent); the second created 0, with 0 failures. The walkthrough account's Outbox contains exactly one digest.
- Fresh demo seeding succeeds and includes the fictional enrolled plan.
- `git diff --check` passes.

## Preview artifact

The final local screenshot (fictional details only) is saved outside the repository at
`/Users/williamhartono/.codex/visualizations/2026/10/23/01a166e1-6c2c-7b03-ba6d-abb6880a4840/follow-up-plan-preview.jpg`.
It shows the completed preview step and the remaining steps canceled after a recorded consultation.
The verification server was stopped and the temporary browser tab was closed.

## Conservative choices and assumptions

1. Booked, won and lost leads cannot start a plan until the agent reopens their pipeline status. Existing unsubscribed contacts may receive call/text reminders, but no email tasks.
2. Skipped steps are JSON snapshots on the enrollment, rather than tasks. This keeps them visible after plan edits/deletion without counting them as open work. An enrollment containing only skipped steps is immediately completed.
3. Exact priority wins over campaign specificity; creation time and id break equal-position ties. Plans can be manually started while switched off for automatic enrollment. An active manual enrollment must be stopped before another is manually started.
4. The plan/step limits are enforced in server repositories under locks, with single-row checks in SQL. Reminder titles are rendered at enrollment and capped at 200 characters; copied text messages are rendered and capped at 2,000 characters. Email template text is copied and rendered for the lead at review time.
5. Stop/completion/provider-acceptance triggers are private SECURITY DEFINER functions with an empty search path and no API-role execute grants. Parent RLS and composite ownership foreign keys constrain the trigger rows; writes use their agent/contact/enrollment. Agents cannot set the system stop actor.
6. The digest service role receives no billing privileges. With live paid gating, the runner invokes the existing invoker-security paid-access function under each agent's authenticated RLS role before its digest transaction. Local development retains the existing free-access behavior.
7. A digest includes future tasks due later today, and scheduled consultations today; past scheduled consultations are also counted as needing an outcome. Clicks, inquiries or old consultation outcomes alone do not trigger a digest if there are no due tasks or consultations today.
8. A missed cron run is not backfilled. A failed or uncertain digest delivery is retained and not automatically resent that local day. The claim guarantees one stored digest per agent/date, not provider inbox delivery. Hourly Pro configuration normally delivers during the 7am local hour and can catch up later that day.
9. An email task with a queued provider attempt cannot be submitted again while its outcome is unknown. Rejected attempts remain open and permit an explicit review/retry. Status labels use the linked email's actual status. Existing inquiry acknowledgment behavior is unchanged.
10. The Supabase CLI was unavailable, so new migration files follow this repository's existing timestamp convention and were verified with its PGlite migration runner. No previously existing migration was edited.

## Intentionally untested or out of scope

Live Supabase, deployed Vercel cron timing, live Resend delivery and actual paid Stripe subscriptions were not exercised. Provider success/failure and paid-access decisions were tested with fictional local database rows and provider mocks. There are no automatic plan emails, SMS delivery, reply detection, two-hour alerts, List-Unsubscribe headers, weekend/holiday shifting or plan analytics. No remote deployment or service configuration was performed.

## Try locally

Use your existing local database, or an isolated directory:

```bash
LISTINGFLOW_BACKEND=local LOCAL_DATA_DIR=/private/tmp/listingflow-plan-demo EMAIL_DELIVERY= npm run db:seed-demo
LISTINGFLOW_BACKEND=local LOCAL_DATA_DIR=/private/tmp/listingflow-plan-demo EMAIL_DELIVERY= npm run dev
```

Sign in with the fictional demo account printed by the seed. Open Settings → Follow-up plans and the seeded Casey lead to inspect a running example. The seeded demo account already has one plan; the Add starter plans button appears only on an empty plan list. An empty local account can use that button, or create an individual plan and its steps with New plan. Enable a matching plan and submit fictional details on a published seller page.

Stop the server before running the local digest, since PGlite permits one owning process:

```bash
LISTINGFLOW_BACKEND=local LOCAL_DATA_DIR=/private/tmp/listingflow-plan-demo EMAIL_DELIVERY= npm run digest:run
LISTINGFLOW_BACKEND=local LOCAL_DATA_DIR=/private/tmp/listingflow-plan-demo EMAIL_DELIVERY= npm run digest:run
```

Restart the app to view the preview in Outbox. Hosting instructions, CRON_SECRET and the Hobby-to-Pro switch are in README.md. No live email configuration is needed for any local walkthrough step.

## Files added

Paths are relative to `/Users/williamhartono/Documents/ChatGPT/ListingFlow`.

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261022200000_follow_up_plans.sql` | Plans, steps, enrollment/task snapshots, scoped stop/completion triggers and RLS. |
| `supabase/migrations/20261022200100_agent_digests.sql` | Digest preference, email kind and service-only date claims. |
| `src/lib/follow-up-plans.ts` | Shared types, limits, validation, due dates, labels and starter copy. |
| `src/lib/data/plans.ts` | Agent-scoped plan CRUD, matching, enrollment and task snapshots. |
| `src/lib/data/digests.ts` | Minimal digest queries and atomic claim/outbox creation. |
| `src/lib/daily-digest.ts` | Shared digest runner, cron authentication and local-hour configuration. |
| `src/app/api/cron/daily-digest/route.ts` | Uncached authenticated daily cron endpoint. |
| `src/app/(app)/settings/follow-up-plans/actions.ts` | Builder server actions. |
| `src/app/(app)/settings/follow-up-plans/page.tsx` | Plan list, on/off controls, priority and starter plans. |
| `src/app/(app)/settings/follow-up-plans/new/page.tsx` | New plan page. |
| `src/app/(app)/settings/follow-up-plans/[id]/page.tsx` | Plan and step editor page. |
| `src/components/plan-forms.tsx` | Builder forms, variable chips and fictional previews. |
| `src/components/lead-plan-card.tsx` | Enrollment history, step states, manual start/stop and text copying. |
| `scripts/run-digest.ts` | Local-only preview command using the shared runner. |
| `vercel.json` | Daily Hobby cron schedule. |
| `tests/db/follow-up-plans.test.ts` | Matching, snapshots, consent, triggers, limits and RLS tests. |
| `tests/db/daily-digest.test.ts` | Digest idempotency, content, preferences, paid eligibility and isolation tests. |
| `tests/db/plan-email-action.test.ts` | Existing send action with preview, mocked rejection/acceptance and ownership checks. |
| `tests/unit/follow-up-plans.test.ts` | Calendar/DST scheduling and builder validation tests. |
| `tests/unit/digest-cron.test.ts` | Cron auth and hour configuration tests. |
| `docs/follow-up-plans-implementation.md` | This implementation and verification report. |

## Existing files modified

Some were already modified or untracked before this task. Only the additions described here belong to this task.

| File | Change |
| --- | --- |
| `AGENTS.md` | Expand the permitted service-role steps. |
| `README.md` | Plans/digests, security boundaries, cron setup, Hobby/Pro and limitations. |
| `.env.example` | Empty CRON_SECRET and optional DIGEST_LOCAL_HOUR. |
| `package.json` | Add digest:run; no dependencies added. |
| `scripts/seed-demo.ts` | One fictional off plan with a manually enrolled fictional lead. |
| `src/app/(app)/settings/settings-tabs.tsx` | Add Follow-up plans tab. |
| `src/app/(app)/settings/preferences/page.tsx` | Notification settings including daily digest. |
| `src/app/(app)/settings/actions.ts` | Save notification preferences. |
| `src/app/(app)/leads/[id]/page.tsx` | Plan history and task-specific draft review with honest email statuses. |
| `src/app/(app)/leads/actions.ts` | Start/stop plans and validate/link optional task_id in the existing send path. |
| `src/components/lead-forms.tsx` | Carry the selected task id in FollowUpComposer. |
| `src/components/overview.tsx` | Task icons, real email status, direct draft links and plan activity icons; keep layout. |
| `src/components/ui/action-form.tsx` | Native server action fallback without JavaScript while preserving hydrated validation behavior. |
| `src/lib/activity-text.ts` | Readable plan started/stopped events. |
| `src/lib/data/leads.ts` | Extended task fields, optional contact lock and cancellation-aware next-due queries. |
| `src/lib/data/tasks.ts` | Task/email ownership locks, linkage, real email status and canceled-task filtering. |
| `src/lib/data/metrics.ts` | Exclude canceled tasks from awaiting_follow_up. |
| `src/lib/data/profiles.ts` | Read digest preference and save notifications. |
| `src/lib/db/index.ts` | Document the new permitted service-role steps. |
| `src/lib/domain.ts` | Daily digest email kind and label. |
| `src/lib/inquiry-service.ts` | Independent post-commit automatic enrollment; plan errors never undo inquiries. |
| `src/proxy.ts` | Let cron use its bearer authentication without Supabase session refresh. |
| `src/app/(legal)/privacy/page.tsx` | Describe plan content and agent-only digest processing. |
| `src/app/(legal)/terms/page.tsx` | Describe reminders/drafts and default-on agent digest. |
| `src/config/brand.ts` | Bump legalUpdated to October 22, 2026. |
| `tests/db/postgres-driver.test.ts` | Round-trip arrays, skipped snapshots and digest dates over a local PGlite wire socket. |
