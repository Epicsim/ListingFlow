import type { Tx } from "@/lib/db/types";
import type { EmailKind, EmailStatus } from "@/lib/domain";
import { logAgentEvent } from "./activity";

export interface OutboxRow {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  kind: EmailKind;
  to_email: string;
  subject: string;
  body_text: string;
  status: EmailStatus;
  provider: string | null;
  error_code: string | null;
  sent_at: Date | null;
  created_at: Date;
}

export async function listOutbox(tx: Tx, agentId: string, limit = 100): Promise<OutboxRow[]> {
  return tx.query<OutboxRow>(
    `select o.id, o.contact_id, c.full_name as contact_name, o.kind, o.to_email, o.subject, o.body_text,
            o.status, o.provider, o.error_code, o.sent_at, o.created_at
     from public.outbound_emails o left join public.contacts c on c.id = o.contact_id
     where o.agent_id = $1::uuid
     order by o.created_at desc
     limit $2::int`,
    [agentId, limit],
  );
}

export interface NewEmail {
  agentId: string;
  contactId: string | null;
  inquiryId: string | null;
  kind: EmailKind;
  to: string;
  replyTo: string | null;
  subject: string;
  body: string;
  /** "preview" when delivery is not configured; "queued" when it will be sent now. */
  status: "preview" | "queued";
}

export async function insertEmail(tx: Tx, email: NewEmail): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `insert into public.outbound_emails (agent_id, contact_id, inquiry_id, kind, to_email, reply_to, subject, body_text, status)
     values ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::text, $8::text, $9::text)
     returning id`,
    [
      email.agentId,
      email.contactId,
      email.inquiryId,
      email.kind,
      email.to,
      email.replyTo,
      email.subject.slice(0, 300),
      email.body.slice(0, 10000),
      email.status,
    ],
  );
  return rows[0].id;
}

/** Agent-composed follow-up. RLS only lets agents insert follow-ups as preview/queued. */
export async function createFollowUpEmail(tx: Tx, email: NewEmail): Promise<string> {
  const id = await insertEmail(tx, { ...email, kind: "follow_up" });
  await logAgentEvent(tx, email.agentId, {
    type: email.status === "preview" ? "email_previewed" : "email_queued",
    contactId: email.contactId,
    data: { email_id: id, subject: email.subject.slice(0, 120) },
  });
  return id;
}

export interface QueuedEmail {
  id: string;
  agent_id: string;
  contact_id: string | null;
  kind: EmailKind;
  to_email: string;
  reply_to: string | null;
  subject: string;
  body_text: string;
}

/** Service role: fetch messages waiting to be handed to the provider. */
export async function getQueuedEmails(tx: Tx, ids: string[]): Promise<QueuedEmail[]> {
  if (!ids.length) return [];
  return tx.query<QueuedEmail>(
    `select id, agent_id, contact_id, kind, to_email, reply_to, subject, body_text
     from public.outbound_emails where id = any($1::text::uuid[]) and status = 'queued'`,
    [`{${ids.join(",")}}`],
  );
}

/** Service role: record what the provider said. Only a provider acceptance marks a message "sent". */
export async function recordDeliveryResult(
  tx: Tx,
  id: string,
  result: { ok: true; provider: string; messageId: string } | { ok: false; provider: string; error: string },
): Promise<void> {
  if (result.ok) {
    await tx.query(
      `update public.outbound_emails set status = 'sent', provider = $2::text, provider_message_id = $3::text,
         sent_at = now(), error_code = null
       where id = $1::uuid and status = 'queued'`,
      [id, result.provider, result.messageId.slice(0, 200)],
    );
  } else {
    await tx.query(
      `update public.outbound_emails set status = 'failed', provider = $2::text, error_code = $3::text
       where id = $1::uuid and status = 'queued'`,
      [id, result.provider, result.error.slice(0, 200)],
    );
  }
}
