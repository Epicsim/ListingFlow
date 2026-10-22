import { ArrowUpRight, CalendarClock, Check, LayoutDashboard, MessageSquare, Users } from "lucide-react";
import { BrandGlyph } from "@/components/brand-mark";

/** An explicitly labeled product illustration, never presented as live metrics. */
export function WorkspacePreview() {
  return (
    <div className="relative rounded-[24px] border border-line bg-surface p-2 shadow-raised sm:p-3">
      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <BrandGlyph className="size-6" />Your workspace
          </span>
          <span className="rounded-full bg-sunken px-2.5 py-1 text-[10px] font-medium text-ink-muted">Product preview</span>
        </div>
        <div className="flex bg-canvas">
          <div aria-hidden className="hidden w-14 shrink-0 space-y-4 border-r border-line bg-surface px-3 py-6 sm:block">
            {[LayoutDashboard, Users, CalendarClock].map((Icon, i) => (
              <div key={i} className={`flex size-8 items-center justify-center rounded-lg ${i === 0 ? "bg-accent-soft text-accent-ink" : "text-ink-muted"}`}>
                <Icon className="size-4" />
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 p-5 sm:p-7">
            <p className="text-xs text-ink-muted">A little clarity goes a long way</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">Your next move, in focus.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-surface p-4">
                <MessageSquare aria-hidden className="mb-3 size-5 text-accent-ink" />
                <p className="text-sm font-medium">Seller inquiries</p>
                <p className="mt-1 text-xs text-ink-muted">One place to follow up</p>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <CalendarClock aria-hidden className="mb-3 size-5 text-accent-ink" />
                <p className="text-sm font-medium">Consultations</p>
                <p className="mt-1 text-xs text-ink-muted">A clearer next step</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">From hello to a new possibility</p>
                <ArrowUpRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
              </div>
              <ol className="mt-4 space-y-3">
                {["Inquiry received", "Personal follow-up", "Consultation recorded"].map((label, i) => (
                  <li key={label} className="flex items-center gap-3 text-xs text-ink-soft">
                    <span className={`flex size-6 items-center justify-center rounded-full ${i === 0 ? "bg-accent-soft text-accent-ink" : "bg-sunken text-ink-muted"}`}>
                      {i === 0 ? <Check aria-hidden className="size-3" /> : `0${i + 1}`}
                    </span>
                    {label}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
