import { beforeAll, describe, expect, it } from "vitest";
import { recordAppointment, updateAppointmentStatus } from "@/lib/data/appointments";
import { listCampaignsWithStats } from "@/lib/data/campaigns";
import { getLeadDetail, listLeads, markContacted } from "@/lib/data/leads";
import { getOverviewMetrics } from "@/lib/data/metrics";
import { recordBookingClick } from "@/lib/data/public";
import { createTask, setTaskCompleted } from "@/lib/data/tasks";
import type { Driver } from "@/lib/db/types";
import { asAgent, asOwner, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;
const allTime = (): { from: Date | null; to: Date } => ({ from: null, to: new Date(Date.now() + 60_000) });

beforeAll(async () => {
  db = await createTestDb();
});

async function metrics(agent: string, range = allTime(), now = new Date()) {
  return asAgent(db, agent, (tx) => getOverviewMetrics(tx, agent, range, now));
}

describe("booking-link clicks vs confirmed consultations", () => {
  it("counts a click as a click, never as a consultation", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const res = await submit(db, campaign.slug);
    if (res.status !== "created") throw new Error(res.status);

    const url = await asService(db, (tx) => recordBookingClick(tx, campaign.slug, res.public_token));
    expect(url).toBe("https://scheduler.example.test/agent");

    const m = await metrics(agent);
    expect(m.booking_clicks).toBe(1);
    expect(m.consultations_booked).toBe(0);
    expect(m.consultations_attended).toBe(0);

    const detail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, res.contact_id));
    expect(detail?.bookingClicks).toBe(1);
    expect(detail?.appointments).toHaveLength(0);
    expect(detail?.contact.status).toBe("new");
    expect(detail?.activity.map((e) => e.type)).toContain("booking_link_clicked");
  });

  it("collapses rapid repeat clicks and ignores tokens from other campaigns", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const other = await createCampaignFor(db, agent);
    const res = await submit(db, campaign.slug);
    if (res.status !== "created") throw new Error(res.status);

    await asService(db, (tx) => recordBookingClick(tx, campaign.slug, res.public_token));
    await asService(db, (tx) => recordBookingClick(tx, campaign.slug, res.public_token));
    expect((await metrics(agent)).booking_clicks).toBe(1);

    // A token presented on a different campaign's page is not attributed to the lead.
    await asService(db, (tx) => recordBookingClick(tx, other.slug, res.public_token));
    const detail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, res.contact_id));
    expect(detail?.bookingClicks).toBe(1);
    expect((await metrics(agent)).booking_clicks).toBe(2);
  });

  it("returns no URL (and records nothing) when no booking link is configured", async () => {
    const agent = await createAgent(db);
    await asAgent(db, agent, (tx) => tx.query(`update public.agent_profiles set booking_url = null where id = $1::uuid`, [agent]));
    const campaign = await createCampaignFor(db, agent);
    expect(await asService(db, (tx) => recordBookingClick(tx, campaign.slug, null))).toBeNull();
    expect((await metrics(agent)).booking_clicks).toBe(0);
  });

  it("uses the campaign's own booking link when it overrides the default", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent, { bookingUrl: "https://scheduler.example.test/listing-consult" });
    expect(await asService(db, (tx) => recordBookingClick(tx, campaign.slug, null))).toBe(
      "https://scheduler.example.test/listing-consult",
    );
  });

  it("counts consultations only when the agent records them, and tracks outcomes", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const res = await submit(db, campaign.slug);
    if (res.status !== "created") throw new Error(res.status);

    const appointmentId = await asAgent(db, agent, (tx) =>
      recordAppointment(tx, agent, { contactId: res.contact_id, scheduledAt: new Date(Date.now() - 3_600_000) }),
    );
    expect(appointmentId).toBeTruthy();

    let m = await metrics(agent);
    expect(m.consultations_booked).toBe(1);
    expect(m.consultations_attended).toBe(0);
    expect(m.booking_clicks).toBe(0);

    const detail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, res.contact_id));
    expect(detail?.contact.status).toBe("consultation_booked");
    expect(detail?.appointments[0]).toMatchObject({ status: "scheduled", source: "manual", inquiry_id: res.inquiry_id });

    await asAgent(db, agent, (tx) => updateAppointmentStatus(tx, agent, appointmentId!, "attended"));
    m = await metrics(agent);
    expect(m.consultations_attended).toBe(1);

    const [stats] = await asAgent(db, agent, (tx) => listCampaignsWithStats(tx, agent));
    expect(stats).toMatchObject({ inquiries: 1, leads: 1, consultations_booked: 1, consultations_attended: 1, booking_clicks: 0 });
  });

  it("does not count canceled or no-show consultations as attended", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const a = await submit(db, campaign.slug, { inquiry: { email: "one@example.test" } });
    const b = await submit(db, campaign.slug, { inquiry: { email: "two@example.test" } });
    if (a.status !== "created" || b.status !== "created") throw new Error("setup");
    const when = new Date(Date.now() - 3_600_000);
    const apA = await asAgent(db, agent, (tx) => recordAppointment(tx, agent, { contactId: a.contact_id, scheduledAt: when }));
    const apB = await asAgent(db, agent, (tx) => recordAppointment(tx, agent, { contactId: b.contact_id, scheduledAt: when }));
    await asAgent(db, agent, (tx) => updateAppointmentStatus(tx, agent, apA!, "canceled"));
    await asAgent(db, agent, (tx) => updateAppointmentStatus(tx, agent, apB!, "no_show"));
    const m = await metrics(agent);
    expect(m.consultations_booked).toBe(1); // the canceled one is excluded
    expect(m.consultations_attended).toBe(0);
  });
});

