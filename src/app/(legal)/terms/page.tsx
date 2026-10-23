import type { Metadata } from "next";
import Link from "next/link";
import { brand, business, legalUpdated } from "@/config/brand";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <>
      <div>
        <h1>Terms of Service</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated {legalUpdated.label}</p>
      </div>

      <p>
        These terms are an agreement between you and {business.legalName} (&ldquo;we&rdquo;) for using {brand.name}. By
        creating an account you agree to them. If you use {brand.name} for a brokerage or team, you confirm you are
        allowed to accept them on its behalf.
      </p>

      <section>
        <h2>1. What {brand.name} does</h2>
        <p>
          {brand.name} lets real estate agents publish seller pages, receive homeowner inquiries, keep notes and
          reminders, record consultations, build follow-up plans and write follow-up emails. It does not create traffic, buy ads, provide
          prospect lists, connect to the MLS or produce home valuations; any estimate is prepared by you. We don&rsquo;t
          promise any number of inquiries, consultations or listings.
        </p>
      </section>

      <p>Follow-up plans create reminders and drafts. Nothing from a plan is emailed to a homeowner until you review it
        and press Send. Text reminders do not send texts. A daily digest to your own notification or contact email is
        enabled by default and can be turned off in Settings → Preferences.</p>

      <section>
        <h2>2. Your account</h2>
        <p>
          You must be at least 18, give accurate information and keep your password secure. You are responsible for
          activity in your account. Tell us promptly at <a href={`mailto:${business.email}`}>{business.email}</a> if you
          think someone else has accessed it.
        </p>
      </section>

      <section>
        <h2>3. Homeowners&rsquo; information</h2>
        <p>
          For the inquiries you receive, you decide how the information is used, and you are responsible for following
          the laws that apply to you, including real estate advertising and licensing rules, privacy laws and laws on
          email, calls and texts (such as CAN-SPAM, the TCPA and the GDPR where they apply). In particular you agree to:
        </p>
        <ul>
          <li>contact homeowners only about their request, or with marketing they opted in to;</li>
          <li>honor unsubscribe requests and requests to access or delete their information;</li>
          <li>show any license, brokerage or other disclosures your jurisdiction requires on your pages and emails;</li>
          <li>
            link your own privacy policy in Settings if you need one beyond our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>You must not use {brand.name} to:</p>
        <ul>
          <li>publish false or misleading content, including fake reviews, endorsements or results;</li>
          <li>send spam or contact people who haven&rsquo;t asked to hear from you;</li>
          <li>break the law or infringe anyone&rsquo;s rights;</li>
          <li>access other accounts, probe or overload the service, or work around its security or limits.</li>
        </ul>
      </section>

      <section>
        <h2>5. Your content</h2>
        <p>
          You keep ownership of everything you add, such as your branding, page text, notes and emails. You give us
          permission to store, display and send it only as needed to run {brand.name} for you, and you confirm you have
          the right to use it.
        </p>
      </section>

      <section>
        <h2>6. Fees</h2>
        <p>
          The {brand.name} subscription costs US$20 per month, billed in US dollars through Stripe. It renews
          automatically each month until you cancel using Settings → Billing → Manage billing. Cancellation stops
          renewals at the end of the current billing period. We will never charge you without your agreement.
          Payment details are entered on Stripe&rsquo;s hosted checkout. Paid invoices are saved in Billing. See the{" "}
          <Link href="/refunds">Refund Policy</Link>.
        </p>
        <p>When live billing is enabled, workspace features and public seller pages require an active subscription with a current paid invoice. If payment lapses, those features pause. You can still access Billing and account settings to resolve payment or close your account. Local development and sandbox mode do not require payment.</p>
      </section>

      <section>
        <h2>7. Changes and availability</h2>
        <p>
          {brand.name} is under active development. Features may change, and the service may occasionally be
          unavailable. We will give account holders notice before changes that significantly reduce what they can do.
        </p>
      </section>

      <section>
        <h2>8. Ending your account</h2>
        <p>
          You can delete your account at any time in Settings → Preferences; this permanently deletes your pages, leads
          and all related data. We may suspend or close accounts that break these terms, and we will tell you why unless
          the law or safety prevents it.
        </p>
        <p>Before deleting an account, close pending checkouts and let any scheduled subscription cancellation finish, then refresh Billing. This prevents a subscription from continuing after account deletion.</p>
      </section>

      <section>
        <h2>9. Disclaimers and liability</h2>
        <p>
          {brand.name} is provided &ldquo;as is&rdquo;. To the extent the law allows, we disclaim implied warranties and
          are not liable for indirect or consequential losses, such as lost business or profits. Nothing in these terms
          limits rights you have under consumer law that can&rsquo;t be excluded.
        </p>
      </section>

      <section>
        <h2>10. Changes to these terms and contact</h2>
        <p>
          We&rsquo;ll update the date above when these terms change and tell account holders before significant changes
          take effect. Questions: {business.legalName}, {business.address},{" "}
          <a href={`mailto:${business.email}`}>{business.email}</a>.
        </p>
      </section>
    </>
  );
}
