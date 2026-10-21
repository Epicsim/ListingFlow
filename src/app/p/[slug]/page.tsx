import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { getAppSecret } from "@/lib/config";
import { marketingConsentWording } from "@/lib/data/public";
import { issueFormToken } from "@/lib/security/form-token";
import { readUtm } from "@/lib/utm";
import { loadPublicCampaign } from "./data";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPublicCampaign(slug);
  if (!data) return { title: "Page not available", robots: { index: false } };
  const description = data.description.replace(/\s+/g, " ").slice(0, 160);
  return {
    title: { absolute: `${data.headline} | ${data.agent_name}` },
    description,
    openGraph: { title: data.headline, description, type: "website" },
  };
}

export default async function PublicCampaignPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const data = await loadPublicCampaign(slug);
  if (!data) notFound();

  return (
    <LandingPage
      data={data}
      mode="live"
      form={{
        slug: data.slug,
        token: issueFormToken(data.campaign_id, await getAppSecret()),
        utm: readUtm(await searchParams),
        consentWording: marketingConsentWording(data.agent_name),
      }}
    />
  );
}
