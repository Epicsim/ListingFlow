import { ChartNoAxesColumn } from "lucide-react";
import type { Metadata } from "next";
import { RangeFilter } from "@/components/range-filter";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/display";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { getChannelReport } from "@/lib/data/channel-report";
import { resolveRange } from "@/lib/date-range";
import { asUser } from "@/lib/db";
import { sourceLabel } from "@/lib/utm";

export const metadata: Metadata = { title: "Channel report" };

const COUNTS = [
  { key: "inquiries", label: "Inquiries" },
  { key: "homeowners", label: "Homeowners" },
  { key: "booking_clicks", label: "Booking clicks" },
  { key: "consultations", label: "Consultations" },
  { key: "attended", label: "Attended consultations" },
  { key: "won", label: "Listings won" },
] as const;

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { profile } = await requireWorkspaceAgent();
  const params = await searchParams;
  const tz = profile.timezone;
  const range = resolveRange(
    {
      range: typeof params.range === "string" ? params.range : undefined,
      from: typeof params.from === "string" ? params.from : undefined,
      to: typeof params.to === "string" ? params.to : undefined,
    },
    tz,
    new Date(),
  );
  const rows = await asUser(profile.id, (tx) => getChannelReport(tx, profile.id, range));
  const totals = COUNTS.map(({ key }) => rows.reduce((sum, row) => sum + row[key], 0));

  return (
    <div className="min-w-0">
      <PageHeader
        title="Channel report"
        description="See which channels lead to consultations and signed listings."
      />

      <section aria-labelledby="channels-heading" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h2 id="channels-heading" className="text-[15px] font-semibold tracking-tight text-ink">
              Performance by channel
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {range.label} · {tz.replace(/_/g, " ")}
            </p>
          </div>
          <RangeFilter range={range} />
        </div>

        <p className="text-sm text-ink-soft">Each homeowner is credited to the channel of their first inquiry.</p>
        <p id="report-period" className="mt-1 mb-5 max-w-3xl text-sm text-ink-muted">
          The period selects homeowners by their first inquiry date. Their later activity is included, even outside
          this period. Inquiries include repeat requests, counted under the channel where each was submitted.
        </p>

        <Card className="min-w-0 max-w-full">
          <CardHeader
            title="Channel outcomes"
            description="Booking clicks are separate from consultations. Canceled consultations are excluded."
          />
          {rows.length === 0 ? (
            <EmptyState
              icon={<ChartNoAxesColumn />}
              title="No homeowners first inquired in this period"
              action={<ButtonLink href="/campaigns">Get campaign links</ButtonLink>}
            >
              Share tracked links from a campaign page to see which channels bring inquiries and consultations.
              You can also choose a wider date range.
            </EmptyState>
          ) : (
            <>
              <p id="report-scroll" className="px-5 pt-4 text-xs text-ink-muted sm:px-6 lg:hidden">
                Scroll the table to see all outcomes.
              </p>
              <div
                role="region"
                aria-label="Channel outcomes table"
                aria-describedby="report-period report-scroll"
                tabIndex={0}
                className="max-w-full overflow-x-auto rounded-b-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <table className="w-full min-w-[900px] text-sm">
                  <caption className="sr-only">Channel outcomes for homeowners first inquiring in {range.label}</caption>
                  <thead className="border-b border-line bg-sunken/50 text-xs font-medium text-ink-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 text-left sm:px-6">Channel</th>
                      {COUNTS.map(({ key, label }) => (
                        <th key={key} scope="col" className="px-4 py-3 text-right">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row) => (
                      <tr key={row.channel} className="hover:bg-sunken/30">
                        <th scope="row" className="max-w-64 px-5 py-4 text-left font-medium break-words text-ink sm:px-6">
                          {row.channel === "direct" ? "Direct / untracked link" : sourceLabel(row.channel)}
                          {row.utm_source_hint ? (
                            <span className="mt-1 block text-xs font-normal text-ink-muted">UTM source: {row.utm_source_hint}</span>
                          ) : null}
                        </th>
                        {COUNTS.map(({ key }) => (
                          <td key={key} className="px-4 py-4 text-right tabular-nums text-ink">{row[key].toLocaleString("en-US")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-line bg-sunken/50 font-semibold text-ink">
                    <tr>
                      <th scope="row" className="px-5 py-4 text-left sm:px-6">Total</th>
                      {COUNTS.map(({ key }, index) => (
                        <td key={key} className="px-4 py-4 text-right tabular-nums">{totals[index].toLocaleString("en-US")}</td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </Card>
        <p className="mt-3 text-xs text-ink-muted">
          Clicks and consultations count stored records linked to these homeowners. Listings won counts homeowners
          currently marked &ldquo;Won – listing signed&rdquo;.
        </p>
      </section>
    </div>
  );
}
