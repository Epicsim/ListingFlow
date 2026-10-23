# Build follow-up plans (with a plan builder) and a daily digest

You are working in the ListingFlow repository, a Next.js 16 and Supabase app for solo real-estate agents.

Before writing code:
- Read `AGENTS.md` and `README.md`.
- Read the relevant guides in `node_modules/next/dist/docs/`. This Next.js version differs from what you may know.
- Read `design-system/listingflow/MASTER.md` before touching UI.

The working tree already contains many uncommitted changes from other work. Leave them as they are: don't revert, reformat or "clean up" files you aren't changing, and read a file before you edit it.

## Goal

Add two features, both of which leave the agent in control:

1. **Follow-up plans (B).** Agents build their own plans: a list of steps such as "Day 0: call", "Day 1: email", "Day 3: email".
   - When a new inquiry arrives, the first matching plan creates dated reminders for that lead.
   - Email steps carry a pre-written draft.
   - The agent reviews each draft and clicks Send. **Nothing is ever emailed to a homeowner automatically.**
2. **Daily digest (A).** Once a day, each agent gets one email listing today's and overdue follow-ups and today's consultations. It goes to the agent only.

## Hard rules

**Deployment and real data**
- Don't commit, push, deploy, or apply migrations to any remote database.
- Don't change Vercel, Supabase, Stripe or Resend settings.
- Test only in local mode (`LISTINGFLOW_BACKEND=local`, PGlite).
- Never send real email: leave `EMAIL_DELIVERY` unset.
- Use clearly fictional data for every demo and test record.

**Sending**
- Nothing goes to a homeowner unless the agent clicks Send on that specific email. No scheduled job, cron or trigger may email a homeowner.
- Every homeowner email goes through the existing follow-up path, `saveFollowUpEmailAction` in `src/app/(app)/leads/actions.ts` and `createFollowUpEmail`. That path keeps the unsubscribe link (`withUnsubscribeLink`), the unsubscribed check, RLS and honest status labels. Don't build a second send path.
- SMS stays non-functional. A "text" step is only a reminder, with a message the agent can copy.
- Never label a preview or queued email as sent or delivered. Status text always comes from `EMAIL_STATUS_LABELS` and the email's real status.

**Personal data**
- No personal data (names, emails, addresses, phones) in logs; log error codes only.
- No personal data in URLs. Record ids are fine.

**Wording rules.** These apply to starter plans, defaults and UI text:
- no valuation numbers;
- no "automated estimate";
- no MLS or market data;
- no promises of traffic, leads or results.

The agent prepares every estimate personally.

**AGENTS.md rules**
- Data access goes through `src/lib/data/*` with an explicit `Tx`, under `asUser`, `asAnon` or `asService`.
- Schema changes go in new migration files only.
- Every new table: RLS on, revoke from `anon`, the smallest possible grants to `authenticated`, and tests in `tests/db/`.
- Cast every SQL parameter.

**UI**
- Use the existing components: `Card`, `CardHeader`, `Badge`, `EmptyState`, `ButtonLink` and the form patterns in `src/components`.
- Pages must work in light and dark mode and at 375px wide.
- Forms must work without JavaScript, using server actions in the existing `ActionState` style.

When something here is ambiguous, pick the more conservative option and list it in your final report.

## Part B: Follow-up plans

### Data model

Use new migrations.

**`follow_up_plans`**
- `id`, `agent_id`
- `name`: 1–80 characters
- `is_active`: boolean, default false
- `position`: int. Plans are checked top to bottom and the first match wins.
- `timelines`: `text[]`. A non-empty subset of `TIMELINES` in `src/lib/domain.ts`.
- `campaign_id`: nullable. Null means all campaigns. Use a composite foreign key with `agent_id`, like the other tables.
- `created_at`, `updated_at`
- Limit: 20 plans per agent.

**`follow_up_plan_steps`**
- `id`, `plan_id`, `agent_id`
- `day_offset`: int, 0–365
- `kind`: `call`, `email` or `text`
- `title`: for call and text steps, may contain `{{placeholders}}`
- `text_message`: optional, text steps only
- `email_subject`, `email_body`: email steps only
- Steps are ordered by `day_offset` (then kind), so there's no step reordering.
- Limits:
  - at most 12 steps per plan;
  - at most 6 email steps per plan;
  - email steps at least 2 days apart.

  Enforce these in server validation. Add database checks where a single-row check works.

  These limits matter because every agent sends from the app's one shared sending address, and an aggressive plan can hurt deliverability for all of them.

