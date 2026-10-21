import { describe, expect, it } from "vitest";
import {
  attributionSchema,
  campaignSchema,
  cleanLine,
  cleanMultiline,
  parseInquiry,
  profileSchema,
} from "@/lib/validation";

const valid = {
  full_name: "Pat Example",
  email: "pat@example.test",
  property_address: "12 Sample Lane, Springfield",
  timeline: "soon",
  preferred_contact: "email",
};

describe("public inquiry validation", () => {
  it("accepts a minimal valid inquiry and normalizes it", () => {
    const r = parseInquiry({ ...valid, full_name: "  Pat   Example ", phone: "", message: "   " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toEqual({
      full_name: "Pat Example",
      email: "pat@example.test",
      phone: undefined,
      property_address: "12 Sample Lane, Springfield",
      timeline: "soon",
      message: undefined,
      preferred_contact: "email",
      // An absent checkbox means no consent.
      marketing_consent: false,
    });
  });

  it("reports every invalid field at once", () => {
    const r = parseInquiry({ full_name: "", email: "nope", property_address: "x", timeline: "someday", preferred_contact: "text" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(["email", "full_name", "phone", "property_address", "timeline"]);
  });

  it("requires a phone number only when the homeowner asks to be called or texted", () => {
    expect(parseInquiry({ ...valid, preferred_contact: "phone" }).success).toBe(false);
    expect(parseInquiry({ ...valid, preferred_contact: "text", phone: "555-0100" }).success).toBe(true);
    expect(parseInquiry({ ...valid, preferred_contact: "email" }).success).toBe(true);
  });

  it("rejects malformed phone numbers and over-long input", () => {
    expect(parseInquiry({ ...valid, phone: "call me" }).success).toBe(false);
    expect(parseInquiry({ ...valid, phone: "12" }).success).toBe(false);
    expect(parseInquiry({ ...valid, message: "a".repeat(2001) }).success).toBe(false);
    expect(parseInquiry({ ...valid, full_name: "a".repeat(121) }).success).toBe(false);
  });

  it("treats marketing consent as opt-in only", () => {
    const yes = parseInquiry({ ...valid, marketing_consent: "on" });
    const no = parseInquiry({ ...valid, marketing_consent: "" });
    expect(yes.success && yes.data.marketing_consent).toBe(true);
    expect(no.success && no.data.marketing_consent).toBe(false);
  });

  it("strips control and invisible characters", () => {
    const r = parseInquiry({ ...valid, full_name: "Pat\u0000 Ex​ample‮", message: "Line 1\r\n\r\n\r\n\r\nLine 2\u0007" });
    expect(r.success && r.data.full_name).toBe("Pat Example");
    expect(r.success && r.data.message).toBe("Line 1\n\nLine 2");
  });
});

describe("attribution", () => {
  it("keeps clean UTM values and drops anything suspicious", () => {
    const a = attributionSchema.parse({
      utm_source: "Instagram",
      utm_medium: "<script>alert(1)</script>",
      utm_campaign: "spring-2026",
      referrer_host: "L.Instagram.com",
    });
    expect(a).toMatchObject({ utm_source: "Instagram", utm_medium: undefined, utm_campaign: "spring-2026", referrer_host: "l.instagram.com" });
    expect(attributionSchema.parse({ referrer_host: "https://evil.example/path?email=a@b.c" }).referrer_host).toBeUndefined();
  });
});

describe("agent settings validation", () => {
  const profile = {
    full_name: "Jordan Agent",
    contact_email: "jordan@example.test",
    primary_color: "#1f5f4a",
    service_areas: "Maple Heights, Riverside,\nMaple Heights, ",
    timezone: "America/Chicago",
  };

  it("parses service areas, normalizes color and defaults checkboxes", () => {
    const r = profileSchema.parse(profile);
    expect(r.service_areas).toEqual(["Maple Heights", "Riverside"]);
    expect(r.primary_color).toBe("#1F5F4A");
    expect(r.notify_new_inquiry).toBe(false);
  });

  it("only accepts https links for booking and privacy pages", () => {
    expect(profileSchema.safeParse({ ...profile, booking_url: "http://cal.example.com/x" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, booking_url: "javascript:alert(1)" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, booking_url: "https://cal.example.com/jordan" }).success).toBe(true);
  });

  it("rejects unknown time zones and invalid colors", () => {
    expect(profileSchema.safeParse({ ...profile, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, primary_color: "red" }).success).toBe(false);
  });

  it("validates campaign links (slugs)", () => {
    const base = {
      name: "Spring",
      headline: "H",
      description: "D",
      cta_text: "Go",
      thank_you_message: "Thanks",
    };
    expect(campaignSchema.safeParse({ ...base, slug: "Spring-Home-Value" }).success).toBe(true);
    expect(campaignSchema.safeParse({ ...base, slug: "spring--home" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...base, slug: "../admin" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...base, slug: "ab" }).success).toBe(false);
  });
});

describe("text cleaning helpers", () => {
  it("collapses whitespace in single-line text", () => {
    expect(cleanLine(" a\n b\t\tc ")).toBe("a b c");
  });
  it("keeps paragraphs in multi-line text", () => {
    expect(cleanMultiline("a\r\nb\n\n\n\nc")).toBe("a\nb\n\nc");
  });
});
