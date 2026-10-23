import type { TemplateKind } from "@/lib/domain";

/** Safe to import from client components (used by the template editor). */

export const TEMPLATE_VARIABLES = [
  { key: "first_name", description: "Homeowner's first name" },
  { key: "full_name", description: "Homeowner's full name" },
  { key: "property_address", description: "Address from their latest inquiry" },
  { key: "agent_name", description: "Your name" },
  { key: "brokerage", description: "Your brokerage" },
  { key: "agent_phone", description: "Your phone number" },
  { key: "agent_email", description: "Your contact email" },
  { key: "booking_link", description: "Your consultation booking link" },
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]["key"];
export type TemplateValues = Partial<Record<TemplateVariable, string | null | undefined>>;

export const DEFAULT_TEMPLATES: Record<TemplateKind, { label: string; description: string; subject: string; body: string }> = {
  acknowledgment: {
    label: "Acknowledgment",
    description:
      "Sent to the homeowner right after they submit a request (when email delivery is set up and this is turned on in Settings). An unsubscribe link is added at the end.",
    subject: "Thanks, {{first_name}} – I received your request",
    body: `Hi {{first_name}},

Thanks for reaching out about {{property_address}}. I've received your request and will personally review your home's details to prepare your price estimate. It's prepared by me, not generated automatically, so please allow a little time.

I'll be in touch soon. If you'd like to talk sooner, you can pick a time here: {{booking_link}}

{{agent_name}}
{{brokerage}}
{{agent_phone}}`,
  },
  follow_up: {
    label: "Follow-up",
    description:
      "Starting point when you write a follow-up from a lead's page. You can edit it before sending. An unsubscribe link is added at the end.",
    subject: "Following up on {{property_address}}",
    body: `Hi {{first_name}},

I wanted to follow up on your request about {{property_address}}. I'd be glad to walk you through the estimate and talk about your timing and goals – no pressure and no obligation.

Would a quick call this week work? You can choose a time that suits you here: {{booking_link}}

Best,
{{agent_name}}
{{brokerage}}
{{agent_phone}}`,
  },
};

const VARIABLE_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Replaces {{placeholders}}. A line that uses a placeholder with no value is
 * left out entirely, so e.g. the booking-link sentence disappears when no link
 * is configured instead of ending in a blank.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  const lines = template.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    let missing = false;
    const rendered = line.replace(VARIABLE_RE, (_, key: string) => {
      const value = (values as Record<string, string | null | undefined>)[key];
      if (value === undefined || value === null || value.trim() === "") {
        missing = true;
        return "";
      }
      return value;
    });
    if (!missing) out.push(rendered);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
