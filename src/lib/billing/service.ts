import "server-only";
import type Stripe from "stripe";
import { z } from "zod";
import { MONTHLY_PLAN } from "@/config/billing";
import {
  type BillingCheckout, type BillingReceipt, checkoutReceipt, currentCheckout, getCheckout,
  lockBilling, reserveCheckout, saveReceipt, saveSession, saveSubscription,
} from "@/lib/data/billing";
import { asUser, type Tx } from "@/lib/db";
import { BillingError, getBillingConfig, stripeClient } from "./config";

export const checkoutKeySchema = z.uuid();
const idOf = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id;
const receiptPath = (key: string) => `/settings/billing/receipt/${key}`;
const terminal = (row: BillingCheckout) => row.status === "expired" ||
  row.subscription_status === "canceled" || row.subscription_status === "incomplete_expired";

function assert(condition: unknown): asserts condition {
  if (!condition) throw new BillingError("stripe_record_mismatch");
}

function metadataFor(row: BillingCheckout) {
  return { application: "listingflow", agent_id: row.agent_id, checkout_key: row.idempotency_key };
}

function matchesMetadata(metadata: Stripe.Metadata | null, row: BillingCheckout) {
  return metadata?.application === "listingflow" && metadata.agent_id === row.agent_id &&
    metadata.checkout_key === row.idempotency_key;
}

export function safeStripeUrl(value: string | null | undefined, host: string): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === host ? value : null; }
  catch { return null; }
}

async function storeInvoice(tx: Tx, row: BillingCheckout, invoice: Stripe.Invoice, subscriptionId: string) {
  assert(invoice.livemode === row.livemode && idOf(invoice.customer) === row.customer_id &&
    idOf(invoice.parent?.subscription_details?.subscription ?? null) === subscriptionId);
  // An open/failed invoice is never a receipt. Only Stripe-confirmed paid invoices are saved.
  if (invoice.status !== "paid" || !invoice.status_transitions.paid_at) return;
  assert(invoice.currency === MONTHLY_PLAN.currency);
  await saveReceipt(tx, {
    invoice_id: invoice.id, agent_id: row.agent_id, checkout_key: row.idempotency_key,
    invoice_number: invoice.number, amount_paid: invoice.amount_paid, currency: invoice.currency,
    paid_at: new Date(invoice.status_transitions.paid_at * 1000), livemode: invoice.livemode,
    hosted_invoice_url: safeStripeUrl(invoice.hosted_invoice_url, "invoice.stripe.com"),
    invoice_pdf: safeStripeUrl(invoice.invoice_pdf, "pay.stripe.com"),
  });
}

async function syncSubscription(tx: Tx, row: BillingCheckout, subscriptionId: string, invoiceId?: string) {
  const stripe = stripeClient();
  // Always retrieve current state under the per-agent lock. Replayed/out-of-order
  // webhook snapshots cannot restore an older subscription status.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  assert(matchesMetadata(sub.metadata, row) && sub.livemode === row.livemode &&
    (!row.subscription_id || row.subscription_id === sub.id) && sub.items.data.length === 1 &&
    item.price.id === row.price_id && item.quantity === 1 && item.price.unit_amount === MONTHLY_PLAN.amount &&
    item.price.currency === MONTHLY_PLAN.currency && item.price.recurring?.interval === "month" &&
    item.price.recurring.interval_count === 1 && (!row.customer_id || row.customer_id === idOf(sub.customer)));
  const customerId = idOf(sub.customer);
  assert(customerId);
  await saveSubscription(tx, row, {
    id: sub.id, customerId, status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end,
    periodEnd: new Date(item.current_period_end * 1000), latestInvoiceId: idOf(sub.latest_invoice) ?? null,
  });
  const invoiceIds = new Set([invoiceId, idOf(sub.latest_invoice)].filter((id): id is string => Boolean(id)));
  for (const id of invoiceIds) {
    await storeInvoice(tx, { ...row, customer_id: customerId }, await stripe.invoices.retrieve(id), sub.id);
  }
}

