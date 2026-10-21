import { Eye, Megaphone, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CampaignStatusBadge } from "@/components/status-badges";
import { ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Card, EmptyState, PageHeader } from "@/components/ui/display";
import { requireAgent } from "@/lib/auth/session";
import { listCampaignsWithStats } from "@/lib/data/campaigns";
import { asUser } from "@/lib/db";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/time";
import { buildCampaignUrl } from "@/lib/utm";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { profile } = await requireAgent();
  const [campaigns, origin] = await Promise.all([
    asUser(profile.id, (tx) => listCampaignsWithStats(tx, profile.id)),
    requestOrigin(),
  ]);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Each campaign is a seller landing page with its own link. Share it wherever your audience already is."
        actions={
          <ButtonLink href="/campaigns/new">
            <Plus aria-hidden className="size-4" /> New campaign
          </ButtonLink>
        }
      />

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone />}
            title="No campaigns yet"
            action={<ButtonLink href="/campaigns/new">Create your first campaign</ButtonLink>}
          >
            Start from ready-to-edit copy, publish, then add the link to your Instagram bio, website or ads.
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Phones and tablets: one card per campaign */}
          <ul className="divide-y divide-line xl:hidden">
            {campaigns.map((c) => (
              <li key={c.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/campaigns/${c.id}`} className="min-w-0 font-medium text-ink hover:underline">
                    {c.name}
                  </Link>
                  <CampaignStatusBadge status={c.status} />
                </div>
                <dl className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Inquiries", c.inquiries],
                    ["Leads", c.leads],
                    ["Consults", c.consultations_booked],
                    ["Attended", c.consultations_attended],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-sunken/60 px-1 py-2">
                      <dt className="text-[11px] text-ink-muted">{label}</dt>
                      <dd className="text-base font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-ink-muted">Booking-link clicks: {c.booking_clicks} (not confirmed appointments)</p>
                <div className="flex flex-wrap gap-2">
                  {c.status === "published" ? <CopyButton value={buildCampaignUrl(origin, c.slug)} label="Copy link" /> : null}
                  <ButtonLink href={`/campaign-preview/${c.id}`} variant="secondary" size="sm">
                    <Eye aria-hidden className="size-4" /> Preview
                  </ButtonLink>
                  <ButtonLink href={`/campaigns/${c.id}`} variant="secondary" size="sm">
                    <Pencil aria-hidden className="size-4" /> Edit
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>

          {/* Wide screens: comparison table */}
          <div className="relative hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Campaigns and their results</caption>
              <thead className="border-b border-line bg-sunken/50 text-left text-xs font-medium tracking-wide text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="w-[34%] px-5 py-3">Campaign</th>
                  <th scope="col" className="px-3 py-3 text-right">Inquiries</th>
                  <th scope="col" className="px-3 py-3 text-right">Leads</th>
                  <th scope="col" className="px-3 py-3 text-right" title="Clicks on the booking link. Not confirmed appointments.">
                    Booking clicks
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">Consultations</th>
                  <th scope="col" className="px-3 py-3 text-right">Attended</th>
                  <th scope="col" className="px-5 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaigns.map((c) => (
                  <tr key={c.id} className="align-middle hover:bg-sunken/30">
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/campaigns/${c.id}`} className="font-medium text-ink hover:underline">
                          {c.name}
                        </Link>
                        <CampaignStatusBadge status={c.status} />
                      </div>
                      <p className="mt-0.5 max-w-[320px] truncate text-xs text-ink-muted" title={`/p/${c.slug}`}>
                        /p/{c.slug}
                      </p>
                      <p className="text-xs text-ink-muted">Created {formatDate(c.created_at, profile.timezone)}</p>
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">{c.inquiries}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{c.leads}</td>
                    <td className="px-3 py-4 text-right tabular-nums text-ink-muted">{c.booking_clicks}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{c.consultations_booked}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{c.consultations_attended}</td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        {c.status === "published" ? (
                          <CopyButton value={buildCampaignUrl(origin, c.slug)} label="Copy link" />
                        ) : null}
                        <ButtonLink href={`/campaign-preview/${c.id}`} variant="ghost" size="sm" aria-label={`Preview ${c.name}`}>
                          <Eye aria-hidden className="size-4" />
                          <span className="hidden xl:inline">Preview</span>
                        </ButtonLink>
                        <ButtonLink href={`/campaigns/${c.id}`} variant="ghost" size="sm" aria-label={`Edit ${c.name}`}>
                          <Pencil aria-hidden className="size-4" />
                          <span className="hidden xl:inline">Edit</span>
                        </ButtonLink>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hidden border-t border-line px-5 py-3 text-xs text-ink-muted xl:block">
            Consultations are the ones you record on a lead (canceled ones excluded). Booking clicks only mean someone
            opened your scheduler.
          </p>
        </Card>
      )}
    </>
  );
}
