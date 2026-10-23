import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAppointment } from "@/lib/data/appointments";
import { getLeadDetail, listLeads, markContacted, updateLeadStatus } from "@/lib/data/leads";
import { getOverviewMetrics } from "@/lib/data/metrics";
import { recordBookingClick } from "@/lib/data/public";
import { addStarterPlans, changePlan, getPlanSteps, listEnrollments, listPlans, savePlan, savePlanStep, startMatchingPlan, stopPlan, startPlan } from "@/lib/data/plans";
import { listDueTasks, setTaskCompleted } from "@/lib/data/tasks";
import type { Driver } from "@/lib/db/types";
import { STARTER_PLANS, type PlanStepInput } from "@/lib/follow-up-plans";
import { processInquirySubmission } from "@/lib/inquiry-service";
import { issueFormToken } from "@/lib/security/form-token";
import { asAgent, asAnon, asOwner, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.close(); });
const day = new Date("2026-10-22T18:00:00Z");
const call = STARTER_PLANS[0].steps[0];
const email = (offset: number): PlanStepInput => ({ ...STARTER_PLANS[0].steps[1], day_offset: offset });
async function fixture(options: { steps?: PlanStepInput[]; text?: boolean; consent?: boolean } = {}) {
  const agent = await createAgent(db);
  const campaign = await createCampaignFor(db, agent);
  const plan = await asAgent(db, agent, async (tx) => {
    const id = await savePlan(tx, agent, { name: "Fictional plan", timelines: ["soon"], is_active: true, campaign_id: null });
    for (const step of options.steps ?? [call, email(1), email(3), email(44)]) await savePlanStep(tx, agent, id, step);
    return id;
  });
  const res = await submit(db, campaign.slug, { inquiry: { timeline: "soon", preferred_contact: options.text ? "text" : "email", marketing_consent: options.consent ?? false } });
  if (res.status !== "created") throw new Error("fixture_failed");
  return { agent, campaign, plan, contact: res.contact_id, inquiry: res.inquiry_id };
}
const start = (f: Awaited<ReturnType<typeof fixture>>) => asService(db, (tx) => startMatchingPlan(tx, f.agent, f.contact, f.inquiry, day));
const detail = (f: Awaited<ReturnType<typeof fixture>>) => asAgent(db, f.agent, (tx) => getLeadDetail(tx, f.agent, f.contact));
const enrollments = (f: Awaited<ReturnType<typeof fixture>>) => asAgent(db, f.agent, (tx) => listEnrollments(tx, f.agent, f.contact));