async function syncSession(tx: Tx, row: BillingCheckout, session: Stripe.Checkout.Session) {
  assert(matchesMetadata(session.metadata, row) && session.client_reference_id === row.idempotency_key &&
    session.livemode === row.livemode && session.mode === "subscription" &&
    (!row.session_id || session.id === row.session_id));
  assert(session.status === "open" || session.status === "complete" || session.status === "expired");
  await saveSession(tx, row, session.id, session.status);
  const subscriptionId = idOf(session.subscription);
  if (subscriptionId) await syncSubscription(tx, row, subscriptionId, idOf(session.invoice));
}

/** Reconcile only this owner's stored Stripe objects. Never accept session IDs from the browser. */
export async function refreshCheckout(agentId: string, key: string): Promise<void> {
  await asUser(agentId, async (tx) => {
    if (!await lockBilling(tx, agentId)) return;
    const row = await getCheckout(tx, agentId, key);
    if (!row) throw new BillingError("checkout_not_found");
    assert(row.livemode === getBillingConfig().livemode);
    if (row.session_id) await syncSession(tx, row, await stripeClient().checkout.sessions.retrieve(row.session_id));
    else if (row.subscription_id) await syncSubscription(tx, row, row.subscription_id);
  });
}

/** The same key always resolves to the same checkout or first saved receipt. */
export async function beginCheckout(agentId: string, key: string, reconciled = false): Promise<string> {
  checkoutKeySchema.parse(key);
  const config = getBillingConfig();
  let row = await asUser(agentId, (tx) => reserveCheckout(tx, agentId, key, config));
  assert(row.livemode === config.livemode);

  if (row.idempotency_key !== key && (row.session_id || row.subscription_id)) {
    await refreshCheckout(agentId, row.idempotency_key);
    row = (await asUser(agentId, (tx) => getCheckout(tx, agentId, row.idempotency_key)))!;
    if (terminal(row) && !reconciled) return beginCheckout(agentId, key, true);
  }
  const receipt = await asUser(agentId, (tx) => checkoutReceipt(tx, agentId, row.idempotency_key));
  if (receipt) return receiptPath(row.idempotency_key);
  if (row.status === "complete") return receiptPath(row.idempotency_key);
  if (terminal(row)) throw new BillingError("checkout_expired");

  const stripe = stripeClient();
  if (row.session_id) {
    const session = await stripe.checkout.sessions.retrieve(row.session_id);
    await asUser(agentId, async (tx) => {
      await lockBilling(tx, agentId);
      await syncSession(tx, row, session);
    });
    if (session.status === "complete") return receiptPath(row.idempotency_key);
    if (session.status === "expired") throw new BillingError("checkout_expired");
    const url = safeStripeUrl(session.url, "checkout.stripe.com");
    assert(url);
    return url;
  }

  // Stripe may prune keys after 24h. An ambiguous attempt is NEVER recreated
  // after this cutoff; it needs reconciliation, even if the caller retries years later.
  if (Date.now() >= row.created_at.getTime() + 22 * 60 * 60 * 1000) {
    throw new BillingError("checkout_needs_review");
  }
  const price = await stripe.prices.retrieve(row.price_id);
  assert(price.active && price.livemode === row.livemode && price.type === "recurring" &&
    price.unit_amount === MONTHLY_PLAN.amount && price.currency === MONTHLY_PLAN.currency &&
    price.recurring?.interval === "month" && price.recurring.interval_count === 1 &&
    !price.recurring.meter && price.recurring.usage_type === "licensed" && price.billing_scheme === "per_unit");
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    integration_identifier: `listingflow_monthly_${row.idempotency_key.replaceAll("-", "").slice(0, 8).replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))}`,
    adaptive_pricing: { enabled: false }, automatic_tax: { enabled: false },
    managed_payments: { enabled: false },
    line_items: [{ price: row.price_id, quantity: 1 }],
    client_reference_id: row.idempotency_key, metadata: metadataFor(row),
    subscription_data: { metadata: metadataFor(row), billing_mode: { type: "flexible" } },
    expires_at: Math.floor(row.expires_at.getTime() / 1000),
    success_url: `${row.site_url}${receiptPath(row.idempotency_key)}`,
    cancel_url: `${row.site_url}/settings/billing?canceled=1`,
  }, { idempotencyKey: `listingflow:checkout:${row.agent_id}:${row.idempotency_key}` });
  await asUser(agentId, async (tx) => {
    await lockBilling(tx, agentId);
    await syncSession(tx, row, session);
  });
  if (session.status === "complete") return receiptPath(row.idempotency_key);
  const url = safeStripeUrl(session.url, "checkout.stripe.com");
  assert(url);
  return url;
}