**`follow_up_enrollments`**
- `id`, `agent_id`, `contact_id`, `inquiry_id` (nullable)
- `plan_id`: nullable, `on delete set null`
- `plan_name`: a snapshot of the plan's name
- `status`: `active`, `completed` or `stopped`
- `stop_reason`: `consultation_booked`, `won`, `lost`, `unsubscribed`, `repeat_inquiry` or `agent_stopped`. Keep this list easy to extend.
- `started_at`, `stopped_at`
- At most one `active` enrollment per contact, using a partial unique index.

**Extend `follow_up_tasks`** with:
- `kind`: `reminder`, `call`, `email` or `text`, default `reminder`. Existing manual reminders stay `reminder`.
- `enrollment_id`, `plan_step_id`: nullable
- `email_subject`, `email_body`: the step's template text with `{{placeholders}}`, copied when the task is created
- `email_id`: the outbox row created when the agent sends the step
- `canceled_at`, `cancel_reason`

Two consequences of copying template text onto tasks:
- **Editing or deleting a plan never changes tasks that already exist.**
- **Deleting a plan leaves running enrollments as they are.**

**Update every query that reads `follow_up_tasks`** (grep for it) so canceled tasks are left out of everything that counts as due or open:
- `listDueTasks`;
- the next-due logic in `listLeads`;
- `awaiting_follow_up` in `getOverviewMetrics`;
- the lead detail page.

### Which leads get a plan

**Automatic start.** When an inquiry is created (not a duplicate retry), find the first active plan, by `position`, where:
- `timelines` contains the inquiry's timeline; and
- `campaign_id` is null or equals the inquiry's campaign.

Do this in `src/lib/inquiry-service.ts` after the inquiry is committed, in its own transaction, the same way `createSubmissionEmails` works. A plan error must never undo a saved inquiry. Log error codes only.

**Repeat inquiry.**
- If a plan matches, stop the contact's active enrollment (`repeat_inquiry`) and start the match.
- If no plan matches, leave the current one running.

**Manual start.** A "Start a plan" control on the lead page lets the agent pick any of their plans. Day 0 is the moment they click.

**Turning plans off.** Switching a plan off stops new enrollments only. Existing ones continue.

**Completion.** An enrollment becomes `completed` when it has no open steps left. Mark it at that point, or when a new enrollment starts.

### Creating the steps

Create all of a plan's steps as tasks at the moment it starts. No scheduler is needed for this part.

**Due times**
- Day 0 is due at the start instant.
- Day N is due at 09:00 in the agent's time zone, N calendar days after the start date in that zone.
- Use `zonedDate`, `addDays` and `zonedDateTimeToUtc` from `src/lib/time.ts`.
- Make the 09:00 a named constant.
- Don't shift steps for weekends.

**Titles.** Render placeholders in titles when the task is created, using the same values as `templateValuesFor` in `src/lib/email/messages.ts`.

**Call steps.** If the contact's `preferred_contact` is `text`, create the step as a text reminder ("Text {first name}") instead.

**Consent rule.** Make this a named constant, `CONSENT_REQUIRED_AFTER_DAYS = 30`. An email step with `day_offset > 30` is created only if the contact has `marketing_consent = true`. Otherwise skip it, and show it on the lead page as "Skipped – no marketing consent".

**Unsubscribed contacts.** If the contact is unsubscribed when the plan starts, create no email steps.

### Stop rules

When a plan stops:
- set the enrollment to `stopped` with its reason;
- set `canceled_at` and `cancel_reason` on its open tasks;
- leave completed tasks alone.

**Stop triggers**

| Trigger | Stop reason |
|---|---|
| Contact status changes to `consultation_booked`, `won` or `lost` | That status |
| An appointment is recorded for the contact | `consultation_booked` |
| The contact unsubscribes (`unsubscribed_at` is set; see `unsubscribe_contact`) | `unsubscribed` |
| The agent clicks "Stop plan" on the lead page | `agent_stopped` |
| A repeat inquiry starts a new plan | `repeat_inquiry` |

**Implement these as database triggers on `contacts` and `appointments`.** That way every path is covered: the agent UI, the unsubscribe function, and a future booking webhook. Choose `security definer` or invoker deliberately, and test that triggers can't be used to touch another agent's rows.

**Deleting a lead** already cascades.

**Booking-link clicks** don't stop or pause anything. They are surfaced in the digest instead.

**Not in scope: replies.** Don't build reply detection or a "They replied" button. That decision is still open. "Stop plan" with a reason covers it for now.

### Builder UI: Settings → "Follow-up plans"

Add a tab in `src/app/(app)/settings/settings-tabs.tsx`. The tab has three pages: `/settings/follow-up-plans`, `/settings/follow-up-plans/new` and `/settings/follow-up-plans/[id]`.

**Plan list**
- Each plan shows its name, an on/off control, who it applies to (timeline labels from `TIMELINE_LABELS`, plus campaign or "All campaigns") and its step count.
- "Move up" and "Move down" buttons set the priority. Don't use a drag-and-drop library.
- Explain in one line: "Plans are checked from top to bottom; the first match is used."
- Show the "applies to" text in plain language.

