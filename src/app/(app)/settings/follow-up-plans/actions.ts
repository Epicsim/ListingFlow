"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { type ActionState, failure } from "@/lib/action-state";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { addStarterPlans, changePlan, deletePlanStep, PlanError, savePlan, savePlanStep } from "@/lib/data/plans";
import { asUser } from "@/lib/db";
import { planSchema, planStepSchema } from "@/lib/follow-up-plans";
import { formFields, toFieldErrors, uuidSchema } from "@/lib/validation";

const base = "/settings/follow-up-plans";
const message = (e: unknown) => e instanceof PlanError ? e.message : "We couldn't save this plan. Check your choices and try again.";
export async function savePlanAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const parsed = planSchema.safeParse({ ...formFields(data, ["name", "campaign_id"]), is_active: data.get("is_active") === "on", timelines: data.getAll("timelines") });
  if (!parsed.success) return failure("Please check the highlighted fields.", toFieldErrors(parsed.error));
  const rawId = data.get("plan_id");
  const id = rawId ? uuidSchema.safeParse(rawId) : null;
  if (id && !id.success) return failure("This plan could not be found.");
  let saved: string;
  try { saved = await asUser(profile.id, (tx) => savePlan(tx, profile.id, parsed.data, id?.success ? id.data : undefined)); }
  catch (e) { return failure(message(e)); }
  revalidatePath(base);
  redirect(`${base}/${saved}`);
}
export async function saveStepAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const plan = uuidSchema.safeParse(data.get("plan_id"));
  const rawId = data.get("step_id");
  const id = rawId ? uuidSchema.safeParse(rawId) : null;
  if (!plan.success || (id && !id.success)) return failure("This plan or step could not be found.");
  const parsed = planStepSchema.safeParse(formFields(data, ["day_offset", "kind", "title", "text_message", "email_subject", "email_body"]));
  if (!parsed.success) return failure("Please check the highlighted fields.", toFieldErrors(parsed.error));
  try { await asUser(profile.id, (tx) => savePlanStep(tx, profile.id, plan.data, parsed.data, id?.success ? id.data : undefined)); }
  catch (e) { return failure(message(e)); }
  revalidatePath(base);
  redirect(`${base}/${plan.data}`);
}
export async function planOperationAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const operation = data.get("operation");
  if (operation === "starters") {
    try { await asUser(profile.id, (tx) => addStarterPlans(tx, profile.id)); }
    catch (e) { return failure(message(e)); }
  } else {
    const id = uuidSchema.safeParse(data.get("plan_id"));
    if (!id.success) return failure("This plan could not be found.");
    if (operation === "delete" && data.get("confirm_delete") !== "delete") {
      return failure("Please confirm the permanent deletion.", {
        confirm_delete: "Check the box to confirm you want to permanently delete this plan.",
      });
    }
    try {
      if (operation === "delete_step") {
        const step = uuidSchema.safeParse(data.get("step_id"));
        if (!step.success) return failure("This step could not be found.");
        await asUser(profile.id, (tx) => deletePlanStep(tx, profile.id, id.data, step.data));
      } else if (operation === "toggle" || operation === "up" || operation === "down" || operation === "delete") {
        await asUser(profile.id, (tx) => changePlan(tx, profile.id, id.data, operation));
      } else return failure("Choose a plan action.");
    } catch (e) { return failure(message(e)); }
    revalidatePath(base);
    if (operation === "delete_step") redirect(`${base}/${id.data}`);
  }
  revalidatePath(base);
  redirect(base);
}
