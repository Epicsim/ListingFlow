import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";
import { beginCheckout, closePendingCheckout, getSavedReceipt, handleBillingEvent, openBillingPortal, refreshCheckout } from "@/lib/billing/service";
import { checkoutReceipt, getCheckout, hasPaidSubscription, listReceipts, reserveCheckout } from "@/lib/data/billing";
import { getPublicCampaign, recordBookingClick } from "@/lib/data/public";
import { deleteOwnAccount } from "@/lib/data/profiles";
import { runAs } from "@/lib/db/run-as";
import type { Driver, Tx } from "@/lib/db/types";
import { asAgent, asAnon, asOwner, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

vi.mock("@/lib/db", () => ({
  asUser: <T>(id: string, fn: (tx: Tx) => Promise<T>) => runAs(db, "authenticated", id, fn),
}));
vi.mock("@/lib/billing/config", async (original) => ({
  ...await original<typeof import("@/lib/billing/config")>(),
  stripeClient: () => provider,
}));

let db: Driver;
const config = { priceId: "price_monthly", livemode: false, siteUrl: "https://listingflow.example.test" };
const sessions = new Map<string, Stripe.Checkout.Session>();
const subscriptions = new Map<string, Stripe.Subscription>();
const invoices = new Map<string, Stripe.Invoice>();
const stripeKeys = new Map<string, string>();
const signatures = new Stripe("sk_test_fixture").webhooks;
const provider = {
  prices: { retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
  invoices: { retrieve: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: signatures,
};
let lostResponse = false;

beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db?.close(); });
beforeEach(() => {
  vi.stubEnv("BILLING_MODE", "test");
  vi.stubEnv("LISTINGFLOW_BACKEND", "local");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_PRICE_ID", config.priceId);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", config.siteUrl);
  sessions.clear(); subscriptions.clear(); invoices.clear(); stripeKeys.clear(); lostResponse = false;
  vi.resetAllMocks();
  provider.prices.retrieve.mockResolvedValue({
    id: config.priceId, active: true, livemode: false, type: "recurring", billing_scheme: "per_unit",
    unit_amount: 2000, currency: "usd", recurring: { interval: "month", interval_count: 1, meter: null, usage_type: "licensed" },
  });
  provider.checkout.sessions.create.mockImplementation(async (params, options) => {
    const priorId = stripeKeys.get(options.idempotencyKey);
    if (priorId) return sessions.get(priorId)!;
    const id = `cs_test_${randomUUID()}`;
    const session = {
      id, metadata: params.metadata, mode: params.mode, client_reference_id: params.client_reference_id,
      livemode: false, status: "open", payment_status: "unpaid", subscription: null, invoice: null,
      url: `https://checkout.stripe.com/c/pay/${id}`,
    } as Stripe.Checkout.Session;
    sessions.set(id, session); stripeKeys.set(options.idempotencyKey, id);
    if (lostResponse) { lostResponse = false; throw new Error("connection_lost_after_stripe_created_session"); }
    return session;
  });
  provider.checkout.sessions.retrieve.mockImplementation(async (id) => {
    if (!sessions.has(id)) throw new Error("fixture_session_missing");
    return sessions.get(id)!;
  });
  provider.checkout.sessions.expire.mockImplementation(async (id) => {
    const session = sessions.get(id)!;
    const expired = { ...session, status: "expired" as const }; sessions.set(id, expired); return expired;
  });
  provider.subscriptions.retrieve.mockImplementation(async (id) => {
    if (!subscriptions.has(id)) throw new Error("fixture_subscription_missing");
    return subscriptions.get(id)!;
  });
  provider.invoices.retrieve.mockImplementation(async (id) => {
    if (!invoices.has(id)) throw new Error("fixture_invoice_missing");
    return invoices.get(id)!;
  });
  provider.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/p/session_fixture" });
});
afterEach(() => { vi.unstubAllEnvs(); });

function event(type: string, object: unknown): Stripe.Event {
  return { id: `evt_${randomUUID()}`, object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object } } as Stripe.Event;
}

