/** Creates/reuses the fixed Stripe plan and portal. Does not create customers or charges. */
import Stripe from "stripe";
import { MONTHLY_PLAN } from "../src/config/billing";
import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || !/^(?:sk|rk)_(?:test|live)_/.test(key)) {
    throw new Error("stripe_secret_key_required");
  }
  const stripe = new Stripe(key, { apiVersion: "2026-09-30.endive", maxNetworkRetries: 2, timeout: 10_000 });
  const productId = "listingflow_workspace_v1";
  let product;
  try { product = await stripe.products.retrieve(productId); }
  catch (error) {
    if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.code !== "resource_missing") throw error;
    product = await stripe.products.create({ id: productId, name: "ListingFlow seller workspace" }, { idempotencyKey: "listingflow:product:v1" });
  }
  if (product.deleted || !product.active) throw new Error("stripe_product_inactive");
  const lookupKey = "listingflow_usd_20_monthly_v1";
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const price = existing.data[0] ?? await stripe.prices.create({
    product: productId, currency: MONTHLY_PLAN.currency, unit_amount: MONTHLY_PLAN.amount,
    recurring: { interval: "month", interval_count: 1 }, lookup_key: lookupKey,
  }, { idempotencyKey: "listingflow:price:usd:2000:month:v1" });
  if (!price.active || price.unit_amount !== MONTHLY_PLAN.amount || price.currency !== MONTHLY_PLAN.currency ||
      price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) throw new Error("stripe_price_mismatch");
  let portal: Stripe.BillingPortal.Configuration | undefined;
  for await (const configuration of stripe.billingPortal.configurations.list({ limit: 100 })) {
    if (configuration.active && configuration.metadata?.application === "listingflow_v1") { portal = configuration; break; }
  }
  portal ??= await stripe.billingPortal.configurations.create({
    metadata: { application: "listingflow_v1" },
    features: {
      invoice_history: { enabled: true }, payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: { enabled: false }, customer_update: { enabled: false },
    },
  }, { idempotencyKey: "listingflow:portal:v1" });
  console.log(`Plan: ${MONTHLY_PLAN.label} (${price.livemode ? "LIVE" : "TEST"})`);
  console.log(`STRIPE_PRICE_ID=${price.id}`);
  console.log(`STRIPE_PORTAL_CONFIGURATION_ID=${portal.id}`);
  console.log("Next: register /api/stripe/webhook and set its STRIPE_WEBHOOK_SECRET. See README.md.");
}

main().catch((error: unknown) => {
  // Never print Stripe error messages or request payloads.
  const code = error instanceof Stripe.errors.StripeError ? error.code ?? "stripe_setup_failed" :
    error instanceof Error && /^stripe_[a-z_]+$/.test(error.message) ? error.message : "stripe_setup_failed";
  console.error(code);
  process.exitCode = 1;
});
