import { addDays, startOfZonedDay, zonedDate } from "./time";

export const RANGE_PRESETS = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "365d", label: "Last 12 months", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"] | "custom";

export interface ResolvedRange {
  key: RangeKey;
  label: string;
  /** Inclusive UTC start, or null for all time. */
  from: Date | null;
  /** Exclusive UTC end. */
  to: Date;
  /** Calendar dates in the agent's time zone, for the custom range inputs. */
  fromDate: string | null;
  toDate: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns `?range=30d` or `?from=YYYY-MM-DD&to=YYYY-MM-DD` into UTC bounds,
 * where days start and end at midnight in the agent's time zone.
 */
export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  timeZone: string,
  now: Date,
): ResolvedRange {
  const today = zonedDate(now, timeZone);

  if (params.from && params.to && DATE_RE.test(params.from) && DATE_RE.test(params.to)) {
    const [fromDate, toDate] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    return {
      key: "custom",
      label: `${fromDate} – ${toDate}`,
      from: startOfZonedDay(fromDate, timeZone),
      to: startOfZonedDay(addDays(toDate, 1), timeZone),
      fromDate,
      toDate,
    };
  }

  const preset = RANGE_PRESETS.find((p) => p.key === params.range) ?? RANGE_PRESETS[1];
  const toExclusive = startOfZonedDay(addDays(today, 1), timeZone);
  if (preset.days === null) {
    return { key: preset.key, label: preset.label, from: null, to: toExclusive, fromDate: null, toDate: today };
  }
  const fromDate = addDays(today, -(preset.days - 1));
  return {
    key: preset.key,
    label: preset.label,
    from: startOfZonedDay(fromDate, timeZone),
    to: toExclusive,
    fromDate,
    toDate: today,
  };
}
