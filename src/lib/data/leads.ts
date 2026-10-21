import type { Tx } from "@/lib/db/types";
import type { AppointmentStatus, ContactMethod, EmailKind, EmailStatus, LeadStatus, Timeline } from "@/lib/domain";
import { type ActivityEvent, listContactActivity, logAgentEvent } from "./activity";

export const LEADS_PAGE_SIZE = 25;

export interface LeadListRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  preferred_contact: ContactMethod;
  status: LeadStatus;
  last_inquiry_at: Date;
  inquiry_count: number;
  property_address: string;
  timeline: Timeline;
  source: string;
  campaign_id: string;
  campaign_name: string;
  next_follow_up_at: Date | null;
  needs_follow_up: boolean;
}

export interface LeadFilters {
  q?: string;
  status?: LeadStatus;
  campaignId?: string;
  source?: string;
  timeline?: Timeline;
  needsFollowUp?: boolean;
  page?: number;
}

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * "Needs follow-up" = a brand-new lead nobody has acted on yet, or any lead
 * with an open follow-up task that is due. The same rule drives the dashboard
 * count and the leads filter.
 */
export async function listLeads(
  tx: Tx,
  agentId: string,
  filters: LeadFilters,
  now: Date,
): Promise<{ rows: LeadListRow[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const q = filters.q?.trim();
  const rows = await tx.query<LeadListRow & { total: number }>(
    `with base as (
       select c.id, c.full_name, c.email, c.phone, c.preferred_contact, c.status, c.last_inquiry_at, c.inquiry_count,
              li.property_address, li.timeline, li.source, li.campaign_id, cp.name as campaign_name,
              nt.next_due as next_follow_up_at,
              (c.status = 'new' or (nt.next_due is not null and nt.next_due <= $8::timestamptz)) as needs_follow_up
       from public.contacts c
       join lateral (
         select i.property_address, i.timeline, i.source, i.campaign_id
         from public.inquiries i where i.contact_id = c.id
         order by i.created_at desc limit 1
       ) li on true
       join public.campaigns cp on cp.id = li.campaign_id
       left join lateral (
         select min(t.due_at) as next_due from public.follow_up_tasks t
         where t.contact_id = c.id and t.completed_at is null
       ) nt on true
       where c.agent_id = $1::uuid
         and ($2::text is null or c.status = $2::text)
         and ($3::uuid is null or exists (
               select 1 from public.inquiries i where i.contact_id = c.id and i.campaign_id = $3::uuid))
         and ($4::text is null or exists (
               select 1 from public.inquiries i where i.contact_id = c.id and i.source = $4::text))
         and ($5::text is null or li.timeline = $5::text)
         and ($6::text is null
              or c.full_name ilike $6::text or c.email ilike $6::text or coalesce(c.phone, '') ilike $6::text
              or exists (select 1 from public.inquiries i
                         where i.contact_id = c.id and i.property_address ilike $6::text))
     )
     select *, count(*) over ()::int as total
     from base
     where not $7::boolean or needs_follow_up
     order by last_inquiry_at desc, id
     limit $9::int offset $10::int`,
    [
      agentId,
      filters.status ?? null,
      filters.campaignId ?? null,
      filters.source ?? null,
      filters.timeline ?? null,
      q ? likePattern(q) : null,
      Boolean(filters.needsFollowUp),
      now.toISOString(),
      LEADS_PAGE_SIZE,
      (page - 1) * LEADS_PAGE_SIZE,
    ],
  );
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function listLeadSources(tx: Tx, agentId: string): Promise<string[]> {
  const rows = await tx.query<{ source: string }>(
    `select distinct source from public.inquiries where agent_id = $1::uuid order by source`,
    [agentId],
  );
  return rows.map((r) => r.source);
}

export interface Contact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  preferred_contact: ContactMethod;
  status: LeadStatus;
  outcome_note: string | null;
  outcome_at: Date | null;
  marketing_consent: boolean;
  first_inquiry_at: Date;
  last_inquiry_at: Date;
  inquiry_count: number;
  last_contacted_at: Date | null;
}

export interface InquiryRecord {
  id: string;
  campaign_id: string;
  campaign_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  property_address: string;
  timeline: Timeline;
  message: string | null;
  preferred_contact: ContactMethod;
  marketing_consent: boolean;
  is_repeat: boolean;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer_host: string | null;
  created_at: Date;
}

export interface ConsentRecord {
  id: string;
  inquiry_id: string;
  consent_type: string;
  wording: string;
  source_page: string;
  source_utm: string | null;
  captured_at: Date;
}

export interface AppointmentRecord {
  id: string;
  inquiry_id: string | null;
  scheduled_at: Date;
  status: AppointmentStatus;
  source: "manual" | "booking_webhook";
  notes: string | null;
  status_changed_at: Date | null;
  created_at: Date;
}

export interface TaskRecord {
  id: string;
  title: string;
  due_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

export interface NoteRecord {
  id: string;
  body: string;
  created_at: Date;
}

export interface EmailRecord {
  id: string;
  kind: EmailKind;
  to_email: string;
  subject: string;
  body_text: string;
  status: EmailStatus;
  error_code: string | null;
  sent_at: Date | null;
  created_at: Date;
}

export interface LeadDetail {
  contact: Contact;
  inquiries: InquiryRecord[];
  consents: ConsentRecord[];
  appointments: AppointmentRecord[];
  tasks: TaskRecord[];
  notes: NoteRecord[];
  emails: EmailRecord[];
  activity: ActivityEvent[];
  bookingClicks: number;
}

export async function getContact(tx: Tx, agentId: string, contactId: string): Promise<Contact | null> {
  const rows = await tx.query<Contact>(
    `select id, full_name, email, phone, preferred_contact, status, outcome_note, outcome_at, marketing_consent,
            first_inquiry_at, last_inquiry_at, inquiry_count, last_contacted_at
     from public.contacts where id = $1::uuid and agent_id = $2::uuid`,
    [contactId, agentId],
  );
  return rows[0] ?? null;
}

export async function getLeadDetail(tx: Tx, agentId: string, contactId: string): Promise<LeadDetail | null> {
  const contact = await getContact(tx, agentId, contactId);
  if (!contact) return null;
  const params = [contactId, agentId];
  const [inquiries, consents, appointments, tasks, notes, emails, activity, clicks] = await Promise.all([
    tx.query<InquiryRecord>(
      `select i.id, i.campaign_id, cp.name as campaign_name, i.full_name, i.email, i.phone, i.property_address,
              i.timeline, i.message, i.preferred_contact, i.marketing_consent, i.is_repeat, i.source,
              i.utm_source, i.utm_medium, i.utm_campaign, i.utm_content, i.utm_term, i.referrer_host, i.created_at
       from public.inquiries i join public.campaigns cp on cp.id = i.campaign_id
       where i.contact_id = $1::uuid and i.agent_id = $2::uuid
       order by i.created_at desc`,
      params,
    ),
    tx.query<ConsentRecord>(
      `select id, inquiry_id, consent_type, wording, source_page, source_utm, captured_at
       from public.consent_records where contact_id = $1::uuid and agent_id = $2::uuid
       order by captured_at desc`,
      params,
    ),
    tx.query<AppointmentRecord>(
      `select id, inquiry_id, scheduled_at, status, source, notes, status_changed_at, created_at
       from public.appointments where contact_id = $1::uuid and agent_id = $2::uuid
       order by scheduled_at desc`,
      params,
    ),
    tx.query<TaskRecord>(
      `select id, title, due_at, completed_at, created_at
       from public.follow_up_tasks where contact_id = $1::uuid and agent_id = $2::uuid
       order by (completed_at is not null), coalesce(completed_at, due_at) desc`,
      params,
    ),
    tx.query<NoteRecord>(
      `select id, body, created_at from public.lead_notes
       where contact_id = $1::uuid and agent_id = $2::uuid order by created_at desc`,
      params,
    ),
    tx.query<EmailRecord>(
      `select id, kind, to_email, subject, body_text, status, error_code, sent_at, created_at
       from public.outbound_emails where contact_id = $1::uuid and agent_id = $2::uuid
       order by created_at desc`,
      params,
    ),
    listContactActivity(tx, agentId, contactId),
    tx.query<{ n: number }>(
      `select count(*)::int as n from public.booking_clicks where contact_id = $1::uuid and agent_id = $2::uuid`,
      params,
    ),
  ]);
  // Open tasks soonest-first, then completed tasks most-recent-first.
  tasks.sort((a, b) => {
    if (!a.completed_at && !b.completed_at) return +new Date(a.due_at) - +new Date(b.due_at);
    if (!a.completed_at) return -1;
    if (!b.completed_at) return 1;
    return +new Date(b.completed_at) - +new Date(a.completed_at);
  });
  return { contact, inquiries, consents, appointments, tasks, notes, emails, activity, bookingClicks: clicks[0]?.n ?? 0 };
}

const OUTCOME_STATUSES: readonly LeadStatus[] = ["won", "lost"];

export async function updateLeadStatus(
  tx: Tx,
  agentId: string,
  contactId: string,
  status: LeadStatus,
  outcomeNote: string | undefined,
): Promise<boolean> {
  const current = await getContact(tx, agentId, contactId);
  if (!current) return false;
  const isOutcome = OUTCOME_STATUSES.includes(status);
  await tx.query(
    `update public.contacts set
       status = $3::text,
       outcome_at = case when $4::boolean then (case when status = $3::text then coalesce(outcome_at, now()) else now() end) else null end,
       outcome_note = case when $4::boolean and $5::text is not null then $5::text else outcome_note end
     where id = $1::uuid and agent_id = $2::uuid`,
    [contactId, agentId, status, isOutcome, outcomeNote ?? null],
  );
  if (current.status !== status || (isOutcome && outcomeNote)) {
    await logAgentEvent(tx, agentId, {
      type: "status_changed",
      contactId,
      data: { from: current.status, to: status, ...(isOutcome && outcomeNote ? { outcome_note: outcomeNote } : {}) },
    });
  }
  return true;
}

export async function markContacted(tx: Tx, agentId: string, contactId: string): Promise<boolean> {
  const rows = await tx.query<{ old_status: LeadStatus; new_status: LeadStatus }>(
    `update public.contacts c set
       last_contacted_at = now(),
       status = case when c.status = 'new' then 'contacted' else c.status end
     from (select status as old_status from public.contacts where id = $1::uuid and agent_id = $2::uuid) prev
     where c.id = $1::uuid and c.agent_id = $2::uuid
     returning prev.old_status, c.status as new_status`,
    [contactId, agentId],
  );
  if (!rows.length) return false;
  await logAgentEvent(tx, agentId, {
    type: "marked_contacted",
    contactId,
    data: rows[0].old_status !== rows[0].new_status ? { from: rows[0].old_status, to: rows[0].new_status } : {},
  });
  return true;
}

export async function addNote(tx: Tx, agentId: string, contactId: string, body: string): Promise<boolean> {
  const rows = await tx.query<{ id: string }>(
    `insert into public.lead_notes (agent_id, contact_id, body)
     select $1::uuid, c.id, $3::text from public.contacts c where c.id = $2::uuid and c.agent_id = $1::uuid
     returning id`,
    [agentId, contactId, body],
  );
  if (!rows.length) return false;
  await logAgentEvent(tx, agentId, { type: "note_added", contactId });
  return true;
}

export async function deleteNote(tx: Tx, agentId: string, noteId: string): Promise<string | null> {
  const rows = await tx.query<{ contact_id: string }>(
    `delete from public.lead_notes where id = $1::uuid and agent_id = $2::uuid returning contact_id`,
    [noteId, agentId],
  );
  return rows[0]?.contact_id ?? null;
}
