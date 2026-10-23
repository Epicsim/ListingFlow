import type { Tx } from "@/lib/db";

export interface BillingCheckout {
  agent_id: string;
  idempotency_key: string;
  price_id: string;
  livemode: boolean;
  site_url: string;
  status: "creating" | "open" | "complete" | "expired";
  session_id: string | null;
  customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  latest_invoice_id: string | null;
  cancel_at_period_end: boolean;
  period_end: Date | null;
  expires_at: Date;
  created_at: Date;
}

export interface BillingReceipt {
  invoice_id: string;
  agent_id: string;
  checkout_key: string;
  invoice_number: string | null;
  amount_paid: number;
  currency: string;
  paid_at: Date;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  livemode: boolean;
}

// billing_private MUST remain outside Supabase's exposed Data API schemas. All
// writes come from server code after Stripe verification, under the owner's RLS
// session. No service_role access or public RPC can forge billing records.
export async function lockBilling(tx: Tx, agentId: string): Promise<boolean> {
  const rows = await tx.query(`select id from public.agent_profiles where id = $1::uuid for update`, [agentId]);
  return rows.length === 1;
}

export async function getCheckout(tx: Tx, agentId: string, key: string): Promise<BillingCheckout | null> {
  return (await tx.query<BillingCheckout>(
    `select * from billing_private.checkouts where agent_id = $1::uuid and idempotency_key = $2::uuid`, [agentId, key],
  ))[0] ?? null;
}

export async function currentCheckout(tx: Tx, agentId: string, livemode: boolean): Promise<BillingCheckout | null> {
  return (await tx.query<BillingCheckout>(
    `select * from billing_private.checkouts where agent_id = $1::uuid and livemode = $2::boolean
     and status <> 'expired' and coalesce(subscription_status, '') not in ('canceled', 'incomplete_expired')
     order by created_at desc limit 1`, [agentId, livemode],
  ))[0] ?? null;
}

/** Commit this reservation BEFORE making any request to Stripe. */
export async function reserveCheckout(
  tx: Tx, agentId: string, key: string, config: { priceId: string; livemode: boolean; siteUrl: string },
): Promise<BillingCheckout> {
  if (!await lockBilling(tx, agentId)) throw new Error("billing_profile_missing");
  const existing = await getCheckout(tx, agentId, key) ?? await currentCheckout(tx, agentId, config.livemode);
  if (existing) return existing;
  const rows = await tx.query<BillingCheckout>(
    `insert into billing_private.checkouts (agent_id, idempotency_key, price_id, livemode, site_url)
     values ($1::uuid, $2::uuid, $3::text, $4::boolean, $5::text) returning *`,
    [agentId, key, config.priceId, config.livemode, config.siteUrl],
  );
  return rows[0];
}

export async function saveSession(tx: Tx, checkout: BillingCheckout, sessionId: string, status: string) {
  await tx.query(
    `update billing_private.checkouts set session_id = $3::text,
       status = case when status = 'complete' then status else $4::text end
     where agent_id = $1::uuid and idempotency_key = $2::uuid and (session_id is null or session_id = $3::text)`,
    [checkout.agent_id, checkout.idempotency_key, sessionId, status],
  );
}

export async function saveSubscription(tx: Tx, checkout: BillingCheckout, subscription: {
  id: string; customerId: string; status: string; cancelAtPeriodEnd: boolean; periodEnd: Date; latestInvoiceId: string | null;
}) {
  await tx.query(
    `update billing_private.checkouts set status = 'complete', subscription_id = $3::text,
       customer_id = $4::text, subscription_status = $5::text,
       cancel_at_period_end = $6::boolean, period_end = $7::timestamptz, latest_invoice_id = $8::text
     where agent_id = $1::uuid and idempotency_key = $2::uuid`,
    [checkout.agent_id, checkout.idempotency_key, subscription.id, subscription.customerId,
      subscription.status, subscription.cancelAtPeriodEnd, subscription.periodEnd, subscription.latestInvoiceId],
  );
}

export async function saveReceipt(tx: Tx, receipt: BillingReceipt) {
  await tx.query(
    `insert into billing_private.receipts
       (invoice_id, agent_id, checkout_key, invoice_number, amount_paid, currency, paid_at, hosted_invoice_url, invoice_pdf, livemode)
     values ($1::text, $2::uuid, $3::uuid, $4::text, $5::int, $6::text, $7::timestamptz, $8::text, $9::text, $10::boolean)
     on conflict (invoice_id) do nothing`,
    [receipt.invoice_id, receipt.agent_id, receipt.checkout_key, receipt.invoice_number, receipt.amount_paid,
      receipt.currency, receipt.paid_at, receipt.hosted_invoice_url, receipt.invoice_pdf, receipt.livemode],
  );
}

export async function checkoutReceipt(tx: Tx, agentId: string, key: string): Promise<BillingReceipt | null> {
  return (await tx.query<BillingReceipt>(
    `select * from billing_private.receipts where agent_id = $1::uuid and checkout_key = $2::uuid
     order by paid_at asc, invoice_id asc limit 1`, [agentId, key],
  ))[0] ?? null;
}

export async function listReceipts(tx: Tx, agentId: string, livemode: boolean): Promise<BillingReceipt[]> {
  return tx.query<BillingReceipt>(
    `select * from billing_private.receipts where agent_id = $1::uuid and livemode = $2::boolean
     order by paid_at desc, invoice_id desc limit 100`, [agentId, livemode],
  );
}

export async function hasUnresolvedBilling(tx: Tx, agentId: string): Promise<boolean> {
  const rows = await tx.query<{ exists: boolean }>(
    `select exists(select 1 from billing_private.checkouts where agent_id = $1::uuid
      and status <> 'expired' and coalesce(subscription_status, '') not in ('canceled', 'incomplete_expired')) as exists`,
    [agentId],
  );
  return rows[0].exists;
}

export async function hasPaidSubscription(tx: Tx, agentId: string): Promise<boolean> {
  const rows = await tx.query<{ allowed: boolean }>(
    `select billing_private.has_paid_access($1::uuid) as allowed`, [agentId],
  );
  return rows[0].allowed;
}
