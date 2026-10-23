import * as z from "zod";
import {
  APPOINTMENT_STATUSES,
  CONTACT_METHODS,
  LEAD_STATUSES,
  TEMPLATE_KINDS,
  TIMELINES,
} from "./domain";

/* ----------------------------------------------------------------------------
 * Text sanitizing
 * React escapes everything it renders and emails are sent as plain text, so
 * the goal here is normalization: strip control characters, trim, and cap
 * lengths. Line breaks are kept only where multi-line text makes sense.
 * ------------------------------------------------------------------------- */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
const LINE_BREAKS = /[\r\n\u2028\u2029]+/g;

export function cleanLine(value: string): string {
  return value.replace(LINE_BREAKS, " ").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

export function cleanMultiline(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const line = (max: number, requiredMessage?: string) => {
  const base = z.string().transform(cleanLine);
  return requiredMessage
    ? base.pipe(z.string().min(1, { error: requiredMessage }).max(max, { error: `Keep this under ${max} characters.` }))
    : base.pipe(z.string().max(max, { error: `Keep this under ${max} characters.` }));
};

const optionalLine = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : cleanLine(v) || undefined))
    .pipe(z.string().max(max, { error: `Keep this under ${max} characters.` }).optional());

const optionalMultiline = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : cleanMultiline(v) || undefined))
    .pipe(z.string().max(max, { error: `Keep this under ${max} characters.` }).optional());

const email = (message = "Enter a valid email address.") =>
  z
    .string()
    .transform(cleanLine)
    .pipe(z.string().min(1, { error: message }).max(254).pipe(z.email({ error: message })));

const optionalEmail = (message = "Enter a valid email address.") =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : cleanLine(v) || undefined))
    .pipe(z.string().max(254).pipe(z.email({ error: message })).optional());

const PHONE_RE = /^[0-9+().\-\s]{7,40}$/;
const optionalPhone = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : cleanLine(v) || undefined))
  .pipe(
    z
      .string()
      .regex(PHONE_RE, { error: "Enter a valid phone number." })
      .refine((v) => v.replace(/\D/g, "").length >= 7, { error: "Enter a valid phone number." })
      .optional(),
  );

const optionalHttpsUrl = (message = "Enter a full link starting with https://") =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : cleanLine(v) || undefined))
    .pipe(
      z
        .url({ protocol: /^https$/, hostname: z.regexes.domain, error: message })
        .max(500, { error: "Keep links under 500 characters." })
        .optional(),
    );

// Unchecked checkboxes are simply absent from form data, so the key is optional.
const checkbox = z
  .union([z.boolean(), z.string(), z.null()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

/* ----------------------------------------------------------------------------
 * Public inquiry form
 * ------------------------------------------------------------------------- */

const inquiryObject = z.object({
  full_name: line(120, "Please enter your name."),
  email: email("Please enter a valid email address."),
  phone: optionalPhone,
  property_address: line(300, "Please enter the property address.").pipe(
    z.string().min(5, { error: "Please enter the full property address." }),
  ),
  timeline: z.enum(TIMELINES, { error: "Please choose when you're thinking of selling." }),
  message: optionalMultiline(2000),
  preferred_contact: z.enum(CONTACT_METHODS, { error: "Please choose how you'd like to be contacted." }),
  marketing_consent: checkbox,
});

const PHONE_REQUIRED = "Add a phone number so the agent can call or text you.";

export const inquirySchema = inquiryObject.superRefine((value, ctx) => {
  if ((value.preferred_contact === "phone" || value.preferred_contact === "text") && !value.phone) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: PHONE_REQUIRED });
  }
});
export type InquiryInput = z.infer<typeof inquirySchema>;

/**
 * Validates an inquiry and reports every problem at once. (Zod skips
 * cross-field refinements while other fields are invalid, so the
 * "phone needed for call/text" rule is also checked against the raw input.)
 */
export function parseInquiry(
  raw: Record<string, unknown>,
): { success: true; data: InquiryInput } | { success: false; fieldErrors: FieldErrors } {
  const parsed = inquirySchema.safeParse(raw);
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors = toFieldErrors(parsed.error);
  const method = raw.preferred_contact;
  const phone = typeof raw.phone === "string" ? raw.phone.trim() : "";
  if ((method === "phone" || method === "text") && !phone && !fieldErrors.phone) {
    fieldErrors.phone = PHONE_REQUIRED;
  }
  return { success: false, fieldErrors };
}

const UTM_VALUE = /^[\p{L}\p{N} _.+\-/:|]{1,100}$/u;
const optionalUtm = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const cleaned = cleanLine(v).slice(0, 100);
    return cleaned && UTM_VALUE.test(cleaned) ? cleaned : undefined;
  });

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export const attributionSchema = z.object({
  utm_source: optionalUtm,
  utm_medium: optionalUtm,
  utm_campaign: optionalUtm,
  utm_content: optionalUtm,
  utm_term: optionalUtm,
  referrer_host: z
    .string()
    .optional()
    .transform((v) => {
      const host = v?.trim().toLowerCase();
      return host && HOSTNAME.test(host) ? host : undefined;
    }),
});
export type AttributionInput = z.infer<typeof attributionSchema>;

