import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { LegalFooter } from "@/components/legal-footer";

/** Privacy, terms, cookies, refunds and unsubscribe pages. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <header className="px-4 py-5 sm:px-8">
        <BrandMark />
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pt-6 pb-16 text-[15px] leading-relaxed text-ink-soft [&_a]:text-accent-ink [&_a]:underline [&_a]:underline-offset-4 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-ink [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1 [&_section>p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
      >
        {children}
      </main>
      <LegalFooter />
    </div>
  );
}
