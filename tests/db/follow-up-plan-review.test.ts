import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logAgentEvent } from "@/lib/data/activity";
import { recordAppointment, updateAppointmentStatus } from "@/lib/data/appointments";
import { createAgentDigest } from "@/lib/data/digests";
import { getContact, getLeadDetail, listLeads, markContacted, updateLeadStatus } from "@/lib/data/leads";
import { getOverviewMetrics } from "@/lib/data/metrics";
import { createFollowUpEmail, recordDeliveryResult } from "@/lib/data/outbox";
import { changePlan, deletePlanStep, getPlan, getPlanSteps, getPlanTemplateValues, listEnrollments, savePlan, savePlanStep, startMatchingPlan, startPlan, stopPlan } from "@/lib/data/plans";
import { getProfile } from "@/lib/data/profiles";
import { createTask, linkTaskEmail, listDueTasks, setTaskCompleted, skipPlanTask } from "@/lib/data/tasks";
import type { Driver } from "@/lib/db/types";
import { renderEmail } from "@/lib/email/messages";
import { STARTER_PLANS, type PlanStepInput } from "@/lib/follow-up-plans";
import { asAgent, asAnon, asOwner, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
const now = new Date();
const call = STARTER_PLANS[0].steps[0];
const email: PlanStepInput = { ...STARTER_PLANS[0].steps[1], day_offset: 0 };
const text: PlanStepInput = { ...call, kind: "text", title: "Text {{first_name}}", text_message: "Hello {{first_name}}" };
const settings = { name: "Fictional review plan", is_active: false, campaign_id: null, timelines: ["soon"] as ("soon")[] };

async function fixture(steps: PlanStepInput[] = [call, email, text]) {
  const agent = await createAgent(db);
  const campaign = await createCampaignFor(db, agent, { bookingUrl: "https://scheduler.example.test/campaign-only" });
  const plan = await asAgent(db, agent, async (tx) => {
    const id = await savePlan(tx, agent, settings);
    for (const step of steps) await savePlanStep(tx, agent, id, step);
    return id;
  });
  const res = await submit(db, campaign.slug, { inquiry: { timeline: "soon" } });
  if (res.status !== "created") throw new Error("fixture_failed");
  return { agent, campaign, plan, contact: res.contact_id, inquiry: res.inquiry_id };
}
const detail = async (f: Awaited<ReturnType<typeof fixture>>) => (await asAgent(db, f.agent, (tx) => getLeadDetail(tx, f.agent, f.contact)))!;
const enrollments = (f: Awaited<ReturnType<typeof fixture>>) => asAgent(db, f.agent, (tx) => listEnrollments(tx, f.agent, f.contact));
const start = (f: Awaited<ReturnType<typeof fixture>>) => asAgent(db, f.agent, (tx) => startPlan(tx, f.agent, f.contact, f.plan, { now }));

async function queuePlanEmail(f: Awaited<ReturnType<typeof fixture>>, taskId: string) {
  return asAgent(db, f.agent, async (tx) => {
    const id = await createFollowUpEmail(tx, {
      agentId: f.agent, contactId: f.contact, inquiryId: f.inquiry, kind: "follow_up",
      to: "pat@example.test", replyTo: null, subject: "Fictional plan follow-up",
      body: "Hi Pat, would a conversation help?", status: "queued",
    });
    await linkTaskEmail(tx, f.agent, f.contact, taskId, id);
    return id;
  });
}

describe("skip one plan step", () => {
  it("refuses to skip a queued email, leaving it open for later provider acceptance", async () => {
    const f = await fixture([email]); await start(f);
    const [task] = (await detail(f)).tasks;
    const emailId = await queuePlanEmail(f, task.id);
    expect(await asAgent(db, f.agent, (tx) => skipPlanTask(tx, task.id))).toBeNull();
    expect((await detail(f)).tasks[0]).toMatchObject({ canceled_at: null, cancel_reason: null, completed_at: null, email_id: emailId });
    expect((await enrollments(f))[0].status).toBe("active");
    await asService(db, (tx) => recordDeliveryResult(tx, emailId, { ok: true, provider: "fictional", messageId: "fictional_acceptance" }));
    const accepted = await detail(f);
    expect(accepted.emails[0].status).toBe("sent");
    expect(accepted.tasks[0]).toMatchObject({ canceled_at: null, cancel_reason: null, completed_at: expect.any(Date) });
    expect((await enrollments(f))[0].status).toBe("completed");
  });
  it("allows a failed linked email to be skipped only by its owner", async () => {
    const f = await fixture([email]); await start(f);
    const [task] = (await detail(f)).tasks;
    const emailId = await queuePlanEmail(f, task.id);
    await asService(db, (tx) => recordDeliveryResult(tx, emailId, { ok: false, provider: "fictional", error: "fictional_rejection" }));
    const other = await createAgent(db);
    expect(await asAgent(db, other, (tx) => skipPlanTask(tx, task.id))).toBeNull();
    expect((await detail(f)).tasks[0].canceled_at).toBeNull();
    expect(await asAgent(db, f.agent, (tx) => skipPlanTask(tx, task.id))).toBe(f.contact);
    const skipped = await detail(f);
    expect(skipped.emails[0].status).toBe("failed");
    expect(skipped.tasks[0]).toMatchObject({ canceled_at: expect.any(Date), cancel_reason: "skipped", completed_at: null });
    expect((await enrollments(f))[0].status).toBe("completed");
  });
  it.each(["call", "email", "text"])("skips only the open %s task, with no email, and completes on the last skip", async (kind) => {
    const f = await fixture(); await start(f);
    await asAgent(db, f.agent, (tx) => markContacted(tx, f.agent, f.contact));
    const tasks = (await detail(f)).tasks;
    const target = tasks.find((t) => t.kind === kind)!;
    expect(await asAgent(db, f.agent, (tx) => skipPlanTask(tx, target.id))).toBe(f.contact);
    const changed = await detail(f);
    expect(changed.tasks.find((t) => t.id === target.id)).toMatchObject({ canceled_at: expect.any(Date), cancel_reason: "skipped", completed_at: null });
    expect(changed.tasks.filter((t) => t.id !== target.id).every((t) => !t.canceled_at)).toBe(true);
    expect((await enrollments(f))[0].status).toBe("active");
    for (const task of tasks.filter((t) => t.id !== target.id)) await asAgent(db, f.agent, (tx) => skipPlanTask(tx, task.id));
    expect((await enrollments(f))[0].status).toBe("completed");
    expect((await detail(f)).emails).toEqual([]);
    await asAgent(db, f.agent, async (tx) => {
      expect(await listDueTasks(tx, f.agent, now)).toEqual([]);
      expect((await listLeads(tx, f.agent, { needsFollowUp: true }, now)).total).toBe(0);
      expect((await getOverviewMetrics(tx, f.agent, { from: null, to: now }, now)).awaiting_follow_up).toBe(0);
    });
    expect(await asService(db, (tx) => createAgentDigest(tx, f.agent, now, "https://app.example.test", false))).toBeNull();
  });
  it("refuses foreign, completed, canceled and manual tasks without broad cancellation permissions", async () => {
    const f = await fixture(); await start(f);
    const other = await createAgent(db);
    const tasks = (await detail(f)).tasks;
    expect(await asAgent(db, other, (tx) => skipPlanTask(tx, tasks[0].id))).toBeNull();
    expect((await detail(f)).tasks.every((t) => t.canceled_at === null)).toBe(true);
    for (const role of [asAnon, asService]) await expect(role(db, (tx) => skipPlanTask(tx, tasks[0].id))).rejects.toThrow(/permission denied/);
    await expect(asAgent(db, f.agent, (tx) => tx.query(`update public.follow_up_tasks set canceled_at = now(), cancel_reason = 'won' where id = $1::uuid`, [tasks[0].id]))).rejects.toThrow(/permission denied/);
    const callTask = tasks.find((t) => t.kind === "call")!;
    await asAgent(db, f.agent, (tx) => setTaskCompleted(tx, f.agent, callTask.id, true));
    expect(await asAgent(db, f.agent, (tx) => skipPlanTask(tx, callTask.id))).toBeNull();
    const emailTask = tasks.find((t) => t.kind === "email")!;
    await asAgent(db, f.agent, (tx) => skipPlanTask(tx, emailTask.id));
    expect(await asAgent(db, f.agent, (tx) => skipPlanTask(tx, emailTask.id))).toBeNull();
    const manual = await asAgent(db, f.agent, (tx) => createTask(tx, f.agent, f.contact, "Fictional manual reminder", now));
    expect(await asAgent(db, f.agent, (tx) => skipPlanTask(tx, manual!))).toBeNull();
    expect((await detail(f)).tasks.find((t) => t.id === callTask.id)).toMatchObject({ canceled_at: null, completed_at: expect.any(Date) });
  });
});

describe("empty plan guards and targeted lookups", () => {
  it("blocks creating an on plan and enabling an empty plan through either repository path", async () => {
    const f = await fixture([]);
    await expect(asAgent(db, f.agent, (tx) => savePlan(tx, f.agent, { ...settings, is_active: true }))).rejects.toThrow(/at least one step/);
    await expect(asAgent(db, f.agent, (tx) => savePlan(tx, f.agent, { ...settings, is_active: true }, f.plan))).rejects.toThrow(/at least one step/);
    await expect(asAgent(db, f.agent, (tx) => changePlan(tx, f.agent, f.plan, "toggle"))).rejects.toThrow(/at least one step/);
    expect(await asAgent(db, f.agent, (tx) => getPlan(tx, f.agent, f.plan))).toMatchObject({ is_active: false, step_count: 0 });
    const other = await createAgent(db);
    expect(await asAgent(db, other, (tx) => getPlan(tx, f.agent, f.plan))).toBeNull();
  });
  it("turns off an active plan when the last step is deleted, preserving copied tasks", async () => {
    const f = await fixture([call]); await start(f);
    await asAgent(db, f.agent, async (tx) => {
      await changePlan(tx, f.agent, f.plan, "toggle");
      const [step] = await getPlanSteps(tx, f.agent, f.plan);
      await deletePlanStep(tx, f.agent, f.plan, step.id);
      expect(await getPlan(tx, f.agent, f.plan)).toMatchObject({ is_active: false, step_count: 0 });
    });
    expect((await detail(f)).tasks).toHaveLength(1);
    expect((await enrollments(f))[0].status).toBe("active");
  });
  it("ignores legacy active empty plans and chooses the next matching nonempty plan", async () => {
    const f = await fixture([]);
    await asOwner(db, (tx) => tx.query(`update public.follow_up_plans set is_active = true where id = $1::uuid`, [f.plan]));
    const second = await asAgent(db, f.agent, async (tx) => {
      const id = await savePlan(tx, f.agent, { ...settings, name: "Fictional usable plan" });
      await savePlanStep(tx, f.agent, id, call);
      await changePlan(tx, f.agent, id, "toggle");
      return id;
    });
    expect(await asService(db, (tx) => startMatchingPlan(tx, f.agent, f.contact, f.inquiry))).toBeTruthy();
    expect((await enrollments(f))[0].plan_name).toBe("Fictional usable plan");
    expect((await asAgent(db, f.agent, (tx) => getPlan(tx, f.agent, second)))!.step_count).toBe(1);
  });
});

describe("plan draft booking context", () => {
  it("shares the campaign-only booking link between task creation and review, using the enrollment inquiry", async () => {
    const f = await fixture([{ ...text, text_message: "Choose a time: {{booking_link}}" }, email]);
    await asAgent(db, f.agent, (tx) => tx.query(`update public.agent_profiles set booking_url = null where id = $1::uuid`, [f.agent]));
    const enrollment = await asAgent(db, f.agent, (tx) => startPlan(tx, f.agent, f.contact, f.plan, { inquiryId: f.inquiry }));
    const otherCampaign = await createCampaignFor(db, f.agent, { bookingUrl: "https://scheduler.example.test/later-campaign" });
    await submit(db, otherCampaign.slug);
    await asAgent(db, f.agent, async (tx) => {
      const contact = (await getContact(tx, f.agent, f.contact))!;
      const profile = (await getProfile(tx, f.agent))!;
      const values = await getPlanTemplateValues(tx, f.agent, contact, profile, { enrollmentId: enrollment });
      expect(renderEmail({ subject: email.email_subject!, body: email.email_body! }, values).body).toContain("https://scheduler.example.test/campaign-only");
      expect((await getPlanTemplateValues(tx, f.agent, contact, profile)).booking_link).toBe("https://scheduler.example.test/later-campaign");
    });
    expect((await detail(f)).tasks.find((t) => t.kind === "text")?.text_message).toContain("https://scheduler.example.test/campaign-only");
  });
});

describe("appointment outcomes and enrollment transitions", () => {
  it.each(["no_show", "attended", "canceled"] as const)("recording an old %s outcome keeps the newer plan running; rebooking stops it", async (status) => {
    const f = await fixture();
    const appointment = await asAgent(db, f.agent, (tx) => recordAppointment(tx, f.agent, { contactId: f.contact, scheduledAt: new Date(Date.now() - 86_400_000) }));
    await asAgent(db, f.agent, (tx) => updateLeadStatus(tx, f.agent, f.contact, "contacted", undefined));
    await start(f);
    await asAgent(db, f.agent, (tx) => updateAppointmentStatus(tx, f.agent, appointment!, status));
    expect((await enrollments(f))[0].status).toBe("active");
    expect((await detail(f)).tasks.every((t) => !t.canceled_at)).toBe(true);
    await asAgent(db, f.agent, (tx) => updateAppointmentStatus(tx, f.agent, appointment!, "scheduled"));
    expect((await enrollments(f))[0]).toMatchObject({ status: "stopped", stop_reason: "consultation_booked" });
  });
  it("blocks direct completion and all reactivation, but allows agent stops and trigger completion", async () => {
    const f = await fixture([email]); await start(f);
    const [{ id }] = await enrollments(f);
    await expect(asAgent(db, f.agent, (tx) => tx.query(`update public.follow_up_enrollments set status = 'completed' where id = $1::uuid`, [id]))).rejects.toThrow(/requires_trigger/);
    await asAgent(db, f.agent, (tx) => stopPlan(tx, f.agent, f.contact));
    for (const run of [(fn: Parameters<typeof asService>[1]) => asService(db, fn), (fn: Parameters<typeof asService>[1]) => asAgent(db, f.agent, fn)]) {
      await expect(run((tx) => tx.query(`update public.follow_up_enrollments set status = 'active', stop_reason = null, stopped_at = null where id = $1::uuid`, [id]))).rejects.toThrow(/transition_forbidden/);
    }
    await start(f);
    const open = (await detail(f)).tasks.find((t) => !t.canceled_at)!;
    await asAgent(db, f.agent, (tx) => skipPlanTask(tx, open.id));
    const completed = (await enrollments(f)).find((e) => e.status === "completed")!;
    await expect(asAgent(db, f.agent, (tx) => tx.query(`update public.follow_up_enrollments set status = 'active' where id = $1::uuid`, [completed.id]))).rejects.toThrow(/transition_forbidden/);
  });
  it("keeps system activity subject to the existing agent RLS boundary", async () => {
    const f = await fixture();
    await expect(asAgent(db, f.agent, (tx) => logAgentEvent(tx, f.agent, { type: "plan_started", contactId: f.contact }, "system"))).rejects.toThrow(/row-level security/);
  });
});
