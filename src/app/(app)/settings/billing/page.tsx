import { randomUUID } from "node:crypto";
import { CreditCard, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MONTHLY_PLAN } from "@/config/billing";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { CheckboxField } from "@/components/ui/fields";
import { requireAgent } from "@/lib/auth/session";
import { billingEnabled, billingMessage } from "@/lib/billing/config";
import { refreshCheckout } from "@/lib/billing/service";
import { currentCheckout, listReceipts } from "@/lib/data/billing";
import { asUser } from "@/lib/db";
import { SettingsTabs } from "../settings-tabs";
import { checkoutAction, closeCheckoutAction, portalAction, refreshBillingAction } from "./actions";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ canceled?: string; subscription_required?: string }> }) {
  const { user } = await requireAgent();
  const enabled = billingEnabled();
  const live = process.env.BILLING_MODE === "live";
  let checkout = await asUser(user.id, (tx) => currentCheckout(tx, user.id, live));
  let refreshError: string | null = null;
  if (enabled && checkout && (checkout.session_id || checkout.subscription_id)) {
    try { await refreshCheckout(user.id, checkout.idempotency_key); }
    catch (error) { refreshError = billingMessage(error); }
    checkout = await asUser(user.id, (tx) => currentCheckout(tx, user.id, live));
  }
  const receipts = await asUser(user.id, (tx) => listReceipts(tx, user.id, live));
  const params = await searchParams;
  const key = checkout?.idempotency_key ?? randomUUID();
  return (
    <>
      <PageHeader title="Settings" description="Your subscription, payment history and receipts." />
      <SettingsTabs />
      <div className="max-w-4xl space-y-6">
        {params.subscription_required ? <Notice title="Choose your monthly plan">An active paid subscription is required to use your workspace and publish seller pages. Your saved data stays in your account.</Notice> : null}
        {!enabled ? <Notice title="Checkout is currently unavailable">Please try again later or contact support. Saved billing records are shown below.</Notice> : null}
        {enabled && !live ? <Notice tone="warning" title="Stripe test mode">Use Stripe test cards only. Test payments do not move real money.</Notice> : null}
        {refreshError ? <Notice tone="warning">{refreshError}</Notice> : null}
        {params.canceled ? <Notice tone="neutral">You returned from checkout. You can resume it below; payment is confirmed only after Stripe verifies it.</Notice> : null}
        <Card>
          <CardHeader title="Your seller workspace" action={<Badge tone={checkout?.subscription_status === "active" ? "accent" : "neutral"}>{checkout?.subscription_status?.replaceAll("_", " ") ?? "No subscription"}</Badge>} />
          <div className="space-y-5 p-5 sm:p-6">
            <p className="text-3xl font-semibold tracking-tight">US$20<span className="text-base font-normal text-ink-muted"> / month</span></p>
            <p className="text-sm text-ink-soft">Branded seller pages, organized inquiries, follow-up reminders, campaign tracking, consultation records and email templates.</p>
            <p className="text-sm text-ink-muted">Billed monthly in US dollars. Renews automatically until you cancel in Manage billing. Stripe handles payment details.</p>
            {checkout?.cancel_at_period_end && checkout.period_end ? <Notice tone="neutral">Cancellation is scheduled for {checkout.period_end.toLocaleDateString("en-US", { timeZone: "UTC" })}.</Notice> : null}
            {checkout?.customer_id ? (
              <ActionForm action={portalAction}><SubmitButton pendingLabel="Opening billing…"><CreditCard aria-hidden className="size-4" />Manage billing</SubmitButton></ActionForm>
            ) : (
              <ActionForm action={checkoutAction} className="space-y-4">
                <input type="hidden" name="checkout_key" value={key} />
                <CheckboxField name="agree_recurring" value="yes" label={`I agree to ${MONTHLY_PLAN.label}, renewing automatically until canceled.`} required disabled={!enabled} />
                <SubmitButton disabled={!enabled} pendingLabel="Opening secure checkout…">{checkout ? "Resume checkout" : "Subscribe for US$20/month"}</SubmitButton>
              </ActionForm>
            )}
            {checkout ? <ActionForm action={refreshBillingAction}><input type="hidden" name="checkout_key" value={key} /><SubmitButton variant="secondary" disabled={!enabled} pendingLabel="Checking Stripe…">Refresh billing status</SubmitButton></ActionForm> : null}
            {checkout?.session_id && !checkout.subscription_id ? <ActionForm action={closeCheckoutAction}><input type="hidden" name="checkout_key" value={key} /><SubmitButton variant="secondary" disabled={!enabled} pendingLabel="Closing unpaid checkout…">Close pending checkout</SubmitButton></ActionForm> : null}
            <p className="text-xs leading-relaxed text-ink-muted">Retrying checkout reuses your existing payment attempt. Once paid, the same checkout returns your saved receipt. <Link className="underline" href="/refunds">Refund policy</Link></p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Payment history" description="Receipts appear after Stripe confirms a paid invoice, including monthly renewals." />
          {receipts.length ? <ul className="divide-y divide-line">{receipts.map((receipt) => <li key={receipt.invoice_id} className="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6"><div><p className="text-sm font-medium">{!receipt.livemode ? "Test · " : ""}{new Intl.NumberFormat("en-US", { style: "currency", currency: receipt.currency }).format(receipt.amount_paid / 100)} paid</p><p className="mt-1 text-xs text-ink-muted">{receipt.paid_at.toLocaleDateString("en-US", { timeZone: "UTC" })} · {receipt.invoice_number ?? receipt.invoice_id}</p></div>{receipt.hosted_invoice_url ? <a href={receipt.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline">View paid invoice<span className="sr-only"> (opens a new tab)</span></a> : <Link href={`/settings/billing/receipt/${receipt.checkout_key}`} className="inline-flex min-h-11 items-center text-sm underline">View receipt</Link>}</li>)}</ul> : <EmptyState compact icon={<ReceiptText />} title="No payments yet">Your paid invoices will be saved here. An open checkout is not a payment receipt.</EmptyState>}
        </Card>
      </div>
    </>
  );
}
