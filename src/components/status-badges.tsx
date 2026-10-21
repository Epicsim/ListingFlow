import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  CAMPAIGN_STATUS_LABELS,
  type CampaignStatus,
  EMAIL_STATUS_LABELS,
  type EmailStatus,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/domain";
import { Badge } from "./ui/display";

const LEAD_TONES: Record<LeadStatus, Parameters<typeof Badge>[0]["tone"]> = {
  new: "info",
  contacted: "neutral",
  consultation_booked: "accent",
  nurturing: "warning",
  won: "accent",
  lost: "neutral",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD_TONES[status]}>{LEAD_STATUS_LABELS[status]}</Badge>;
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const tone = status === "published" ? "accent" : status === "draft" ? "warning" : "neutral";
  return <Badge tone={tone}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>;
}

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const tone = status === "attended" ? "accent" : status === "scheduled" ? "info" : status === "no_show" ? "danger" : "neutral";
  return <Badge tone={tone}>{APPOINTMENT_STATUS_LABELS[status]}</Badge>;
}

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const tone = status === "sent" ? "accent" : status === "failed" ? "danger" : status === "queued" ? "info" : "warning";
  return <Badge tone={tone}>{EMAIL_STATUS_LABELS[status]}</Badge>;
}