**Plan editor**
- Name, on/off, timeline checkboxes and a campaign select.
- The step list, with add, edit and delete.
- **Step form:**
  - Day.
  - Type: "Call reminder", "Email draft" or "Text reminder (you send it yourself)".
  - Call and text steps: a title. Text steps also get an optional message.
  - Email steps: subject and body, with the variable chips from `TEMPLATE_VARIABLES` and a "Start from my follow-up template" button.
  - A preview rendered with clearly fictional sample values.
- Validation errors explain the limits in plain words.
- Show near the top: "Plans create reminders and drafts. Nothing is sent until you press Send."

**Empty state.** An "Add starter plans" button creates three plans, **switched off**, for the agent to review. Write short, honest copy that follows the wording rules and the style of `DEFAULT_TEMPLATES` in `src/lib/email/templates.ts`.

| Starter plan | Timelines | Steps |
|---|---|---|
| "Selling soon" | `soon` | Day 0 call, Day 1 email, Day 3 email, Day 7 email ("closing the loop") |
| "In 3–6 months" | `3_6_months` | Day 0 call, Day 3 email, Day 14 email, then emails on Day 44, 74 and 104 (these need consent) |
| "Later or just exploring" | `6_12_months`, `exploring` | Day 0 call, Day 7 email, then emails on Day 37 and 67 (these need consent) |

### Lead page (`src/app/(app)/leads/[id]/page.tsx`)

**Follow-up plan card**
- Plan name and status: active, completed, or stopped with a readable reason.
- Each step with its state:
  - done;
  - due date;
  - canceled;
  - skipped, with the reason.
- "Stop plan" when a plan is active; "Start a plan" when none is.

**Email steps**
- A "Review draft" button opens the existing `FollowUpComposer`, pre-filled with the step's subject and body rendered for this lead. Pass the task id in the URL, such as `?task=<id>`; never names or emails.
- `saveFollowUpEmailAction` takes an optional `task_id` and must check that the task belongs to this agent and contact.
  - When the email is stored as a preview, or accepted by the provider, mark the task completed and set its `email_id`.
  - If the provider rejects it, leave the task open.
- A step's label always reflects the linked email's real status. In preview mode it reads "Preview only – not sent".

**Text steps** show the message with a copy button and the contact's phone number. Nothing is sent.

### Dashboard and activity

- **Keep the Overview layout as it is.** In `FollowUpList` (`src/components/overview.tsx`), show each task's type with an icon and a label such as "Email draft ready", "Call" or "Text". An email row links straight to its draft.
- **New activity events:**
  - `plan_started`: data is the plan name.
  - `plan_stopped`: data is the reason.

  Use actor `system` for automatic events and `agent` for manual ones. Add them to `describeEvent` in `src/lib/activity-text.ts` and to `EVENT_ICONS` in `src/components/overview.tsx`. Don't log an event for every task created.

## Part A: Daily digest

Hosting will be **Vercel on the free Hobby plan**, so the cron can run only once a day, at an unpredictable minute within the scheduled hour. Later the app will move to Vercel Pro (hourly or more often). Build it so that switch is a config change.

**Setting.** Add `agent_profiles.send_daily_digest boolean not null default true`, with a toggle in Settings → Preferences next to the existing notification settings.

**Outbox.** Add a new email kind, `agent_digest`, labeled "Daily digest to you" in `EMAIL_KIND_LABELS`. Extend the `outbound_emails` kind check in a new migration. Agents must still be unable to insert anything except `follow_up`, so keep the RLS insert policy as it is.

**Route: `src/app/api/cron/daily-digest/route.ts` (GET)**
- Require `Authorization: Bearer <CRON_SECRET>`. Compare in constant time.
- Return 401 when the header is wrong or missing. Refuse to run when `CRON_SECRET` is unset.
- The route must never be cached.
- Add `vercel.json`:

  ```json
  { "crons": [{ "path": "/api/cron/daily-digest", "schedule": "0 13 * * *" }] }
  ```

  On Hobby, this runs between 13:00 and 13:59 UTC.

**For each agent with the digest on**
- **Paid access.** When `BILLING_MODE=live`, skip agents without paid access. Reuse the existing billing logic. Note that `billing_private.has_paid_access` isn't executable by `service_role`, so pick a safe approach and explain it.
- **Contents**, using the agent's time zone for "today":
  - open, non-canceled tasks that are overdue or due today: a count plus up to 10 lines, each with the lead's name, the step type and "today" or "overdue since <date>";
  - consultations scheduled today;
  - past consultations that still need an outcome;
  - booking-link clicks in the last 24 hours ("check your scheduler");
  - the number of new inquiries in the last 24 hours.
