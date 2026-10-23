import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/display";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { listPlans } from "@/lib/data/plans";
import { asUser } from "@/lib/db";
import { TIMELINE_LABELS } from "@/lib/domain";
import { SettingsTabs } from "../settings-tabs";
import { planOperationAction } from "./actions";
export const metadata: Metadata = { title: "Follow-up plans" };
export default async function PlansPage() {
  const { profile } = await requireWorkspaceAgent();
  const plans = await asUser(profile.id, (tx) => listPlans(tx, profile.id));
  return <><PageHeader title="Settings" description="Plans create reminders and drafts. Nothing is sent until you press Send." actions={<ButtonLink href="/settings/follow-up-plans/new">New plan</ButtonLink>} /><SettingsTabs />
    <Card><CardHeader title="Follow-up plans" description="Plans are checked from top to bottom; the first match is used." />
      {plans.length ? <ol className="divide-y divide-line">{plans.map((p, i) => <li key={p.id} className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2"><Link href={`/settings/follow-up-plans/${p.id}`} className="font-semibold break-words hover:underline">{p.name}</Link><Badge tone={p.is_active ? "info" : "neutral"}>{p.is_active ? "On" : "Off"}</Badge></div>
        <p className="text-sm text-ink-muted">{p.timelines.map((t) => TIMELINE_LABELS[t]).join(" or ")} · {p.campaign_name ?? "All campaigns"} · {p.step_count} steps</p>
        <ActionForm action={planOperationAction} className="flex flex-wrap gap-2"><input type="hidden" name="plan_id" value={p.id} />
          <SubmitButton name="operation" value="toggle" variant="secondary" size="sm">Turn {p.is_active ? "off" : "on"}</SubmitButton>
          <SubmitButton name="operation" value="up" variant="ghost" size="sm" disabled={i === 0}>Move up</SubmitButton>
          <SubmitButton name="operation" value="down" variant="ghost" size="sm" disabled={i === plans.length - 1}>Move down</SubmitButton>
        </ActionForm>
      </li>)}</ol> : <div className="p-5"><EmptyState title="Build your first follow-up plan">Choose when to call, review a draft or send a text yourself. Review the starter plans before switching them on.</EmptyState>
        <ActionForm action={planOperationAction} className="mt-4"><SubmitButton name="operation" value="starters">Add starter plans</SubmitButton></ActionForm></div>}
    </Card></>;
}
