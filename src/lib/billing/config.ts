import "server-only";
import Stripe from "stripe";
import { configuredSiteUrl, getBackend } from "@/lib/config";

export class BillingError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BillingError";
  }
}

export function getBillingConfig() {
  const mode = process.env.BILLING_MODE ?? "disabled";
  if (mode !== "test" && mode !== "live") throw new BillingError("billing_unavailable");
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const priceId = process.env.STRIPE_PRICE_ID?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const siteUrl = configuredSiteUrl();
  const livemode = mode === "live";
  const keyMatchesMode = secretKey && new RegExp(`^(?:sk|rk)_${livemode ? "live" : "test"}_`).test(secretKey);
  if (!keyMatchesMode || !priceId?.startsWith("price_") ||
      !webhookSecret?.startsWith("whsec_") || !siteUrl ||
      (livemode && (getBackend() === "local" || !siteUrl.startsWith("https://")))) {
    throw new BillingError("billing_unavailable");
  }
  return { secretKey, priceId, webhookSecret, siteUrl, livemode };
}

export function billingEnabled(): boolean {
  try { getBillingConfig(); return true; } catch { return false; }
}

export function stripeClient() {
  return new Stripe(getBillingConfig().secretKey, {
    apiVersion: "2026-09-30.endive",
    maxNetworkRetries: 2,
    timeout: 10_000,
  });
}

export function billingMessage(error: unknown): string {
  if (error instanceof BillingError) {
    if (error.code === "checkout_expired") return "This checkout expired. Refresh Billing to start a new checkout.";
    if (error.code === "checkout_needs_review") return "This checkout needs to be checked before another can start. Please contact support so we can avoid a duplicate charge.";
    if (error.code === "billing_unavailable") return "Checkout is not available yet. Please try again later.";
    if (error.code === "checkout_not_found") return "That checkout could not be found in your account.";
  }
  return "We couldn't confirm billing with Stripe. Please retry; your existing checkout will be reused.";
}
