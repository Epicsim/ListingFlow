import { brand } from "@/config/brand";
import type { AgentProfile } from "@/lib/data/profiles";
import { CONTACT_METHOD_LABELS, TIMELINE_LABELS } from "@/lib/domain";
import type { AttributionInput, InquiryInput } from "@/lib/validation";
import { firstName, renderTemplate, type TemplateValues } from "./templates";

export function templateValuesFor(
  profile: Pick<AgentProfile, "full_name" | "brokerage" | "phone" | "contact_email" | "booking_url">,
  homeowner: { full_name: string; property_address?: string | null },
  bookingUrl: string | null,
): TemplateValues {
  return {
    first_name: firstName(homeowner.full_name),
    full_name: homeowner.full_name,
    property_address: homeowner.property_address ?? null,
    agent_name: profile.full_name,
    brokerage: profile.brokerage,
    agent_phone: profile.phone,
    agent_email: profile.contact_email,
    booking_link: bookingUrl,
  };
}

/** Internal alert to the agent. Contains the lead's details, so it only goes to the agent's own address. */
export function agentNotification(args: {
  campaignName: string;
  inquiry: InquiryInput;
  attribution: Partial<AttributionInput>;
  isRepeat: boolean;
  leadUrl: string;
}): { subject: string; body: string } {
  const { inquiry, attribution } = args;
  const lines = [
    args.isRepeat
      ? `A homeowner who has contacted you before sent a new request from your "${args.campaignName}" page.`
      : `You have a new seller inquiry from your "${args.campaignName}" page.`,
    "",
    `Name: ${inquiry.full_name}`,
    `Email: ${inquiry.email}`,
    inquiry.phone ? `Phone: ${inquiry.phone}` : null,
    `Property: ${inquiry.property_address}`,
    `Timeline: ${TIMELINE_LABELS[inquiry.timeline]}`,
    `Prefers: ${CONTACT_METHOD_LABELS[inquiry.preferred_contact]}`,
    attribution.utm_source ? `Source: ${attribution.utm_source}` : "Source: direct / unknown",
    inquiry.message ? `\nMessage:\n${inquiry.message}` : null,
    "",
    `Open the lead: ${args.leadUrl}`,
    "",
    `Sent by ${brand.name}. They asked you to prepare a personalized estimate – no automated valuation was shown to them.`,
  ];
  return {
    subject: `${args.isRepeat ? "Repeat" : "New"} seller inquiry: ${inquiry.full_name}`,
    body: lines.filter((l) => l !== null).join("\n"),
  };
}

export function renderEmail(
  template: { subject: string; body: string },
  values: TemplateValues,
): { subject: string; body: string } {
  return {
    subject: renderTemplate(template.subject, values).replace(/\s+/g, " ").trim() || "(no subject)",
    body: renderTemplate(template.body, values),
  };
}
