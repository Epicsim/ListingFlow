import { describe, expect, it } from "vitest";
import { contrastRatio, readableOn, brandTextColor } from "@/lib/color";
import { resolveRange } from "@/lib/date-range";
import { renderTemplate } from "@/lib/email/templates";
import { slugify } from "@/lib/slug";
import { addDays, formatDateTime, zonedDate, zonedDateTimeToUtc, zonedTime } from "@/lib/time";
import { buildCampaignUrl, normalizeSource, readUtm, sourceLabel } from "@/lib/utm";

describe("time zones", () => {
  it("converts an agent's local appointment time to UTC and back", () => {
    const utc = zonedDateTimeToUtc("2026-10-21", "14:30", "America/Los_Angeles");
    expect(utc.toISOString()).toBe("2026-10-21T21:30:00.000Z");
    expect(zonedDate(utc, "America/Los_Angeles")).toBe("2026-10-21");
    expect(zonedTime(utc, "America/Los_Angeles")).toBe("14:30");
    expect(zonedDateTimeToUtc("2026-10-21", "14:30", "Asia/Tokyo").toISOString()).toBe("2026-10-21T05:30:00.000Z");
  });

  it("handles daylight-saving transitions", () => {
    // US clocks fall back on 2026-11-01: 01:30 happens twice; we pick the first (PDT).
    expect(zonedDateTimeToUtc("2026-11-01", "01:30", "America/Los_Angeles").toISOString()).toBe("2026-11-01T08:30:00.000Z");
    // After the change, PST applies.
    expect(zonedDateTimeToUtc("2026-11-02", "09:00", "America/Los_Angeles").toISOString()).toBe("2026-11-02T17:00:00.000Z");
    // Spring forward 2026-03-08: 02:30 doesn't exist; it resolves just after the jump.
    expect(zonedTime(zonedDateTimeToUtc("2026-03-08", "02:30", "America/New_York"), "America/New_York")).toBe("03:30");
  });

  it("formats in the agent's time zone", () => {
    expect(formatDateTime("2026-10-21T21:30:00Z", "America/Los_Angeles")).toBe("Oct 21, 2026, 2:30 PM PDT");
    expect(formatDateTime("2026-10-21T21:30:00Z", "America/New_York")).toBe("Oct 21, 2026, 5:30 PM EDT");
  });

  it("adds calendar days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dashboard date ranges", () => {
  const now = new Date("2026-10-21T19:00:00Z"); // 12:00 in Los Angeles
  const tz = "America/Los_Angeles";

  it("uses whole local days for presets", () => {
    const r = resolveRange({ range: "7d" }, tz, now);
    expect(r.from?.toISOString()).toBe("2026-10-15T07:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-22T07:00:00.000Z");
  });

  it("supports custom and all-time ranges, defaulting to 30 days", () => {
    const custom = resolveRange({ from: "2026-10-01", to: "2026-10-05" }, tz, now);
    expect(custom.key).toBe("custom");
    expect(custom.from?.toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(custom.to.toISOString()).toBe("2026-10-06T07:00:00.000Z");
    expect(resolveRange({ range: "all" }, tz, now).from).toBeNull();
    expect(resolveRange({ range: "bogus" }, tz, now).key).toBe("30d");
    // Reversed dates are swapped rather than producing an empty range.
    expect(resolveRange({ from: "2026-10-05", to: "2026-10-01" }, tz, now).fromDate).toBe("2026-10-01");
  });
});

describe("email templates", () => {
  it("fills placeholders and drops lines whose placeholders are empty", () => {
    const out = renderTemplate("Hi {{first_name}},\n\nBook here: {{booking_link}}\n\n{{agent_name}}\n{{brokerage}}", {
      first_name: "Sam",
      agent_name: "Jordan",
      booking_link: null,
      brokerage: "",
    });
    expect(out).toBe("Hi Sam,\n\nJordan");
  });
});

describe("campaign links and sources", () => {
  it("builds tracked links", () => {
    expect(buildCampaignUrl("https://app.example.test", "spring", { source: "instagram", medium: "social" })).toBe(
      "https://app.example.test/p/spring?utm_source=instagram&utm_medium=social",
    );
    expect(buildCampaignUrl("https://app.example.test", "spring")).toBe("https://app.example.test/p/spring");
  });

  it("normalizes sources for grouping", () => {
    expect(normalizeSource("Instagram")).toBe("instagram");
    expect(normalizeSource("  Paid Ads! ")).toBe("paid_ads");
    expect(normalizeSource(undefined)).toBe("direct");
    expect(sourceLabel("website")).toBe("Website");
    expect(sourceLabel("direct")).toBe("Direct / unknown");
    expect(readUtm({ utm_source: ["a", "b"], utm_term: undefined })).toMatchObject({ utm_source: "a", utm_term: undefined });
  });

  it("creates clean slugs", () => {
    expect(slugify("Jordan Rivera – Home Value & More!")).toBe("jordan-rivera-home-value-and-more");
    expect(slugify("Café Été")).toBe("cafe-ete");
  });
});

describe("brand color contrast", () => {
  it("picks readable button text and falls back for light brand colors", () => {
    expect(readableOn("#1F5F4A")).toBe("#FFFFFF");
    expect(readableOn("#F5D547")).toBe("#1C1A17");
    expect(brandTextColor("#F5D547")).toBe("#1C1A17");
    expect(brandTextColor("#1F5F4A")).toBe("#1F5F4A");
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
});
