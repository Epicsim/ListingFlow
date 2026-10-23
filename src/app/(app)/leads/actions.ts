"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, failure, success } from "@/lib/action-state";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { recordAppointment, rescheduleAppointment, updateAppointmentStatus } from "@/lib/data/appointments";
import { addNote, deleteLead, deleteNote, getContact, markContacted, updateLeadStatus } from "@/lib/data/leads";
import { createFollowUpEmail } from "@/lib/data/outbox";
import { createTask, deleteTask, setTaskCompleted, lockEmailTask, linkTaskEmail, skipPlanTask } from "@/lib/data/tasks";
import { PlanError, startPlan, stopPlan } from "@/lib/data/plans";
import { getAppSecret } from "@/lib/config";
import { asService, asUser } from "@/lib/db";
import { getEmailDeliveryConfig } from "@/lib/email/config";
import { deliverQueuedEmails } from "@/lib/email/deliver";
import { unsubscribeUrl, withUnsubscribeLink } from "@/lib/email/unsubscribe";
import { requestOrigin } from "@/lib/request-origin";
import { zonedDateTimeToUtc } from "@/lib/time";
import {
  appointmentSchema,
  appointmentStatusSchema,
  followUpEmailSchema,
  formFields,
  leadStatusSchema,
  localDateSchema,
  localTimeSchema,
  noteSchema,
  taskSchema,
  toFieldErrors,
  uuidSchema,
} from "@/lib/validation";

