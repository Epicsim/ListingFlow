import type { Metadata } from "next";
import { PlanForm } from "@/components/plan-forms";
import { Card, CardHeader, PageHeader } from "@/components/ui/display";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { listCampaignOptions } from "@/lib/data/campaigns";
import { asUser } from "@/lib/db";
import { SettingsTabs } from "../../settings-tabs";
export const metadata: Metadata = { title: "New follow-up plan" };
export default async function NewPlanPage() {
  const { profile } = await requireWorkspaceAgent();
  const campaigns = await asUser(profile.id, (tx) => listCampaignOptions(tx, profile.id));
  return <><PageHeader title="New follow-up plan" description="Plans create reminders and drafts. Nothing is sent until you press Send." /><SettingsTabs />
    <Card className="max-w-3xl"><CardHeader title="Who this plan applies to" description="Up to 20 plans. Add steps after creating the plan." /><div className="p-5"><PlanForm campaigns={campaigns} /></div></Card></>;
}
