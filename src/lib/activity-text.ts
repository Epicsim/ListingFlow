import type { ActivityEvent } from "@/lib/data/activity";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  LEAD_STATUS_LABELS,
  type LeadStatus,
  TIMELINE_LABELS,
  type Timeline,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/time";
import { sourceLabel } from "@/lib/utm";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Plain-language description of an activity event. */
export function describeEvent(event: ActivityEvent, timeZone: string, includeName = false): string {
  const d = event.data ?? {};
  const who = includeName && event.contact_name ? event.contact_name : "";
  const subject = who || "Homeowner";
  switch (event.type) {
    case "lead_deleted":
      return "Lead permanently deleted";
    case "inquiry_submitted": {
      const timeline = TIMELINE_LABELS[str(d.timeline) as Timeline];
      return `${subject} requested an estimate via “${str(d.campaign_name)}”${
        d.source ? ` (${sourceLabel(str(d.source))})` : ""
      }${timeline ? ` · ${timeline.toLowerCase()}` : ""}`;
    }
    case "repeat_inquiry_submitted":
      return `${subject} sent another request via “${str(d.campaign_name)}”${d.source ? ` (${sourceLabel(str(d.source))})` : ""}`;
    case "booking_link_clicked":
      return `${subject} opened your booking link (not a confirmed appointment)`;
    case "status_changed":
      return `${who ? `${who}: s` : "S"}tatus changed from ${LEAD_STATUS_LABELS[str(d.from) as LeadStatus] ?? str(d.from)} to ${
        LEAD_STATUS_LABELS[str(d.to) as LeadStatus] ?? str(d.to)
      }${d.outcome_note ? ` – “${str(d.outcome_note)}”` : ""}`;
    case "marked_contacted":
      return `${who ? `${who} m` : "M"}arked as contacted`;
    case "note_added":
      return `${who ? `Note added for ${who}` : "Note added"}`;
    case "task_created":
      return `Follow-up scheduled${who ? ` for ${who}` : ""}: ${str(d.title)}${
        d.due_at ? ` (due ${formatDateTime(str(d.due_at), timeZone)})` : ""
      }`;
    case "task_completed":
      return `Follow-up completed${who ? ` for ${who}` : ""}: ${str(d.title)}`;
    case "task_reopened":
      return `Follow-up reopened${who ? ` for ${who}` : ""}: ${str(d.title)}`;
    case "appointment_recorded":
      return `Consultation recorded${who ? ` with ${who}` : ""} for ${formatDateTime(str(d.scheduled_at), timeZone)}`;
    case "appointment_rescheduled":
      return `Consultation${who ? ` with ${who}` : ""} moved to ${formatDateTime(str(d.scheduled_at), timeZone)}`;
    case "appointment_status_changed":
      return `Consultation${who ? ` with ${who}` : ""} marked ${(
        APPOINTMENT_STATUS_LABELS[str(d.to) as AppointmentStatus] ?? str(d.to)
      ).toLowerCase()}`;
    case "email_previewed":
      return `Follow-up email saved to outbox as a preview – not sent${who ? ` (${who})` : ""}`;
    case "email_queued":
      return `Follow-up email queued for sending${who ? ` (${who})` : ""}`;
    case "campaign_published":
      return `Campaign “${str(d.campaign_name)}” published`;
    case "campaign_unpublished":
      return `Campaign “${str(d.campaign_name)}” moved back to draft`;
    case "campaign_archived":
      return `Campaign “${str(d.campaign_name)}” archived`;
    default:
      return event.type.replace(/_/g, " ");
  }
}
