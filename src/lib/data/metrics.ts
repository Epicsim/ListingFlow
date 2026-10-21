import type { Tx } from "@/lib/db/types";

export interface OverviewMetrics {
  /** Inquiries submitted in the range (repeat inquiries included). */
  new_inquiries: number;
  /** Contacts whose first inquiry falls in the range. */
  new_leads: number;
  /** Right now: leads still "new", or with an open follow-up that is due. */
  awaiting_follow_up: number;
  /** Consultations recorded in the range, excluding canceled ones. */
  consultations_booked: number;
  /** Consultations scheduled in the range and marked attended. */
  consultations_attended: number;
  /** Booking-link clicks in the range. Not confirmed appointments. */
  booking_clicks: number;
  total_leads: number;
  total_campaigns: number;
  published_campaigns: number;
}

/** Every number on the overview comes from stored rows; nothing is estimated. */
export async function getOverviewMetrics(
  tx: Tx,
  agentId: string,
  range: { from: Date | null; to: Date },
  now: Date,
): Promise<OverviewMetrics> {
  const rows = await tx.query<OverviewMetrics>(
    `with bounds as (
       select coalesce($2::timestamptz, '-infinity'::timestamptz) as f, $3::timestamptz as t
     )
     select
       (select count(*)::int from public.inquiries i, bounds
         where i.agent_id = $1::uuid and i.created_at >= bounds.f and i.created_at < bounds.t) as new_inquiries,
       (select count(*)::int from public.contacts c, bounds
         where c.agent_id = $1::uuid and c.first_inquiry_at >= bounds.f and c.first_inquiry_at < bounds.t) as new_leads,
       (select count(*)::int from public.contacts c
         where c.agent_id = $1::uuid
           and (c.status = 'new' or exists (
             select 1 from public.follow_up_tasks t
             where t.contact_id = c.id and t.completed_at is null and t.due_at <= $4::timestamptz))) as awaiting_follow_up,
       (select count(*)::int from public.appointments a, bounds
         where a.agent_id = $1::uuid and a.status <> 'canceled'
           and a.created_at >= bounds.f and a.created_at < bounds.t) as consultations_booked,
       (select count(*)::int from public.appointments a, bounds
         where a.agent_id = $1::uuid and a.status = 'attended'
           and a.scheduled_at >= bounds.f and a.scheduled_at < bounds.t) as consultations_attended,
       (select count(*)::int from public.booking_clicks b, bounds
         where b.agent_id = $1::uuid and b.clicked_at >= bounds.f and b.clicked_at < bounds.t) as booking_clicks,
       (select count(*)::int from public.contacts c where c.agent_id = $1::uuid) as total_leads,
       (select count(*)::int from public.campaigns c where c.agent_id = $1::uuid) as total_campaigns,
       (select count(*)::int from public.campaigns c
         where c.agent_id = $1::uuid and c.status = 'published') as published_campaigns`,
    [agentId, range.from?.toISOString() ?? null, range.to.toISOString(), now.toISOString()],
  );
  return rows[0];
}