async function paid(agent: string, key: string) {
  const row = await asAgent(db, agent, (tx) => getCheckout(tx, agent, key));
  const session = row?.session_id ? sessions.get(row.session_id)! : [...sessions.values()][0];
  const subscriptionId = `sub_${randomUUID()}`;
  const customerId = `cus_${randomUUID()}`;
  const invoiceId = `in_${randomUUID()}`;
  const sub = {
    id: subscriptionId, metadata: session.metadata, livemode: false, customer: customerId,
    status: "active", cancel_at_period_end: false, latest_invoice: invoiceId,
    items: { data: [{ quantity: 1, price: await provider.prices.retrieve(config.priceId), current_period_end: Math.floor(Date.now() / 1000) + 2_592_000 }] },
  } as unknown as Stripe.Subscription;
  const invoice = {
    id: invoiceId, customer: customerId, parent: { subscription_details: { subscription: subscriptionId } },
    livemode: false, status: "paid", status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
    amount_paid: 2000, currency: "usd", number: "LF-0001",
    hosted_invoice_url: `https://invoice.stripe.com/i/${invoiceId}`, invoice_pdf: `https://pay.stripe.com/invoice/${invoiceId}/pdf`,
  } as unknown as Stripe.Invoice;
  sessions.set(session.id, { ...session, status: "complete", payment_status: "paid", subscription: subscriptionId, invoice: invoiceId });
  subscriptions.set(subscriptionId, sub); invoices.set(invoiceId, invoice);
  return { sub, invoice, session: sessions.get(session.id)! };
}

