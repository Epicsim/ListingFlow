import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanForm, PlanStepForm } from "@/components/plan-forms";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/display";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { listCampaignOptions } from "@/lib/data/campaigns";
import { getPlanSteps, listPlans } from "@/lib/data/plans";
import { getTemplates } from "@/lib/data/templates";
import { asUser } from "@/lib/db";
import { TASK_KIND_LABELS } from "@/lib/follow-up-plans";
import { uuidSchema } from "@/lib/validation";
import { SettingsTabs } from "../../settings-tabs";
import { planOperationAction } from "../actions";
export const metadata: Metadata = { title: "Edit follow-up plan" };
export default async function EditPlanPage({ params }: PageProps<"/settings/follow-up-plans/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { profile } = await requireWorkspaceAgent();
  const { plans, steps, campaigns, templates } = await asUser(profile.id, async (tx) => ({ plans: await listPlans(tx, profile.id), steps: await getPlanSteps(tx, profile.id, id), campaigns: await listCampaignOptions(tx, profile.id), templates: await getTemplates(tx, profile.id) }));
  const plan = plans.find((p) => p.id === id);
  if (!plan) notFound();
  return <><PageHeader title={plan.name} description="Plans create reminders and drafts. Nothing is sent until you press Send." actions={<ButtonLink href="/settings/follow-up-plans" variant="secondary">All plans</ButtonLink>} /><SettingsTabs />
    <div className="max-w-3xl space-y-6"><Card><CardHeader title="Plan settings" /><div className="p-5"><PlanForm plan={plan} campaigns={campaigns} /></div></Card>
      <Card><CardHeader title={`Steps (${steps.length}/12)`} description="Day 0 is immediate. Later days are due at 9am in your time zone, including weekends. Changes apply to future enrollments." />
        <ol className="divide-y divide-line">{steps.map((s) => <li key={s.id} className="p-5"><details><summary className="cursor-pointer text-sm font-medium">Day {s.day_offset} · {TASK_KIND_LABELS[s.kind]} · {s.title ?? s.email_subject}</summary>
          <div className="mt-4"><PlanStepForm planId={id} step={s} template={templates.follow_up} /></div>
          <ActionForm action={planOperationAction} className="mt-4"><input type="hidden" name="plan_id" value={id} /><input type="hidden" name="step_id" value={s.id} /><SubmitButton name="operation" value="delete_step" size="sm" variant="danger">Delete step</SubmitButton></ActionForm>
        </details></li>)}</ol>
        {steps.length < 12 ? <div className="border-t border-line p-5"><h2 className="mb-4 font-semibold">Add a step</h2><PlanStepForm key={steps.map((s) => s.id).join(":")} planId={id} template={templates.follow_up} /></div> : null}
      </Card>
      <Card><CardHeader title="Delete plan" description="Existing enrollments and their copied steps continue. This removes the plan from future use." /><ActionForm action={planOperationAction} className="p-5"><input type="hidden" name="plan_id" value={id} /><SubmitButton name="operation" value="delete" variant="danger" size="sm">Delete plan</SubmitButton></ActionForm></Card>
    </div></>;
}
