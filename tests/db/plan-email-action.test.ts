import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { saveFollowUpEmailAction } from "@/app/(app)/leads/actions";
import { getLeadDetail } from "@/lib/data/leads";
import { savePlan, savePlanStep, startPlan, listEnrollments } from "@/lib/data/plans";
import { getProfile } from "@/lib/data/profiles";
import { runAs } from "@/lib/db/run-as";
import type { Driver, Tx } from "@/lib/db/types";
import { EMAIL_STATUS_LABELS } from "@/lib/domain";
import { STARTER_PLANS } from "@/lib/follow-up-plans";
import { asAgent, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;
let agent: string;
const settings = vi.hoisted(() => ({ live: false, accepted: false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/request-origin", () => ({ requestOrigin: async () => "https://app.example.test" }));
vi.mock("@/lib/config", async (original) => ({ ...await original<typeof import("@/lib/config")>(), getAppSecret: async () => "fictional-test-secret-more-than-32-chars" }));
vi.mock("@/lib/auth/session", () => ({ requireWorkspaceAgent: async () => ({ profile: await asAgent(db, agent, (tx) => getProfile(tx, agent)) }) }));
vi.mock("@/lib/db", () => ({
  asUser: <T>(id: string, fn: (tx: Tx) => Promise<T>) => runAs(db, "authenticated", id, fn),
  asService: <T>(fn: (tx: Tx) => Promise<T>) => runAs(db, "service_role", null, fn),
}));
vi.mock("@/lib/email/config", () => ({ getEmailDeliveryConfig: () => ({ live: settings.live, provider: "resend", from: "agent@example.test", explanation: "Fictional provider" }) }));
vi.mock("@/lib/email/deliver", async (original) => {
  const actual = await original<typeof import("@/lib/email/deliver")>();
  return { ...actual, deliverQueuedEmails: (service: Parameters<typeof actual.deliverQueuedEmails>[0], ids: string[]) => actual.deliverQueuedEmails(service, ids, async () => settings.accepted ? { ok: true, messageId: "fictional_provider_id" } : { ok: false, error: "provider_rejected_fixture" }, { live: true, provider: "resend", from: "agent@example.test", explanation: "Fictional provider" }) };
});
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
beforeEach(() => { settings.live = false; settings.accepted = false; });
async function fixture() {
  agent = await createAgent(db);
  const campaign = await createCampaignFor(db, agent);
  const res = await submit(db, campaign.slug);
  if (res.status !== "created") throw new Error("fixture_failed");
  await asAgent(db, agent, async (tx) => {
    const plan = await savePlan(tx, agent, { name: "Fictional draft plan", is_active: false, campaign_id: null, timelines: ["soon"] });
    await savePlanStep(tx, agent, plan, STARTER_PLANS[0].steps[1]);
    await startPlan(tx, agent, res.contact_id, plan);
  });
  const task = (await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, res.contact_id)))!.tasks[0];
  const data = new FormData();
  data.set("contact_id", res.contact_id); data.set("task_id", task.id);
  data.set("subject", "Fictional draft subject"); data.set("body", "Hi Pat, would a conversation help?");
  return { contact: res.contact_id, task, data };
}
describe("plan draft through the existing send action", () => {
  it("links a preview, completes the step, preserves unsubscribe, and labels it honestly", async () => {
    const f = await fixture();
    expect((await saveFollowUpEmailAction({ ok: false }, f.data)).ok).toBe(true);
    const d = (await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, f.contact)))!;
    expect(d.tasks[0]).toMatchObject({ completed_at: expect.any(Date), email_id: d.emails[0].id });
    expect(d.emails[0].status).toBe("preview");
    expect(EMAIL_STATUS_LABELS[d.emails[0].status]).toBe("Preview only – not sent");
    expect(d.emails[0].body_text).toContain("/unsubscribe?t=");
    expect((await asAgent(db, agent, (tx) => listEnrollments(tx, agent, f.contact)))[0].status).toBe("completed");
    expect((await saveFollowUpEmailAction({ ok: false }, f.data)).ok).toBe(false);
    expect((await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, f.contact)))!.emails).toHaveLength(1);
  });
  it("leaves a rejected step open; a retry completes only after provider acceptance", async () => {
    const f = await fixture(); settings.live = true;
    expect((await saveFollowUpEmailAction({ ok: false }, f.data)).ok).toBe(false);
    let d = (await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, f.contact)))!;
    expect(d.tasks[0].completed_at).toBeNull(); expect(d.emails[0].status).toBe("failed");
    settings.accepted = true;
    expect((await saveFollowUpEmailAction({ ok: false }, f.data)).ok).toBe(true);
    d = (await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, f.contact)))!;
    expect(d.tasks[0].completed_at).toBeInstanceOf(Date);
    expect(d.emails.find((e) => e.id === d.tasks[0].email_id)?.status).toBe("sent");
  });
  it("refuses a task from a different contact or agent, or a canceled step", async () => {
    const f = await fixture();
    const other = await submit(db, (await createCampaignFor(db, agent)).slug, { inquiry: { email: "second@example.test" } });
    if (other.status !== "created") throw new Error("fixture_failed");
    f.data.set("contact_id", other.contact_id);
    expect((await saveFollowUpEmailAction({ ok: false }, f.data)).ok).toBe(false);
    f.data.set("contact_id", f.contact);
    const owner = agent; agent = await createAgent(db);
    expect((await saveFollowUpEmailAction({ ok: false }, f.data)).ok).toBe(false);
    agent = owner;
    await asService(db, (tx) => tx.query(`select public.unsubscribe_contact($1::uuid)`, [f.contact]));
    expect((await saveFollowUpEmailAction({ ok: false }, f.data)).ok).toBe(false);
    expect((await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, f.contact)))!.emails).toEqual([]);
  });
});
