import type { Metadata } from "next";
import Link from "next/link";
import { brand, business, legalUpdated } from "@/config/brand";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <div>
        <h1>Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated {legalUpdated.label}</p>
      </div>

      <p>
        {brand.name} is operated by {business.legalName} (&ldquo;we&rdquo;). Real estate agents use it to publish seller
        pages and manage the inquiries homeowners send through them. This policy explains what we collect, why, and the
        choices you have.
      </p>

      <section>
        <h2>If you sent a request through an agent&rsquo;s seller page</h2>
        <p>
          The agent named on the page decides how your information is used and is responsible for it. We store and
          process it for them so they can respond to you. The agent may link to their own or their brokerage&rsquo;s
          privacy policy instead of this one.
        </p>
        <ul>
          <li>
            <strong>What is collected:</strong> your name, email address, property address, selling timeline and
            preferred contact method, plus your phone number and message if you provide them. We also record which page
            and shared link you came from (for example, a link the agent posted on Instagram) and the domain of the
            website that referred you, never the full address.
          </li>
          <li>
            <strong>How it is used:</strong> it is shared only with the agent, who uses it to prepare your estimate and
            contact you about it. Submitting a request does not sign you up for marketing.
          </li>
          <li>
            <strong>Optional marketing emails:</strong> only if you tick the optional box. We store the exact wording you
            agreed to, when and on which page. Every email has an unsubscribe link, and unsubscribing stops further
            emails from the agent through {brand.name}.
          </li>
          <li>
            <strong>Booking:</strong> if you open the agent&rsquo;s booking link, we record that the link was opened. The
            scheduling page itself belongs to a third party with its own privacy policy.
          </li>
        </ul>
      </section>

      <section>
        <h2>If you have an agent account</h2>
        <p>
          We collect your account email and password (stored only as a one-way hash), the profile details you enter
          (name, brokerage, license number, contact email, phone, logo, headshot, colors, service areas, introduction,
          booking link and time zone) and the content you create: seller pages, notes, reminders, consultations, email
          templates, follow-up plans and messages. When you accept the <Link href="/terms">Terms of Service</Link>, we record when and
          which version you accepted.
        </p>
        <p>
          Follow-up plans create reminders and drafts for you to review. Each plan email requires you to press Send;
          text reminders do not send texts. When enabled, a daily digest containing lead names and follow-up details
          goes only to your notification email, or your contact email if none is set. You can turn it off in Settings → Preferences.
        </p>
        <p>If you subscribe, Stripe collects your payment details on its hosted checkout. We store Stripe customer, subscription and checkout references, subscription status and paid invoice receipts (amount, currency, time and invoice links). We do not store your full card number or security code.</p>
      </section>

      <section>
        <h2>What we don&rsquo;t do</h2>
        <ul>
          <li>We don&rsquo;t sell or rent personal information or use it for advertising.</li>
          <li>
            We don&rsquo;t use analytics, advertising or tracking cookies, pixels or third-party scripts. See the{" "}
            <Link href="/cookies">Cookie Policy</Link>.
          </li>
          <li>We don&rsquo;t produce automated home valuations. Estimates are prepared by the agent personally.</li>
        </ul>
      </section>

      <section>
        <h2>Why we process it</h2>
        <p>
          To provide the service an agent signed up for (contract), to keep it secure and prevent spam and abuse
          (legitimate interests), to send marketing emails only to people who opted in (consent), and to meet legal
          obligations. To prevent abuse we keep a one-way, keyed fingerprint of your connection&rsquo;s IP address for
          up to a day; the address itself is not stored.
        </p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>We share data only with the providers that run {brand.name} for us:</p>
        <ul>
          <li>Supabase – database hosting and account sign-in.</li>
          <li>Resend – email delivery, only when email sending is turned on.</li>
          <li>Stripe – subscription payments, billing management and receipts, when you choose to subscribe.</li>
          <li>Our website hosting provider – serves the website and processes requests to it.</li>
        </ul>
        <p>These providers may process data outside your country.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          Homeowner information is kept until the agent deletes it or deletes their account. Agent data is kept while
          the account is open. Deletion in the app is immediate and permanent; copies in our database provider&rsquo;s
          backups are overwritten within their backup cycle.
        </p>
        <p>Pending checkouts and subscriptions must be closed before account deletion. Deleting your account removes our local billing records. Stripe may retain financial records under its own retention obligations.</p>
      </section>

      <section id="your-rights">
        <h2>Your rights and deletion requests</h2>
        <p>
          You can ask to access, correct or delete your information, object to its use, or withdraw consent at any time.
          Depending on where you live, you may also complain to your data protection authority.
        </p>
        <ul>
          <li>
            <strong>Homeowners:</strong> contact the agent using the details on their page (each page has a &ldquo;Delete
            my data&rdquo; link). Agents can permanently delete your record from their workspace. You can also email us
            at <a href={`mailto:${business.email}`}>{business.email}</a> and we will pass your request to the agent.
          </li>
          <li>
            <strong>Agents:</strong> delete your account and all of its data at any time in Settings → Preferences, or
            email us.
          </li>
        </ul>
        <p>We respond within 30 days and may ask you to confirm your identity first.</p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Data is sent over encrypted connections, and each agent can only access their own records; this is enforced in
          the database itself. No system is perfectly secure, so please tell us if you notice a problem.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>{brand.name} is not intended for anyone under 18, and we don&rsquo;t knowingly collect their information.</p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We&rsquo;ll update the date above when this policy changes and tell account holders before significant
          changes take effect. Questions: {business.legalName}, {business.address},{" "}
          <a href={`mailto:${business.email}`}>{business.email}</a>.
        </p>
      </section>
    </>
  );
}
