import { Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LeadStatusBadge } from "@/components/status-badges";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { requireAgent } from "@/lib/auth/session";
import { listCampaignOptions } from "@/lib/data/campaigns";
import { LEADS_PAGE_SIZE, type LeadFilters, listLeadSources, listLeads } from "@/lib/data/leads";
import { asUser } from "@/lib/db";
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatus, TIMELINE_LABELS, TIMELINES, type Timeline } from "@/lib/domain";
import { formatShortDate } from "@/lib/time";
import { sourceLabel } from "@/lib/utm";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Leads" };

function pick(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim().slice(0, 200) : undefined;
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const { profile } = await requireAgent();
  const sp = await searchParams;
  const tz = profile.timezone;
  const now = new Date();

  const status = pick(sp.status);
  const timeline = pick(sp.timeline);
  const campaign = pick(sp.campaign);
  const filters: LeadFilters = {
    q: pick(sp.q),
    status: LEAD_STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : undefined,
    timeline: TIMELINES.includes(timeline as Timeline) ? (timeline as Timeline) : undefined,
    campaignId: campaign && uuidSchema.safeParse(campaign).success ? campaign : undefined,
    source: pick(sp.source),
    needsFollowUp: pick(sp.view) === "needs_follow_up",
    page: Math.max(1, Number(pick(sp.page)) || 1),
  };
  const filtering = Boolean(
    filters.q || filters.status || filters.timeline || filters.campaignId || filters.source || filters.needsFollowUp,
  );

  const { result, campaigns, sources } = await asUser(profile.id, async (tx) => ({
    result: await listLeads(tx, profile.id, filters, now),
    campaigns: await listCampaignOptions(tx, profile.id),
    sources: await listLeadSources(tx, profile.id),
  }));
  const pages = Math.max(1, Math.ceil(result.total / LEADS_PAGE_SIZE));

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = pick(v);
      if (val && k !== "page") params.set(k, val);
    }
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/leads?${qs}` : "/leads";
  };

  return (
    <>
      <PageHeader
        title="Leads"
        description="Homeowners who asked for an estimate. Repeat requests are grouped under the same person."
      />

      <Card className="mb-5">
        <form method="get" className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-[1.4fr_repeat(4,1fr)_auto] lg:items-end">
          <div className="col-span-2 lg:col-span-1">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-muted">
              Search
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
              <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Name, email, phone or address" className="input-base h-9 py-1.5 pl-9 text-sm" />
            </div>
          </div>
          <FilterSelect id="status" label="Status" value={filters.status}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="campaign" label="Campaign" value={filters.campaignId}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="source" label="Source" value={filters.source}>
            {sources.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="timeline" label="Timeline" value={filters.timeline}>
            {TIMELINES.map((t) => (
              <option key={t} value={t}>
                {TIMELINE_LABELS[t]}
              </option>
            ))}
          </FilterSelect>
          <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
            <button type="submit" className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">
              Apply
            </button>
            {filtering ? (
              <Link href="/leads" className="h-9 rounded-lg px-3 text-sm leading-9 text-ink-soft hover:bg-sunken">
                Clear
              </Link>
            ) : null}
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-ink-soft lg:col-span-6">
            <input type="checkbox" name="view" value="needs_follow_up" defaultChecked={filters.needsFollowUp} className="size-4 accent-[var(--color-accent)]" />
            Only leads that need follow-up (new, or a follow-up is due)
          </label>
        </form>
      </Card>

      {result.rows.length === 0 ? (
        <Card>
          {filtering ? (
            <EmptyState icon={<Search />} title="No leads match these filters" action={<ButtonLink href="/leads" variant="secondary">Clear filters</ButtonLink>}>
              Try a different search or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState icon={<Users />} title="No leads yet" action={<ButtonLink href="/campaigns">Share a campaign</ButtonLink>}>
              When a homeowner submits a request on one of your pages, they&rsquo;ll appear here.
            </EmptyState>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <p className="border-b border-line px-5 py-3 text-sm text-ink-muted" aria-live="polite">
            {result.total} lead{result.total === 1 ? "" : "s"}
            {filtering ? " match your filters" : ""}
          </p>

          {/* Mobile: cards */}
          <ul className="divide-y divide-line md:hidden">
            {result.rows.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`} className="block px-4 py-4 hover:bg-sunken/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.full_name}</p>
                      <p className="truncate text-sm text-ink-muted">{l.property_address}</p>
                    </div>
                    <LeadStatusBadge status={l.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                    <span>{TIMELINE_LABELS[l.timeline]}</span>
                    <span>{sourceLabel(l.source)}</span>
                    <span>{formatShortDate(l.last_inquiry_at, tz)}</span>
                    {l.needs_follow_up ? <Badge tone="warning">Needs follow-up</Badge> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Leads</caption>
              <thead className="border-b border-line bg-sunken/50 text-left text-xs font-medium tracking-wide text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3">Homeowner · property</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Timeline</th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">Source · campaign</th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">Last inquiry</th>
                  <th scope="col" className="px-5 py-3 whitespace-nowrap">Next follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map((l) => {
                  const overdue = l.next_follow_up_at && new Date(l.next_follow_up_at) <= now;
                  return (
                    <tr key={l.id} className="hover:bg-sunken/30">
                      <td className="max-w-[260px] px-5 py-3.5">
                        <Link href={`/leads/${l.id}`} className="block truncate font-medium text-ink hover:underline">
                          {l.full_name}
                        </Link>
                        <span className="block truncate text-xs text-ink-muted" title={l.property_address}>
                          {l.property_address}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <LeadStatusBadge status={l.status} />
                          {l.inquiry_count > 1 ? <span className="text-xs text-ink-muted">{l.inquiry_count} inquiries</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-ink-soft">{TIMELINE_LABELS[l.timeline]}</td>
                      <td className="max-w-[200px] px-3 py-3.5">
                        <span className="block truncate">{sourceLabel(l.source)}</span>
                        <span className="block truncate text-xs text-ink-muted">{l.campaign_name}</span>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-ink-soft">{formatShortDate(l.last_inquiry_at, tz)}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {l.next_follow_up_at ? (
                          <Badge tone={overdue ? "warning" : "neutral"}>
                            {overdue ? "Due " : ""}
                            {formatShortDate(l.next_follow_up_at, tz)}
                          </Badge>
                        ) : l.status === "new" ? (
                          <Badge tone="info">Respond</Badge>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
              <span className="text-ink-muted">
                Page {filters.page} of {pages}
              </span>
              <div className="flex gap-2">
                {filters.page! > 1 ? (
                  <ButtonLink href={pageHref(filters.page! - 1)} variant="secondary" size="sm">
                    Previous
                  </ButtonLink>
                ) : null}
                {filters.page! < pages ? (
                  <ButtonLink href={pageHref(filters.page! + 1)} variant="secondary" size="sm">
                    Next
                  </ButtonLink>
                ) : null}
              </div>
            </nav>
          ) : null}
        </Card>
      )}
    </>
  );
}

function FilterSelect({ id, label, value, children }: { id: string; label: string; value?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <select id={id} name={id} defaultValue={value ?? ""} className="input-base h-9 py-1.5 pr-8 text-sm">
        <option value="">All</option>
        {children}
      </select>
    </div>
  );
}
