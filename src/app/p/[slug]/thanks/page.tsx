import { CalendarDays, CheckCircle2, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentHeader, LandingFooter } from "@/components/landing/landing-page";
import { isSavedInquiryReference } from "@/lib/data/public";
import { brandStyle } from "@/lib/color";
import { asService } from "@/lib/db";
import { firstName } from "@/lib/email/templates";
import { uuidSchema } from "@/lib/validation";
import { loadPublicCampaign } from "../data";

export const metadata: Metadata = {
  // Neutral on purpose: the page only says "received" after verifying the reference.
  title: "Your request",
  robots: { index: false, follow: false },
};

export default async function ThanksPage({ params, searchParams }: PageProps<"/p/[slug]/thanks">) {
  const { slug } = await params;
  const { r } = await searchParams;
  const data = await loadPublicCampaign(slug);
  if (!data) notFound();

  const ref = typeof r === "string" && uuidSchema.safeParse(r).success ? r : null;
  const saved = ref ? await asService((tx) => isSavedInquiryReference(tx, slug, ref)) : false;
  const agentFirst = firstName(data.agent_name);

  return (
    <div className="brand-scope flex min-h-screen flex-col bg-[#faf8f4]" style={brandStyle(data.primary_color)}>
      <AgentHeader data={data} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
        {saved ? (
          <div className="rounded-2xl bg-white p-6 shadow-raised ring-1 ring-black/5 sm:p-10">
            <CheckCircle2 aria-hidden className="size-10 text-[var(--brand-text)]" />
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">Request received</h1>
            <div className="mt-3 space-y-3 text-[17px] leading-relaxed text-ink-soft">
              {data.thank_you_message.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <h2 className="mt-8 text-sm font-semibold tracking-wide text-ink-muted uppercase">What happens next</h2>
            <ol className="mt-3 space-y-3 text-[15px] text-ink-soft">
              <li className="flex gap-3">
                <span className="font-semibold text-[var(--brand-text)]">1.</span>
                {agentFirst} reviews your home&rsquo;s details and prepares your estimate personally.
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-[var(--brand-text)]">2.</span>
                You&rsquo;ll hear back using the contact method you chose.
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-[var(--brand-text)]">3.</span>
                If it&rsquo;s helpful, you can talk it through in a no-obligation consultation.
              </li>
            </ol>

            {data.booking_url ? (
              <div className="mt-8 rounded-xl bg-[color-mix(in_srgb,var(--brand)_8%,white)] p-5 ring-1 ring-[color-mix(in_srgb,var(--brand)_20%,transparent)]">
                <h2 className="font-semibold text-ink">Want to pick a time now?</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Optional – your request has already been sent. This opens {agentFirst}&rsquo;s scheduling page, where
                  you can choose a consultation time.
                </p>
                <a
                  href={`/p/${slug}/book?r=${ref}`}
                  rel="nofollow"
                  className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--brand)] px-5 font-medium text-[var(--brand-contrast)] shadow-sm hover:brightness-95"
                >
                  <CalendarDays aria-hidden className="size-4" />
                  Book a consultation
                </a>
              </div>
            ) : null}

            <div className="mt-8 border-t border-line pt-6 text-sm text-ink-muted">
              <p>Questions in the meantime?</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                <a href={`mailto:${data.contact_email}`} className="inline-flex items-center gap-2 font-medium text-[var(--brand-text)] hover:underline">
                  <Mail aria-hidden className="size-4" /> {data.contact_email}
                </a>
                {data.phone ? (
                  <a
                    href={`tel:${data.phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center gap-2 font-medium text-[var(--brand-text)] hover:underline"
                  >
                    <Phone aria-hidden className="size-4" /> {data.phone}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-black/5 sm:p-10">
            <h1 className="font-display text-2xl font-semibold tracking-tight">We can&rsquo;t confirm a request from this link</h1>
            <p className="mt-2 text-ink-soft">
              This confirmation link is incomplete or has expired. If you meant to send a request, please use the form.
            </p>
            <a
              href={`/p/${slug}#request`}
              className="mt-6 inline-flex h-11 items-center rounded-lg bg-[var(--brand)] px-5 font-medium text-[var(--brand-contrast)] hover:brightness-95"
            >
              Go to the request form
            </a>
          </div>
        )}
      </main>
      <LandingFooter data={data} />
    </div>
  );
}
