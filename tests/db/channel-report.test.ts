import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAppointment, updateAppointmentStatus } from "@/lib/data/appointments";
import { getChannelReport } from "@/lib/data/channel-report";
import { updateLeadStatus } from "@/lib/data/leads";
import { recordBookingClick } from "@/lib/data/public";
import { resolveRange } from "@/lib/date-range";
import type { Driver } from "@/lib/db/types";
import { asAgent, asOwner, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;
const allTime = () => ({ from: null, to: new Date(Date.now() + 60_000) });

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

async function inquire(slug: string, source?: string, email = "homeowner@example.test") {
  const result = await submit(db, slug, { inquiry: { email }, attribution: { utm_source: source } });
  if (result.status !== "created") throw new Error(`fixture_${result.status}`);
  return result;
}

async function dateInquiry(inquiryId: string, date: string) {
  await asOwner(db, (tx) => tx.query(
    `update public.inquiries set created_at = $2::timestamptz where id = $1::uuid`,
    [inquiryId, date],
  ));
}

async function report(agent: string, range: { from: Date | null; to: Date } = allTime()) {
  return asAgent(db, agent, (tx) => getChannelReport(tx, agent, range));
}

describe("channel report", () => {
  it("credits a returning homeowner and all outcomes to the first channel, preserving both raw inquiries", async () => {
    const agent = await createAgent(db);
    const instagram = await createCampaignFor(db, agent);
    const email = await createCampaignFor(db, agent);
    const first = await inquire(instagram.slug, "instagram");
    await dateInquiry(first.inquiry_id, "2026-01-01T12:00:00Z");
    const repeat = await inquire(email.slug, "email");
    expect(repeat.contact_id).toBe(first.contact_id);

    // Both activities point to the later inquiry/campaign, but first touch wins.
    await asService(db, (tx) => recordBookingClick(tx, email.slug, repeat.public_token));
    const appointment = await asAgent(db, agent, (tx) => recordAppointment(tx, agent, {
      contactId: repeat.contact_id, inquiryId: repeat.inquiry_id, scheduledAt: new Date(),
    }));
    await asAgent(db, agent, (tx) => updateAppointmentStatus(tx, agent, appointment!, "attended"));
    await asAgent(db, agent, (tx) => updateLeadStatus(tx, agent, first.contact_id, "won", undefined));

    expect(await report(agent)).toEqual([
      { channel: "instagram", utm_source_hint: null, inquiries: 1, homeowners: 1, booking_clicks: 1, consultations: 1, attended: 1, won: 1 },
      { channel: "email", utm_source_hint: null, inquiries: 1, homeowners: 0, booking_clicks: 0, consultations: 0, attended: 0, won: 0 },
    ]);
  });

  it("does not multiply homeowners or activity across repeat inquiries, clicks and appointments", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const first = await inquire(campaign.slug, "website");
    const repeat = await inquire(campaign.slug, "website");
    await inquire(campaign.slug, "website");
    await asService(db, (tx) => recordBookingClick(tx, campaign.slug, first.public_token));
    await asService(db, (tx) => recordBookingClick(tx, campaign.slug, repeat.public_token));

    for (const status of ["scheduled", "attended", "canceled", "no_show"] as const) {
      const appointment = await asAgent(db, agent, (tx) => recordAppointment(tx, agent, {
        contactId: first.contact_id, scheduledAt: new Date(),
      }));
      await asAgent(db, agent, (tx) => updateAppointmentStatus(tx, agent, appointment!, status));
    }
    await asAgent(db, agent, (tx) => updateLeadStatus(tx, agent, first.contact_id, "won", undefined));

    expect(await report(agent)).toEqual([
      { channel: "website", utm_source_hint: null, inquiries: 3, homeowners: 1, booking_clicks: 2, consultations: 3, attended: 1, won: 1 },
    ]);
  });

  it("keeps clicks separate from consultations and excludes clicks with no linked homeowner", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const first = await inquire(campaign.slug);
    await asService(db, (tx) => recordBookingClick(tx, campaign.slug, first.public_token));
    await asService(db, (tx) => recordBookingClick(tx, campaign.slug, null));

    expect(await report(agent)).toEqual([
      { channel: "direct", utm_source_hint: null, inquiries: 1, homeowners: 1, booking_clicks: 1, consultations: 0, attended: 0, won: 0 },
    ]);

    // Appointments may have a contact without an inquiry (e.g. an import).
    await asAgent(db, agent, (tx) => tx.query(
      `insert into public.appointments (agent_id, contact_id, scheduled_at, status)
       values ($1::uuid, $2::uuid, $3::timestamptz, 'attended')`,
      [agent, first.contact_id, new Date().toISOString()],
    ));
    expect((await report(agent))[0]).toMatchObject({ booking_clicks: 1, consultations: 1, attended: 1 });
  });

  it("filters by the actual first inquiry, excluding returning homeowners first seen before the range", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const old = await inquire(campaign.slug, "instagram", "old@example.test");
    await dateInquiry(old.inquiry_id, "2026-01-01T12:00:00Z");
    const returning = await inquire(campaign.slug, "email", "old@example.test");
    await dateInquiry(returning.inquiry_id, "2026-02-02T12:00:00Z");
    await asAgent(db, agent, (tx) => updateLeadStatus(tx, agent, old.contact_id, "won", undefined));

    const fresh = await inquire(campaign.slug, "website", "fresh@example.test");
    await dateInquiry(fresh.inquiry_id, "2026-02-01T00:00:00Z");
    const later = await inquire(campaign.slug, "email", "fresh@example.test");
    // Record with a current token before backdating it past the public token's lifetime.
    await asService(db, (tx) => recordBookingClick(tx, campaign.slug, later.public_token));
    await dateInquiry(later.inquiry_id, "2026-03-01T00:00:00Z");
    // Activity outside the inquiry cohort's range is still credited to it.
    const appointment = await asAgent(db, agent, (tx) => recordAppointment(tx, agent, {
      contactId: fresh.contact_id, inquiryId: later.inquiry_id, scheduledAt: new Date(),
    }));
    await asAgent(db, agent, (tx) => updateAppointmentStatus(tx, agent, appointment!, "attended"));
    await asAgent(db, agent, (tx) => updateLeadStatus(tx, agent, fresh.contact_id, "won", undefined));

    const atEnd = await inquire(campaign.slug, "paid_ads", "end@example.test");
    await dateInquiry(atEnd.inquiry_id, "2026-03-01T00:00:00Z");

    expect(await report(agent, { from: new Date("2026-02-01T00:00:00Z"), to: new Date("2026-03-01T00:00:00Z") })).toEqual([
      { channel: "website", utm_source_hint: null, inquiries: 1, homeowners: 1, booking_clicks: 1, consultations: 1, attended: 1, won: 1 },
      { channel: "email", utm_source_hint: null, inquiries: 1, homeowners: 0, booking_clicks: 0, consultations: 0, attended: 0, won: 0 },
    ]);
    // All-time still respects its exclusive upper bound for first inquiries.
    expect((await report(agent, { from: null, to: new Date("2026-02-01T00:00:00Z") })).map((row) => row.channel)).toEqual(["instagram", "email"]);
  });

  it("uses dashboard timezone bounds, including a 23-hour daylight-saving day", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const dates = ["2026-03-08T07:59:59Z", "2026-03-08T08:00:00Z", "2026-03-09T06:59:59Z", "2026-03-09T07:00:00Z"];
    for (const [index, date] of dates.entries()) {
      const result = await inquire(campaign.slug, "website", `boundary-${index}@example.test`);
      await dateInquiry(result.inquiry_id, date);
    }
    const range = resolveRange({ from: "2026-03-08", to: "2026-03-08" }, "America/Los_Angeles", new Date());
    expect(await report(agent, range)).toEqual([
      { channel: "website", utm_source_hint: null, inquiries: 2, homeowners: 2, booking_clicks: 0, consultations: 0, attended: 0, won: 0 },
    ]);
  });

  it("groups by stored source, using differing UTM sources only as a hint", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const other = await createCampaignFor(db, agent);
    await inquire(campaign.slug, "Instagram", "one@example.test");
    await inquire(other.slug, "Instagram", "two@example.test");
    await inquire(other.slug, "instagram", "three@example.test");
    expect(await report(agent)).toEqual([
      { channel: "instagram", utm_source_hint: "Instagram", inquiries: 3, homeowners: 3, booking_clicks: 0, consultations: 0, attended: 0, won: 0 },
    ]);
  });

  it("uses a stable inquiry-ID tie-breaker for simultaneous first inquiries", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const a = await inquire(campaign.slug, "instagram");
    const b = await inquire(campaign.slug, "email");
    await dateInquiry(a.inquiry_id, "2026-01-01T00:00:00Z");
    await dateInquiry(b.inquiry_id, "2026-01-01T00:00:00Z");
    const firstChannel = a.inquiry_id < b.inquiry_id ? "instagram" : "email";
    const rows = await report(agent);
    expect(rows.find((row) => row.channel === firstChannel)?.homeowners).toBe(1);
    expect(rows.reduce((sum, row) => sum + row.homeowners, 0)).toBe(1);
  });

  it("sorts by listings won, then consultations, then raw inquiries", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const won = await inquire(campaign.slug, "instagram", "won@example.test");
    await asAgent(db, agent, (tx) => updateLeadStatus(tx, agent, won.contact_id, "won", undefined));
    const consultation = await inquire(campaign.slug, "email", "consultation@example.test");
    await asAgent(db, agent, (tx) => recordAppointment(tx, agent, { contactId: consultation.contact_id, scheduledAt: new Date() }));
    await inquire(campaign.slug, "website", "many@example.test");
    await inquire(campaign.slug, "website", "many@example.test");
    await inquire(campaign.slug, "paid_ads", "one@example.test");
    expect((await report(agent)).map((row) => row.channel)).toEqual(["instagram", "email", "website", "paid_ads"]);
  });

  it("isolates channels and every count under each agent's RLS session, even with the wrong agent ID", async () => {
    const a = await createAgent(db);
    const b = await createAgent(db);
    for (const [agent, channel] of [[a, "instagram"], [b, "email"]]) {
      const campaign = await createCampaignFor(db, agent);
      const result = await inquire(campaign.slug, channel);
      await asService(db, (tx) => recordBookingClick(tx, campaign.slug, result.public_token));
      const appointment = await asAgent(db, agent, (tx) => recordAppointment(tx, agent, {
        contactId: result.contact_id, scheduledAt: new Date(),
      }));
      await asAgent(db, agent, (tx) => updateAppointmentStatus(tx, agent, appointment!, "attended"));
      await asAgent(db, agent, (tx) => updateLeadStatus(tx, agent, result.contact_id, "won", undefined));
    }
    expect(await report(a)).toEqual([
      { channel: "instagram", utm_source_hint: null, inquiries: 1, homeowners: 1, booking_clicks: 1, consultations: 1, attended: 1, won: 1 },
    ]);
    expect(await report(b)).toEqual([
      { channel: "email", utm_source_hint: null, inquiries: 1, homeowners: 1, booking_clicks: 1, consultations: 1, attended: 1, won: 1 },
    ]);
    expect(await asAgent(db, a, (tx) => getChannelReport(tx, b, allTime()))).toEqual([]);
    expect(await asAgent(db, b, (tx) => getChannelReport(tx, a, allTime()))).toEqual([]);
  });

  it("returns no rows for an agent with no inquiries", async () => {
    const agent = await createAgent(db);
    expect(await report(agent)).toEqual([]);
  });
});
