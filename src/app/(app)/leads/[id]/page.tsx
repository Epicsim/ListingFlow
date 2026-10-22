import { ArrowLeft, CalendarClock, Check, MailCheck, Phone, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AppointmentForm,
  DeleteLeadForm,
  FollowUpComposer,
  NoteForm,
  RescheduleForm,
  StatusForm,
  TaskForm,
} from "@/components/lead-forms";
import { AppointmentStatusBadge, EmailStatusBadge, LeadStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, DefinitionList, EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { describeEvent } from "@/lib/activity-text";
import { requireAgent } from "@/lib/auth/session";
import { getLeadDetail } from "@/lib/data/leads";
import { getTemplates } from "@/lib/data/templates";
import { asUser } from "@/lib/db";
import { APPOINTMENT_STATUS_LABELS, CONTACT_METHOD_LABELS, EMAIL_KIND_LABELS, TIMELINE_LABELS } from "@/lib/domain";
import { getEmailDeliveryConfig } from "@/lib/email/config";
import { renderEmail, templateValuesFor } from "@/lib/email/messages";
import { addDays, formatDate, formatDateTime, formatShortDate, zonedDate, zonedTime } from "@/lib/time";
import { sourceLabel } from "@/lib/utm";
import { uuidSchema } from "@/lib/validation";
import {
  appointmentStatusAction,
  deleteNoteAction,
  deleteTaskAction,
  markContactedAction,
  toggleTaskAction,
} from "../actions";

export const metadata: Metadata = { title: "Lead" };

function HiddenForm({
  action,
  fields,
  children,
  label,
  variant = "ghost",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  children: React.ReactNode;
  label?: string;
  variant?: "ghost" | "secondary" | "primary" | "danger";
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" size="sm" variant={variant} aria-label={label}>
        {children}
      </Button>
    </form>
  );
}

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { profile } = await requireAgent();
  const tz = profile.timezone;
  const now = new Date();

  const { detail, templates } = await asUser(profile.id, async (tx) => ({
    detail: await getLeadDetail(tx, profile.id, id),
    templates: await getTemplates(tx, profile.id),
  }));
  if (!detail) notFound();
  const { contact, inquiries, consents, appointments, tasks, notes, emails, activity } = detail;
  const latest = inquiries[0];
  const today = zonedDate(now, tz);
  const email = getEmailDeliveryConfig();
  const draft = renderEmail(
    templates.follow_up,
    templateValuesFor(profile, { full_name: contact.full_name, property_address: latest?.property_address }, profile.booking_url),
  );
  const openTasks = tasks.filter((t) => !t.completed_at);
  const doneTasks = tasks.filter((t) => t.completed_at);

  return (
    <>
      <Link href="/leads" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> All leads
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {contact.full_name} <LeadStatusBadge status={contact.status} />
          </span>
        }
        description={
          <>
            {latest?.property_address} · first inquiry {formatDate(contact.first_inquiry_at, tz)}
            {contact.inquiry_count > 1 ? ` · ${contact.inquiry_count} inquiries` : ""}
          </>
        }
        actions={
          <>
            {/* Quick contact on phones; on desktop the Contact card is visible beside the content. */}
            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium shadow-sm lg:hidden"
              >
                <Phone aria-hidden className="size-4" /> Call
              </a>
            ) : null}
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium shadow-sm lg:hidden"
            >
              <MailCheck aria-hidden className="size-4" /> Email
            </a>
            <HiddenForm action={markContactedAction} fields={{ contact_id: contact.id }} variant={contact.status === "new" ? "primary" : "secondary"}>
              <Check aria-hidden className="size-4" />
              {contact.last_contacted_at ? "Log another contact" : "Mark as contacted"}
            </HiddenForm>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Consultations"
              description="Record a consultation once it's actually booked. Booking-link clicks alone don't count."
            />
            <div className="space-y-5 p-5">
              {detail.bookingClicks > 0 ? (
                <Notice tone="neutral" icon={<CalendarClock />}>
                  Opened your booking link {detail.bookingClicks} time{detail.bookingClicks === 1 ? "" : "s"}. That
                  doesn&rsquo;t confirm a booking – check your scheduler, then record it below.
                </Notice>
              ) : null}
              {appointments.length ? (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {appointments.map((a) => (
                    <li key={a.id} className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{formatDateTime(a.scheduled_at, tz)}</p>
                        <AppointmentStatusBadge status={a.status} />
                      </div>
                      {a.notes ? <p className="text-sm whitespace-pre-line text-ink-soft">{a.notes}</p> : null}
                      <div className="flex flex-wrap items-center gap-1">
                        {(["attended", "no_show", "canceled", "scheduled"] as const)
                          .filter((s) => s !== a.status)
                          .map((s) => (
                            <HiddenForm key={s} action={appointmentStatusAction} fields={{ appointment_id: a.id, status: s }} variant="secondary">
                              {s === "scheduled" ? "Back to scheduled" : `Mark ${APPOINTMENT_STATUS_LABELS[s].toLowerCase()}`}
                            </HiddenForm>
                          ))}
                      </div>
                      <RescheduleForm
                        appointmentId={a.id}
                        date={zonedDate(new Date(a.scheduled_at), tz)}
                        time={zonedTime(new Date(a.scheduled_at), tz)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className={appointments.length ? "border-t border-line pt-5" : ""}>
                <h3 className="mb-3 text-sm font-semibold">Record a consultation</h3>
                <AppointmentForm
                  contactId={contact.id}
                  defaultDate={today}
                  timeZone={tz}
                  inquiries={inquiries.map((i) => ({ id: i.id, label: `${formatShortDate(i.created_at, tz)} · ${i.campaign_name}` }))}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={`Inquiries (${inquiries.length})`} description="Exactly what the homeowner submitted, with where it came from." />
            <ol className="divide-y divide-line">
              {inquiries.map((i) => (
                <li key={i.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{formatDateTime(i.created_at, tz)}</p>
                    {i.is_repeat ? <Badge tone="info">Repeat request</Badge> : null}
                  </div>
                  <DefinitionList
                    items={[
                      { label: "Property", value: i.property_address },
                      { label: "Timeline", value: TIMELINE_LABELS[i.timeline] },
                      { label: "Prefers", value: CONTACT_METHOD_LABELS[i.preferred_contact] },
                      { label: "Campaign", value: i.campaign_name },
                      {
                        label: "Source",
                        value: (
                          <>
                            {sourceLabel(i.source)}
                            {[i.utm_medium, i.utm_campaign, i.utm_content].some(Boolean) ? (
                              <span className="text-ink-muted">
                                {" "}
                                · {[i.utm_medium && `medium: ${i.utm_medium}`, i.utm_campaign && `campaign: ${i.utm_campaign}`, i.utm_content && `detail: ${i.utm_content}`]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            ) : null}
                            {i.referrer_host ? <span className="text-ink-muted"> · via {i.referrer_host}</span> : null}
                          </>
                        ),
                      },
                      ...(i.message ? [{ label: "Message", value: <span className="whitespace-pre-line">{i.message}</span> }] : []),
                      { label: "Marketing emails", value: i.marketing_consent ? "Opted in" : "Not opted in" },
                    ]}
                  />
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Follow-up email" description="Starts from your follow-up template – edit freely." />
            <div className="p-5">
              <FollowUpComposer
                contactId={contact.id}
                to={contact.email}
                subject={draft.subject}
                body={draft.body}
                live={email.live}
                deliveryExplanation={email.explanation}
              />
              {emails.length ? (
                <div className="mt-6 border-t border-line pt-5">
                  <h3 className="mb-3 text-sm font-semibold">Emails for this lead</h3>
                  <ul className="space-y-2">
                    {emails.map((e) => (
                      <li key={e.id}>
                        <details className="rounded-lg border border-line">
                          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{e.subject}</span>
                              <span className="block text-xs text-ink-muted">
                                {EMAIL_KIND_LABELS[e.kind]} · {formatDateTime(e.created_at, tz)}
                              </span>
                            </span>
                            <EmailStatusBadge status={e.status} />
                          </summary>
                          <pre className="border-t border-line px-3 py-3 font-sans text-sm whitespace-pre-wrap text-ink-soft">{e.body_text}</pre>
                        </details>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <div className="p-5">
              <NoteForm contactId={contact.id} />
              {notes.length ? (
                <ul className="mt-5 space-y-3">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-sunken/60 p-3">
                      <p className="text-sm whitespace-pre-line text-ink">{n.body}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-ink-muted">{formatDateTime(n.created_at, tz)}</span>
                        <HiddenForm action={deleteNoteAction} fields={{ note_id: n.id }} label="Delete note">
                          <Trash2 aria-hidden className="size-4" />
                        </HiddenForm>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            {activity.length ? (
              <ol className="divide-y divide-line">
                {activity.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:justify-between sm:gap-4">
                    <span className="text-sm">{describeEvent(e, tz)}</span>
                    <time className="shrink-0 text-xs text-ink-muted" dateTime={new Date(e.created_at).toISOString()}>
                      {formatDateTime(e.created_at, tz)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState compact title="No activity yet" />
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <div className="space-y-3 p-5 text-sm">
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 font-medium break-all text-accent-ink hover:underline">
                <MailCheck aria-hidden className="size-4 shrink-0" /> {contact.email}
              </a>
              {contact.phone ? (
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 font-medium text-accent-ink hover:underline">
                  <Phone aria-hidden className="size-4 shrink-0" /> {contact.phone}
                </a>
              ) : null}
              <DefinitionList
                items={[
                  { label: "Prefers", value: CONTACT_METHOD_LABELS[contact.preferred_contact] },
                  {
                    label: "Last contacted",
                    value: contact.last_contacted_at ? formatDateTime(contact.last_contacted_at, tz) : "Not yet",
                  },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Status & outcome" />
            <div className="p-5">
              {/* Keyed so the form re-syncs when the status changes elsewhere (e.g. "Mark as contacted"). */}
              <StatusForm
                key={`${contact.status}:${contact.outcome_note ?? ""}`}
                contactId={contact.id}
                status={contact.status}
                outcomeNote={contact.outcome_note}
              />
              {contact.outcome_at ? (
                <p className="mt-3 text-xs text-ink-muted">
                  Outcome recorded {formatDate(contact.outcome_at, tz)}
                  {contact.outcome_note ? ` – “${contact.outcome_note}”` : ""}
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Follow-ups" description="Reminders show on your Overview when due." />
            <div className="p-5">
              {openTasks.length ? (
                <ul className="mb-5 space-y-2">
                  {openTasks.map((t) => {
                    const due = new Date(t.due_at);
                    const overdue = due <= now;
                    return (
                      <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg border border-line p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t.title}</p>
                          <p className={`text-xs ${overdue ? "font-medium text-warning" : "text-ink-muted"}`}>
                            {overdue ? "Due " : ""}
                            {formatDateTime(t.due_at, tz)}
                          </p>
                        </div>
                        <div className="flex shrink-0">
                          <HiddenForm action={toggleTaskAction} fields={{ task_id: t.id, completed: "true" }} label={`Mark “${t.title}” done`}>
                            <Check aria-hidden className="size-4" />
                          </HiddenForm>
                          <HiddenForm action={deleteTaskAction} fields={{ task_id: t.id }} label={`Delete “${t.title}”`}>
                            <Trash2 aria-hidden className="size-4" />
                          </HiddenForm>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mb-4 text-sm text-ink-muted">No open follow-ups.</p>
              )}
              <TaskForm contactId={contact.id} defaultDate={addDays(today, 1)} />
              {doneTasks.length ? (
                <details className="mt-5">
                  <summary className="cursor-pointer text-sm text-ink-muted">Completed ({doneTasks.length})</summary>
                  <ul className="mt-2 space-y-1.5">
                    {doneTasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 text-sm text-ink-muted">
                        <span className="line-through">{t.title}</span>
                        <HiddenForm action={toggleTaskAction} fields={{ task_id: t.id, completed: "false" }} label={`Reopen “${t.title}”`}>
                          <Undo2 aria-hidden className="size-4" />
                        </HiddenForm>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Marketing consent" />
            <div className="p-5 text-sm">
              {consents.length ? (
                <ul className="space-y-4">
                  {consents.map((c) => (
                    <li key={c.id}>
                      <p className="flex items-center gap-2 font-medium text-accent-ink">
                        <ShieldCheck aria-hidden className="size-4" /> Opted in to marketing email
                      </p>
                      <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink-soft">“{c.wording}”</blockquote>
                      <p className="mt-2 text-xs text-ink-muted">
                        {formatDateTime(c.captured_at, tz)} · {c.source_page}
                        {c.source_utm ? ` · source: ${c.source_utm}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-muted">
                  No marketing consent given. You can still reply to their request personally; don&rsquo;t add them to
                  marketing emails.
                </p>
              )}
            </div>
          </Card>
          <Card>
            <DeleteLeadForm contactId={contact.id} />
          </Card>
        </aside>
      </div>
    </>
  );
}
