import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { runDailyDigest } from "@/lib/daily-digest";
import { createAgentDigest } from "@/lib/data/digests";
import { recordAppointment } from "@/lib/data/appointments";
import { listOutbox } from "@/lib/data/outbox";
import { updateDigestPreference } from "@/lib/data/profiles";
import { reserveCheckout, saveSubscription, saveReceipt } from "@/lib/data/billing";
import { createTask } from "@/lib/data/tasks";
import type { Driver } from "@/lib/db/types";
import { asAgent, asAnon, asOwner, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
afterEach(() => vi.unstubAllEnvs());
const now = new Date("2026-10-22T18:00:00Z");
const origin = "https://app.example.test";
async function fixture(due = true) {
  const agent = await createAgent(db);
  const campaign = await createCampaignFor(db, agent);
  const res = await submit(db, campaign.slug);
  if (res.status !== "created") throw new Error("fixture_failed");
  if (due) await asAgent(db, agent, (tx) => createTask(tx, agent, res.contact_id, "Call Pat Example", now));
  return { agent, contact: res.contact_id };
}
const digest = (agent: string, at = now, hour?: number) => asService(db, (tx) => createAgentDigest(tx, agent, at, origin, false, hour));
describe("daily digest", () => {
  it("creates one preview per local date even for concurrent duplicate runs", async () => {
    const f = await fixture();
    const ids = await Promise.all([digest(f.agent), digest(f.agent)]);
    expect(ids.filter(Boolean)).toHaveLength(1);
    const messages = await asAgent(db, f.agent, (tx) => listOutbox(tx, f.agent));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "agent_digest", status: "preview", sent_at: null, contact_id: null });
    expect(messages[0].to_email).toMatch(/^alerts-.*@example.test$/);
    expect(messages[0].body_text).toContain("Pat Example · Reminder · today");
    expect(messages[0].body_text).toContain(`${origin}/dashboard`);
    expect(messages[0].body_text).toContain("Settings → Preferences");
    expect(await digest(f.agent, new Date("2026-10-23T18:00:00Z"))).toBeTruthy();
  });
  it("skips empty workdays and opted-out agents; falls back only to contact email", async () => {
    const empty = await fixture(false);
    expect(await digest(empty.agent)).toBeNull();
    expect(await asAgent(db, empty.agent, (tx) => listOutbox(tx, empty.agent))).toEqual([]);
    const off = await fixture();
    await asAgent(db, off.agent, (tx) => updateDigestPreference(tx, off.agent, false));
    expect(await digest(off.agent)).toBeNull();
    const fallback = await fixture();
    await asAgent(db, fallback.agent, (tx) => tx.query(`update public.agent_profiles set notification_email = null where id = $1::uuid`, [fallback.agent]));
    await digest(fallback.agent);
    expect((await asAgent(db, fallback.agent, (tx) => listOutbox(tx, fallback.agent)))[0].to_email).toMatch(/^agent-.*@example.test$/);
  });
  it("uses local-day boundaries, a local-hour threshold, and at most ten task lines", async () => {
    const f = await fixture();
    await asAgent(db, f.agent, async (tx) => {
      await tx.query(`update public.agent_profiles set timezone = 'America/Los_Angeles' where id = $1::uuid`, [f.agent]);
      for (let i = 0; i < 12; i++) await createTask(tx, f.agent, f.contact, `Fictional task ${i}`, new Date("2026-10-21T18:00:00Z"));
    });
    expect(await digest(f.agent, new Date("2026-10-22T13:00:00Z"), 7)).toBeNull();
    expect(await digest(f.agent, new Date("2026-10-22T14:00:00Z"), 7)).toBeTruthy();
    const e = (await asAgent(db, f.agent, (tx) => listOutbox(tx, f.agent)))[0];
    expect(e.body_text).toContain("13 open follow-ups");
    expect(e.body_text.match(/Pat Example · Reminder/g)).toHaveLength(10);
    expect(e.body_text).toContain("overdue since Oct 21, 2026");
    expect(e.body_text).toContain("Plus 3 more");
  });
  it("includes today's consultations and past outcomes; no task is needed for today's consultation", async () => {
    const f = await fixture(false);
    await asAgent(db, f.agent, (tx) => recordAppointment(tx, f.agent, { contactId: f.contact, scheduledAt: new Date("2026-10-22T20:00:00Z") }));
    await asAgent(db, f.agent, (tx) => recordAppointment(tx, f.agent, { contactId: f.contact, scheduledAt: new Date("2026-10-21T20:00:00Z") }));
    await digest(f.agent);
    const e = (await asAgent(db, f.agent, (tx) => listOutbox(tx, f.agent)))[0];
    expect(e.body_text).toContain("1 consultation scheduled today");
    expect(e.body_text).toContain("1 past consultation still needs an outcome");
    expect(e.body_text).toContain("check your scheduler");
  });
  it("reuses paid-access checks under authenticated RLS and keeps preview delivery off", async () => {
    await fixture();
    const service = <T>(fn: Parameters<typeof asService<T>>[1]) => asService(db, fn);
    const userCall = vi.fn();
    const user = <T>(id: string, fn: Parameters<typeof asAgent<T>>[2]) => { userCall(id); return asAgent(db, id, fn); };
    const result = await runDailyDigest({ service, user }, { now, siteOrigin: origin, paidRequired: true });
    expect(result).toEqual({ created: 0, failed: 0 });
    expect(userCall).toHaveBeenCalled();
    await expect(asService(db, (tx) => tx.query(`select billing_private.has_paid_access($1::uuid)`, ["11111111-1111-4111-8111-111111111111"]))).rejects.toThrow(/permission denied/);
    const free = await runDailyDigest({ service, user }, { now, siteOrigin: origin, paidRequired: false });
    expect(free.created).toBeGreaterThan(0);
    expect(free.failed).toBe(0);
    const repeats = await runDailyDigest({ service, user }, { now, siteOrigin: origin, paidRequired: false });
    expect(repeats.created).toBe(0);
  });
  it("doesn't leave an idempotency claim when the outbox insert rolls back", async () => {
    const f = await fixture();
    await expect(asService(db, async (tx) => { await createAgentDigest(tx, f.agent, now, origin, false); throw new Error("simulated_failure"); })).rejects.toThrow("simulated_failure");
    expect(await digest(f.agent)).toBeTruthy();
  });
  it("includes an eligible paid agent without giving the service role billing access", async () => {
    const f = await fixture();
    const key = randomUUID();
    const invoice = `in_fixture_${key}`;
    await asAgent(db, f.agent, async (tx) => {
      const checkout = await reserveCheckout(tx, f.agent, key, { priceId: "price_fixture", livemode: true, siteUrl: origin });
      await saveSubscription(tx, checkout, { id: `sub_fixture_${key}`, customerId: `cus_fixture_${key}`, status: "active", cancelAtPeriodEnd: false, periodEnd: new Date(Date.now() + 86_400_000), latestInvoiceId: invoice });
      await saveReceipt(tx, { invoice_id: invoice, agent_id: f.agent, checkout_key: key, invoice_number: "FICTIONAL-1", amount_paid: 2000, currency: "usd", paid_at: new Date(), hosted_invoice_url: null, invoice_pdf: null, livemode: true });
    });
    const result = await runDailyDigest({ service: (fn) => asService(db, fn), user: (id, fn) => asAgent(db, id, fn) }, { now, siteOrigin: origin, paidRequired: true });
    expect(result).toEqual({ created: 1, failed: 0 });
    expect((await asAgent(db, f.agent, (tx) => listOutbox(tx, f.agent)))[0].kind).toBe("agent_digest");
  });
  it("denies all digest-table access and digest-email inserts to API roles", async () => {
    const f = await fixture();
    for (const role of ["anon", "agent"] as const) {
      const run = <T>(fn: Parameters<typeof asService<T>>[1]) => role === "anon" ? asAnon(db, fn) : asAgent(db, f.agent, fn);
      await expect(run((tx) => tx.query(`select * from public.agent_digests`))).rejects.toThrow(/permission denied/);
      await expect(run((tx) => tx.query(`insert into public.agent_digests(agent_id, local_date) values($1::uuid,'2026-10-22'::date)`, [f.agent]))).rejects.toThrow(/permission denied/);
    }
    await expect(asAgent(db, f.agent, (tx) => tx.query(`insert into public.outbound_emails(agent_id,kind,to_email,subject,body_text,status)
      values($1::uuid,'agent_digest','pat@example.test','Forged','Forged','preview')`, [f.agent]))).rejects.toThrow(/row-level security/);
    expect((await asOwner(db, (tx) => tx.query(`select * from public.agent_digests where agent_id = $1::uuid`, [f.agent])))).toEqual([]);
  });
});
