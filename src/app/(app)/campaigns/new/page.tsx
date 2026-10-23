import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { CampaignForm } from "@/components/campaign-form";
import { Notice, PageHeader } from "@/components/ui/display";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { STARTER_CAMPAIGN } from "@/lib/domain";
import { requestOrigin } from "@/lib/request-origin";
import { suggestCampaignSlug } from "@/lib/slug";
import { createCampaignAction } from "../actions";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const { profile } = await requireWorkspaceAgent();
  const welcome = (await searchParams).welcome === "1";
  const origin = await requestOrigin();

  return (
    <>
      <PageHeader
        eyebrow={welcome ? "Step 2 of 2 · Your first seller page" : "Campaigns"}
        title={welcome ? "Create your first seller page" : "New campaign"}
        description="Edit the starter copy, then publish to get a shareable link."
      />
      {welcome ? (
        <Notice tone="accent" icon={<Sparkles />} className="mb-5">
          Your profile is saved. We&rsquo;ve filled in starter copy – adjust anything, then choose{" "}
          <strong>Save and publish</strong>.
        </Notice>
      ) : null}
      <CampaignForm
        action={createCampaignAction}
        origin={origin}
        defaultBookingUrl={profile.booking_url}
        defaults={{
          name: STARTER_CAMPAIGN.name,
          slug: suggestCampaignSlug(profile.full_name, STARTER_CAMPAIGN.name),
          headline: STARTER_CAMPAIGN.headline,
          description: STARTER_CAMPAIGN.description,
          cta_text: STARTER_CAMPAIGN.cta_text,
          thank_you_message: STARTER_CAMPAIGN.thank_you_message,
          booking_url: "",
        }}
      />
    </>
  );
}
