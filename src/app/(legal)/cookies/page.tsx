import type { Metadata } from "next";
import { brand, business, COOKIE_NOTICE_KEY, legalUpdated } from "@/config/brand";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const metadata: Metadata = { title: "Cookie Policy" };

const ITEMS = [
  {
    name: "sb-<project>-auth-token",
    type: "Cookie",
    purpose: "Keeps you signed in to your agent account.",
    lifetime: "Until you sign out (at most 400 days)",
  },
  {
    name: "sb-<project>-auth-token-code-verifier",
    type: "Cookie",
    purpose: "Secures email confirmation and password reset links.",
    lifetime: "Until the link is used",
  },
  {
    name: "lf_local_session",
    type: "Cookie",
    purpose: "Sign-in for local development installs only.",
    lifetime: "7 days",
  },
  { name: THEME_STORAGE_KEY, type: "Browser storage", purpose: "Remembers the light or dark theme you chose.", lifetime: "Until you clear it" },
  { name: COOKIE_NOTICE_KEY, type: "Browser storage", purpose: "Remembers that you closed the cookie notice.", lifetime: "Until you clear it" },
];

export default function CookiesPage() {
  return (
    <>
      <div>
        <h1>Cookie Policy</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated {legalUpdated.label}</p>
      </div>

      <p>
        {brand.name} uses only what is strictly necessary to sign you in and remember your display settings. There are
        no analytics, advertising or third-party tracking cookies, so we don&rsquo;t ask for cookie consent; the notice
        you see simply tells you this.
      </p>

      <section>
        <h2>What we store</h2>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-ink">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2 font-semibold">Purpose</th>
                <th scope="col" className="px-3 py-2 font-semibold">Kept for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ITEMS.map((item) => (
                <tr key={item.name} className="align-top">
                  <td className="px-3 py-2">
                    <code className="text-[13px] break-all text-ink">{item.name}</code>
                    <span className="block text-xs text-ink-muted">{item.type}</span>
                  </td>
                  <td className="px-3 py-2">{item.purpose}</td>
                  <td className="px-3 py-2">{item.lifetime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Seller pages</h2>
        <p>
          Agents&rsquo; public seller pages and their confirmation pages set no cookies. If you open an agent&rsquo;s
          booking link, you leave {brand.name} for their scheduling service, which has its own cookie policy.
        </p>
      </section>

      <section>
        <h2>Payments</h2>
        <p>Checkout and billing management open on Stripe&rsquo;s website. Stripe may use cookies needed for payment processing and fraud prevention under its own cookie policy. We do not load Stripe scripts or set Stripe cookies on {brand.name} pages.</p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can block or delete cookies and browser storage in your browser settings. Blocking the sign-in cookies
          will sign you out of your account. Questions: <a href={`mailto:${business.email}`}>{business.email}</a>.
        </p>
      </section>
    </>
  );
}