describe("durable, retry-safe Stripe checkout", () => {
  it("resumes the same session for repeated keys, with a fixed $20/month price", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    const first = await beginCheckout(agent, key);
    expect(await beginCheckout(agent, key)).toBe(first);
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(provider.checkout.sessions.create.mock.calls[0]).toMatchObject([
      { mode: "subscription", managed_payments: { enabled: false }, integration_identifier: expect.stringMatching(/^listingflow_monthly_[a-p]{8}$/), line_items: [{ price: config.priceId, quantity: 1 }], metadata: { agent_id: agent, checkout_key: key } },
      { idempotencyKey: `listingflow:checkout:${agent}:${key}` },
    ]);
  });

  it("serializes simultaneous checkouts from different tabs onto one subscription attempt", async () => {
    const agent = await createAgent(db);
    const urls = await Promise.all([beginCheckout(agent, randomUUID()), beginCheckout(agent, randomUUID()), beginCheckout(agent, randomUUID())]);
    expect(new Set(urls).size).toBe(1);
    expect(stripeKeys.size).toBe(1);
    const rows = await asAgent(db, agent, (tx) => tx.query(`select * from billing_private.checkouts`));
    expect(rows).toHaveLength(1);
  });

  it("scopes identical UUIDs to different agents and keeps their Stripe sessions separate", async () => {
    const a = await createAgent(db); const b = await createAgent(db); const key = randomUUID();
    expect(await beginCheckout(a, key)).not.toBe(await beginCheckout(b, key));
    expect(stripeKeys.size).toBe(2);
  });

  it("reuses Stripe's key and identical parameters after an ambiguous network failure", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    lostResponse = true;
    await expect(beginCheckout(agent, key)).rejects.toThrow("connection_lost");
    expect((await asAgent(db, agent, (tx) => getCheckout(tx, agent, key)))?.session_id).toBeNull();
    await beginCheckout(agent, key);
    expect(stripeKeys.size).toBe(1);
    expect(provider.checkout.sessions.create.mock.calls[1]).toEqual(provider.checkout.sessions.create.mock.calls[0]);
  });

  it("recovers a payment by webhook even when Stripe's response was never saved", async () => {
    const agent = await createAgent(db); const key = randomUUID(); lostResponse = true;
    await expect(beginCheckout(agent, key)).rejects.toThrow();
    const payment = await paid(agent, key);
    await handleBillingEvent(event("checkout.session.completed", payment.session));
    expect((await getSavedReceipt(agent, key))?.invoice_id).toBe(payment.invoice.id);
    expect(await beginCheckout(agent, key)).toBe(`/settings/billing/receipt/${key}`);
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("returns the saved receipt without calling Stripe again, even years later", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    await handleBillingEvent(event("invoice.paid", payment.invoice));
    await asOwner(db, (tx) => tx.query(`update billing_private.checkouts set created_at = now() - interval '2 years' where agent_id = $1::uuid`, [agent]));
    vi.clearAllMocks();
    expect(await beginCheckout(agent, key)).toBe(`/settings/billing/receipt/${key}`);
    expect(provider.checkout.sessions.create).not.toHaveBeenCalled();
    expect(provider.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(provider.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("fails closed for old ambiguous attempts, even if a fresh key is supplied", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await asAgent(db, agent, (tx) => reserveCheckout(tx, agent, key, config));
    await asOwner(db, (tx) => tx.query(`update billing_private.checkouts set created_at = now() - interval '25 hours' where agent_id = $1::uuid`, [agent]));
    await expect(beginCheckout(agent, key)).rejects.toThrow("checkout_needs_review");
    await expect(beginCheckout(agent, randomUUID())).rejects.toThrow("checkout_needs_review");
    expect(provider.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("keeps an expired key terminal; a new key may replace the verified expired session", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key);
    const session = [...sessions.values()][0]; sessions.set(session.id, { ...session, status: "expired" });
    await expect(beginCheckout(agent, key)).rejects.toThrow("checkout_expired");
    const next = randomUUID(); await beginCheckout(agent, next);
    expect(stripeKeys.size).toBe(2);
    await expect(beginCheckout(agent, key)).rejects.toThrow("checkout_expired");
    expect(stripeKeys.size).toBe(2);
  });

  it("does not create another subscription for an already subscribed account using a new key", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    await handleBillingEvent(event("checkout.session.completed", payment.session));
    expect(await beginCheckout(agent, randomUUID())).toBe(`/settings/billing/receipt/${key}`);
    expect(stripeKeys.size).toBe(1);
  });

  it("can subscribe again after a verified cancellation, while the old key still returns its receipt", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    await handleBillingEvent(event("invoice.paid", payment.invoice));
    subscriptions.set(payment.sub.id, { ...payment.sub, status: "canceled" });
    const next = randomUUID(); await beginCheckout(agent, next);
    expect(stripeKeys.size).toBe(2);
    expect(await beginCheckout(agent, key)).toBe(`/settings/billing/receipt/${key}`);
  });

  it("rejects a configured price that is not USD 20 monthly before creating a session", async () => {
    const agent = await createAgent(db);
    provider.prices.retrieve.mockResolvedValueOnce({ active: true, livemode: false, type: "recurring", unit_amount: 3000, currency: "usd" });
    await expect(beginCheckout(agent, randomUUID())).rejects.toThrow("stripe_record_mismatch");
    expect(provider.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("closes an unpaid checkout, keeps its key terminal, and never expires a completed payment", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); await closePendingCheckout(agent, key);
    expect(provider.checkout.sessions.expire).toHaveBeenCalledTimes(1);
    await expect(beginCheckout(agent, key)).rejects.toThrow("checkout_expired");
    const next = randomUUID(); await beginCheckout(agent, next); const payment = await paid(agent, next);
    await closePendingCheckout(agent, next);
    expect(provider.checkout.sessions.expire).toHaveBeenCalledTimes(1);
    expect((await getSavedReceipt(agent, next))?.invoice_id).toBe(payment.invoice.id);
  });
});

describe("verified payment receipts and subscription updates", () => {
  it("deduplicates repeated webhooks, and saves separate monthly renewal invoices", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    const paidEvent = event("invoice.paid", payment.invoice);
    await handleBillingEvent(paidEvent); await handleBillingEvent(paidEvent);
    await handleBillingEvent(event("checkout.session.completed", payment.session));
    expect(await asAgent(db, agent, (tx) => listReceipts(tx, agent, false))).toHaveLength(1);
    const renewal = { ...payment.invoice, id: `in_${randomUUID()}`, number: "LF-0002", status_transitions: { ...payment.invoice.status_transitions, paid_at: payment.invoice.status_transitions.paid_at! + 2_592_000 } };
    invoices.set(renewal.id, renewal);
    subscriptions.set(payment.sub.id, { ...payment.sub, latest_invoice: renewal.id });
    await handleBillingEvent(event("invoice.paid", renewal));
    expect(await asAgent(db, agent, (tx) => listReceipts(tx, agent, false))).toHaveLength(2);
    expect((await getSavedReceipt(agent, key))?.invoice_id).toBe(payment.invoice.id);
  });

  it("never saves an unpaid invoice as a receipt", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    invoices.set(payment.invoice.id, { ...payment.invoice, status: "open", amount_paid: 0, status_transitions: { ...payment.invoice.status_transitions, paid_at: null } });
    await handleBillingEvent(event("checkout.session.completed", payment.session));
    expect(await getSavedReceipt(agent, key)).toBeNull();
    expect(await beginCheckout(agent, key)).toBe(`/settings/billing/receipt/${key}`);
    expect(stripeKeys.size).toBe(1);
  });

  it("retrieves current state so an old event cannot reactivate a canceled subscription", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    subscriptions.set(payment.sub.id, { ...payment.sub, status: "canceled" });
    await handleBillingEvent(event("customer.subscription.updated", payment.sub));
    expect((await asAgent(db, agent, (tx) => getCheckout(tx, agent, key)))?.subscription_status).toBe("canceled");
  });

  it("rejects forged signatures before processing; accepts a signed event more than once safely", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    const payload = JSON.stringify(event("invoice.paid", payment.invoice));
    const invalid = await POST(new Request("https://listingflow.example.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "invalid" }, body: payload }));
    expect(invalid.status).toBe(400); expect(await getSavedReceipt(agent, key)).toBeNull();
    const header = signatures.generateTestHeaderString({ payload, secret: "whsec_fixture" });
    for (let i = 0; i < 2; i++) {
      const result = await POST(new Request("https://listingflow.example.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": header }, body: payload }));
      expect(result.status).toBe(200);
    }
    expect(await asAgent(db, agent, (tx) => listReceipts(tx, agent, false))).toHaveLength(1);
  });

  it("rejects signatures over a modified body and signatures older than Stripe's tolerance", async () => {
    const payload = JSON.stringify(event("invoice.paid", {}));
    for (const [body, timestamp] of [[payload + " ", Math.floor(Date.now() / 1000)], [payload, Math.floor(Date.now() / 1000) - 600]] as const) {
      const header = signatures.generateTestHeaderString({ payload, secret: "whsec_fixture", timestamp });
      expect((await POST(new Request("https://listingflow.example.test/api/stripe/webhook", {
        method: "POST", headers: { "stripe-signature": header }, body,
      }))).status).toBe(400);
    }
  });

  it("rolls back a mismatched invoice instead of saving another customer's payment", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    invoices.set(payment.invoice.id, { ...payment.invoice, customer: "cus_someone_else" });
    await expect(handleBillingEvent(event("invoice.paid", payment.invoice))).rejects.toThrow("stripe_record_mismatch");
    expect(await getSavedReceipt(agent, key)).toBeNull();
    expect((await asAgent(db, agent, (tx) => getCheckout(tx, agent, key)))?.subscription_id).toBeNull();
  });

  it("uses only the signed-in agent's stored customer in the billing portal", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    await handleBillingEvent(event("invoice.paid", payment.invoice));
    expect(await openBillingPortal(agent)).toBe("https://billing.stripe.com/p/session_fixture");
    expect(provider.billingPortal.sessions.create.mock.calls[0][0].customer).toBe(payment.sub.customer);
    await expect(openBillingPortal(await createAgent(db))).rejects.toThrow("checkout_not_found");
  });
});