describe("plan matching and snapshots", () => {
  it("uses position first, including campaign-specific vs all-campaign plans; ignores off plans", async () => {
    const f = await fixture();
    const second = await asAgent(db, f.agent, async (tx) => {
      const id = await savePlan(tx, f.agent, { name: "Specific plan", timelines: ["soon"], campaign_id: f.campaign.id, is_active: true });
      await savePlanStep(tx, f.agent, id, call);
      return id;
    });
    await start(f);
    expect((await enrollments(f))[0].plan_name).toBe("Fictional plan");
    await asAgent(db, f.agent, (tx) => changePlan(tx, f.agent, second, "up"));
    const repeat = await submit(db, f.campaign.slug, { inquiry: { timeline: "soon" } });
    if (repeat.status !== "created") throw new Error("fixture_failed");
    await start({ ...f, inquiry: repeat.inquiry_id });
    expect((await enrollments(f)).find((e) => e.status === "active")?.plan_name).toBe("Specific plan");
    expect((await enrollments(f)).find((e) => e.plan_name === "Fictional plan")?.stop_reason).toBe("repeat_inquiry");
    await asAgent(db, f.agent, async (tx) => { await changePlan(tx, f.agent, second, "toggle"); await changePlan(tx, f.agent, f.plan, "toggle"); });
    const third = await submit(db, f.campaign.slug, { inquiry: { timeline: "soon" } });
    if (third.status !== "created") throw new Error("fixture_failed");
    expect(await start({ ...f, inquiry: third.inquiry_id })).toBeNull();
    expect((await enrollments(f)).filter((e) => e.status === "active")).toHaveLength(1);
  });
  it("ignores campaign and timeline mismatches", async () => {
    const f = await fixture();
    const other = await createCampaignFor(db, f.agent);
    await asAgent(db, f.agent, (tx) => savePlan(tx, f.agent, { name: "Different campaign", timelines: ["soon"], campaign_id: other.id, is_active: true }, f.plan));
    expect(await start(f)).toBeNull();
    await asAgent(db, f.agent, (tx) => savePlan(tx, f.agent, { name: "Different timeline", timelines: ["exploring"], campaign_id: null, is_active: true }, f.plan));
    expect(await start(f)).toBeNull();
  });
  it("creates dated snapshots, skips late drafts without consent, and converts calls to text", async () => {
    const f = await fixture({ text: true });
    await start(f);
    const d = (await detail(f))!;
    expect(d.tasks).toHaveLength(3);
    expect(d.tasks.find((t) => t.kind === "text")).toMatchObject({ title: "Text Pat", due_at: day });
    expect(d.tasks.filter((t) => t.kind === "email")).toHaveLength(2);
    expect((await enrollments(f))[0].skipped_steps).toMatchObject([{ day_offset: 44, reason: "no_marketing_consent" }]);
    const original = d.tasks.map((t) => ({ title: t.title, subject: t.email_subject, body: t.email_body }));
    await asAgent(db, f.agent, async (tx) => {
      const step = (await getPlanSteps(tx, f.agent, f.plan))[1];
      await savePlanStep(tx, f.agent, f.plan, { ...step, email_subject: "New subject" }, step.id);
      await savePlan(tx, f.agent, { name: "New plan name", is_active: false, campaign_id: null, timelines: ["soon"] }, f.plan);
      await changePlan(tx, f.agent, f.plan, "delete");
    });
    expect((await detail(f))!.tasks.map((t) => ({ title: t.title, subject: t.email_subject, body: t.email_body }))).toEqual(original);
    expect((await enrollments(f))[0]).toMatchObject({ plan_name: "Fictional plan", status: "active" });
  });
  it("includes late emails with consent and no emails at all for an unsubscribed contact", async () => {
    const consent = await fixture({ consent: true });
    await start(consent);
    expect((await detail(consent))!.tasks).toHaveLength(4);
    const unsub = await fixture({ consent: true });
    await asService(db, (tx) => tx.query(`select public.unsubscribe_contact($1::uuid)`, [unsub.contact]));
    await start(unsub);
    expect((await detail(unsub))!.tasks.map((t) => t.kind)).toEqual(["call"]);
    expect((await enrollments(unsub))[0].skipped_steps).toHaveLength(3);
  });
  it("runs after the public commit and never repeats a duplicate form submission", async () => {
    const f = await fixture();
    const secret = "fictional-test-secret-more-than-32-chars";
    const now = Date.now();
    const req = { slug: f.campaign.slug, secret, ip: "203.0.113.20", siteOrigin: "https://app.example.test", emailLive: false, now,
      fields: { full_name: "Lee Fictional", email: "lee@example.test", phone: "555-0100", property_address: "123 Fictional Road", timeline: "soon", preferred_contact: "email", form_token: issueFormToken(f.campaign.id, secret, now - 10000) } };
    const publicDb = { anon: <T>(fn: Parameters<typeof asAnon<T>>[1]) => asAnon(db, fn), service: <T>(fn: Parameters<typeof asService<T>>[1]) => asService(db, fn) };
    const first = await processInquirySubmission(publicDb, req);
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(await processInquirySubmission(publicDb, req)).toMatchObject({ ok: true, duplicate: true });
    const rows = await asAgent(db, f.agent, (tx) => tx.query(`select id from public.follow_up_enrollments where agent_id = $1::uuid`, [f.agent]));
    expect(rows).toHaveLength(1);
    // An empty matching plan raises an error only in the post-commit step.
    await asAgent(db, f.agent, (tx) => tx.query(`delete from public.follow_up_plan_steps where plan_id = $1::uuid`, [f.plan]));
    const saved = await processInquirySubmission(publicDb, { ...req, fields: { ...req.fields, email: "other@example.test" } });
    expect(saved.ok).toBe(true);
  });
  it("adds only off starter plans and enforces the plan and email limits", async () => {
    const agent = await createAgent(db);
    await asAgent(db, agent, (tx) => addStarterPlans(tx, agent));
    expect((await asAgent(db, agent, (tx) => listPlans(tx, agent))).map((p) => p.is_active)).toEqual([false, false, false]);
    await expect(asAgent(db, agent, (tx) => addStarterPlans(tx, agent))).rejects.toThrow(/empty/);
    for (let n = 3; n < 20; n++) await asAgent(db, agent, (tx) => savePlan(tx, agent, { name: `Plan ${n}`, is_active: false, campaign_id: null, timelines: ["soon"] }));
    await expect(asAgent(db, agent, (tx) => savePlan(tx, agent, { name: "Over limit", is_active: false, campaign_id: null, timelines: ["soon"] }))).rejects.toThrow(/20/);
    const f = await fixture({ steps: [email(0)] });
    await expect(asAgent(db, f.agent, (tx) => savePlanStep(tx, f.agent, f.plan, email(1)))).rejects.toThrow(/2 days/);
  });
});

