import type { Tx } from "@/lib/db/types";

export interface ChannelReportRow {
  channel: string;
  utm_source_hint: string | null;
  /** Every inquiry from the selected homeowners, grouped by its own source. */
  inquiries: number;
  /** Unique contacts credited to this channel by their first inquiry. */
  homeowners: number;
  booking_clicks: number;
  /** Stored consultations, excluding canceled ones. Never booking-link clicks. */
  consultations: number;
  attended: number;
  /** Contacts currently marked won (listing signed). */
  won: number;
}

/**
 * First-touch report for homeowners whose earliest inquiry falls in the range.
 * Find the first inquiry before filtering dates so returning homeowners never
 * acquire a new first channel. Their linked activity counts regardless of its
 * date or inquiry/campaign; raw inquiries keep their own channel, repeats included.
 * Aggregate each kind of activity separately so joins cannot multiply counts.
 * Run under asUser: every CTE remains subject to the agent's RLS policies.
 */
export async function getChannelReport(
  tx: Tx,
  agentId: string,
  range: { from: Date | null; to: Date },
): Promise<ChannelReportRow[]> {
  return tx.query<ChannelReportRow>(
    `with first_inquiries as (
       select distinct on (i.contact_id) i.contact_id, i.source as channel, i.created_at
       from public.inquiries i
       where i.agent_id = $1::uuid
       order by i.contact_id, i.created_at, i.id
     ), homeowners as (
       select f.contact_id, f.channel, c.status
       from first_inquiries f
       join public.contacts c on c.id = f.contact_id and c.agent_id = $1::uuid
       where f.created_at >= coalesce($2::timestamptz, '-infinity'::timestamptz)
         and f.created_at < $3::timestamptz
     ), inquiry_counts as (
       select i.source as channel, count(*)::int as inquiries,
         string_agg(distinct i.utm_source, ', ' order by i.utm_source)
           filter (where i.utm_source <> i.source and i.utm_source <> '') as utm_source_hint
       from public.inquiries i
       join homeowners h on h.contact_id = i.contact_id
       where i.agent_id = $1::uuid
       group by i.source
     ), homeowner_counts as (
       select channel, count(*)::int as homeowners,
         count(*) filter (where status = 'won')::int as won
       from homeowners
       group by channel
     ), booking_counts as (
       select h.channel, count(*)::int as booking_clicks
       from public.booking_clicks b
       join homeowners h on h.contact_id = b.contact_id
       where b.agent_id = $1::uuid
       group by h.channel
     ), consultation_counts as (
       select h.channel,
         count(*) filter (where a.status <> 'canceled')::int as consultations,
         count(*) filter (where a.status = 'attended')::int as attended
       from public.appointments a
       join homeowners h on h.contact_id = a.contact_id
       where a.agent_id = $1::uuid
       group by h.channel
     )
     select i.channel, i.utm_source_hint, i.inquiries,
       coalesce(h.homeowners, 0)::int as homeowners,
       coalesce(b.booking_clicks, 0)::int as booking_clicks,
       coalesce(a.consultations, 0)::int as consultations,
       coalesce(a.attended, 0)::int as attended,
       coalesce(h.won, 0)::int as won
     from inquiry_counts i
     left join homeowner_counts h on h.channel = i.channel
     left join booking_counts b on b.channel = i.channel
     left join consultation_counts a on a.channel = i.channel
     order by won desc, consultations desc, inquiries desc, i.channel`,
    [agentId, range.from?.toISOString() ?? null, range.to.toISOString()],
  );
}
