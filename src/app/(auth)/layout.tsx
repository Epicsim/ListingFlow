import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { LocalModeNotice } from "@/components/local-mode-notice";
import { Check } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4 sm:px-8">
        <BrandMark />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-5 py-10 sm:px-8 lg:grid-cols-2 lg:py-20">
        <div className="hidden max-w-lg lg:block">
          <p className="text-xs font-semibold tracking-[0.12em] text-accent-ink uppercase">A clearer way to grow</p>
          <h2 className="mt-5 text-[52px] leading-[1.1] font-semibold tracking-[-0.05em]">Less admin.<br /><span className="text-accent-ink">More conversations.</span></h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-muted">Keep your seller pages, inquiries and follow-ups together. Make space for the work that matters.</p>
          <ul className="mt-8 space-y-4 text-sm text-ink-soft">{["Seller pages that feel like you", "Every inquiry, organized", "A clear next step for every lead"].map((item) => <li key={item} className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><Check aria-hidden className="size-3.5" /></span>{item}</li>)}</ul>
        </div>
        <div className="mx-auto w-full max-w-[440px]">
          {children}
          <LocalModeNotice className="mt-6" />
        </div>
      </main>
    </div>
  );
}
