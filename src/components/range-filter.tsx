import type { ResolvedRange } from "@/lib/date-range";
import { RANGE_PRESETS } from "@/lib/date-range";

/** Date-range picker as a plain GET form, so it works without JavaScript and is shareable by URL. */
export function RangeFilter({ range }: { range: ResolvedRange }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Date range">
      <div>
        <label htmlFor="range" className="mb-1 block text-xs font-medium text-ink-muted">
          Period
        </label>
        <select id="range" name="range" defaultValue={range.key === "custom" ? "30d" : range.key} className="input-base h-9 w-auto py-1.5 pr-8 text-sm">
          {RANGE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <details className="group relative" open={range.key === "custom"}>
        <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg px-2.5 text-sm text-ink-soft hover:bg-sunken [&::-webkit-details-marker]:hidden">
          Custom dates
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-2 sm:absolute sm:right-0 sm:z-10 sm:mt-1 sm:rounded-lg sm:border sm:border-line sm:bg-surface sm:p-3 sm:shadow-raised">
          <div>
            <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-muted">
              From
            </label>
            <input id="from" type="date" name="from" defaultValue={range.key === "custom" ? (range.fromDate ?? "") : ""} className="input-base h-9 py-1.5 text-sm" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-muted">
              To
            </label>
            <input id="to" type="date" name="to" defaultValue={range.key === "custom" ? range.toDate : ""} className="input-base h-9 py-1.5 text-sm" />
          </div>
        </div>
      </details>
      <button type="submit" className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium shadow-sm hover:bg-sunken/60">
        Apply
      </button>
    </form>
  );
}