function refresh(contactId?: string | null) {
  if (contactId) revalidatePath(`/leads/${contactId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

const NOT_FOUND = "This lead could not be found.";

export async function deleteLeadAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const id = uuidSchema.safeParse(formData.get("contact_id"));
  if (!id.success) return failure(NOT_FOUND);
  if (formData.get("confirm_delete") !== "delete") {
    return failure("Please confirm the permanent deletion.", {
      confirm_delete: "Check the box to confirm you want to permanently delete this lead.",
    });
  }
  const deleted = await asUser(profile.id, (tx) => deleteLead(tx, profile.id, id.data));
  if (!deleted) return failure(NOT_FOUND);
  refresh(id.data);
  revalidatePath("/campaigns");
  revalidatePath("/campaigns/[id]", "page");
  revalidatePath("/outbox");
  redirect("/leads?deleted=1");
}

export async function updateStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const parsed = leadStatusSchema.safeParse(formFields(formData, ["contact_id", "status", "outcome_note"]));
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const { contact_id, status, outcome_note } = parsed.data;
  const ok = await asUser(profile.id, (tx) => updateLeadStatus(tx, profile.id, contact_id, status, outcome_note));
  if (!ok) return failure(NOT_FOUND);
  refresh(contact_id);
  return success("Status saved.");
}

export async function markContactedAction(formData: FormData): Promise<void> {
  const { profile } = await requireWorkspaceAgent();
  const id = uuidSchema.safeParse(formData.get("contact_id"));
  if (!id.success) return;
  await asUser(profile.id, (tx) => markContacted(tx, profile.id, id.data));
  refresh(id.data);
}

export async function addNoteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const parsed = noteSchema.safeParse(formFields(formData, ["contact_id", "body"]));
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const ok = await asUser(profile.id, (tx) => addNote(tx, profile.id, parsed.data.contact_id, parsed.data.body));
  if (!ok) return failure(NOT_FOUND);
  refresh(parsed.data.contact_id);
  return success("Note added.");
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const { profile } = await requireWorkspaceAgent();
  const id = uuidSchema.safeParse(formData.get("note_id"));
  if (!id.success) return;
  const contactId = await asUser(profile.id, (tx) => deleteNote(tx, profile.id, id.data));
  refresh(contactId);
}

export async function createTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const parsed = taskSchema.safeParse(formFields(formData, ["contact_id", "title", "due_date", "due_time"]));
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const { contact_id, title, due_date, due_time } = parsed.data;
  const dueAt = zonedDateTimeToUtc(due_date, due_time, profile.timezone);
  const id = await asUser(profile.id, (tx) => createTask(tx, profile.id, contact_id, title, dueAt));
  if (!id) return failure(NOT_FOUND);
  refresh(contact_id);
  return success("Follow-up added.");
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const { profile } = await requireWorkspaceAgent();
  const id = uuidSchema.safeParse(formData.get("task_id"));
  if (!id.success) return;
  const completed = formData.get("completed") === "true";
  const contactId = await asUser(profile.id, (tx) => setTaskCompleted(tx, profile.id, id.data, completed));
  refresh(contactId);
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const { profile } = await requireWorkspaceAgent();
  const id = uuidSchema.safeParse(formData.get("task_id"));
  if (!id.success) return;
  const contactId = await asUser(profile.id, (tx) => deleteTask(tx, profile.id, id.data));
  refresh(contactId);
}

export async function recordAppointmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const parsed = appointmentSchema.safeParse(formFields(formData, ["contact_id", "inquiry_id", "date", "time", "notes"]));
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const { contact_id, inquiry_id, date, time, notes } = parsed.data;
  const scheduledAt = zonedDateTimeToUtc(date, time, profile.timezone);
  const id = await asUser(profile.id, (tx) =>
    recordAppointment(tx, profile.id, { contactId: contact_id, inquiryId: inquiry_id, scheduledAt, notes }),
  );
  if (!id) return failure(NOT_FOUND);
  refresh(contact_id);
  revalidatePath("/campaigns");
  return success("Consultation recorded.");
}

export async function appointmentStatusAction(formData: FormData): Promise<void> {
  const { profile } = await requireWorkspaceAgent();
  const parsed = appointmentStatusSchema.safeParse(formFields(formData, ["appointment_id", "status"]));
  if (!parsed.success) return;
  const contactId = await asUser(profile.id, (tx) =>
    updateAppointmentStatus(tx, profile.id, parsed.data.appointment_id, parsed.data.status),
  );
  refresh(contactId);
  revalidatePath("/campaigns");
}

export async function rescheduleAppointmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const id = uuidSchema.safeParse(formData.get("appointment_id"));
  const date = localDateSchema.safeParse(formData.get("date"));
  const time = localTimeSchema.safeParse(formData.get("time"));
  if (!id.success) return failure("This consultation could not be found.");
  if (!date.success || !time.success) {
    return failure("Choose a new date and time.", {
      ...(date.success ? {} : { date: "Choose a date." }),
      ...(time.success ? {} : { time: "Choose a time." }),
    });
  }
  const scheduledAt = zonedDateTimeToUtc(date.data, time.data, profile.timezone);
  const contactId = await asUser(profile.id, (tx) => rescheduleAppointment(tx, profile.id, id.data, scheduledAt));
  if (!contactId) return failure("This consultation could not be found.");
  refresh(contactId);
  return success("Consultation moved.");
}

/**
 * Saves an agent-written follow-up. With delivery configured it is sent and
 * the real provider result is reported; otherwise it is stored as a clearly
 * labeled preview and nothing is sent.
 */
export async function saveFollowUpEmailAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const parsed = followUpEmailSchema.safeParse(formFields(formData, ["contact_id", "subject", "body"]));
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const { contact_id, subject, body } = parsed.data;
  const rawTask = formData.get("task_id");
  const task = rawTask ? uuidSchema.safeParse(rawTask) : null;
  if (task && !task.success) return failure("This draft step could not be found.");
  const taskId = task?.success ? task.data : null;
  const config = getEmailDeliveryConfig();
  const unsubscribe = unsubscribeUrl(await requestOrigin(), contact_id, await getAppSecret());

  const emailId = await asUser(profile.id, async (tx) => {
    const contact = await getContact(tx, profile.id, contact_id, true);
    if (!contact) return null;
    if (contact.unsubscribed_at) return "unsubscribed" as const;
    if (taskId && !await lockEmailTask(tx, profile.id, contact_id, taskId)) return "task_unavailable" as const;
    const id = await createFollowUpEmail(tx, {
      agentId: profile.id,
      contactId: contact.id,
      inquiryId: null,
      kind: "follow_up",
      to: contact.email,
      replyTo: profile.contact_email,
      subject,
      body: withUnsubscribeLink(body, unsubscribe),
      status: config.live ? "queued" : "preview",
    });
    if (taskId) await linkTaskEmail(tx, profile.id, contact_id, taskId, id);
    return id;
  });
  if (!emailId) return failure(NOT_FOUND);
  if (emailId === "unsubscribed") return failure("This homeowner unsubscribed from your emails, so nothing was saved or sent.");
  if (emailId === "task_unavailable") return failure("This draft step is completed, canceled, already queued, or no longer available. Refresh the lead before trying again.");

  if (!config.live) {
    refresh(contact_id);
    revalidatePath("/outbox");
    return success("Saved to your outbox as a preview. It was not sent because email delivery isn't set up.");
  }
  const result = await deliverQueuedEmails(asService, [emailId]);
  refresh(contact_id);
  revalidatePath("/outbox");
  return result.sent === 1
    ? success("Sent. The email provider accepted the message.")
    : failure("The email provider didn't accept this message, so it was not sent. It's saved in your outbox as failed.");
}

export async function startPlanAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const contact = uuidSchema.safeParse(data.get("contact_id"));
  const plan = uuidSchema.safeParse(data.get("plan_id"));
  if (!contact.success || !plan.success) return failure("Choose one of your plans.");
  try {
    const id = await asUser(profile.id, (tx) => startPlan(tx, profile.id, contact.data, plan.data));
    if (!id) return failure("This plan cannot start. Check the lead's status and try again.");
  } catch (e) { return failure(e instanceof PlanError ? e.message : "We couldn't start this plan. Please retry."); }
  refresh(contact.data);
  return success("Plan started. Its reminders and drafts are ready to review.");
}
export async function stopPlanAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const contact = uuidSchema.safeParse(data.get("contact_id"));
  if (!contact.success) return failure(NOT_FOUND);
  await asUser(profile.id, (tx) => stopPlan(tx, profile.id, contact.data));
  refresh(contact.data);
  return success("Plan stopped. Its open steps are canceled.");
}

export async function skipPlanStepAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const task = uuidSchema.safeParse(data.get("task_id"));
  if (!task.success) return failure("This open plan step could not be found.");
  const contactId = await asUser(profile.id, (tx) => skipPlanTask(tx, task.data));
  if (!contactId) return failure("This step is done, canceled, still sending, or no longer available.");
  refresh(contactId);
  return success("Step skipped. The other open steps continue.");
}
