import { ArrowLeft, Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { requireAgent } from "@/lib/auth/session";
import { getCampaign } from "@/lib/data/campaigns";
import { marketingConsentWording } from "@/lib/data/public";
import { asUser } from "@/lib/db";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/domain";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/**
 * Full-page preview of a campaign (including drafts), rendered with the same
 * component as the public page but with submissions turned off.
 */
export default async function CampaignPreviewPage({ params }: PageProps<"/campaign-preview/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { profile } = await requireAgent();
  const campaign = await asUser(profile.id, (tx) => getCampaign(tx, profile.id, id));
  if (!campaign) notFound();

  return (
    <LandingPage
      mode="preview"
      banner={
        <div className="sticky top-0 z-30 bg-ink text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
            <p className="flex items-center gap-2">
              <Eye aria-hidden className="size-4" />
              Preview · {CAMPAIGN_STATUS_LABELS[campaign.status]} · the form is turned off here
            </p>
            <Link
              href={`/campaigns/${campaign.id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 font-medium hover:bg-white/20"
            >
              <ArrowLeft aria-hidden className="size-4" /> Back to editor
            </Link>
          </div>
        </div>
      }
      form={{ slug: campaign.slug, token: "", utm: {}, consentWording: marketingConsentWording(profile.full_name) }}
      data={{
        campaign_id: campaign.id,
        slug: campaign.slug,
        headline: campaign.headline,
        description: campaign.description,
        hero_asset_id: campaign.hero_asset_id,
        cta_text: campaign.cta_text,
        thank_you_message: campaign.thank_you_message,
        booking_url: campaign.booking_url ?? profile.booking_url,
        agent_name: profile.full_name,
        brokerage: profile.brokerage,
        license_number: profile.license_number,
        contact_email: profile.contact_email,
        phone: profile.phone,
        headshot_asset_id: profile.headshot_asset_id,
        logo_asset_id: profile.logo_asset_id,
        primary_color: profile.primary_color,
        service_areas: profile.service_areas,
        intro: profile.intro,
        privacy_policy_url: profile.privacy_policy_url,
      }}
    />
  );
}
