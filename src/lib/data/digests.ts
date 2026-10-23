import type { Tx } from "@/lib/db/types";
import { addDays, startOfZonedDay, zonedDate, zonedTime, formatDate } from "@/lib/time";
import { TASK_KIND_LABELS, type TaskKind } from "@/lib/follow-up-plans";
import { insertEmail } from "./outbox";

export async function listDigestAgents(tx: Tx, after: string | null): Promise<{ id: string }[]> {
  return tx.query<{ id: string }>(`select id from public.agent_profiles
    where send_daily_digest and ($1::uuid is null or id > $1::uuid) order by id limit 100`, [after]);
}

export async function countDigestAgentsAfter(tx: Tx, after: string | null): Promise<number> {
  const [row] = await tx.query<{ n: number }>(`select count(*)::int as n from public.agent_profiles
    where send_daily_digest and ($1::uuid is null or id > $1::uuid)`, [after]);
  return row.n;
}

/** Service-only, one agent and one local day per atomic outbox transaction. */
export async function createAgentDigest(tx: Tx, agentId: string, now: Date, siteOrigin: string, live: boolean, localHour?: number): Promise<string | null> {
  const profile = (await tx.query<{ timezone: string; recipient: string }>(`select timezone,
    coalesce(notification_email, contact_email) as recipient from public.agent_profiles
    where id = $1::uuid and send_daily_digest for update`, [agentId]))[0];
  if (!profile || (localHour !== undefined && Number(zonedTime(now, profile.timezone).slice(0, 2)) < localHour)) return null;
  const date = zonedDate(now, profile.timezone);
  const start = startOfZonedDay(date, profile.timezone);
  const end = startOfZonedDay(addDays(date, 1), profile.timezone);
  const bounds = [agentId, start.toISOString(), end.toISOString(), now.toISOString()];
  const [counts] = await tx.query<{ tasks: number; consultations: number; outcomes: number; clicks: number; inquiries: number }>(`select
    (select count(*)::int from public.follow_up_tasks where agent_id = $1::uuid and completed_at is null
      and canceled_at is null and due_at < $3::timestamptz) as tasks,
    (select count(*)::int from public.appointments where agent_id = $1::uuid and status = 'scheduled'
      and scheduled_at >= $2::timestamptz and scheduled_at < $3::timestamptz) as consultations,
    (select count(*)::int from public.appointments where agent_id = $1::uuid and status = 'scheduled'
      and scheduled_at < $4::timestamptz) as outcomes,
    (select count(*)::int from public.booking_clicks where agent_id = $1::uuid
      and clicked_at >= $4::timestamptz - interval '24 hours' and clicked_at <= $4::timestamptz) as clicks,
    (select count(*)::int from public.inquiries where agent_id = $1::uuid
      and created_at >= $4::timestamptz - interval '24 hours' and created_at <= $4::timestamptz) as inquiries`, bounds);
  if (!counts.tasks && !counts.consultations) return null;
  const claimed = await tx.query(`insert into public.agent_digests(agent_id, local_date) values($1::uuid, $2::date)
    on conflict do nothing returning agent_id`, [agentId, date]);
  if (!claimed.length) return null;
  const tasks = await tx.query<{ full_name: string; kind: TaskKind; due_at: Date }>(`select c.full_name, t.kind, t.due_at
    from public.follow_up_tasks t join public.contacts c on c.id = t.contact_id and c.agent_id = t.agent_id
    where t.agent_id = $1::uuid and t.completed_at is null and t.canceled_at is null and t.due_at < $2::timestamptz
    order by t.due_at, t.id limit 10`, [agentId, end.toISOString()]);
  const body = [
    `Your follow-ups for ${date} (${profile.timezone})`, "",
    `${counts.tasks} open follow-up${counts.tasks === 1 ? "" : "s"} due today or overdue.`,
    ...tasks.map((t) => `${t.full_name} · ${TASK_KIND_LABELS[t.kind]} · ${zonedDate(new Date(t.due_at), profile.timezone) === date ? "today" : `overdue since ${formatDate(t.due_at, profile.timezone)}`}`),
    counts.tasks > 10 ? `Plus ${counts.tasks - 10} more in your dashboard.` : null,
    "", `${counts.consultations} consultation${counts.consultations === 1 ? "" : "s"} scheduled today.`,
    `${counts.outcomes} past consultation${counts.outcomes === 1 ? " still needs" : "s still need"} an outcome.`,
    `${counts.clicks} booking-link click${counts.clicks === 1 ? "" : "s"} in the last 24 hours – check your scheduler. A click isn't a confirmed booking.`,
    `${counts.inquiries} new ${counts.inquiries === 1 ? "inquiry" : "inquiries"} in the last 24 hours.`, "",
    `Open your dashboard: ${siteOrigin}/dashboard`, "",
    "Turn this daily digest off in Settings → Preferences.",
    "Plans create reminders and drafts. Nothing is sent to a homeowner until you press Send.",
  ].filter((line) => line !== null).join("\n");
  const emailId = await insertEmail(tx, { agentId, contactId: null, inquiryId: null, kind: "agent_digest",
    to: profile.recipient, replyTo: null, subject: `Your daily follow-ups · ${date}`, body, status: live ? "queued" : "preview" });
  await tx.query(`update public.agent_digests set email_id = $3::uuid where agent_id = $1::uuid and local_date = $2::date`, [agentId, date, emailId]);
  return emailId;
}
