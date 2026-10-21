import { Activity, ArrowRight, BellRing, CalendarClock, Check, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { RangeFilter } from "@/components/range-filter";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/display";
import { describeEvent } from "@/lib/activity-text";
import { requireAgent } from "@/lib/auth/session";
import { listRecentActivity } from "@/lib/data/activity";
import { listScheduledAppointments } from "@/lib/data/appointments";
import { getOverviewMetrics } from "@/lib/data/metrics";
import { listDueTasks } from "@/lib/data/tasks";
import { resolveRange } from "@/lib/date-range";
import { asUser } from "@/lib/db";
import { formatDateTime, formatShortDate, formatTime, zonedDate } from "@/lib/time";

export const metadata: Metadata = { title: "Overview" };

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  href?: string;
}) {
  const body = (
    <>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </>
  );
  return (
    <div className="rounded-xl border border-line bg-surface shadow-card">
      {href ? (
        <Link href={href} className="block h-full rounded-xl p-5 hover:bg-sunken/30">
          {body}
        </Link>
      ) : (
        <div className="p-5">{body}</div>
      )}
    </div>
  );
}

function ChecklistItem({ done, children, action }: { done: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className={`flex items-center gap-3 text-sm ${done ? "text-ink-muted line-through" : "text-ink"}`}>
        {done ? (
          <Check aria-hidden className="size-5 rounded-full bg-accent p-0.5 text-white" />
        ) : (
          <Circle aria-hidden className="size-5 text-line-strong" />
        )}
        <span>
          {children}
          <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
        </span>
      </span>
      {!done && action ? action : null}
    </li>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { profile } = await requireAgent();
  const params = await searchParams;
  const tz = profile.timezone;
  const now = new Date();
  const range = resolveRange(
    {
      range: typeof params.range === "string" ? params.range : undefined,
      from: typeof params.from === "string" ? params.from : undefined,
      to: typeof params.to === "string" ? params.to : undefined,
    },
    tz,
    now,
  );

  const { metrics, tasks, appointments, activity } = await asUser(profile.id, async (tx) => ({
    metrics: await getOverviewMetrics(tx, profile.id, range, now),
    tasks: await listDueTasks(tx, profile.id, now, 7, 8),
    appointments: await listScheduledAppointments(tx, profile.id, 6),
    activity: await listRecentActivity(tx, profile.id, 12),
  }));

  const firstName = profile.full_name.split(/\s+/)[0];
  const today = zonedDate(now, tz);
  const gettingStarted = metrics.published_campaigns === 0 || metrics.total_leads === 0;

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName}`}
        description={`Showing ${range.label.toLowerCase()} · times in ${tz.replace(/_/g, " ")}`}
        actions={<RangeFilter range={range} />}
      />

      {gettingStarted ? (
        <Card className="mb-6">
          <CardHeader
            title="Get your first inquiry"
            description="Your page converts visitors you send to it – share it where people already find you."
          />
          <ul className="divide-y divide-line px-5">
            <ChecklistItem done>Set up your profile</ChecklistItem>
            <ChecklistItem
              done={metrics.total_campaigns > 0}
              action={<ButtonLink href="/campaigns/new" size="sm">Create a page</ButtonLink>}
            >
              Create a seller page
            </ChecklistItem>
            <ChecklistItem
              done={metrics.published_campaigns > 0}
              action={<ButtonLink href="/campaigns" size="sm" variant="secondary">Publish</ButtonLink>}
            >
              Publish it
            </ChecklistItem>
            <ChecklistItem
              done={metrics.total_leads > 0}
              action={
                metrics.published_campaigns > 0 ? (
                  <ButtonLink href="/campaigns" size="sm" variant="secondary">Get links</ButtonLink>
                ) : undefined
              }
            >
              Share the link on Instagram, your website or ads
            </ChecklistItem>
          </ul>
        </Card>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="New inquiries" value={metrics.new_inquiries} hint={`${metrics.new_leads} new lead${metrics.new_leads === 1 ? "" : "s"}`} href="/leads" />
        <Stat
          label="Awaiting follow-up"
          value={metrics.awaiting_follow_up}
          hint="Right now: new or follow-up due"
          href="/leads?view=needs_follow_up"
        />
        <Stat label="Consultations booked" value={metrics.consultations_booked} hint="Recorded by you, excl. canceled" />
        <Stat label="Consultations attended" value={metrics.consultations_attended} hint="Marked attended" />
      </dl>
      <p className="mt-3 text-sm text-ink-muted">
        Booking-link clicks: <span className="font-medium text-ink tabular-nums">{metrics.booking_clicks}</span>{" "}
        <span className="text-xs">– homeowners who opened your scheduler. These aren&rsquo;t confirmed appointments.</span>
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader
            title="Follow-ups due"
            description="Overdue and next 7 days"
            action={<ButtonLink href="/leads?view=needs_follow_up" size="sm" variant="ghost">All <ArrowRight aria-hidden className="size-4" /></ButtonLink>}
          />
          {tasks.length === 0 ? (
            <EmptyState compact icon={<BellRing />} title="Nothing due">
              Reminders you add on a lead&rsquo;s page show up here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {tasks.map((t) => {
                const overdue = new Date(t.due_at) < now;
                const dueToday = zonedDate(new Date(t.due_at), tz) === today;
                return (
                  <li key={t.id}>
                    <Link href={`/leads/${t.contact_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sunken/30">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{t.contact_name}</span>
                        <span className="block truncate text-sm text-ink-muted">{t.title}</span>
                      </span>
                      {overdue && !dueToday ? (
                        <Badge tone="danger">Overdue · {formatShortDate(t.due_at, tz)}</Badge>
                      ) : dueToday ? (
                        <Badge tone="warning">Today · {formatTime(t.due_at, tz)}</Badge>
                      ) : (
                        <Badge>{formatShortDate(t.due_at, tz)}</Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Scheduled consultations" description="Upcoming, and past ones waiting for an outcome" />
          {appointments.length === 0 ? (
            <EmptyState compact icon={<CalendarClock />} title="No consultations scheduled">
              When a homeowner books with you, record it on their lead page so it&rsquo;s counted here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {appointments.map((a) => {
                const past = new Date(a.scheduled_at) < now;
                return (
                  <li key={a.id}>
                    <Link href={`/leads/${a.contact_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sunken/30">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{a.contact_name}</span>
                        <span className="block text-sm text-ink-muted">{formatDateTime(a.scheduled_at, tz)}</span>
                      </span>
                      {past ? <Badge tone="warning">Record outcome</Badge> : <Badge tone="info">Upcoming</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity" />
        {activity.length === 0 ? (
          <EmptyState compact icon={<Activity />} title="No activity yet">
            New inquiries, booking-link clicks and your updates will appear here.
          </EmptyState>
        ) : (
          <ol className="divide-y divide-line">
            {activity.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                {e.contact_id ? (
                  <Link href={`/leads/${e.contact_id}`} className="min-w-0 text-sm text-ink hover:underline">
                    {describeEvent(e, tz, true)}
                  </Link>
                ) : (
                  <span className="min-w-0 text-sm text-ink">{describeEvent(e, tz, true)}</span>
                )}
                <time dateTime={new Date(e.created_at).toISOString()} className="shrink-0 text-xs text-ink-muted">
                  {formatDateTime(e.created_at, tz)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