describe("plan stop rules", () => {
  it("keeps booking-link clicks separate from consultations", async () => {
    const f = await fixture(); await start(f);
    await asService(db, (tx) => recordBookingClick(tx, f.campaign.slug, null));
    expect((await enrollments(f))[0].status).toBe("active");
  });
  it("completes an email-only enrollment when every step is skipped", async () => {
    const f = await fixture({ steps: [email(44)] }); await start(f);
    expect((await enrollments(f))[0]).toMatchObject({ status: "completed", skipped_steps: [{ day_offset: 44, reason: "no_marketing_consent" }] });
    expect((await detail(f))!.tasks).toEqual([]);
  });
  it("supports manual off-plan starts and cascades enrollments when the lead is deleted", async () => {
    const f = await fixture();
    await asAgent(db, f.agent, async (tx) => {
      await changePlan(tx, f.agent, f.plan, "toggle");
      expect(await startPlan(tx, f.agent, f.contact, f.plan)).toBeTruthy();
    });
    await asAgent(db, f.agent, (tx) => tx.query(`delete from public.contacts where id = $1::uuid`, [f.contact]));
    expect(await enrollments(f)).toEqual([]);
  });
  it.each(["consultation_booked", "won", "lost", "unsubscribed", "appointment", "agent_stopped"] as const)("%s cancels only open plan steps", async (trigger) => {
    const f = await fixture();
    await start(f);
    const callTask = (await detail(f))!.tasks.find((t) => t.kind === "call")!;
    await asAgent(db, f.agent, (tx) => setTaskCompleted(tx, f.agent, callTask.id, true));
    if (trigger === "unsubscribed") await asService(db, (tx) => tx.query(`select public.unsubscribe_contact($1::uuid)`, [f.contact]));
    else if (trigger === "appointment") await asAgent(db, f.agent, (tx) => recordAppointment(tx, f.agent, { contactId: f.contact, scheduledAt: day }));
    else if (trigger === "agent_stopped") await asAgent(db, f.agent, (tx) => stopPlan(tx, f.agent, f.contact));
    else await asAgent(db, f.agent, (tx) => updateLeadStatus(tx, f.agent, f.contact, trigger, undefined));
    const d = (await detail(f))!;
    expect(d.tasks.find((t) => t.id === callTask.id)).toMatchObject({ completed_at: expect.any(Date), canceled_at: null });
    expect(d.tasks.filter((t) => t.id !== callTask.id).every((t) => t.canceled_at && !t.completed_at)).toBe(true);
    const e = (await enrollments(f))[0];
    expect(e).toMatchObject({ status: "stopped", stop_reason: trigger === "appointment" ? "consultation_booked" : trigger });
    const event = d.activity.find((a) => a.type === "plan_stopped");
    expect(event?.actor).toBe(trigger === "agent_stopped" ? "agent" : "system");
  });
  it("completes the enrollment when its last open step finishes", async () => {
    const f = await fixture({ steps: [call] });
    await start(f);
    const task = (await detail(f))!.tasks[0];
    await asAgent(db, f.agent, (tx) => setTaskCompleted(tx, f.agent, task.id, true));
    expect((await enrollments(f))[0].status).toBe("completed");
  });
  it("excludes canceled tasks from every due view while keeping history", async () => {
    const f = await fixture();
    await start(f);
    await asAgent(db, f.agent, async (tx) => { await markContacted(tx, f.agent, f.contact); await stopPlan(tx, f.agent, f.contact); });
    await asAgent(db, f.agent, async (tx) => {
      const now = new Date("2027-01-01T18:00:00Z");
      expect(await listDueTasks(tx, f.agent, now)).toEqual([]);
      expect((await listLeads(tx, f.agent, { needsFollowUp: true }, now)).total).toBe(0);
      expect((await getOverviewMetrics(tx, f.agent, { from: null, to: now }, now)).awaiting_follow_up).toBe(0);
    });
    expect((await detail(f))!.tasks).toHaveLength(3);
  });
});

