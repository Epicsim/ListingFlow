import { ArrowRight, CalendarCheck, ClipboardList, Link2, ListChecks } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/config/brand";

const STEPS = [
  {
    icon: Link2,
    title: "Publish a seller page",
    body: "Start from editable copy for a personal home-price estimate request, add your branding, and publish.",
  },
  {
    icon: ClipboardList,
    title: "Share it where you already are",
    body: "Put tracked links in your Instagram bio, website, email signature or your own ads to see which channel works.",
  },
  {
    icon: ListChecks,
    title: "Follow up in one place",
    body: "Inquiries land in a focused lead list with statuses, reminders, notes and email templates.",
  },
  {
    icon: CalendarCheck,
    title: "Track real consultations",
    body: "Offer your existing booking link, then record the consultations that actually happen and their outcomes.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <BrandMark />
        <nav className="flex items-center gap-2" aria-label="Account">
          <ButtonLink href="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup">Get started</ButtonLink>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
          <p className="text-sm font-medium text-accent">For individual real estate agents</p>
          <h1 className="mt-3 max-w-3xl font-display text-[40px] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
            {brand.tagline}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
            {brand.name} turns the traffic you already bring – from your social profiles, website or ads – into seller
            inquiries and booked consultations. It doesn&rsquo;t create traffic or promise leads; it helps you convert
            and follow up on the visitors you have.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/signup" size="lg">
              Create your seller page <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <ButtonLink href="/login" size="lg" variant="secondary">
              Sign in
            </ButtonLink>
          </div>
        </section>

        <section aria-labelledby="how" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="how" className="font-display text-2xl font-semibold tracking-tight">
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="rounded-xl border border-line bg-canvas/60 p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Icon aria-hidden className="size-[18px]" />
                    </span>
                    <span className="text-xs font-medium text-ink-muted">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-10 max-w-3xl text-sm text-ink-muted">
              Estimates are prepared by you, the agent. {brand.name} doesn&rsquo;t generate valuations or connect to
              the MLS, and homeowners are told that clearly.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-muted sm:px-6">
          <p>{brand.name}</p>
          <Link href="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
