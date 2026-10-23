import type { Tx } from "@/lib/db/types";
import type { Timeline } from "@/lib/domain";
import { renderTemplate, firstName } from "@/lib/email/templates";
import { templateValuesFor } from "@/lib/email/messages";
import { CONSENT_REQUIRED_AFTER_DAYS, MAX_PLANS, planDueAt, planSchema, planStepSchema, STARTER_PLANS, stepLimitError, type PlanInput, type PlanStepInput, type StepKind } from "@/lib/follow-up-plans";
import { getProfile } from "./profiles";
import { getContact } from "./leads";

export class PlanError extends Error {}
export interface FollowUpPlan extends PlanInput { id: string; position: number; campaign_name: string | null; step_count: number }
export interface PlanStep extends PlanStepInput { id: string }
export interface SkippedStep { day_offset: number; title: string; reason: "no_marketing_consent" | "unsubscribed" }
export interface Enrollment { id: string; plan_name: string; status: "active" | "completed" | "stopped"; stop_reason: string | null; started_at: Date; skipped_steps: SkippedStep[] }

export async function listPlans(tx: Tx, agentId: string): Promise<FollowUpPlan[]> {
  return tx.query<FollowUpPlan>(`select p.id, p.name, p.is_active, p.position, p.timelines, p.campaign_id,
    c.name as campaign_name, (select count(*)::int from public.follow_up_plan_steps s where s.plan_id = p.id) as step_count
    from public.follow_up_plans p left join public.campaigns c on c.id = p.campaign_id and c.agent_id = p.agent_id
    where p.agent_id = $1::uuid order by p.position, p.created_at, p.id`, [agentId]);
}
export async function getPlanSteps(tx: Tx, agentId: string, planId: string): Promise<PlanStep[]> {
  return tx.query<PlanStep>(`select id, day_offset, kind, title, text_message, email_subject, email_body
    from public.follow_up_plan_steps where plan_id = $1::uuid and agent_id = $2::uuid order by day_offset, kind, id`, [planId, agentId]);
}
export async function savePlan(tx: Tx, agentId: string, input: PlanInput, id?: string): Promise<string> {
  const plan = planSchema.parse(input);
  // A stable per-agent lock enforces the plan limit across tabs and servers.
  await tx.query(`select id from public.agent_profiles where id = $1::uuid for update`, [agentId]);
  if (!id && (await listPlans(tx, agentId)).length >= MAX_PLANS) throw new PlanError("You can have up to 20 plans. Delete a plan before adding another.");
  const params = [agentId, plan.name, plan.is_active, JSON.stringify([...new Set(plan.timelines)]), plan.campaign_id];
  const timelines = `array(select jsonb_array_elements_text($4::text::jsonb))`;
  const rows = id
    ? await tx.query<{ id: string }>(`update public.follow_up_plans set name = $2::text, is_active = $3::boolean,
      timelines = ${timelines}, campaign_id = $5::uuid where agent_id = $1::uuid and id = $6::uuid returning id`, [...params, id])
    : await tx.query<{ id: string }>(`insert into public.follow_up_plans(agent_id, name, is_active, timelines, campaign_id, position)
      values($1::uuid, $2::text, $3::boolean, ${timelines}, $5::uuid,
        (select coalesce(max(position), -1) + 1 from public.follow_up_plans where agent_id = $1::uuid)) returning id`, params);
  if (!rows.length) throw new PlanError("This plan could not be found.");
  return rows[0].id;
}
export async function savePlanStep(tx: Tx, agentId: string, planId: string, input: PlanStepInput, id?: string): Promise<void> {
  const step = planStepSchema.parse(input);
  const locked = await tx.query(`select id from public.follow_up_plans where id = $1::uuid and agent_id = $2::uuid for update`, [planId, agentId]);
  if (!locked.length) throw new PlanError("This plan could not be found.");
  const steps = await getPlanSteps(tx, agentId, planId);
  if (id && !steps.some((s) => s.id === id)) throw new PlanError("This step could not be found.");
  const error = stepLimitError([...steps.filter((s) => s.id !== id), step]);
  if (error) throw new PlanError(error);
  const p = [agentId, planId, step.day_offset, step.kind, step.title, step.text_message, step.email_subject, step.email_body];
  if (id) await tx.query(`update public.follow_up_plan_steps set day_offset = $3::int, kind = $4::text,
    title = $5::text, text_message = $6::text, email_subject = $7::text, email_body = $8::text
    where agent_id = $1::uuid and plan_id = $2::uuid and id = $9::uuid`, [...p, id]);
  else await tx.query(`insert into public.follow_up_plan_steps(agent_id, plan_id, day_offset, kind, title, text_message, email_subject, email_body)
    values($1::uuid, $2::uuid, $3::int, $4::text, $5::text, $6::text, $7::text, $8::text)`, p);
}
export async function deletePlanStep(tx: Tx, agentId: string, planId: string, stepId: string): Promise<void> {
  await tx.query(`select id from public.follow_up_plans where id = $1::uuid and agent_id = $2::uuid for update`, [planId, agentId]);
  await tx.query(`delete from public.follow_up_plan_steps where id = $1::uuid and agent_id = $2::uuid and plan_id = $3::uuid`, [stepId, agentId, planId]);
}
export async function changePlan(tx: Tx, agentId: string, id: string, operation: "toggle" | "up" | "down" | "delete"): Promise<void> {
  await tx.query(`select id from public.agent_profiles where id = $1::uuid for update`, [agentId]);
  if (operation === "delete") { await tx.query(`delete from public.follow_up_plans where id = $1::uuid and agent_id = $2::uuid`, [id, agentId]); return; }
  if (operation === "toggle") { await tx.query(`update public.follow_up_plans set is_active = not is_active where id = $1::uuid and agent_id = $2::uuid`, [id, agentId]); return; }
  const plans = await listPlans(tx, agentId);
  const index = plans.findIndex((p) => p.id === id);
  const next = index + (operation === "up" ? -1 : 1);
  if (index < 0 || next < 0 || next >= plans.length) return;
  [plans[index], plans[next]] = [plans[next], plans[index]];
  for (const [position, plan] of plans.entries()) await tx.query(`update public.follow_up_plans set position = $3::int where id = $1::uuid and agent_id = $2::uuid`, [plan.id, agentId, position]);
}
export async function addStarterPlans(tx: Tx, agentId: string): Promise<void> {
  await tx.query(`select id from public.agent_profiles where id = $1::uuid for update`, [agentId]);
  if ((await listPlans(tx, agentId)).length) throw new PlanError("Starter plans can be added to an empty plan list.");
  for (const starter of STARTER_PLANS) {
    const id = await savePlan(tx, agentId, { name: starter.name, timelines: starter.timelines, is_active: false, campaign_id: null });
    for (const step of starter.steps) await savePlanStep(tx, agentId, id, step);
  }
}
export async function listEnrollments(tx: Tx, agentId: string, contactId: string): Promise<Enrollment[]> {
  return tx.query<Enrollment>(`select id, plan_name, status, stop_reason, started_at, skipped_steps
    from public.follow_up_enrollments where agent_id = $1::uuid and contact_id = $2::uuid order by started_at desc, id`, [agentId, contactId]);
}
export async function stopPlan(tx: Tx, agentId: string, contactId: string): Promise<void> {
  await tx.query(`select id from public.contacts where id = $1::uuid and agent_id = $2::uuid for update`, [contactId, agentId]);
  await tx.query(`update public.follow_up_enrollments set status = 'stopped', stop_reason = 'agent_stopped', stopped_at = now()
    where agent_id = $1::uuid and contact_id = $2::uuid and status = 'active'`, [agentId, contactId]);
}

