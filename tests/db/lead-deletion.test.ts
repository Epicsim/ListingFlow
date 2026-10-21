import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeEvent } from "@/lib/activity-text";
import { listRecentActivity } from "@/lib/data/activity";
import { recordAppointment, updateAppointmentStatus } from "@/lib/data/appointments";
import { getCampaign, listCampaignsWithStats } from "@/lib/data/campaigns";
import { addNote, deleteLead, getLeadDetail, listLeads } from "@/lib/data/leads";
import { getOverviewMetrics } from "@/lib/data/metrics";
import { createFollowUpEmail, insertEmail, listOutbox } from "@/lib/data/outbox";
import { isSavedInquiryReference, recordBookingClick } from "@/lib/data/public";
import { createTask } from "@/lib/data/tasks";
import type { Driver, Tx } from "@/lib/db/types";
import { asAgent, asOwner, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

const CHILD_TABLES = [
  "inquiries",
  "consent_records",
  "booking_clicks",
  "appointments",
  "follow_up_tasks",
  "lead_notes",
  "activity_events",
  "outbound_emails",
] as const;

async function childCounts(tx: Tx, contactId: string) {
  const counts: Record<string, number> = {};
  for (const table of CHILD_TABLES) {
    const [row] = await tx.query<{ n: number }>(
      `select count(*)::int as n from public.${table} where contact_id = $1::uuid`,
      [contactId],
    );
    counts[table] = row.n;
  }
  return counts;
}

async function populateLead(agentId: string, campaign: { id: string; slug: string }, email: string) {
  const result = await submit(db, campaign.slug, { inquiry: { email, marketing_consent: true } });
  if (result.status !== "created") throw new Error("setup failed");
  await asService(db, (tx) => recordBookingClick(tx, campaign.slug, result.public_token));
  await asAgent(db, agentId, async (tx) => {
    const appointmentId = await recordAppointment(tx, agentId, {
      contactId: result.contact_id,
      scheduledAt: new Date(Date.now() - 3_600_000),
    });
    if (!appointmentId) throw new Error("setup failed");
    await updateAppointmentStatus(tx, agentId, appointmentId, "attended");
    await createTask(tx, agentId, result.contact_id, "Send estimate", new Date(Date.now() - 60_000));
    await addNote(tx, agentId, result.contact_id, "Fictional homeowner's private note");
    await createFollowUpEmail(tx, {
      agentId,
      contactId: result.contact_id,
      inquiryId: null,
      kind: "follow_up",
      to: email,
      replyTo: null,
      subject: "Your estimate",
      body: "Fictional homeowner's private message",
      status: "preview",
    });
  });
  return result;
}

describe("permanent lead deletion", () => {
  it("cascades through every child table, updates counts and preserves other leads and campaigns", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const target = await populateLead(agent, campaign, "delete@example.test");
    const keeper = await populateLead(agent, campaign, "keep@example.test");
    const repeat = await submit(db, campaign.slug, {
      inquiry: { email: "delete@example.test", marketing_consent: true },
    });
    expect(repeat.status).toBe("created");
    if (repeat.status !== "created") throw new Error("setup failed");
    expect(repeat.contact_id).toBe(target.contact_id);

    // Inquiry-only links must also be removed, even when contact_id is null.
    const inquiryOnlyEmail = await asOwner(db, (tx) => insertEmail(tx, {
      agentId: agent,
      contactId: null,
      inquiryId: repeat.inquiry_id,
      kind: "acknowledgment",
      to: "delete@example.test",
      replyTo: null,
      subject: "Request received",
      body: "Fictional acknowledgment",
      status: "preview",
    }));
    const inquiryOnlyActivity = await asOwner(db, async (tx) => {
      const [event] = await tx.query<{ id: string }>(
        `insert into public.activity_events (agent_id, inquiry_id, type, actor)
         values ($1::uuid, $2::uuid, 'inquiry_submitted', 'system') returning id`,
        [agent, repeat.inquiry_id],
      );
      return event.id;
    });

    const before = await asOwner(db, (tx) => childCounts(tx, target.contact_id));
    for (const table of CHILD_TABLES) expect(before[table], table).toBeGreaterThan(0);
    expect(before.inquiries).toBe(2);
    const keptDetail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, keeper.contact_id));
    const keptCounts = await asOwner(db, (tx) => childCounts(tx, keeper.contact_id));
    const now = new Date();
    const range = { from: null, to: new Date(now.getTime() + 60_000) };
    const metrics = () => asAgent(db, agent, (tx) => getOverviewMetrics(tx, agent, range, now));
    expect(await metrics()).toMatchObject({
      new_inquiries: 3, new_leads: 2, total_leads: 2, awaiting_follow_up: 2,
      consultations_booked: 2, consultations_attended: 2, booking_clicks: 2,
    });
    expect((await asAgent(db, agent, (tx) => listCampaignsWithStats(tx, agent)))[0]).toMatchObject({
      inquiries: 3, leads: 2, booking_clicks: 2, consultations_booked: 2, consultations_attended: 2,
    });

    expect(await asAgent(db, agent, (tx) => deleteLead(tx, agent, target.contact_id))).toBe(true);

    await asOwner(db, async (tx) => {
      expect(await tx.query(`select id from public.contacts where id = $1::uuid`, [target.contact_id])).toEqual([]);
      expect(await childCounts(tx, target.contact_id)).toEqual(Object.fromEntries(CHILD_TABLES.map((t) => [t, 0])));
      expect(await childCounts(tx, keeper.contact_id)).toEqual(keptCounts);
      expect(await tx.query(`select id from public.outbound_emails where id = $1::uuid`, [inquiryOnlyEmail])).toEqual([]);
      expect(await tx.query(`select id from public.activity_events where id = $1::uuid`, [inquiryOnlyActivity])).toEqual([]);
    });
    await asAgent(db, agent, async (tx) => {
      expect(await getLeadDetail(tx, agent, target.contact_id)).toBeNull();
      expect((await listLeads(tx, agent, {}, now)).rows.map((r) => r.id)).toEqual([keeper.contact_id]);
      expect(await getLeadDetail(tx, agent, keeper.contact_id)).toEqual(keptDetail);
      expect(await getCampaign(tx, agent, campaign.id)).not.toBeNull();
      expect((await listOutbox(tx, agent)).map((e) => e.contact_id)).toEqual([keeper.contact_id]);
      expect((await listCampaignsWithStats(tx, agent))[0]).toMatchObject({
        inquiries: 1, leads: 1, booking_clicks: 1, consultations_booked: 1, consultations_attended: 1,
      });
      const deletionEvents = (await listRecentActivity(tx, agent, 100)).filter((e) => e.type === "lead_deleted");
      expect(deletionEvents).toHaveLength(1);
      expect(deletionEvents[0]).toMatchObject({
        contact_id: null, inquiry_id: null, campaign_id: null, contact_name: null, actor: "agent", data: {},
      });
      expect(describeEvent(deletionEvents[0], "America/Chicago", true)).toBe("Lead permanently deleted");
    });
    expect(await metrics()).toMatchObject({
      new_inquiries: 1, new_leads: 1, total_leads: 1, awaiting_follow_up: 1,
      consultations_booked: 1, consultations_attended: 1, booking_clicks: 1,
      total_campaigns: 1, published_campaigns: 1,
    });
    expect(await asService(db, (tx) => isSavedInquiryReference(tx, campaign.slug, target.public_token))).toBe(false);
    expect(await asService(db, (tx) => isSavedInquiryReference(tx, campaign.slug, repeat.public_token))).toBe(false);
  });

  it("returns false for a missing or already deleted lead without logging another deletion", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const result = await submit(db, campaign.slug);
    if (result.status !== "created") throw new Error("setup failed");
    expect(await asAgent(db, agent, (tx) => deleteLead(tx, agent, randomUUID()))).toBe(false);
    expect(await asAgent(db, agent, (tx) => listRecentActivity(tx, agent))).not.toContainEqual(
      expect.objectContaining({ type: "lead_deleted" }),
    );
    expect(await asAgent(db, agent, (tx) => deleteLead(tx, agent, result.contact_id))).toBe(true);
    expect(await asAgent(db, agent, (tx) => deleteLead(tx, agent, result.contact_id))).toBe(false);
    const events = await asAgent(db, agent, (tx) => listRecentActivity(tx, agent));
    expect(events.filter((e) => e.type === "lead_deleted")).toHaveLength(1);
  });

  it("rolls back the deletion, cascades and activity event if the transaction fails", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const result = await populateLead(agent, campaign, "rollback@example.test");
    const before = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, result.contact_id));
    await expect(asAgent(db, agent, async (tx) => {
      await deleteLead(tx, agent, result.contact_id);
      throw new Error("transaction_failed");
    })).rejects.toThrow("transaction_failed");
    expect(await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, result.contact_id))).toEqual(before);
    const events = await asAgent(db, agent, (tx) => listRecentActivity(tx, agent, 100));
    expect(events.some((e) => e.type === "lead_deleted")).toBe(false);
  });
});
