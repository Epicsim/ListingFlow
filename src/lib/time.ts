/**
 * Timezone helpers. All timestamps are stored as UTC `timestamptz`; they are
 * converted to and from the agent's chosen IANA time zone only at the edges
 * (form input and display).
 */

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

function zonedParts(date: Date, timeZone: string): Parts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Milliseconds to add to UTC to get wall-clock time in `timeZone` at `date`. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock date and time in `timeZone` to a UTC instant.
 * Times skipped by a daylight-saving jump resolve to the instant just after
 * the jump; repeated times resolve to the first occurrence.
 */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const firstGuess = wall - offsetMs(new Date(wall), timeZone);
  const offset2 = offsetMs(new Date(firstGuess), timeZone);
  const secondGuess = wall - offset2;
  if (secondGuess === firstGuess) return new Date(firstGuess);
  // Offset changed between the guesses (a DST transition is nearby). Prefer the
  // candidate that maps back to the requested wall time, else the later one.
  const candidates = [firstGuess, secondGuess].sort((a, b) => a - b);
  for (const c of candidates) {
    const p = zonedParts(new Date(c), timeZone);
    if (p.hour === h && p.minute === mi && p.day === d) return new Date(c);
  }
  return new Date(candidates[1]);
}

/** UTC instant of 00:00 on `date` in `timeZone`. */
export function startOfZonedDay(date: string, timeZone: string): Date {
  return zonedDateTimeToUtc(date, "00:00", timeZone);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar date (YYYY-MM-DD) of `instant` in `timeZone`. */
export function zonedDate(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The wall-clock time (HH:MM) of `instant` in `timeZone`. */
export function zonedTime(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Adds whole calendar days to a YYYY-MM-DD date string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(toDate(value));
}

export function formatDate(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(toDate(value));
}

export function formatShortDate(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(toDate(value));
}

export function formatTime(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(toDate(value));
}

/** "Today", "Yesterday" or a short date such as "Mon, Oct 19" (with the year when it isn't this year). */
export function formatDayLabel(value: Date | string, timeZone: string, now: Date): string {
  const date = zonedDate(toDate(value), timeZone);
  const today = zonedDate(now, timeZone);
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(toDate(value));
}

/** Weekday, month and day for a calendar tile, e.g. { weekday: "Fri", month: "Oct", day: "23" }. */
export function calendarTile(value: Date | string, timeZone: string): { weekday: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).formatToParts(
    toDate(value),
  );
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), month: get("month"), day: get("day") };
}

export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  return name ? `${timeZone.replace(/_/g, " ")} (${name})` : timeZone;
}

/** IANA zones for the settings picker, with common North American zones first. */
export function timeZoneOptions(): string[] {
  const common = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Phoenix",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
    "America/Toronto",
    "America/Vancouver",
  ];
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    all = [];
  }
  return [...common, ...all.filter((z) => !common.includes(z))];
}