export async function openBillingPortal(agentId: string): Promise<string> {
  const config = getBillingConfig();
  const row = await asUser(agentId, (tx) => currentCheckout(tx, agentId, config.livemode));
  if (!row?.customer_id) throw new BillingError("checkout_not_found");
  const portal = await stripeClient().billingPortal.sessions.create({
    customer: row.customer_id, return_url: `${config.siteUrl}/settings/billing`,
    configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || undefined,
  });
  const url = safeStripeUrl(portal.url, "billing.stripe.com");
  assert(url);
  return url;
}

/** Closing an unpaid session never cancels or refunds an already completed payment. */
export async function closePendingCheckout(agentId: string, key: string): Promise<void> {
  checkoutKeySchema.parse(key);
  await asUser(agentId, async (tx) => {
    assert(await lockBilling(tx, agentId));
    const row = await getCheckout(tx, agentId, key);
    if (!row) throw new BillingError("checkout_not_found");
    assert(row.livemode === getBillingConfig().livemode);
    if (!row.session_id) throw new BillingError("checkout_needs_review");
    const stripe = stripeClient();
    let session = await stripe.checkout.sessions.retrieve(row.session_id);
    if (session.status === "open") session = await stripe.checkout.sessions.expire(row.session_id, {}, {
      idempotencyKey: `listingflow:expire:${agentId}:${key}`,
    });
    await syncSession(tx, row, session);
  });
}

function eventOwner(metadata: Stripe.Metadata | null): { agentId: string; key: string } | null {
  if (metadata?.application !== "listingflow") return null;
  if (!checkoutKeySchema.safeParse(metadata.agent_id).success || !checkoutKeySchema.safeParse(metadata.checkout_key).success) {
    throw new BillingError("stripe_record_mismatch");
  }
  return { agentId: metadata.agent_id, key: metadata.checkout_key };
}

/** Call ONLY after constructEvent verifies the raw body and Stripe-Signature. */
export async function handleBillingEvent(event: Stripe.Event): Promise<void> {
  const config = getBillingConfig();
  assert(event.livemode === config.livemode);
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
    const snapshot = event.data.object as Stripe.Checkout.Session;
    const owner = eventOwner(snapshot.metadata);
    if (!owner) return;
    await asUser(owner.agentId, async (tx) => {
      if (!await lockBilling(tx, owner.agentId)) return; // Account already deleted.
      const row = await getCheckout(tx, owner.agentId, owner.key);
      assert(row);
      await syncSession(tx, row, await stripeClient().checkout.sessions.retrieve(snapshot.id));
    });
  } else if (event.type.startsWith("customer.subscription.") || event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.type.startsWith("invoice.") ? event.data.object as Stripe.Invoice : null;
    const subscriptionId = invoice ? idOf(invoice.parent?.subscription_details?.subscription ?? null) : (event.data.object as Stripe.Subscription).id;
    if (!subscriptionId) return;
    const snapshot = invoice ? await stripeClient().subscriptions.retrieve(subscriptionId) : event.data.object as Stripe.Subscription;
    const owner = eventOwner(snapshot.metadata);
    if (!owner) return;
    await asUser(owner.agentId, async (tx) => {
      if (!await lockBilling(tx, owner.agentId)) return;
      const row = await getCheckout(tx, owner.agentId, owner.key);
      assert(row);
      await syncSubscription(tx, row, subscriptionId, invoice?.id);
    });
  }
}

export async function getSavedReceipt(agentId: string, key: string): Promise<BillingReceipt | null> {
  checkoutKeySchema.parse(key);
  return asUser(agentId, (tx) => checkoutReceipt(tx, agentId, key));
}