describe("plan RLS and trigger boundaries", () => {
  it("isolates every new agent-owned table and tasks, including writes and cross-agent FKs", async () => {
    const f = await fixture(); await start(f);
    const other = await createAgent(db);
    for (const table of ["follow_up_plans", "follow_up_plan_steps", "follow_up_enrollments", "follow_up_tasks"]) {
      expect(await asAgent(db, other, (tx) => tx.query(`select * from public.${table} where agent_id = $1::uuid`, [f.agent]))).toEqual([]);
      await expect(asAnon(db, (tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
    }
    expect(await asAgent(db, other, (tx) => tx.query(`update public.follow_up_plans set name = 'Foreign' where id = $1::uuid returning id`, [f.plan]))).toEqual([]);
    const step = (await asAgent(db, f.agent, (tx) => getPlanSteps(tx, f.agent, f.plan)))[0];
    expect(await asAgent(db, other, (tx) => tx.query(`update public.follow_up_plan_steps set title = 'Foreign' where id = $1::uuid returning id`, [step.id]))).toEqual([]);
    const enrollment = (await enrollments(f))[0];
    expect(await asAgent(db, other, (tx) => tx.query(`update public.follow_up_enrollments set status = 'completed' where id = $1::uuid returning id`, [enrollment.id]))).toEqual([]);
    const task = (await detail(f))!.tasks[0];
    expect(await asAgent(db, other, (tx) => setTaskCompleted(tx, f.agent, task.id, true))).toBeNull();
    await asAgent(db, other, (tx) => stopPlan(tx, f.agent, f.contact));
    expect((await enrollments(f))[0].status).toBe("active");
    await expect(asAgent(db, other, (tx) => savePlanStep(tx, other, f.plan, call))).rejects.toThrow(/not be found/);
    await expect(asAgent(db, other, (tx) => tx.query(`insert into public.follow_up_enrollments(agent_id, contact_id, plan_name, status) values($1::uuid,$2::uuid,'Foreign','completed')`, [other, f.contact]))).rejects.toThrow(/foreign key/);
    await expect(asAgent(db, other, (tx) => recordAppointment(tx, other, { contactId: f.contact, scheduledAt: day }))).resolves.toBeNull();
    await expect(asAgent(db, other, (tx) => tx.query(`insert into public.appointments(agent_id, contact_id, scheduled_at) values($1::uuid,$2::uuid,now())`, [other, f.contact]))).rejects.toThrow(/foreign key/);
    await asAgent(db, other, (tx) => updateLeadStatus(tx, f.agent, f.contact, "lost", undefined));
    expect((await enrollments(f))[0].status).toBe("active");
    await expect(asAgent(db, other, (tx) => tx.query(`select app_private.contact_stops_plans()`))).rejects.toThrow(/permission denied/);
    await expect(asAgent(db, other, (tx) => tx.query(`update public.contacts set unsubscribed_at = now() where id = $1::uuid`, [f.contact]))).rejects.toThrow(/permission denied/);
    await expect(asAgent(db, other, (tx) => tx.query(`insert into public.follow_up_enrollments(agent_id, contact_id, plan_name, stop_actor) values($1::uuid,$2::uuid,'Forged','system')`, [other, f.contact]))).rejects.toThrow(/permission denied/);
    const flags = await asOwner(db, (tx) => tx.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname in ('follow_up_plans','follow_up_plan_steps','follow_up_enrollments','agent_digests')`));
    expect(flags).toHaveLength(4); expect(flags.every((r) => r.relrowsecurity)).toBe(true);
  });
});
