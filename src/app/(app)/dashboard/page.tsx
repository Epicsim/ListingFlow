import { Activity, ArrowRight, BellRing, CalendarCheck, CalendarClock, MessageSquare, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import {
  ActivityFeed,
  BookingClicksStat,
  ConsultationList,
  FollowUpList,
  GettingStarted,
  StatCard,
} from "@/components/overview";
import { RangeFilter } from "@/components/range-filter";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/display";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { listRecentActivity } from "@/lib/data/activity";
import { listScheduledAppointments } from "@/lib/data/appointments";
import { getOverviewMetrics } from "@/lib/data/metrics";
import { listDueTasks } from "@/lib/data/tasks";
import { resolveRange } from "@/lib/date-range";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { profile } = await requireWorkspaceAgent();
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
  const todayLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(now);
  const gettingStarted = metrics.published_campaigns === 0 || metrics.total_leads === 0;

  return (
    <>
      <PageHeader
        eyebrow={todayLabel}
        title="Overview"
        description={`Welcome back, ${firstName}. Here’s what’s happening with your business.`}
        actions={
          <ButtonLink href="/campaigns/new">
            <Plus aria-hidden className="size-4" />
            Create campaign
          </ButtonLink>
        }
      />

      {gettingStarted ? (
        <GettingStarted
          steps={[
            { label: "Set up your profile", done: true },
            {
              label: "Create a seller page",
              done: metrics.total_campaigns > 0,
              action: <ButtonLink href="/campaigns/new" size="sm">Create a page</ButtonLink>,
            },
            {
              label: "Publish it",
              done: metrics.published_campaigns > 0,
              action: <ButtonLink href="/campaigns" size="sm" variant="secondary">Publish</ButtonLink>,
            },
            {
              label: "Share the link on Instagram, your website or ads",
              done: metrics.total_leads > 0,
              action:
                metrics.published_campaigns > 0 ? (
                  <ButtonLink href="/campaigns" size="sm" variant="secondary">Get links</ButtonLink>
                ) : undefined,
            },
          ]}
        />
      ) : null}

      <section aria-labelledby="performance-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <h2 id="performance-heading" className="text-[15px] font-semibold tracking-tight text-ink">
              Performance at a glance
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {range.label} · {tz.replace(/_/g, " ")}
            </p>
          </div>
          <RangeFilter range={range} />
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 [&>*]:min-w-0">
          <StatCard
            icon={MessageSquare}
            label="New inquiries"
            value={metrics.new_inquiries}
            hint={`${metrics.new_leads} new lead${metrics.new_leads === 1 ? "" : "s"}`}
            href="/leads"
            linkLabel="View leads"
          />
          <StatCard
            icon={Users}
            label="Awaiting follow-up"
            value={metrics.awaiting_follow_up}
            hint="Right now: new or follow-up due"
            href="/leads?view=needs_follow_up"
            linkLabel="View leads awaiting follow-up"
            attention={metrics.awaiting_follow_up > 0}
          />
          <StatCard
            icon={CalendarClock}
            label="Consultations booked"
            value={metrics.consultations_booked}
            hint="Recorded by you, excl. canceled"
          />
          <StatCard
            icon={CalendarCheck}
            label="Consultations attended"
            value={metrics.consultations_attended}
            hint="Marked attended"
          />
          <BookingClicksStat value={metrics.booking_clicks} />
        </dl>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="flex flex-col">
          <CardHeader
            title="Follow-ups due"
            description="Overdue and next 7 days"
            action={
              <ButtonLink href="/leads?view=needs_follow_up" size="sm" variant="ghost">
                View all <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            }
          />
          {tasks.length === 0 ? (
            <EmptyState compact icon={<BellRing />} title="Nothing due">
              Reminders you add on a lead&rsquo;s page show up here.
            </EmptyState>
          ) : (
            <FollowUpList tasks={tasks} now={now} timeZone={tz} />
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Scheduled consultations" description="Upcoming, and past ones waiting for an outcome" />
          {appointments.length === 0 ? (
            <EmptyState compact icon={<CalendarClock />} title="No consultations scheduled">
              When a homeowner books with you, record it on their lead page so it&rsquo;s counted here.
            </EmptyState>
          ) : (
            <>
              <ConsultationList appointments={appointments} now={now} timeZone={tz} />
              <p className="mt-auto border-t border-line px-5 py-3 text-xs text-ink-muted sm:px-6">
                Bookings made in your scheduler aren&rsquo;t imported automatically – record them on the lead&rsquo;s page.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity" description="New requests, booking-link clicks and your updates" />
        {activity.length === 0 ? (
          <EmptyState compact icon={<Activity />} title="No activity yet">
            New inquiries, booking-link clicks and your updates will appear here.
          </EmptyState>
        ) : (
          <ActivityFeed events={activity} now={now} timeZone={tz} />
        )}
      </Card>
    </>
  );
}
