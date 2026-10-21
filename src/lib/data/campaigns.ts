import type { Tx } from "@/lib/db/types";
import type { CampaignStatus } from "@/lib/domain";
import type { CampaignInput } from "@/lib/validation";
import { logAgentEvent } from "./activity";

export interface Campaign {
  id: string;
  agent_id: string;
  name: string;
  slug: string;
  status: CampaignStatus;
  headline: string;
  description: string;
  hero_asset_id: string | null;
  cta_text: string;
  thank_you_message: string;
  booking_url: string | null;
  published_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CampaignWithStats extends Campaign {
  inquiries: number;
  leads: number;
  booking_clicks: number;
  consultations_booked: number;
  consultations_attended: number;
}

const COLUMNS = `c.id, c.agent_id, c.name, c.slug, c.status, c.headline, c.description, c.hero_asset_id,
  c.cta_text, c.thank_you_message, c.booking_url, c.published_at, c.archived_at, c.created_at, c.updated_at`;

/** Thrown when a campaign link (slug) is already used by any campaign. */
export class SlugTakenError extends Error {
  constructor() {
    super("That link is already in use.");
    this.name = "SlugTakenError";
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string; constraint_name?: string; message?: string };
  return (
    e?.code === "23505" &&
    (e.constraint === constraint || e.constraint_name === constraint || Boolean(e.message?.includes(constraint)))
  );
}

/**
 * Campaigns with performance counts. Consultations are attributed to the
 * campaign of the inquiry they were recorded against; booking-link clicks are
 * counted separately and never as consultations.
 */
export async function listCampaignsWithStats(tx: Tx, agentId: string): Promise<CampaignWithStats[]> {
  return tx.query<CampaignWithStats>(
    `select ${COLUMNS},
       (select count(*)::int from public.inquiries i where i.campaign_id = c.id) as inquiries,
       (select count(distinct i.contact_id)::int from public.inquiries i where i.campaign_id = c.id) as leads,
       (select count(*)::int from public.booking_clicks b where b.campaign_id = c.id) as booking_clicks,
       (select count(*)::int from public.appointments a join public.inquiries i on i.id = a.inquiry_id
          where i.campaign_id = c.id and a.status <> 'canceled') as consultations_booked,
       (select count(*)::int from public.appointments a join public.inquiries i on i.id = a.inquiry_id
          where i.campaign_id = c.id and a.status = 'attended') as consultations_attended
     from public.campaigns c
     where c.agent_id = $1::uuid
     order by case c.status when 'published' then 0 when 'draft' then 1 else 2 end, c.created_at desc`,
    [agentId],
  );
}

export async function listCampaignOptions(tx: Tx, agentId: string): Promise<{ id: string; name: string }[]> {
  return tx.query(`select id, name from public.campaigns where agent_id = $1::uuid order by name`, [agentId]);
}

export async function getCampaign(tx: Tx, agentId: string, campaignId: string): Promise<Campaign | null> {
  const rows = await tx.query<Campaign>(
    `select ${COLUMNS} from public.campaigns c where c.id = $1::uuid and c.agent_id = $2::uuid`,
    [campaignId, agentId],
  );
  return rows[0] ?? null;
}

export async function countCampaigns(tx: Tx, agentId: string): Promise<number> {
  const rows = await tx.query<{ n: number }>(
    `select count(*)::int as n from public.campaigns where agent_id = $1::uuid`,
    [agentId],
  );
  return rows[0]?.n ?? 0;
}

export async function createCampaign(
  tx: Tx,
  agentId: string,
  input: CampaignInput,
  heroAssetId: string | null,
): Promise<string> {
  try {
    const rows = await tx.query<{ id: string }>(
      `insert into public.campaigns (agent_id, name, slug, headline, description, cta_text, thank_you_message, booking_url, hero_asset_id)
       values ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9::uuid)
       returning id`,
      [
        agentId,
        input.name,
        input.slug,
        input.headline,
        input.description,
        input.cta_text,
        input.thank_you_message,
        input.booking_url ?? null,
        heroAssetId,
      ],
    );
    return rows[0].id;
  } catch (error) {
    if (isUniqueViolation(error, "campaigns_slug_key")) throw new SlugTakenError();
    throw error;
  }
}

export async function updateCampaign(
  tx: Tx,
  agentId: string,
  campaignId: string,
  input: CampaignInput,
  hero: { assetId: string | null } | "keep",
): Promise<boolean> {
  try {
    const rows = await tx.query<{ id: string }>(
      `update public.campaigns set
         name = $3::text, slug = $4::text, headline = $5::text, description = $6::text,
         cta_text = $7::text, thank_you_message = $8::text, booking_url = $9::text,
         hero_asset_id = case when $10::boolean then $11::uuid else hero_asset_id end
       where id = $1::uuid and agent_id = $2::uuid
       returning id`,
      [
        campaignId,
        agentId,
        input.name,
        input.slug,
        input.headline,
        input.description,
        input.cta_text,
        input.thank_you_message,
        input.booking_url ?? null,
        hero !== "keep",
        hero === "keep" ? null : hero.assetId,
      ],
    );
    return rows.length > 0;
  } catch (error) {
    if (isUniqueViolation(error, "campaigns_slug_key")) throw new SlugTakenError();
    throw error;
  }
}

export async function setCampaignStatus(
  tx: Tx,
  agentId: string,
  campaignId: string,
  status: CampaignStatus,
): Promise<boolean> {
  const rows = await tx.query<{ id: string; name: string }>(
    `update public.campaigns set
       status = $3::text,
       published_at = case when $3::text = 'published' then coalesce(published_at, now()) else published_at end,
       archived_at = case when $3::text = 'archived' then now() else null end
     where id = $1::uuid and agent_id = $2::uuid
     returning id, name`,
    [campaignId, agentId, status],
  );
  if (!rows.length) return false;
  await logAgentEvent(tx, agentId, {
    type: `campaign_${status === "draft" ? "unpublished" : status}`,
    campaignId,
    data: { campaign_name: rows[0].name },
  });
  return true;
}
