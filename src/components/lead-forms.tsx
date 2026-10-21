"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import {
  addNoteAction,
  createTaskAction,
  recordAppointmentAction,
  rescheduleAppointmentAction,
  saveFollowUpEmailAction,
  updateStatusAction,
} from "@/app/(app)/leads/actions";
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatus } from "@/lib/domain";
import { ActionForm, SubmitButton } from "./ui/action-form";
import { SelectField, TextArea, TextField } from "./ui/fields";

export function StatusForm({
  contactId,
  status,
  outcomeNote,
}: {
  contactId: string;
  status: LeadStatus;
  outcomeNote: string | null;
}) {
  const [value, setValue] = useState<LeadStatus>(status);
  const outcome = value === "won" || value === "lost";
  return (
    <ActionForm action={updateStatusAction} className="space-y-3">
      <input type="hidden" name="contact_id" value={contactId} />
      <SelectField name="status" label="Status" value={value} onChange={(e) => setValue(e.target.value as LeadStatus)}>
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABELS[s]}
          </option>
        ))}
      </SelectField>
      {outcome ? (
        <TextArea
          name="outcome_note"
          label={value === "won" ? "Outcome" : "Why it didn't move forward"}
          optional
          rows={2}
          defaultValue={outcomeNote ?? ""}
          placeholder={value === "won" ? "e.g. Listing agreement signed" : "e.g. Decided to stay; chose another agent"}
        />
      ) : null}
      <SubmitButton variant="secondary" size="sm">
        Save status
      </SubmitButton>
    </ActionForm>
  );
}

export function TaskForm({ contactId, defaultDate }: { contactId: string; defaultDate: string }) {
  return (
    <ActionForm action={createTaskAction} resetOnSuccess className="space-y-3">
      <input type="hidden" name="contact_id" value={contactId} />
      <TextField name="title" label="Follow-up" placeholder="e.g. Send the estimate" maxLength={200} />
      <div className="grid grid-cols-2 gap-3">
        <TextField name="due_date" label="Date" type="date" defaultValue={defaultDate} />
        <TextField name="due_time" label="Time" type="time" defaultValue="09:00" />
      </div>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…">
        Add follow-up
      </SubmitButton>
    </ActionForm>
  );
}

export function AppointmentForm({
  contactId,
  defaultDate,
  inquiries,
  timeZone,
}: {
  contactId: string;
  defaultDate: string;
  inquiries: { id: string; label: string }[];
  timeZone: string;
}) {
  return (
    <ActionForm action={recordAppointmentAction} resetOnSuccess className="space-y-3">
      <input type="hidden" name="contact_id" value={contactId} />
      <div className="grid grid-cols-2 gap-3">
        <TextField name="date" label="Date" type="date" defaultValue={defaultDate} />
        <TextField name="time" label="Time" type="time" defaultValue="10:00" hint={timeZone.replace(/_/g, " ")} />
      </div>
      {inquiries.length > 1 ? (
        <SelectField name="inquiry_id" label="From inquiry" hint="Used to credit the right campaign." defaultValue={inquiries[0].id}>
          {inquiries.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="inquiry_id" value={inquiries[0]?.id ?? ""} />
      )}
      <TextArea name="notes" label="Notes" optional rows={2} placeholder="Location, video link, what to prepare…" />
      <SubmitButton size="sm" pendingLabel="Recording…">
        Record consultation
      </SubmitButton>
    </ActionForm>
  );
}

export function RescheduleForm({
  appointmentId,
  date,
  time,
}: {
  appointmentId: string;
  date: string;
  time: string;
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        Change time
      </summary>
      <ActionForm action={rescheduleAppointmentAction} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="appointment_id" value={appointmentId} />
        <TextField name="date" label="Date" type="date" defaultValue={date} className="h-9 py-1.5 text-sm" />
        <TextField name="time" label="Time" type="time" defaultValue={time} className="h-9 py-1.5 text-sm" />
        <SubmitButton size="sm" variant="secondary">
          Save
        </SubmitButton>
      </ActionForm>
    </details>
  );
}

export function NoteForm({ contactId }: { contactId: string }) {
  return (
    <ActionForm action={addNoteAction} resetOnSuccess showSuccess={false} className="space-y-3">
      <input type="hidden" name="contact_id" value={contactId} />
      <TextArea name="body" label="Add a note" rows={3} maxLength={5000} placeholder="What you discussed, details about the home…" />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…">
        Add note
      </SubmitButton>
    </ActionForm>
  );
}

export function FollowUpComposer({
  contactId,
  to,
  subject: initialSubject,
  body: initialBody,
  live,
  deliveryExplanation,
}: {
  contactId: string;
  to: string;
  subject: string;
  body: string;
  live: boolean;
  deliveryExplanation: string;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <ActionForm action={saveFollowUpEmailAction} className="space-y-3">
      <input type="hidden" name="contact_id" value={contactId} />
      <p className="text-sm text-ink-muted">
        To <span className="font-medium text-ink">{to}</span>
      </p>
      <TextField name="subject" label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
      <TextArea name="body" label="Message" rows={9} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} />
      <p className="text-[13px] text-ink-muted">{deliveryExplanation}</p>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton size="sm" pendingLabel={live ? "Sending…" : "Saving…"}>
          {live ? "Send email" : "Save to outbox (preview – not sent)"}
        </SubmitButton>
        <a
          href={mailto}
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium shadow-sm hover:bg-sunken/60"
        >
          <Mail aria-hidden className="size-4" /> Open in my email app
        </a>
      </div>
    </ActionForm>
  );
}
