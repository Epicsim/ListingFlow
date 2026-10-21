import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <header className="px-4 py-5 sm:px-8">
        <BrandMark />
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-6 pb-20">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Privacy notice</h1>
        <p className="mt-2 text-sm text-ink-muted">
          For seller pages created with {brand.name}. The real estate agent named on the page you visited is
          responsible for how your information is used, and may link to their own or their brokerage&rsquo;s policy
          instead.
        </p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-soft [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink">
          <section>
            <h2>What is collected</h2>
            <p>
              When you request an estimate we collect the details you enter: your name, email address, the property
              address, your selling timeline, your preferred contact method, and – only if you provide them – your
              phone number and message. We also record which page and link you came from (for example, a link the
              agent shared on Instagram) so the agent knows which of their channels are working.
            </p>
          </section>
          <section>
            <h2>How it is used</h2>
            <p>
              Your details are shared only with the agent, who uses them to prepare your estimate and to contact you
              about it. The estimate is prepared by the agent personally; no automated valuation is produced by this
              page. Submitting a request does not subscribe you to marketing.
            </p>
          </section>
          <section>
            <h2>Optional marketing emails</h2>
            <p>
              If you tick the optional box to receive updates, we store the exact wording you agreed to, when you
              agreed, and on which page. You can withdraw at any time by replying to the agent or asking them
              directly.
            </p>
          </section>
          <section>
            <h2>Protection and retention</h2>
            <p>
              Information is stored securely and is visible only to the agent&rsquo;s account. To prevent abuse we keep
              a one-way, keyed fingerprint of your connection&rsquo;s IP address for up to a day; the address itself is
              not stored.
            </p>
          </section>
          <section>
            <h2>Your choices</h2>
            <p>
              To see, correct or delete the information you submitted, contact the agent using the details on their
              page.
            </p>
          </section>
        </div>
        <p className="mt-10 text-sm">
          <Link href="/" className="text-accent underline-offset-4 hover:underline">
            About {brand.name}
          </Link>
        </p>
      </main>
    </div>
  );
}