- **When to skip.** Skip the email entirely when nothing is due or overdue and no consultation is today.
- **Format.** Plain text, in the style of `agentNotification` in `src/lib/email/messages.ts`, with a link to `/dashboard` and a line saying how to turn the digest off.
- **Recipient.** `notification_email ?? contact_email`. It never goes to anyone else, because it contains lead names.
- **Status.** Store it as `preview` unless delivery is live. Only when live, hand it to `deliverQueuedEmails`.

**Idempotency.** Vercel cron can skip a run or deliver it twice.
- Add a service-only table `agent_digests (agent_id, local_date date, email_id, created_at)`, unique on `(agent_id, local_date)`, with RLS on and no grants to `anon` or `authenticated`.
- Insert into it with `on conflict do nothing`, in the same transaction as the outbox row. Only create the email if the insert succeeded.
- Running the job twice on the same day must produce one email.
- A missed run means no digest that day. That's acceptable; document it.

**Moving to Vercel Pro later.**
- Support an optional `DIGEST_LOCAL_HOUR` environment variable, unset by default. When it's set, skip agents whose current local hour is earlier.
- Document the switch in the README: change the schedule to `0 * * * *` and set `DIGEST_LOCAL_HOUR=7`, so each agent gets the digest at 7am in their own time zone.

**Service role.** This job is a new `asService` step.
- Update the `asService` list in `AGENTS.md`.
- Update the security section of `README.md`.
- Keep the job's queries limited to what the digest needs.

**Local run.** Add `npm run digest:run`, a `tsx` script that calls the same function in local mode. Add `CRON_SECRET=` to `.env.example` with no value.

## Out of scope

- Automatic emails to homeowners.
- The "lead has waited 2 hours" alert.
- Reply detection or a "They replied" button.
- SMS sending.
- `List-Unsubscribe` headers.
- Weekend and holiday shifting.
- Plan analytics.

## Docs to update

- **`README.md`.** Email section:
  - plans create reminders and drafts; nothing is sent until the agent presses Send;
  - the daily digest;
  - cron setup and `CRON_SECRET`;
  - Hobby vs Pro.

  Also update "Known limitations".
- **`AGENTS.md`**: the `asService` list.
- **`.env.example`**.
- **Legal pages** in `src/app/(legal)`. Check Privacy and Terms for anything that becomes untrue, such as which emails agents receive. Change only what's needed, and bump `legalUpdated` in `src/config/brand.ts` if you change them.
- **Demo seed** (`npm run db:seed-demo`). Add one fictional plan and one enrolled fictional lead.

## Tests

**`tests/db/`**
- **RLS on every new table:**
  - one agent can't read or change another agent's plans, steps, enrollments or tasks;
  - `anon` gets nothing;
  - `authenticated` can't touch `agent_digests` or insert `agent_digest` emails.
- **Matching:**
  - first match by position;
  - a campaign-specific plan vs an all-campaigns plan;
  - plans that are off are ignored;
  - a duplicate submission doesn't enroll twice;
  - a repeat inquiry restarts the plan.
- **Step creation:**
  - the consent rule skips late email steps;
  - unsubscribed contacts get no email steps;
  - call steps become text steps for contacts who prefer text.
- **Stop rules:** every trigger cancels only open tasks.
- **Canceled tasks are excluded** from the dashboard due list, the leads "needs follow-up" view and `awaiting_follow_up`.
- **Plan edits and deletes** don't change existing tasks or enrollments.
- **Sending a step** through `saveFollowUpEmailAction` completes the task in preview mode. Its label stays "Preview only – not sent".

**`tests/unit/`**
- **Due dates:** Day 0 is now; Day N is at 09:00 local; across a daylight-saving change; agent time zone vs UTC.
- **Builder validation limits.**
- **Cron auth:** no header gives 401; a wrong secret gives 401; an unset `CRON_SECRET` refuses to run.
- **Digest:** running it twice creates one email; it's skipped when nothing is due; it's stored as a preview when delivery is off.

## Done when

1. `npm run check` passes: lint, typecheck, tests and build.
2. In local mode, this walk-through works:
   1. Add the starter plans and switch "Selling soon" on.
   2. Submit an inquiry with timeline "Soon" on a published fictional seller page.
   3. The dated steps appear on the lead page and the dashboard.
   4. Opening the Day 1 draft and pressing Send stores it as "Preview only – not sent" and completes the step.
   5. Recording a consultation cancels the rest.
   6. `npm run digest:run` creates one digest preview in the outbox, and running it again creates none.

## Report back

- What you built.
- Every file and migration you added or changed.
- Every assumption or conservative choice you made.
- Anything unfinished or untested.
- How to try it locally.

Don't commit.
