import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, DefinitionList, Notice, PageHeader } from "@/components/ui/display";
import { requireAgent } from "@/lib/auth/session";
import { billingEnabled, billingMessage } from "@/lib/billing/config";
import { checkoutKeySchema, getSavedReceipt, refreshCheckout } from "@/lib/billing/service";
import { getCheckout } from "@/lib/data/billing";
import { asUser } from "@/lib/db";
import { refreshBillingAction } from "../../actions";

export const metadata: Metadata = { title: "Payment receipt", robots: { index: false, follow: false } };

export default async function ReceiptPage({ params }: { params: Promise<{ key: string }> }) {
  const { user } = await requireAgent();
  const { key } = await params;
  if (!checkoutKeySchema.safeParse(key).success) notFound();
  const checkout = await asUser(user.id, (tx) => getCheckout(tx, user.id, key));
  if (!checkout) notFound();
  let receipt = await getSavedReceipt(user.id, key);
  let error: string | null = null;
  if (!receipt && billingEnabled()) {
    try { await refreshCheckout(user.id, key); receipt = await getSavedReceipt(user.id, key); }
    catch (cause) { error = billingMessage(cause); }
  }
  return <div className="max-w-2xl space-y-6">
    <PageHeader title={receipt ? (receipt.livemode ? "Payment receipt" : "Test payment receipt") : "Checking your payment"} description={receipt ? "This receipt is saved. Reopening this checkout will not charge you again." : "A receipt appears only after Stripe confirms payment."} />
    {error ? <Notice tone="warning">{error}</Notice> : null}
    {receipt ? <Card><CardHeader title={receipt.livemode ? "Payment confirmed" : "Test payment confirmed · no real money charged"} /><div className="space-y-5 p-5 sm:p-6"><DefinitionList items={[
      { label: "Plan", value: "ListingFlow · monthly subscription" },
      { label: "Amount paid", value: new Intl.NumberFormat("en-US", { style: "currency", currency: receipt.currency }).format(receipt.amount_paid / 100) },
      { label: "Paid on", value: receipt.paid_at.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" },
      { label: "Invoice", value: receipt.invoice_number ?? receipt.invoice_id },
      { label: "Checkout reference", value: key },
    ]} /><div className="flex flex-wrap gap-4 text-sm">{receipt.hosted_invoice_url ? <a className="inline-flex min-h-11 items-center text-accent-ink underline" href={receipt.hosted_invoice_url} target="_blank" rel="noopener noreferrer">Open paid invoice<span className="sr-only"> (opens a new tab)</span></a> : null}{receipt.invoice_pdf ? <a className="inline-flex min-h-11 items-center text-accent-ink underline" href={receipt.invoice_pdf} target="_blank" rel="noopener noreferrer">Download invoice PDF<span className="sr-only"> (opens a new tab)</span></a> : null}</div></div></Card> : <Card><div className="space-y-4 p-5 sm:p-6"><p className="text-sm text-ink-soft">Payment is not confirmed yet. If you completed checkout, check again in a moment. Your existing attempt stays linked to this reference.</p><ActionForm action={refreshBillingAction}><input type="hidden" name="checkout_key" value={key} /><SubmitButton disabled={!billingEnabled()} pendingLabel="Checking payment…">Check payment status</SubmitButton></ActionForm></div></Card>}
    <ButtonLink href="/settings/billing" variant="secondary">Back to billing</ButtonLink>
  </div>;
}