/** Also used by the post-commit public submission step. Never creates an email. */
export async function startPlan(tx: Tx, agentId: string, contactId: string, planId: string, options: { inquiryId?: string; automatic?: boolean; now?: Date } = {}): Promise<string | null> {
  await tx.query(`select id from public.contacts where id = $1::uuid and agent_id = $2::uuid for update`, [contactId, agentId]);
  const contact = await getContact(tx, agentId, contactId);
  const profile = await getProfile(tx, agentId);
  await tx.query(`select id from public.follow_up_plans where id = $1::uuid and agent_id = $2::uuid for share`, [planId, agentId]);
  const plan = (await listPlans(tx, agentId)).find((p) => p.id === planId);
  if (!contact || !profile || !plan) return null;
  // Conservative: terminal pipeline statuses cannot restart a plan, even manually.
  if (["consultation_booked", "won", "lost"].includes(contact.status)) return null;
  if (options.inquiryId) {
    const already = await tx.query(`select id from public.follow_up_enrollments where agent_id = $1::uuid and inquiry_id = $2::uuid`, [agentId, options.inquiryId]);
    if (already.length) return null;
  }
  const active = (await listEnrollments(tx, agentId, contactId)).find((e) => e.status === "active");
  if (active && !options.automatic) throw new PlanError("Stop the active plan before starting another.");
  if (active) await tx.query(`update public.follow_up_enrollments set status = 'stopped', stop_reason = 'repeat_inquiry', stopped_at = now(), stop_actor = 'system' where id = $1::uuid and agent_id = $2::uuid`, [active.id, agentId]);
  const inquiry = (await tx.query<{ id: string; property_address: string; booking_url: string | null }>(`select i.id, i.property_address, coalesce(c.booking_url, p.booking_url) as booking_url
    from public.inquiries i join public.campaigns c on c.id = i.campaign_id and c.agent_id = i.agent_id
    join public.agent_profiles p on p.id = i.agent_id
    where i.agent_id = $1::uuid and i.contact_id = $2::uuid and ($3::uuid is null or i.id = $3::uuid)
    order by i.created_at desc, i.id limit 1`, [agentId, contactId, options.inquiryId ?? null]))[0];
  if (options.inquiryId && !inquiry) throw new PlanError("This inquiry could not be found.");
  const values = templateValuesFor(profile, { full_name: contact.full_name, property_address: inquiry?.property_address }, inquiry?.booking_url ?? profile.booking_url);
  const steps = await getPlanSteps(tx, agentId, planId);
  if (!steps.length) throw new PlanError("Add at least one step before starting this plan.");
  const skipped: SkippedStep[] = [];
  const included = steps.filter((s) => {
    const reason = s.kind !== "email" ? null : contact.unsubscribed_at ? "unsubscribed" : s.day_offset > CONSENT_REQUIRED_AFTER_DAYS && !contact.marketing_consent ? "no_marketing_consent" : null;
    if (reason) skipped.push({ day_offset: s.day_offset, title: renderTemplate(s.email_subject ?? "Email draft", values), reason });
    return !reason;
  });
  const now = options.now ?? new Date();
  const [{ id }] = await tx.query<{ id: string }>(`insert into public.follow_up_enrollments(agent_id, contact_id, inquiry_id, plan_id, plan_name, started_at, skipped_steps, status)
    values($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::timestamptz, $7::text::jsonb, $8::text) returning id`,
  [agentId, contactId, options.inquiryId ?? null, planId, plan.name, now.toISOString(), JSON.stringify(skipped), included.length ? "active" : "completed"]);
  for (const step of included) {
    const kind: StepKind = step.kind === "call" && contact.preferred_contact === "text" ? "text" : step.kind;
    const title = kind === "text" && step.kind === "call" ? `Text ${firstName(contact.full_name)}` : renderTemplate(step.title ?? step.email_subject ?? "Email draft", values) || TASK_TITLE[kind];
    await tx.query(`insert into public.follow_up_tasks(agent_id, contact_id, enrollment_id, plan_step_id, kind, title, due_at, email_subject, email_body, text_message)
      values($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::timestamptz, $8::text, $9::text, $10::text)`,
    [agentId, contactId, id, step.id, kind, title.slice(0, 200), planDueAt(now, step.day_offset, profile.timezone).toISOString(), step.email_subject, step.email_body, step.text_message ? renderTemplate(step.text_message, values).slice(0, 2000) : null]);
  }
  await tx.query(`insert into public.activity_events(agent_id, contact_id, type, actor, data)
    values($1::uuid, $2::uuid, 'plan_started', $3::text, $4::text::jsonb)`, [agentId, contactId, options.automatic ? "system" : "agent", JSON.stringify({ plan_name: plan.name })]);
  return id;
}
const TASK_TITLE = { call: "Call homeowner", email: "Review email draft", text: "Text homeowner" };

export async function startMatchingPlan(tx: Tx, agentId: string, contactId: string, inquiryId: string, now?: Date): Promise<string | null> {
  const inquiry = (await tx.query<{ timeline: Timeline; campaign_id: string }>(`select timeline, campaign_id from public.inquiries
    where id = $1::uuid and agent_id = $2::uuid and contact_id = $3::uuid`, [inquiryId, agentId, contactId]))[0];
  if (!inquiry) return null;
  const match = (await listPlans(tx, agentId)).find((p) => p.is_active && p.timelines.includes(inquiry.timeline) && (!p.campaign_id || p.campaign_id === inquiry.campaign_id));
  return match ? startPlan(tx, agentId, contactId, match.id, { inquiryId, automatic: true, now }) : null;
}
