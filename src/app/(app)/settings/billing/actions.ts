"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, failure, success } from "@/lib/action-state";
import { requireAgent } from "@/lib/auth/session";
import { billingMessage } from "@/lib/billing/config";
import { beginCheckout, checkoutKeySchema, closePendingCheckout, openBillingPortal, refreshCheckout } from "@/lib/billing/service";

export async function checkoutAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { user } = await requireAgent();
  const key = checkoutKeySchema.safeParse(data.get("checkout_key"));
  if (!key.success) return failure("Refresh Billing to load a valid checkout.");
  if (data.get("agree_recurring") !== "yes") return failure("Please confirm the monthly subscription before continuing.");
  let url: string;
  try { url = await beginCheckout(user.id, key.data); }
  catch (error) { return failure(billingMessage(error)); }
  redirect(url);
}

export async function portalAction(): Promise<ActionState> {
  const { user } = await requireAgent();
  let url: string;
  try { url = await openBillingPortal(user.id); }
  catch (error) { return failure(billingMessage(error)); }
  redirect(url);
}

export async function refreshBillingAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { user } = await requireAgent();
  const key = checkoutKeySchema.safeParse(data.get("checkout_key"));
  if (!key.success) return failure("Refresh Billing to load a valid checkout.");
  try { await refreshCheckout(user.id, key.data); }
  catch (error) { return failure(billingMessage(error)); }
  revalidatePath("/settings/billing");
  revalidatePath(`/settings/billing/receipt/${key.data}`);
  return success("Billing checked with Stripe.");
}

export async function closeCheckoutAction(_: ActionState, data: FormData): Promise<ActionState> {
  const { user } = await requireAgent();
  const key = checkoutKeySchema.safeParse(data.get("checkout_key"));
  if (!key.success) return failure("Refresh Billing to load a valid checkout.");
  try { await closePendingCheckout(user.id, key.data); }
  catch (error) { return failure(billingMessage(error)); }
  revalidatePath("/settings/billing");
  revalidatePath(`/settings/billing/receipt/${key.data}`);
  return success("Checkout checked. Any unpaid session is now closed; completed payments remain in your history.");
}
