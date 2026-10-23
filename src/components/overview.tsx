import {
  Activity,
  ArrowRightLeft,
  ArrowUpRight,
  BellRing,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronRight,
  CircleCheck,
  Mail,
  MailX,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  MousePointerClick,
  PhoneCall,
  RotateCcw,
  StickyNote,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card } from "@/components/ui/display";
import { describeEvent } from "@/lib/activity-text";
import type { ActivityEvent } from "@/lib/data/activity";
import type { UpcomingAppointment } from "@/lib/data/appointments";
import type { DueTask } from "@/lib/data/tasks";
import { TASK_KIND_LABELS } from "@/lib/follow-up-plans";
import { EMAIL_STATUS_LABELS } from "@/lib/domain";
import { calendarTile, formatDateTime, formatDayLabel, formatShortDate, formatTime, zonedDate } from "@/lib/time";

/** One stored count on the overview. Linked stats open the matching lead list. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  linkLabel,
  attention = false,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  href?: string;
  linkLabel?: string;
  /** Uses the warning tone, e.g. for leads that need a reply now. */
  attention?: boolean;
}) {
  return (
    <div
      className={`group relative flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5 ${
        href ? "transition-colors hover:border-line-strong/50" : ""
      }`}
    >
      <dt>
        <span className="flex items-center justify-between gap-2">
          <span
            className={`flex size-8 items-center justify-center rounded-lg ${
              attention ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent-ink"
            }`}
          >
            <Icon aria-hidden strokeWidth={1.8} className="size-4" />
          </span>
          {href ? (
            <ArrowUpRight
              aria-hidden
              className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink"
            />
          ) : null}
        </span>
        <span className="mt-3.5 block text-[13px] leading-snug font-medium text-ink-soft sm:text-sm">{label}</span>
      </dt>
      <dd className="pt-2.5">
        <span className="block text-[32px] leading-none font-semibold tracking-[-0.045em] text-ink tabular-nums sm:text-[40px]">
          {value}
        </span>
        <span className="mt-2.5 block text-xs leading-snug text-ink-muted sm:text-[13px]">{hint}</span>
        {href ? (
          <Link href={href} className="absolute inset-0 rounded-2xl">
            <span className="sr-only">{linkLabel ?? label}</span>
          </Link>
        ) : null}
      </dd>
    </div>
  );
}

/** Booking-link clicks sit apart from the consultation counts: a click is not an appointment. */
export function BookingClicksStat({ value }: { value: number }) {
  return (
    <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-dashed border-line-strong/45 px-4 py-3 sm:px-5 xl:col-span-4">
      <dt className="flex items-center gap-2.5 text-[13px] font-medium text-ink-soft sm:text-sm">
        <span className="flex size-7 items-center justify-center rounded-lg bg-sunken text-ink-soft">
          <MousePointerClick aria-hidden strokeWidth={1.8} className="size-3.5" />
        </span>
        Booking-link clicks
      </dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-base font-semibold text-ink tabular-nums">{value}</span>
        <span className="text-xs text-ink-muted sm:text-[13px]">
          Homeowners who opened your scheduler. These aren&rsquo;t confirmed appointments.
        </span>
      </dd>
    </div>
  );
}

