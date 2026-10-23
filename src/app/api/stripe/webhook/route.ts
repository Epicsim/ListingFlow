import { BillingError, getBillingConfig, stripeClient } from "@/lib/billing/config";
import { handleBillingEvent } from "@/lib/billing/service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let config: ReturnType<typeof getBillingConfig>;
  try { config = getBillingConfig(); }
  catch { return Response.json({ error: "billing_unavailable" }, { status: 503 }); }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "invalid_signature" }, { status: 400 });
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(await request.text(), signature, config.webhookSecret);
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }
  try {
    await handleBillingEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    // No Stripe payloads, addresses, emails, or provider error messages in logs.
    console.error(error instanceof BillingError ? error.code : "stripe_webhook_failed");
    return Response.json({ error: "stripe_webhook_failed" }, { status: 500 });
  }
}