describe("billing database security", () => {
  it("isolates other agents' checkout keys and receipts; anon and service roles have no access", async () => {
    const agent = await createAgent(db); const other = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    await handleBillingEvent(event("invoice.paid", payment.invoice));
    expect(await asAgent(db, other, (tx) => getCheckout(tx, agent, key))).toBeNull();
    expect(await getSavedReceipt(other, key)).toBeNull();
    expect(await asAgent(db, other, (tx) => checkoutReceipt(tx, agent, key))).toBeNull();
    for (const table of ["checkouts", "receipts"]) {
      await expect(asAnon(db, (tx) => tx.query(`select * from billing_private.${table}`))).rejects.toThrow(/permission denied/);
      await expect(asService(db, (tx) => tx.query(`select * from billing_private.${table}`))).rejects.toThrow(/permission denied/);
    }
    await expect(asAgent(db, other, (tx) => tx.query(
      `insert into billing_private.checkouts (agent_id, idempotency_key, price_id, site_url, livemode) values ($1::uuid, $2::uuid, 'price_x', 'https://example.test', false)`, [agent, randomUUID()],
    ))).rejects.toThrow(/row-level security/);
  });

  it("makes receipt rows and the original checkout key/price immutable", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    await handleBillingEvent(event("invoice.paid", payment.invoice));
    await expect(asAgent(db, agent, (tx) => tx.query(`update billing_private.receipts set amount_paid = 1`))).rejects.toThrow(/permission denied/);
    await expect(asAgent(db, agent, (tx) => tx.query(`delete from billing_private.receipts`))).rejects.toThrow(/permission denied/);
    await expect(asAgent(db, agent, (tx) => tx.query(`update billing_private.checkouts set price_id = 'price_forged'`))).rejects.toThrow(/permission denied/);
  });

  it("prevents direct account deletion while checkout/subscription is unresolved, then allows it after cancellation", async () => {
    const agent = await createAgent(db); const key = randomUUID();
    await beginCheckout(agent, key);
    await expect(asAgent(db, agent, deleteOwnAccount)).rejects.toThrow("billing_must_be_closed");
    const payment = await paid(agent, key);
    await handleBillingEvent(event("invoice.paid", payment.invoice));
    await expect(asAgent(db, agent, deleteOwnAccount)).rejects.toThrow("billing_must_be_closed");
    subscriptions.set(payment.sub.id, { ...payment.sub, status: "canceled" });
    await refreshCheckout(agent, key);
    expect(await asAgent(db, agent, deleteOwnAccount)).toBe(true);
    expect(await asAgent(db, agent, (tx) => getCheckout(tx, agent, key))).toBeNull();
  });
});

