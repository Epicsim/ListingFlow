import { Archive, ArrowLeft, CheckCircle2, ExternalLink, Eye, RotateCcw, Send, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignForm } from "@/components/campaign-form";
import { ShareLinks } from "@/components/share-links";
import { CampaignStatusBadge } from "@/components/status-badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, Notice, PageHeader } from "@/components/ui/display";
import { requireAgent } from "@/lib/auth/session";
import { getCampaign, listCampaignsWithStats } from "@/lib/data/campaigns";
import { asUser } from "@/lib/db";
import type { CampaignStatus } from "@/lib/domain";
import { assetUrl } from "@/lib/images";
import { requestOrigin } from "@/lib/request-origin";
import { formatDate } from "@/lib/time";
import { buildCampaignUrl } from "@/lib/utm";
import { uuidSchema } from "@/lib/validation";
import { setCampaignStatusAction, updateCampaignAction } from "../actions";

export const metadata: Metadata = { title: "Edit campaign" };

function StatusButton({
  id,
  status,
  children,
  variant = "secondary",
}: {
  id: string;
  status: CampaignStatus;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <form action={setCampaignStatusAction}>
      <input type="hidden" name="campaign_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant}>
        {children}
      </Button>
    </form>
  );
}

export default async function CampaignPage({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { profile } = await requireAgent();
  const [campaign, stats, origin] = await Promise.all([
    asUser(profile.id, (tx) => getCampaign(tx, profile.id, id)),
    asUser(profile.id, (tx) => listCampaignsWithStats(tx, profile.id)),
    requestOrigin(),
  ]);
  if (!campaign) notFound();
  const stat = stats.find((s) => s.id === campaign.id);
  const liveUrl = buildCampaignUrl(origin, campaign.slug);
  const published = campaign.status === "published";

  return (
    <>
      <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> All campaigns
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name} <CampaignStatusBadge status={campaign.status} />
          </span>
        }
        description={
          published && campaign.published_at
            ? `Live since ${formatDate(campaign.published_at, profile.timezone)}.`
            : campaign.status === "draft"
              ? "Draft – only you can see it. Publish to start collecting inquiries."
              : "Archived – the public page is offline and its link no longer accepts requests."
        }
        actions={
          <>
            <ButtonLink href={`/campaign-preview/${campaign.id}`} variant="secondary">
              <Eye aria-hidden className="size-4" /> Preview
            </ButtonLink>
            {published ? (
              <>
                <ButtonLink href={liveUrl} variant="secondary" target="_blank" rel="noopener">
                  <ExternalLink aria-hidden className="size-4" /> Open live page
                </ButtonLink>
                <StatusButton id={campaign.id} status="draft" variant="ghost">
                  <Undo2 aria-hidden className="size-4" /> Unpublish
                </StatusButton>
              </>
            ) : null}
            {campaign.status === "draft" ? (
              <StatusButton id={campaign.id} status="published" variant="primary">
                <Send aria-hidden className="size-4" /> Publish
              </StatusButton>
            ) : null}
            {campaign.status === "archived" ? (
              <StatusButton id={campaign.id} status="draft">
                <RotateCcw aria-hidden className="size-4" /> Restore as draft
              </StatusButton>
            ) : (
              <StatusButton id={campaign.id} status="archived" variant="ghost">
                <Archive aria-hidden className="size-4" /> Archive
              </StatusButton>
            )}
          </>
        }
      />

      {query.published === "1" && published ? (
        <Notice tone="accent" icon={<CheckCircle2 />} className="mb-5" title="Your page is live">
          Copy a tracked link below and add it to your Instagram bio, website or ads. Inquiries appear under Leads.
        </Notice>
      ) : null}
      {query.created === "1" && !published ? (
        <Notice tone="info" className="mb-5">
          Saved as a draft. Preview it, then publish when you&rsquo;re ready.
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <div className="order-2 xl:order-1">
          <CampaignForm
            action={updateCampaignAction}
            campaignId={campaign.id}
            origin={origin}
            heroUrl={assetUrl(campaign.hero_asset_id)}
            defaultBookingUrl={profile.booking_url}
            isPublished={published}
            defaults={{
              name: campaign.name,
              slug: campaign.slug,
              headline: campaign.headline,
              description: campaign.description,
              cta_text: campaign.cta_text,
              thank_you_message: campaign.thank_you_message,
              booking_url: campaign.booking_url ?? "",
            }}
          />
        </div>
        <div className="order-1 space-y-6 xl:order-2">
          <Card>
            <CardHeader title="Results" description="From stored inquiries and recorded consultations." />
            <dl className="grid grid-cols-2 gap-px bg-line">
              {[
                ["Inquiries", stat?.inquiries ?? 0],
                ["Leads", stat?.leads ?? 0],
                ["Consultations", stat?.consultations_booked ?? 0],
                ["Attended", stat?.consultations_attended ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface px-5 py-4">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">
              Booking-link clicks: {stat?.booking_clicks ?? 0} (not confirmed appointments)
            </p>
          </Card>
          <Card>
            <CardHeader
              title="Share"
              description={published ? "Use a tracked link per channel to see what works." : "Publish to get a working link."}
            />
            <div className="p-5">
              {published ? (
                <ShareLinks origin={origin} slug={campaign.slug} />
              ) : (
                <p className="text-sm text-ink-muted">
                  This page isn&rsquo;t public yet, so its link won&rsquo;t work for visitors. You can still{" "}
                  <Link href={`/campaign-preview/${campaign.id}`} className="text-accent underline-offset-4 hover:underline">
                    preview it
                  </Link>
                  .
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
