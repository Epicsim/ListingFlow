import { z } from "zod";
import { TIMELINES } from "@/lib/domain";
import { addDays, zonedDate, zonedDateTimeToUtc } from "@/lib/time";

export const PLAN_DUE_TIME = "09:00";
export const CONSENT_REQUIRED_AFTER_DAYS = 30;
export const MAX_PLANS = 20;
export const MAX_STEPS = 12;
export const MAX_EMAIL_STEPS = 6;
export const STEP_KINDS = ["call", "email", "text"] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export type TaskKind = StepKind | "reminder";
export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  reminder: "Reminder", call: "Call", email: "Email draft ready", text: "Text",
};
export const STOP_REASON_LABELS: Record<string, string> = {
  consultation_booked: "Consultation booked", won: "Won", lost: "Lost",
  unsubscribed: "Homeowner unsubscribed", repeat_inquiry: "New plan for a repeat inquiry",
  agent_stopped: "Stopped by you",
  skipped: "Skipped by you",
};
export const planSchema = z.object({
  name: z.string().trim().min(1, "Give this plan a name.").max(80, "Use 80 characters or fewer."),
  is_active: z.boolean(),
  timelines: z.array(z.enum(TIMELINES)).min(1, "Choose at least one selling timeline.").max(4),
  campaign_id: z.union([z.uuid(), z.literal("")]).nullable().transform((v) => v || null),
});
export type PlanInput = z.infer<typeof planSchema>;

const optionalText = (max: number) => z.string().trim().max(max, `Use ${max} characters or fewer.`).nullable().optional();
export const planStepSchema = z.object({
  day_offset: z.preprocess((v) => v === "" || v == null ? Number.NaN : v, z.coerce.number({ error: "Choose a whole day from 0 to 365." }).int("Use a whole number of days.").min(0, "Day must be from 0 to 365.").max(365, "Day must be from 0 to 365.")),
  kind: z.enum(STEP_KINDS),
  title: optionalText(200),
  text_message: optionalText(2000),
  email_subject: optionalText(200),
  email_body: optionalText(5000),
}).superRefine((step, ctx) => {
  for (const key of step.kind === "email" ? ["email_subject", "email_body"] as const : ["title"] as const) {
    if (!step[key]) ctx.addIssue({ code: "custom", path: [key], message: key === "title" ? "Add a reminder title." : "Add a subject and message for the draft." });
  }
}).transform((s) => ({
  ...s, title: s.kind === "email" ? null : s.title!,
  text_message: s.kind === "text" ? s.text_message || null : null,
  email_subject: s.kind === "email" ? s.email_subject! : null,
  email_body: s.kind === "email" ? s.email_body! : null,
}));
export type PlanStepInput = z.infer<typeof planStepSchema>;

export function stepLimitError(steps: Pick<PlanStepInput, "day_offset" | "kind">[]): string | null {
  if (steps.length > MAX_STEPS) return "A plan can have up to 12 steps.";
  const emails = steps.filter((s) => s.kind === "email").sort((a, b) => a.day_offset - b.day_offset);
  if (emails.length > MAX_EMAIL_STEPS) return "A plan can have up to 6 email drafts.";
  if (emails.some((s, i) => i > 0 && s.day_offset - emails[i - 1].day_offset < 2)) return "Leave at least 2 days between email drafts.";
  return null;
}

export function planDueAt(start: Date, day: number, timeZone: string): Date {
  return day === 0 ? new Date(start) : zonedDateTimeToUtc(addDays(zonedDate(start, timeZone), day), PLAN_DUE_TIME, timeZone);
}

const call = (): PlanStepInput => ({ day_offset: 0, kind: "call", title: "Call {{first_name}}", text_message: null, email_subject: null, email_body: null });
const email = (day: number, subject: string, message: string): PlanStepInput => ({ day_offset: day, kind: "email", title: null, text_message: null,
  email_subject: subject, email_body: `Hi {{first_name}},\n\n${message}\n\nYou can choose a time to talk here: {{booking_link}}\n\n{{agent_name}}\n{{brokerage}}\n{{agent_phone}}` });
export const STARTER_PLANS: { name: string; timelines: PlanInput["timelines"]; steps: PlanStepInput[] }[] = [
  { name: "Selling soon", timelines: ["soon"], steps: [call(),
    email(1, "Your request about {{property_address}}", "I'd like to learn a little more about your home and timing so I can personally prepare your estimate. Would a conversation help?"),
    email(3, "A good time to talk?", "I'm following up on your request. Let me know what you'd like to discuss about your home or selling plans."),
    email(7, "Closing the loop", "I'll leave this with you for now. If you'd like to revisit your request, you're welcome to reach out when the timing suits you.") ] },
  { name: "In 3–6 months", timelines: ["3_6_months"], steps: [call(),
    email(3, "Planning your next move", "Thanks for sharing your timing. I'd be glad to hear about your goals and discuss how to prepare."),
    email(14, "Any questions about your plans?", "Has anything changed since your request? I'm here if you'd like to talk through your next steps."),
    ...[44, 74, 104].map((d) => email(d, "Checking in on your timing", "You asked to hear from me occasionally. If your selling plans have changed, let me know. There's no pressure to decide.")) ] },
  { name: "Later or just exploring", timelines: ["6_12_months", "exploring"], steps: [call(),
    email(7, "Here when you're ready", "Thanks for your request. If a conversation would help you explore your options, I'm happy to listen."),
    ...[37, 67].map((d) => email(d, "How are your plans taking shape?", "You asked to hear from me occasionally. If you'd like to revisit your questions about selling, feel free to reach out.")) ] },
];
