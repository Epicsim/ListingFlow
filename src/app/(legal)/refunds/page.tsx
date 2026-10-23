import type { Metadata } from "next";
import { brand, business, legalUpdated } from "@/config/brand";

export const metadata: Metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  return (
    <>
      <div>
        <h1>Refund Policy</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated {legalUpdated.label}</p>
      </div>

      <section>
        <h2>Monthly subscriptions</h2>
        <p>
          {brand.name} costs US$20 per month, billed in US dollars through Stripe. The subscription renews automatically
          until you cancel in Settings → Billing → Manage billing. Cancellation stops future renewals at the end of
          your current billing period; it does not automatically refund a previous payment.
        </p>
      </section>

      <section>
        <h2>Refund requests</h2>
        <ul>
          <li>
            To request a refund, contact us with the invoice number shown in Settings → Billing. Please do not send
            card details. We review requests individually and confirm the outcome by email.
          </li>
          <li>Nothing will be charged unless you choose a paid plan.</li>
          <li>Any charge made in error, or charged twice, will be refunded in full.</li>
          <li>Approved refunds are processed through Stripe to the original payment method. Processing times depend on your payment provider.</li>
        </ul>
        <p>Nothing in this policy limits refund rights you have under consumer law.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about charges: <a href={`mailto:${business.email}`}>{business.email}</a>.
        </p>
      </section>
    </>
  );
}
