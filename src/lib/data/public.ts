import type { Tx } from "@/lib/db/types";
import type { AttributionInput, InquiryInput } from "@/lib/validation";
import { normalizeSource } from "@/lib/utm";
import { requiresLiveSubscription } from "@/lib/billing/access-mode";

async function campaignMayRun(tx: Tx, slug: string): Promise<boolean> {
  if (!requiresLiveSubscription()) return true;
  const rows = await tx.query<{ allowed: boolean }>(`select public.campaign_has_paid_access($1::text) as allowed`, [slug]);
  return rows[0].allowed;
}

/** Everything a published landing page shows. No private fields. */
export interface PublicCampaign {
  campaign_id: string;
  slug: string;
  headline: string;
  description: string;
  hero_asset_id: string | null;
  cta_text: string;
  thank_you_message: string;
  booking_url: string | null;
  agent_name: string;
  brokerage: string | null;
  license_number: string | null;
  contact_email: string;
  phone: string | null;
  headshot_asset_id: string | null;
  logo_asset_id: string | null;
  primary_color: string;
  service_areas: string[];
  intro: string | null;
  privacy_policy_url: string | null;
}

/** Callable as `anon`: returns a published campaign or null. */
export async function getPublicCampaign(tx: Tx, slug: string): Promise<PublicCampaign | null> {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  if (!await campaignMayRun(tx, slug)) return null;
  const rows = await tx.query<PublicCampaign>(`select * from public.get_public_campaign($1::text)`, [slug]);
  return rows[0] ?? null;
}

export async function getPublicAsset(
  tx: Tx,
  id: string,
): Promise<{ content_type: string; data: Uint8Array } | null> {
  const rows = await tx.query<{ content_type: string; data: Uint8Array }>(
    `select content_type, data from public.get_public_asset($1::uuid)`,
    [id],
  );
  return rows[0] ?? null;
}

export type SubmitResult =
  | {
      status: "created";
      inquiry_id: string;
      public_token: string;
      contact_id: string;
      agent_id: string;
      campaign_id: string;
      is_repeat: boolean;
    }
  | { status: "duplicate"; inquiry_id: string; public_token: string }
  | { status: "rate_limited" }
  | { status: "campaign_unavailable" };

export interface SubmitArgs {
  slug: string;
  inquiry: InquiryInput;
  attribution: Partial<AttributionInput>;
  idempotencyKey: string;
  rateKey: string | null;
  rateLimit?: { max: number; windowSeconds: number };
  consentWording: string | null;
}

/** The fields that make two submissions "the same" for idempotency. */
export function normalizedSubmission(inquiry: InquiryInput, attribution: Partial<AttributionInput>) {
  return {
    full_name: inquiry.full_name,
    email: inquiry.email.toLowerCase(),
    phone: inquiry.phone ?? null,
    property_address: inquiry.property_address,
    timeline: inquiry.timeline,
    message: inquiry.message ?? null,
    preferred_contact: inquiry.preferred_contact,
    marketing_consent: inquiry.marketing_consent,
    utm_source: attribution.utm_source ?? null,
    utm_medium: attribution.utm_medium ?? null,
    utm_campaign: attribution.utm_campaign ?? null,
  };
}

/** Callable as `service_role` only (enforced by the database). */
export async function submitInquiry(tx: Tx, args: SubmitArgs): Promise<SubmitResult> {
  if (!await campaignMayRun(tx, args.slug)) return { status: "campaign_unavailable" };
  const payload = {
    full_name: args.inquiry.full_name,
    email: args.inquiry.email,
    phone: args.inquiry.phone ?? null,
    property_address: args.inquiry.property_address,
    timeline: args.inquiry.timeline,
    message: args.inquiry.message ?? null,
    preferred_contact: args.inquiry.preferred_contact,
    marketing_consent: args.inquiry.marketing_consent,
    source: normalizeSource(args.attribution.utm_source),
    utm_source: args.attribution.utm_source ?? null,
    utm_medium: args.attribution.utm_medium ?? null,
    utm_campaign: args.attribution.utm_campaign ?? null,
    utm_content: args.attribution.utm_content ?? null,
    utm_term: args.attribution.utm_term ?? null,
    referrer_host: args.attribution.referrer_host ?? null,
  };
  const rows = await tx.query<{ result: SubmitResult }>(
    `select public.submit_inquiry($1::text, $2::text::jsonb, $3::text, $4::text, $5::int, $6::int, $7::text) as result`,
    [
      args.slug,
      JSON.stringify(payload),
      args.idempotencyKey,
      args.rateKey,
      args.rateLimit?.max ?? 6,
      args.rateLimit?.windowSeconds ?? 600,
      args.inquiry.marketing_consent ? args.consentWording : null,
    ],
  );
  return rows[0].result;
}

/** Records a booking-link click and returns the URL to redirect to, or null. */
export async function recordBookingClick(tx: Tx, slug: string, publicToken: string | null): Promise<string | null> {
  if (!await campaignMayRun(tx, slug)) return null;
  const rows = await tx.query<{ url: string | null }>(
    `select public.record_booking_click($1::text, $2::uuid) as url`,
    [slug, publicToken],
  );
  return rows[0]?.url ?? null;
}

/**
 * Service role, after the signed unsubscribe link was verified. Stops further
 * emails to the contact; true while the contact still exists.
 */
export async function unsubscribeContact(tx: Tx, contactId: string): Promise<boolean> {
  const rows = await tx.query<{ ok: boolean }>(`select public.unsubscribe_contact($1::uuid) as ok`, [contactId]);
  return rows[0]?.ok === true;
}

/** Exact consent wording shown beside the checkbox; stored verbatim when ticked. */
export function marketingConsentWording(agentName: string): string {
  return `Yes, ${agentName} may also email me occasional market updates and home-selling tips. I can unsubscribe at any time. This is optional and not required to get my estimate.`;
}

/**
 * Service role: whether a confirmation reference belongs to a saved inquiry on
 * this campaign. The thank-you page shows "request received" only if it does.
 */
export async function isSavedInquiryReference(tx: Tx, slug: string, publicToken: string): Promise<boolean> {
  const rows = await tx.query<{ ok: boolean }>(
    `select true as ok from public.inquiries i
     join public.campaigns c on c.id = i.campaign_id
     where i.public_token = $1::uuid and c.slug = $2::text and i.created_at > now() - interval '30 days'`,
    [publicToken, slug],
  );
  return rows.length > 0;
}
