import { CalendarDays, ChevronDown } from "lucide-react";
import type { ResolvedRange } from "@/lib/date-range";
import { RANGE_PRESETS } from "@/lib/date-range";

const control = "h-11 rounded-xl text-sm sm:h-9";
// 16px text on phones so iOS doesn't zoom into the field on focus.
const field = "h-11 py-0 text-base sm:h-9 sm:text-sm";

/** Date-range picker as a plain GET form, so it works without JavaScript and is shareable by URL. */
export function RangeFilter({ range }: { range: ResolvedRange }) {
  return (
    <form method="get" className="flex w-full flex-wrap items-center gap-2 sm:w-auto" aria-label="Date range">
      <div className="relative min-w-0 flex-1 sm:flex-none">
        <label htmlFor="range" className="sr-only">
          Period
        </label>
        <CalendarDays
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 hidden size-4 -translate-y-1/2 text-ink-muted sm:block"
        />
        <select
          id="range"
          name="range"
          defaultValue={range.key === "custom" ? "30d" : range.key}
          className={`input-base w-full pr-8 pl-3.5 font-medium shadow-sm sm:w-auto sm:pl-9 ${field}`}
        >
          {RANGE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <details className="group relative" open={range.key === "custom"}>
        <summary
          className={`flex list-none items-center gap-1 px-3 text-ink-soft hover:bg-sunken hover:text-ink group-open:bg-sunken group-open:text-ink [&::-webkit-details-marker]:hidden ${control}`}
        >
          <span className="sm:hidden">Custom</span>
          <span className="hidden sm:inline">Custom dates</span>
          <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-2 sm:absolute sm:right-0 sm:z-10 sm:mt-1.5 sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:p-3 sm:shadow-raised">
          <div>
            <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-muted">
              From
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={range.key === "custom" ? (range.fromDate ?? "") : ""}
              className={`input-base ${field}`}
            />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-muted">
              To
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={range.key === "custom" ? range.toDate : ""}
              className={`input-base ${field}`}
            />
          </div>
        </div>
      </details>
      <button
        type="submit"
        className={`border border-line-strong bg-surface px-3.5 font-medium text-ink shadow-sm hover:bg-sunken/60 ${control}`}
      >
        Apply
      </button>
    </form>
  );
}