describe("dashboard metrics", () => {
  it("are all zero for a brand-new account", async () => {
    const agent = await createAgent(db);
    expect(await metrics(agent)).toEqual({
      new_inquiries: 0,
      new_leads: 0,
      awaiting_follow_up: 0,
      consultations_booked: 0,
      consultations_attended: 0,
      booking_clicks: 0,
      total_leads: 0,
      total_campaigns: 0,
      published_campaigns: 0,
    });
  });

  it("respect the selected date range", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const old = await submit(db, campaign.slug, { inquiry: { email: "old@example.test" } });
    await submit(db, campaign.slug, { inquiry: { email: "recent@example.test" } });
    if (old.status !== "created") throw new Error(old.status);
    // Backdate one inquiry (and its contact) by 60 days.
    await asOwner(db, async (tx) => {
      await tx.query(`update public.inquiries set created_at = now() - interval '60 days' where id = $1::uuid`, [old.inquiry_id]);
      await tx.query(`update public.contacts set first_inquiry_at = now() - interval '60 days' where id = $1::uuid`, [old.contact_id]);
    });

    const last30 = { from: new Date(Date.now() - 30 * 86_400_000), to: new Date(Date.now() + 60_000) };
    const m30 = await metrics(agent, last30);
    expect(m30.new_inquiries).toBe(1);
    expect(m30.new_leads).toBe(1);
    const all = await metrics(agent);
    expect(all.new_inquiries).toBe(2);
    expect(all.total_leads).toBe(2);
    expect(all.published_campaigns).toBe(1);
  });

  it("track who is awaiting follow-up from stored statuses and tasks", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const res = await submit(db, campaign.slug);
    if (res.status !== "created") throw new Error(res.status);
    const now = new Date();

    expect((await metrics(agent, allTime(), now)).awaiting_follow_up).toBe(1); // brand new

    await asAgent(db, agent, (tx) => markContacted(tx, agent, res.contact_id));
    expect((await metrics(agent, allTime(), now)).awaiting_follow_up).toBe(0);

    const future = await asAgent(db, agent, (tx) =>
      createTask(tx, agent, res.contact_id, "Send estimate", new Date(now.getTime() + 2 * 86_400_000)),
    );
    expect((await metrics(agent, allTime(), now)).awaiting_follow_up).toBe(0); // not due yet
    const later = new Date(now.getTime() + 3 * 86_400_000);
    expect((await metrics(agent, allTime(), later)).awaiting_follow_up).toBe(1); // now due

    const needs = await asAgent(db, agent, (tx) => listLeads(tx, agent, { needsFollowUp: true }, later));
    expect(needs.rows.map((r) => r.id)).toEqual([res.contact_id]);

    await asAgent(db, agent, (tx) => setTaskCompleted(tx, agent, future!, true));
    expect((await metrics(agent, allTime(), later)).awaiting_follow_up).toBe(0);
  });
});
