import type { Tx } from "@/lib/db/types";

export interface ActivityEvent {
  id: string;
  contact_id: string | null;
  inquiry_id: string | null;
  campaign_id: string | null;
  type: string;
  actor: "agent" | "visitor" | "system";
  data: Record<string, unknown>;
  created_at: Date;
  contact_name?: string | null;
}

/** System events require a service transaction; RLS still forbids agent impersonation. */
export async function logAgentEvent(
  tx: Tx,
  agentId: string,
  event: {
    type: string;
    contactId?: string | null;
    inquiryId?: string | null;
    campaignId?: string | null;
    data?: Record<string, unknown>;
  },
  actor: "agent" | "system" = "agent",
): Promise<void> {
  await tx.query(
    `insert into public.activity_events (agent_id, contact_id, inquiry_id, campaign_id, type, actor, data)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::text::jsonb)`,
    [
      agentId,
      event.contactId ?? null,
      event.inquiryId ?? null,
      event.campaignId ?? null,
      event.type,
      actor,
      JSON.stringify(event.data ?? {}),
    ],
  );
}

export async function listRecentActivity(tx: Tx, agentId: string, limit = 12): Promise<ActivityEvent[]> {
  return tx.query<ActivityEvent>(
    `select e.id, e.contact_id, e.inquiry_id, e.campaign_id, e.type, e.actor, e.data, e.created_at,
            c.full_name as contact_name
     from public.activity_events e
     left join public.contacts c on c.id = e.contact_id
     where e.agent_id = $1::uuid
     order by e.created_at desc, e.id
     limit $2::int`,
    [agentId, limit],
  );
}

export async function listContactActivity(tx: Tx, agentId: string, contactId: string): Promise<ActivityEvent[]> {
  return tx.query<ActivityEvent>(
    `select id, contact_id, inquiry_id, campaign_id, type, actor, data, created_at
     from public.activity_events
     where agent_id = $1::uuid and contact_id = $2::uuid
     order by created_at desc, id
     limit 200`,
    [agentId, contactId],
  );
}