export function GettingStarted({ steps }: { steps: { label: ReactNode; done: boolean; action?: ReactNode }[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">Get your first inquiry</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Your page converts visitors you send to it – share it where people already find you.
          </p>
        </div>
        <div className="w-full sm:w-44">
          <p className="mb-1.5 text-xs font-medium text-ink-soft">
            <span className="tabular-nums">
              {done} of {steps.length}
            </span>{" "}
            done
          </p>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((step, i) => (
          <li key={i} className="flex min-h-14 items-center justify-between gap-3 px-5 py-2.5 sm:px-6">
            <span className="flex min-w-0 items-center gap-3 text-sm">
              {step.done ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
                </span>
              ) : (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-semibold text-ink-soft tabular-nums">
                  {i + 1}
                </span>
              )}
              <span className={step.done ? "text-ink-muted line-through decoration-line-strong" : "font-medium text-ink"}>
                {step.label}
                <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
              </span>
            </span>
            {!step.done && step.action ? <span className="shrink-0">{step.action}</span> : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const rowLink = "group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-sunken/40 sm:px-6";
const rowChevron =
  "hidden size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block";

export function FollowUpList({ tasks, now, timeZone }: { tasks: DueTask[]; now: Date; timeZone: string }) {
  const today = zonedDate(now, timeZone);
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => {
        const Icon = t.kind === "email" ? Mail : t.kind === "call" ? PhoneCall : t.kind === "text" ? MessageSquare : BellRing;
        const due = new Date(t.due_at);
        const dueToday = zonedDate(due, timeZone) === today;
        return (
          <li key={t.id}>
            <Link href={`/leads/${t.contact_id}${t.kind === "email" ? `?task=${t.id}#follow-up-email` : ""}`} className={rowLink}>
              <span
                aria-hidden
                className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-ink-soft sm:flex"
              >
                {initials(t.contact_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{t.contact_name}</span>
                <span className="block truncate text-[13px] text-ink-muted">{t.title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted"><Icon aria-hidden className="size-3" />{t.kind === "email" && t.email_status ? EMAIL_STATUS_LABELS[t.email_status] : TASK_KIND_LABELS[t.kind]}</span>
              </span>
              {due < now && !dueToday ? (
                <Badge tone="danger">Overdue · {formatShortDate(due, timeZone)}</Badge>
              ) : dueToday ? (
                <Badge tone="warning">Today · {formatTime(due, timeZone)}</Badge>
              ) : (
                <Badge>{formatShortDate(due, timeZone)}</Badge>
              )}
              <ChevronRight aria-hidden className={rowChevron} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ConsultationList({
  appointments,
  now,
  timeZone,
}: {
  appointments: UpcomingAppointment[];
  now: Date;
  timeZone: string;
}) {
  return (
    <ul className="divide-y divide-line">
      {appointments.map((a) => {
        const past = new Date(a.scheduled_at) < now;
        const tile = calendarTile(a.scheduled_at, timeZone);
        return (
          <li key={a.id}>
            <Link href={`/leads/${a.contact_id}`} className={rowLink}>
              <span
                aria-hidden
                className="flex w-11 shrink-0 flex-col items-center rounded-xl border border-line bg-canvas py-1.5 leading-none"
              >
                <span
                  className={`text-[10px] font-semibold tracking-[0.08em] uppercase ${past ? "text-ink-muted" : "text-accent-ink"}`}
                >
                  {tile.month}
                </span>
                <span className="mt-1 text-[17px] font-semibold text-ink tabular-nums">{tile.day}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{a.contact_name}</span>
                <span className="block truncate text-[13px] text-ink-muted">
                  <span className="sr-only">{formatDateTime(a.scheduled_at, timeZone)}</span>
                  <span aria-hidden>
                    {tile.weekday} · {formatTime(a.scheduled_at, timeZone)}
                  </span>
                </span>
              </span>
              {past ? <Badge tone="warning">Record outcome</Badge> : <Badge tone="info">Upcoming</Badge>}
              <ChevronRight aria-hidden className={rowChevron} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  plan_started: BellRing,
  plan_stopped: CircleCheck,
  inquiry_submitted: MessageSquare,
  repeat_inquiry_submitted: MessageSquarePlus,
  booking_link_clicked: MousePointerClick,
  email_unsubscribed: MailX,
  status_changed: ArrowRightLeft,
  marked_contacted: PhoneCall,
  note_added: StickyNote,
  task_created: BellRing,
  task_completed: CircleCheck,
  task_reopened: RotateCcw,
  appointment_recorded: CalendarClock,
  appointment_rescheduled: CalendarClock,
  appointment_status_changed: CalendarCheck,
  email_previewed: Mail,
  email_queued: Mail,
  campaign_published: Megaphone,
  campaign_unpublished: Megaphone,
  campaign_archived: Megaphone,
  lead_deleted: Trash2,
};

/** Recent events grouped by day in the agent's time zone. Homeowner actions use the accent tone. */
export function ActivityFeed({ events, now, timeZone }: { events: ActivityEvent[]; now: Date; timeZone: string }) {
  const days: { key: string; label: string; events: ActivityEvent[] }[] = [];
  for (const e of events) {
    const key = zonedDate(new Date(e.created_at), timeZone);
    const current = days.at(-1);
    if (current?.key === key) current.events.push(e);
    else days.push({ key, label: formatDayLabel(e.created_at, timeZone, now), events: [e] });
  }

  return (
    <div className="space-y-6 px-5 py-5 sm:px-6">
      {days.map((day) => (
        <div key={day.key}>
          <h3 className="mb-3 text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">{day.label}</h3>
          <ol>
            {day.events.map((e, i) => {
              const Icon = EVENT_ICONS[e.type] ?? Activity;
              const text = describeEvent(e, timeZone, true);
              return (
                <li key={e.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                  {i < day.events.length - 1 ? (
                    <span aria-hidden className="absolute top-9 bottom-0.5 left-4 w-px -translate-x-1/2 bg-line" />
                  ) : null}
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                      e.actor === "visitor" ? "bg-accent-soft text-accent-ink" : "bg-sunken text-ink-soft"
                    }`}
                  >
                    <Icon aria-hidden strokeWidth={1.8} className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    {e.contact_id ? (
                      <Link href={`/leads/${e.contact_id}`} className="min-w-0 text-sm text-ink hover:underline">
                        {text}
                      </Link>
                    ) : (
                      <span className="min-w-0 text-sm text-ink">{text}</span>
                    )}
                    <time
                      dateTime={new Date(e.created_at).toISOString()}
                      title={formatDateTime(e.created_at, timeZone)}
                      className="shrink-0 text-xs text-ink-muted tabular-nums"
                    >
                      {formatTime(e.created_at, timeZone)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
