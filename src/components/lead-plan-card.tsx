import { startPlanAction, stopPlanAction, toggleTaskAction } from "@/app/(app)/leads/actions";
import type { TaskRecord, EmailRecord, Contact } from "@/lib/data/leads";
import type { Enrollment, FollowUpPlan } from "@/lib/data/plans";
import { EMAIL_STATUS_LABELS } from "@/lib/domain";
import { STOP_REASON_LABELS, TASK_KIND_LABELS } from "@/lib/follow-up-plans";
import { formatDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "./ui/action-form";
import { Button, ButtonLink } from "./ui/button";
import { CopyButton } from "./ui/copy-button";
import { Badge, Card, CardHeader } from "./ui/display";
import { SelectField } from "./ui/fields";

export function LeadPlanCard({ enrollments, plans, tasks, emails, contact, timeZone }: { enrollments: Enrollment[]; plans: FollowUpPlan[]; tasks: TaskRecord[]; emails: EmailRecord[]; contact: Contact; timeZone: string }) {
  const active = enrollments.find((e) => e.status === "active");
  const terminal = ["consultation_booked", "won", "lost"].includes(contact.status);
  return <Card><CardHeader title="Follow-up plan" description="Reminders and drafts only. Review each email before sending." /><div className="space-y-5 p-5">
    {enrollments.length ? enrollments.map((e) => <div key={e.id} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{e.plan_name}</h3><Badge className="whitespace-normal">{e.status === "active" ? "Active" : e.status === "completed" ? "Completed" : `Stopped · ${STOP_REASON_LABELS[e.stop_reason ?? ""] ?? e.stop_reason}`}</Badge></div>
      <p className="text-xs text-ink-muted">Started {formatDateTime(e.started_at, timeZone)}</p>
      <ol className="space-y-3">{tasks.filter((t) => t.enrollment_id === e.id).map((t) => {
        const email = emails.find((m) => m.id === t.email_id);
        return <li key={t.id} className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm font-medium break-words">{t.title}</p>
          <p className="text-xs text-ink-muted">{t.kind === "email" ? "Email" : TASK_KIND_LABELS[t.kind]} · {t.canceled_at ? `Canceled · ${STOP_REASON_LABELS[t.cancel_reason ?? ""] ?? t.cancel_reason}` : t.completed_at ? "Done" : `Due ${formatDateTime(t.due_at, timeZone)}`}</p>
          {email ? <Badge>{EMAIL_STATUS_LABELS[email.status]}</Badge> : null}
          {!t.completed_at && !t.canceled_at && t.kind === "email" ? <ButtonLink size="sm" variant="secondary" href={`/leads/${contact.id}?task=${t.id}#follow-up-email`}>{email?.status === "queued" ? "View email status" : "Review draft"}</ButtonLink> : null}
          {t.kind === "text" ? <div className="space-y-2 text-sm"><p>{contact.phone ?? "No phone number provided"} · You send it yourself</p>{t.text_message ? <><p className="whitespace-pre-wrap break-words">{t.text_message}</p><CopyButton value={t.text_message} label="Copy message" /></> : null}</div> : null}
          {!t.completed_at && !t.canceled_at && t.kind !== "email" ? <form action={toggleTaskAction}><input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="completed" value="true" /><Button type="submit" size="sm" variant="secondary">Mark done</Button></form> : null}
        </li>;
      })}{e.skipped_steps.map((s, i) => <li key={`skipped-${i}`} className="rounded-xl border border-dashed border-line p-3 text-sm text-ink-muted">Day {s.day_offset} · {s.title}<span className="mt-1 block">{s.reason === "no_marketing_consent" ? "Skipped – no marketing consent" : "Skipped – homeowner unsubscribed"}</span></li>)}</ol>
    </div>) : <p className="text-sm text-ink-muted">No plan started for this lead.</p>}
    {active ? <ActionForm action={stopPlanAction}><input type="hidden" name="contact_id" value={contact.id} /><SubmitButton variant="danger" size="sm">Stop plan</SubmitButton><p className="mt-2 text-xs text-ink-muted">Reason: stopped by you. Completed steps stay in the history.</p></ActionForm>
      : plans.length && !terminal ? <ActionForm action={startPlanAction} className="space-y-3"><input type="hidden" name="contact_id" value={contact.id} /><SelectField name="plan_id" label="Start a plan" required><option value="">Choose a plan</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_active ? "" : " (off for new inquiries)"}</option>)}</SelectField><SubmitButton size="sm">Start plan</SubmitButton></ActionForm>
      : <p className="text-sm text-ink-muted">{terminal ? "Plans stay stopped while this lead is booked, won or lost." : "Create a plan in Settings → Follow-up plans."}</p>}
  </div></Card>;
}
