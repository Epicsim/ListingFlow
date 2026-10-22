import { Mail, MapPin, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import type { PublicCampaign } from "@/lib/data/public";
import { brandStyle } from "@/lib/color";
import { assetUrl } from "@/lib/images";
import { firstName } from "@/lib/email/templates";
import { InquiryForm } from "./inquiry-form";

export type LandingData = PublicCampaign;

interface Props {
  data: LandingData;
  mode: "live" | "preview";
  form: {
    slug: string;
    token: string;
    utm: Record<string, string | undefined>;
    consentWording: string;
  };
  banner?: ReactNode;
}

export function privacyHref(data: Pick<LandingData, "privacy_policy_url">) {
  return data.privacy_policy_url ?? "/privacy";
}

export function AgentHeader({ data }: { data: LandingData }) {
  const logo = assetUrl(data.logo_asset_id);
  return (
    <header className="border-b border-black/5 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={data.brokerage ? `${data.brokerage} logo` : `${data.agent_name} logo`} className="h-9 w-auto max-w-[160px] object-contain" />
          ) : null}
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold text-ink">{data.agent_name}</p>
            {data.brokerage ? <p className="truncate text-xs text-ink-muted">{data.brokerage}</p> : null}
          </div>
        </div>
        {data.phone ? (
          <a
            href={`tel:${data.phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-sunken"
          >
            <Phone aria-hidden className="size-4 text-[var(--brand-text)]" />
            <span className="hidden sm:inline">{data.phone}</span>
            <span className="sm:hidden">Call</span>
          </a>
        ) : null}
      </div>
    </header>
  );
}

export function LandingFooter({ data }: { data: LandingData }) {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-[13px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {data.agent_name}
          {data.brokerage ? ` · ${data.brokerage}` : ""}
          {data.license_number ? ` · License ${data.license_number}` : ""}
        </p>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href={privacyHref(data)} className="underline-offset-4 hover:text-ink hover:underline">
            Privacy
          </a>
          <span className="inline-flex items-center gap-2">Page by <BrandMark compact /></span>
        </nav>
      </div>
    </footer>
  );
}

export function LandingPage({ data, mode, form, banner }: Props) {
  const hero = assetUrl(data.hero_asset_id);
  const headshot = assetUrl(data.headshot_asset_id);
  const agentFirst = firstName(data.agent_name);
  const area = data.service_areas[0];

  const steps = [
    {
      title: "Tell me about your home",
      body: "Share the address and your timing. It takes about a minute.",
    },
    {
      title: `${agentFirst} prepares your estimate`,
      body: `${agentFirst} reviews your home and the local market personally – it's not an automated or instant valuation.`,
    },
    {
      title: "Talk it through – if you'd like",
      body: "Get your estimate and, if it's helpful, book a no-obligation consultation.",
    },
  ];

  return (
    <div className="brand-scope min-h-screen bg-[#faf8f4]" style={brandStyle(data.primary_color)}>
      {banner}
      <AgentHeader data={data} />

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_80%_at_20%_0%,color-mix(in_srgb,var(--brand)_12%,transparent),transparent)]"
          />
          {/* Mobile order: intro → form → details. Desktop: intro and details on the left, sticky form on the right. */}
          <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pt-8 pb-12 sm:px-6 sm:pt-12 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-8 lg:pt-16 lg:pb-20">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[13px] font-medium text-ink-soft shadow-sm ring-1 ring-black/5">
                <MapPin aria-hidden className="size-3.5 text-[var(--brand-text)]" />
                {area ? `Personal home-price estimates · ${area}` : "Personal home-price estimates"}
              </p>
              <h1 className="font-display text-[32px] leading-[1.1] font-semibold tracking-tight text-ink text-balance sm:text-[44px]">
                {data.headline}
              </h1>
              <div className="mt-4 max-w-xl space-y-3 text-[17px] leading-relaxed text-ink-soft">
                {data.description.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>

            <div id="request" className="min-w-0 scroll-mt-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
              <InquiryForm
                slug={form.slug}
                token={form.token}
                utm={form.utm}
                ctaText={data.cta_text}
                agentName={data.agent_name}
                consentWording={form.consentWording}
                privacyHref={privacyHref(data)}
                disabled={mode === "preview"}
              />
            </div>

            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              {hero ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hero}
                  alt=""
                  className="mb-8 aspect-[16/10] w-full rounded-2xl object-cover shadow-raised ring-1 ring-black/5"
                />
              ) : null}

              <h2 className="sr-only">How it works</h2>
              <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {steps.map((step, i) => (
                  <li key={step.title} className="flex gap-3 rounded-xl bg-white p-4 shadow-card ring-1 ring-black/5 sm:block">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,white)] text-sm font-semibold text-[var(--brand-text)]">
                      {i + 1}
                    </span>
                    <div className="sm:mt-3">
                      <h3 className="text-[15px] font-semibold text-ink">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section aria-labelledby="about-agent" className="border-t border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[auto_1fr] md:gap-10">
            {headshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headshot}
                alt={`Photo of ${data.agent_name}`}
                className="size-28 rounded-full object-cover shadow-card ring-4 ring-white sm:size-32"
              />
            ) : null}
            <div className="min-w-0">
              <h2 id="about-agent" className="font-display text-2xl font-semibold tracking-tight">
                About {data.agent_name}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {[data.brokerage, data.license_number ? `License ${data.license_number}` : null].filter(Boolean).join(" · ") ||
                  "Real estate agent"}
              </p>
              {data.intro ? (
                <div className="mt-4 max-w-2xl space-y-3 leading-relaxed text-ink-soft">
                  {data.intro.split(/\n{2,}/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : null}
              {data.service_areas.length ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Areas served</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {data.service_areas.map((a) => (
                      <li key={a} className="rounded-full bg-sunken px-3 py-1 text-sm text-ink-soft">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <a href={`mailto:${data.contact_email}`} className="inline-flex items-center gap-2 font-medium text-[var(--brand-text)] underline-offset-4 hover:underline">
                  <Mail aria-hidden className="size-4" /> {data.contact_email}
                </a>
                {data.phone ? (
                  <a
                    href={`tel:${data.phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center gap-2 font-medium text-[var(--brand-text)] underline-offset-4 hover:underline"
                  >
                    <Phone aria-hidden className="size-4" /> {data.phone}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter data={data} />
    </div>
  );
}
