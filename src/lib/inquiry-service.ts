import { insertEmail } from "@/lib/data/outbox";
import { getProfile } from "@/lib/data/profiles";
import {
  getPublicCampaign,
  marketingConsentWording,
  normalizedSubmission,
  type PublicCampaign,
  submitInquiry,
  type SubmitResult,
} from "@/lib/data/public";
import { getTemplates } from "@/lib/data/templates";
import type { Tx } from "@/lib/db/types";
import { agentNotification, renderEmail, templateValuesFor } from "@/lib/email/messages";
import { rateLimitKey } from "@/lib/security/client-ip";
import { checkFormToken, idempotencyKey } from "@/lib/security/form-token";
import {
  type AttributionInput,
  attributionSchema,
  type FieldErrors,
  type InquiryInput,
  parseInquiry,
} from "@/lib/validation";

export interface PublicDb {
  anon<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  service<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export const INQUIRY_FIELDS = [
  "full_name",
  "email",
  "phone",
  "property_address",
  "timeline",
  "message",
  "preferred_contact",
  "marketing_consent",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "referrer_host",
  "form_token",
  // Honeypot: hidden from people, often filled in by bots.
  "website",
] as const;

export interface SubmissionRequest {
  slug: string;
  fields: Partial<Record<(typeof INQUIRY_FIELDS)[number], string>>;
  ip: string;
  /** Origin used to build the dashboard link in the agent's notification. */
  siteOrigin: string;
  secret: string;
  emailLive: boolean;
  now?: number;
  rateLimit?: { max: number; windowSeconds: number };
}

export type SubmissionOutcome =
  | { ok: true; publicToken: string; duplicate: boolean; emailIdsToDeliver: string[] }
  | { ok: false; reason: SubmissionFailure; message: string; fieldErrors?: FieldErrors };

export type SubmissionFailure =
  | "unavailable"
  | "spam"
  | "invalid_token"
  | "too_fast"
  | "expired"
  | "validation"
  | "rate_limited"
  | "save_failed";

const MESSAGES: Record<Exclude<SubmissionFailure, "validation">, string> = {
  unavailable: "This page is no longer accepting requests. Please contact the agent directly.",
  spam: "We couldn't submit your request. Please try again, or contact the agent directly.",
  invalid_token: "Something went wrong with this form. Please refresh the page and try again.",
  too_fast: "That was quick! Please double-check your details, then submit again.",
  expired: "This page has been open for a while. Please refresh it and submit again.",
  rate_limited: "We've received several requests from your connection. Please wait a few minutes and try again.",
  save_failed: "We couldn't save your request. Nothing was sent. Please try again in a moment.",
};

const fail = (reason: Exclude<SubmissionFailure, "validation">): SubmissionOutcome => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

/**
 * Handles a public inquiry end to end. A success outcome is returned only after
 * the inquiry has been committed to the database.
 */
export async function processInquirySubmission(db: PublicDb, req: SubmissionRequest): Promise<SubmissionOutcome> {
  const campaign = await db.anon((tx) => getPublicCampaign(tx, req.slug));
  if (!campaign) return fail("unavailable");

  if (req.fields.website && req.fields.website.trim() !== "") return fail("spam");

  const token = checkFormToken(req.fields.form_token, campaign.campaign_id, req.secret, req.now);
  if (!token.ok) {
    return fail(token.reason === "invalid" ? "invalid_token" : token.reason);
  }

  const parsed = parseInquiry(req.fields);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "validation",
      message: "Please check the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
    };
  }
  const inquiry = parsed.data;
  const attribution = attributionSchema.parse(req.fields);

  let result: SubmitResult;
  try {
    result = await db.service((tx) =>
      submitInquiry(tx, {
        slug: campaign.slug,
        inquiry,
        attribution,
        idempotencyKey: idempotencyKey(token.nonce, normalizedSubmission(inquiry, attribution)),
        rateKey: rateLimitKey(req.secret, req.ip),
        rateLimit: req.rateLimit,
        consentWording: inquiry.marketing_consent ? marketingConsentWording(campaign.agent_name) : null,
      }),
    );
  } catch (error) {
    // Error class and code only - never the submitted values.
    const e = error as { code?: string; name?: string };
    console.error(`[inquiry] save failed: ${e.name ?? "Error"} ${e.code ?? ""}`.trim());
    return fail("save_failed");
  }

  switch (result.status) {
    case "campaign_unavailable":
      return fail("unavailable");
    case "rate_limited":
      return fail("rate_limited");
    case "duplicate":
      return { ok: true, publicToken: result.public_token, duplicate: true, emailIdsToDeliver: [] };
    case "created": {
      const emailIds = await createSubmissionEmails(db, req, campaign, result, inquiry, attribution);
      return { ok: true, publicToken: result.public_token, duplicate: false, emailIdsToDeliver: emailIds };
    }
  }
}

/**
 * Writes the agent alert and homeowner acknowledgment to the outbox. This runs
 * after the inquiry is committed, in its own transaction: an email problem can
 * never undo a saved inquiry. Returns ids that should be handed to the provider
 * (empty in preview mode).
 */
async function createSubmissionEmails(
  db: PublicDb,
  req: SubmissionRequest,
  campaign: PublicCampaign,
  result: Extract<SubmitResult, { status: "created" }>,
  inquiry: InquiryInput,
  attribution: AttributionInput,
): Promise<string[]> {
  try {
    return await db.service(async (tx) => {
      const profile = await getProfile(tx, result.agent_id);
      if (!profile) return [];
      const status = req.emailLive ? "queued" : "preview";
      const ids: string[] = [];
      const campaignName =
        (
          await tx.query<{ name: string }>(`select name from public.campaigns where id = $1::uuid`, [
            result.campaign_id,
          ])
        )[0]?.name ?? campaign.headline;

      if (profile.notify_new_inquiry) {
        const message = agentNotification({
          campaignName,
          inquiry,
          attribution,
          isRepeat: result.is_repeat,
          leadUrl: `${req.siteOrigin}/leads/${result.contact_id}`,
        });
        ids.push(
          await insertEmail(tx, {
            agentId: result.agent_id,
            contactId: result.contact_id,
            inquiryId: result.inquiry_id,
            kind: "agent_notification",
            to: profile.notification_email ?? profile.contact_email,
            replyTo: inquiry.email,
            subject: message.subject,
            body: message.body,
            status,
          }),
        );
      }

      if (profile.send_acknowledgment) {
        const templates = await getTemplates(tx, result.agent_id);
        const message = renderEmail(
          templates.acknowledgment,
          templateValuesFor(profile, inquiry, campaign.booking_url),
        );
        ids.push(
          await insertEmail(tx, {
            agentId: result.agent_id,
            contactId: result.contact_id,
            inquiryId: result.inquiry_id,
            kind: "acknowledgment",
            to: inquiry.email,
            replyTo: profile.contact_email,
            subject: message.subject,
            body: message.body,
            status,
          }),
        );
      }
      return req.emailLive ? ids : [];
    });
  } catch (error) {
    const e = error as { code?: string; name?: string };
    console.error(`[inquiry] outbox write failed: ${e.name ?? "Error"} ${e.code ?? ""}`.trim());
    return [];
  }
}
