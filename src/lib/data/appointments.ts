import type { Tx } from "@/lib/db/types";
import type { AppointmentStatus } from "@/lib/domain";
import { logAgentEvent } from "./activity";

export interface UpcomingAppointment {
  id: string;
  contact_id: string;
  contact_name: string;
  scheduled_at: Date;
  status: AppointmentStatus;
}

/** Statuses that move forward to "consultation booked" when one is recorded. */
const ADVANCES_TO_BOOKED = ["new", "contacted", "nurturing"];

/**
 * Records a confirmed consultation. This is the only way a consultation is
 * counted; a booking-link click on its own never creates one.
 */
export async function recordAppointment(
  tx: Tx,
  agentId: string,
  input: { contactId: string; inquiryId?: string; scheduledAt: Date; notes?: string },
): Promise<string | null> {
  // Attribute to the chosen inquiry if it belongs to this contact, otherwise to
  // the contact's most recent inquiry (and therefore its campaign).
  const inquiry = await tx.query<{ id: string }>(
    `select i.id from public.inquiries i
     where i.contact_id = $1::uuid and i.agent_id = $2::uuid
       and ($3::uuid is null or i.id = $3::uuid)
     order by i.created_at desc limit 1`,
    [input.contactId, agentId, input.inquiryId ?? null],
  );
  if (!inquiry.length) return null;

  const rows = await tx.query<{ id: string }>(
    `insert into public.appointments (agent_id, contact_id, inquiry_id, scheduled_at, notes, source)
     values ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::text, 'manual')
     returning id`,
    [agentId, input.contactId, inquiry[0].id, input.scheduledAt.toISOString(), input.notes ?? null],
  );
  const appointmentId = rows[0].id;

  await logAgentEvent(tx, agentId, {
    type: "appointment_recorded",
    contactId: input.contactId,
    inquiryId: inquiry[0].id,
    data: { appointment_id: appointmentId, scheduled_at: input.scheduledAt.toISOString() },
  });

  const advanced = await tx.query<{ old_status: string }>(
    `update public.contacts c set status = 'consultation_booked'
     from (select status as old_status from public.contacts where id = $1::uuid and agent_id = $2::uuid) prev
     where c.id = $1::uuid and c.agent_id = $2::uuid and c.status = any($3::text::text[])
     returning prev.old_status`,
    [input.contactId, agentId, `{${ADVANCES_TO_BOOKED.join(",")}}`],
  );
  if (advanced.length) {
    await logAgentEvent(tx, agentId, {
      type: "status_changed",
      contactId: input.contactId,
      data: { from: advanced[0].old_status, to: "consultation_booked", reason: "appointment_recorded" },
    });
  }
  return appointmentId;
}

export async function updateAppointmentStatus(
  tx: Tx,
  agentId: string,
  appointmentId: string,
  status: AppointmentStatus,
): Promise<string | null> {
  const rows = await tx.query<{ contact_id: string; old_status: AppointmentStatus; scheduled_at: Date }>(
    `update public.appointments a set status = $3::text, status_changed_at = now()
     from (select status as old_status from public.appointments where id = $1::uuid and agent_id = $2::uuid) prev
     where a.id = $1::uuid and a.agent_id = $2::uuid
     returning a.contact_id, prev.old_status, a.scheduled_at`,
    [appointmentId, agentId, status],
  );
  if (!rows.length) return null;
  if (rows[0].old_status !== status) {
    await logAgentEvent(tx, agentId, {
      type: "appointment_status_changed",
      contactId: rows[0].contact_id,
      data: {
        appointment_id: appointmentId,
        from: rows[0].old_status,
        to: status,
        scheduled_at: new Date(rows[0].scheduled_at).toISOString(),
      },
    });
  }
  return rows[0].contact_id;
}

export async function rescheduleAppointment(
  tx: Tx,
  agentId: string,
  appointmentId: string,
  scheduledAt: Date,
): Promise<string | null> {
  const rows = await tx.query<{ contact_id: string }>(
    `update public.appointments set scheduled_at = $3::timestamptz, status = 'scheduled', status_changed_at = now()
     where id = $1::uuid and agent_id = $2::uuid
     returning contact_id`,
    [appointmentId, agentId, scheduledAt.toISOString()],
  );
  if (!rows.length) return null;
  await logAgentEvent(tx, agentId, {
    type: "appointment_rescheduled",
    contactId: rows[0].contact_id,
    data: { appointment_id: appointmentId, scheduled_at: scheduledAt.toISOString() },
  });
  return rows[0].contact_id;
}

/**
 * Scheduled consultations: upcoming ones, plus past ones still waiting for the
 * agent to record whether they happened.
 */
export async function listScheduledAppointments(tx: Tx, agentId: string, limit = 8): Promise<UpcomingAppointment[]> {
  return tx.query<UpcomingAppointment>(
    `select a.id, a.contact_id, c.full_name as contact_name, a.scheduled_at, a.status
     from public.appointments a join public.contacts c on c.id = a.contact_id
     where a.agent_id = $1::uuid and a.status = 'scheduled'
     order by a.scheduled_at
     limit $2::int`,
    [agentId, limit],
  );
}