describe("paid access in live mode", () => {
  it("requires a live active subscription, its latest paid invoice and an unexpired billing period", async () => {
    const agent = await createAgent(db); const other = await createAgent(db); const key = randomUUID();
    const campaign = await createCampaignFor(db, agent);
    await beginCheckout(agent, key); const payment = await paid(agent, key);
    await handleBillingEvent(event("invoice.paid", payment.invoice));
    expect(await asAgent(db, agent, (tx) => hasPaidSubscription(tx, agent))).toBe(false); // Test payment cannot unlock live access.
    await asOwner(db, async (tx) => {
      await tx.query(`update billing_private.checkouts set livemode = true where agent_id = $1::uuid`, [agent]);
      await tx.query(`update billing_private.receipts set livemode = true where agent_id = $1::uuid`, [agent]);
    });
    expect(await asAgent(db, agent, (tx) => hasPaidSubscription(tx, agent))).toBe(true);
    expect(await asAgent(db, other, (tx) => hasPaidSubscription(tx, agent))).toBe(false);
    vi.stubEnv("BILLING_MODE", "live"); vi.stubEnv("LISTINGFLOW_BACKEND", "supabase");
    expect(await asAnon(db, (tx) => getPublicCampaign(tx, campaign.slug))).not.toBeNull();
    await asOwner(db, (tx) => tx.query(`update billing_private.checkouts set latest_invoice_id = 'in_unpaid_renewal' where agent_id = $1::uuid`, [agent]));
    expect(await asAgent(db, agent, (tx) => hasPaidSubscription(tx, agent))).toBe(false);
    expect(await asAnon(db, (tx) => getPublicCampaign(tx, campaign.slug))).toBeNull();
    expect(await submit(db, campaign.slug)).toMatchObject({ status: "campaign_unavailable" });
    expect(await asService(db, (tx) => recordBookingClick(tx, campaign.slug, null))).toBeNull();
    await asOwner(db, (tx) => tx.query(`update billing_private.checkouts set latest_invoice_id = $2::text, period_end = now() - interval '1 minute' where agent_id = $1::uuid`, [agent, payment.invoice.id]));
    expect(await asAgent(db, agent, (tx) => hasPaidSubscription(tx, agent))).toBe(false);
    await asOwner(db, (tx) => tx.query(`update billing_private.checkouts set period_end = now() + interval '1 month', subscription_status = 'past_due' where agent_id = $1::uuid`, [agent]));
    expect(await asAgent(db, agent, (tx) => hasPaidSubscription(tx, agent))).toBe(false);
    vi.stubEnv("LISTINGFLOW_BACKEND", "local"); // Local development remains usable, even with live flag.
    expect(await asAnon(db, (tx) => getPublicCampaign(tx, campaign.slug))).not.toBeNull();
  });
});
