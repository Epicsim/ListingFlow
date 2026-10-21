/** Shared vocabulary for the product. Safe to import from client and server. */

export const TIMELINES = ["soon", "3_6_months", "6_12_months", "exploring"] as const;
export type Timeline = (typeof TIMELINES)[number];
export const TIMELINE_LABELS: Record<Timeline, string> = {
  soon: "Soon (within 3 months)",
  "3_6_months": "In 3–6 months",
  "6_12_months": "In 6–12 months",
  exploring: "Just exploring",
};

export const CONTACT_METHODS = ["email", "phone", "text"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  email: "Email",
  phone: "Phone call",
  text: "Text message",
};

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "consultation_booked",
  "nurturing",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  consultation_booked: "Consultation booked",
  nurturing: "Nurturing",
  won: "Won",
  lost: "Lost",
};

export const CAMPAIGN_STATUSES = ["draft", "published", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const APPOINTMENT_STATUSES = ["scheduled", "attended", "canceled", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  attended: "Attended",
  canceled: "Canceled",
  no_show: "No-show",
};

export const EMAIL_STATUSES = ["preview", "queued", "sent", "failed"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
/** Never call a preview or queued message "sent" or "delivered". */
export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  preview: "Preview only – not sent",
  queued: "Queued – not yet sent",
  sent: "Accepted by email provider",
  failed: "Failed to send",
};

export const EMAIL_KIND_LABELS = {
  agent_notification: "New-inquiry alert to you",
  acknowledgment: "Acknowledgment to homeowner",
  follow_up: "Follow-up to homeowner",
} as const;
export type EmailKind = keyof typeof EMAIL_KIND_LABELS;

export const TEMPLATE_KINDS = ["acknowledgment", "follow_up"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Starter copy for a new campaign. Every field stays editable. */
export const STARTER_CAMPAIGN = {
  name: "Home value request",
  headline: "Thinking of selling your home? Request a personalized home-price estimate from a local agent.",
  description:
    "Share a few details about your home and I'll personally prepare a price estimate based on my knowledge of your neighborhood and recent local sales. It's prepared by me, a licensed agent – not an automated valuation – and there's no cost or obligation.",
  cta_text: "Request my estimate",
  thank_you_message:
    "Thank you! I've received your request and will personally review your home's details. I'll reach out using your preferred contact method, usually within one business day.",
} as const;

export const DEFAULT_PRIMARY_COLOR = "#1F5F4A";