/* ----------------------------------------------------------------------------
 * Agent profile & campaigns
 * ------------------------------------------------------------------------- */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const profileSchema = z.object({
  full_name: line(120, "Enter your name."),
  brokerage: optionalLine(120),
  license_number: optionalLine(60),
  contact_email: email("Enter the email homeowners should use to reach you."),
  phone: optionalPhone,
  primary_color: z
    .string()
    .trim()
    .regex(HEX_COLOR, { error: "Choose a color in #RRGGBB format." })
    .transform((v) => v.toUpperCase()),
  service_areas: z
    .string()
    .optional()
    .transform((v) =>
      Array.from(
        new Set(
          (v ?? "")
            .split(/[,\n]/)
            .map(cleanLine)
            .filter(Boolean),
        ),
      ),
    )
    .pipe(
      z
        .array(z.string().max(60, { error: "Keep each service area under 60 characters." }))
        .max(20, { error: "List up to 20 service areas." }),
    ),
  intro: optionalMultiline(700),
  booking_url: optionalHttpsUrl("Enter your scheduling link, starting with https://"),
  privacy_policy_url: optionalHttpsUrl(),
  notification_email: optionalEmail(),
  notify_new_inquiry: checkbox,
  send_acknowledgment: checkbox,
  timezone: z
    .string()
    .trim()
    .refine(isValidTimeZone, { error: "Choose a valid time zone." }),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const campaignSchema = z.object({
  name: line(120, "Give the campaign a name."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { error: "Use at least 3 characters." })
    .max(80, { error: "Keep the link under 80 characters." })
    .regex(SLUG_RE, { error: "Use lowercase letters, numbers and single hyphens only." }),
  headline: line(160, "Add a headline."),
  description: z
    .string()
    .transform(cleanMultiline)
    .pipe(z.string().min(1, { error: "Add a short description." }).max(1200)),
  cta_text: line(60, "Add the button text."),
  thank_you_message: z
    .string()
    .transform(cleanMultiline)
    .pipe(z.string().min(1, { error: "Add a thank-you message." }).max(800)),
  booking_url: optionalHttpsUrl("Enter a scheduling link starting with https://, or leave blank to use your default."),
});
export type CampaignInput = z.infer<typeof campaignSchema>;

/* ----------------------------------------------------------------------------
 * Lead management
 * ------------------------------------------------------------------------- */

export const uuidSchema = z.uuid({ error: "Invalid reference." });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const localDateSchema = z.string().regex(DATE_RE, { error: "Choose a date." });
export const localTimeSchema = z.string().regex(TIME_RE, { error: "Choose a time." });

export const leadStatusSchema = z.object({
  contact_id: uuidSchema,
  status: z.enum(LEAD_STATUSES, { error: "Choose a status." }),
  outcome_note: optionalMultiline(1000),
});

export const noteSchema = z.object({
  contact_id: uuidSchema,
  body: z
    .string()
    .transform(cleanMultiline)
    .pipe(z.string().min(1, { error: "Write a note first." }).max(5000)),
});

export const taskSchema = z.object({
  contact_id: uuidSchema,
  title: line(200, "Describe the follow-up."),
  due_date: localDateSchema,
  due_time: z
    .string()
    .optional()
    .transform((v) => v || "09:00")
    .pipe(localTimeSchema),
});

export const appointmentSchema = z.object({
  contact_id: uuidSchema,
  inquiry_id: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(uuidSchema.optional()),
  date: localDateSchema,
  time: localTimeSchema,
  notes: optionalMultiline(1000),
});

export const appointmentStatusSchema = z.object({
  appointment_id: uuidSchema,
  status: z.enum(APPOINTMENT_STATUSES, { error: "Choose a status." }),
});

export const templateSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  subject: line(200, "Add a subject line."),
  body: z
    .string()
    .transform(cleanMultiline)
    .pipe(z.string().min(1, { error: "Add the email body." }).max(5000)),
});

export const followUpEmailSchema = z.object({
  contact_id: uuidSchema,
  subject: line(300, "Add a subject line."),
  body: z
    .string()
    .transform(cleanMultiline)
    // Leaves room for the unsubscribe footer within the outbox's 10,000-character limit.
    .pipe(z.string().min(1, { error: "Write the message first." }).max(9000)),
});

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

export type FieldErrors = Record<string, string>;

/** First error message per field, for inline form errors. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Reads string fields from FormData; files and missing fields are ignored. */
export function formFields(formData: FormData, names: readonly string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const name of names) {
    const value = formData.get(name);
    out[name] = typeof value === "string" ? value : undefined;
  }
  return out;
}
