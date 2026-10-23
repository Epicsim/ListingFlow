import { beforeAll, describe, expect, it } from "vitest";
import { listOutbox } from "@/lib/data/outbox";
import type { Driver } from "@/lib/db/types";
import { deliverQueuedEmails } from "@/lib/email/deliver";
import { readUnsubscribeToken } from "@/lib/email/unsubscribe";
import { type PublicDb, processInquirySubmission, type SubmissionRequest } from "@/lib/inquiry-service";
import { issueFormToken } from "@/lib/security/form-token";
import { asAgent, asAnon, asOwner, asService, createAgent, createCampaignFor, createTestDb } from "../helpers/db";

const SECRET = "test-secret-test-secret-test-secret-1234";
const NOW = Date.UTC(2026, 9, 21, 18, 0, 0);

let db: Driver;
let publicDb: PublicDb;

beforeAll(async () => {
  db = await createTestDb();
  publicDb = { anon: (fn) => asAnon(db, fn), service: (fn) => asService(db, fn) };
});

async function setup() {
  const agent = await createAgent(db, "Jordan Sample");
  const campaign = await createCampaignFor(db, agent, { name: "Spring home value" });
  // Issued 10 seconds before "now", i.e. a person filled in the form.
  const token = issueFormToken(campaign.id, SECRET, NOW - 10_000);
  return { agent, campaign, token };
}

function request(slug: string, token: string, fields: SubmissionRequest["fields"] = {}): SubmissionRequest {
  return {
    slug,
    secret: SECRET,
    ip: "203.0.113.7",
    siteOrigin: "https://app.example.test",
    emailLive: false,
    now: NOW,
    fields: {
      full_name: "  Casey Homeowner ",
      email: "casey@example.test",
      phone: "",
      property_address: "42 Sample Road, Springfield",
      timeline: "soon",
      message: "",
      preferred_contact: "email",
      utm_source: "instagram",
      utm_medium: "social",
      form_token: token,
      website: "",
      ...fields,
    },
  };
}

async function inquiryCount(agent: string) {
  const rows = await asAgent(db, agent, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from public.inquiries`));
  return rows[0].n;
}

describe("public inquiry submission", () => {
  it("saves a valid submission and returns an opaque reference", async () => {
    const { agent, campaign, token } = await setup();
    const outcome = await processInquirySubmission(publicDb, request(campaign.slug, token));
    expect(outcome).toMatchObject({ ok: true, duplicate: false, emailIdsToDeliver: [] });
    if (!outcome.ok) return;
    expect(outcome.publicToken).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await asAgent(db, agent, (tx) =>
      tx.query<{ full_name: string; source: string }>(`select full_name, source from public.inquiries`),
    );
    expect(rows).toEqual([{ full_name: "Casey Homeowner", source: "instagram" }]);
  });

  it("rejects invalid input with field errors and saves nothing", async () => {
    const { agent, campaign, token } = await setup();
    const outcome = await processInquirySubmission(
      publicDb,
      request(campaign.slug, token, { email: "nope", property_address: "", timeline: "someday", preferred_contact: "text" }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("validation");
    expect(Object.keys(outcome.fieldErrors ?? {}).sort()).toEqual(["email", "phone", "property_address", "timeline"]);
    expect(await inquiryCount(agent)).toBe(0);
  });

  it.each([
    ["honeypot filled", { website: "http://spam.example" }, "spam"],
    ["missing token", { form_token: "" }, "invalid_token"],
    ["tampered token", { form_token: "eyJjIjoiYSJ9.AAAA" }, "invalid_token"],
  ] as const)("rejects bots (%s) without saving", async (_label, fields, reason) => {
    const { agent, campaign, token } = await setup();
    const outcome = await processInquirySubmission(publicDb, request(campaign.slug, token, fields));
    expect(outcome).toMatchObject({ ok: false, reason });
    expect(await inquiryCount(agent)).toBe(0);
  });

  it("rejects forms submitted instantly or from an expired page", async () => {
    const { agent, campaign } = await setup();
    const instant = issueFormToken(campaign.id, SECRET, NOW - 200);
    expect(await processInquirySubmission(publicDb, request(campaign.slug, instant))).toMatchObject({
      ok: false,
      reason: "too_fast",
    });
    const stale = issueFormToken(campaign.id, SECRET, NOW - 4 * 86_400_000);
    expect(await processInquirySubmission(publicDb, request(campaign.slug, stale))).toMatchObject({
      ok: false,
      reason: "expired",
    });
    expect(await inquiryCount(agent)).toBe(0);
  });

  it("rejects a token issued for a different campaign", async () => {
    const { campaign } = await setup();
    const other = await setup();
    const outcome = await processInquirySubmission(publicDb, request(campaign.slug, other.token));
    expect(outcome).toMatchObject({ ok: false, reason: "invalid_token" });
  });

  it("treats a retry of the same form as one inquiry, but never drops an edited resubmission", async () => {
    const { agent, campaign, token } = await setup();
    const first = await processInquirySubmission(publicDb, request(campaign.slug, token));
    const retry = await processInquirySubmission(publicDb, request(campaign.slug, token));
    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.duplicate).toBe(true);
    expect(retry.publicToken).toBe(first.publicToken);
    expect(await inquiryCount(agent)).toBe(1);

    // Same form instance, different content (e.g. user went back and changed the timeline).
    const edited = await processInquirySubmission(publicDb, request(campaign.slug, token, { timeline: "exploring" }));
    expect(edited).toMatchObject({ ok: true, duplicate: false });
    expect(await inquiryCount(agent)).toBe(2);
  });

  it("does not report success when the database write fails", async () => {
    const { agent, campaign, token } = await setup();
    const failing: PublicDb = {
      anon: publicDb.anon,
      service: async () => {
        throw Object.assign(new Error("connection reset"), { code: "08006" });
      },
    };
    const outcome = await processInquirySubmission(failing, request(campaign.slug, token));
    expect(outcome).toMatchObject({ ok: false, reason: "save_failed" });
    expect(await inquiryCount(agent)).toBe(0);
  });

  it("refuses unpublished campaigns", async () => {
    const agent = await createAgent(db);
    const draft = await createCampaignFor(db, agent, { publish: false });
    const outcome = await processInquirySubmission(
      publicDb,
      request(draft.slug, issueFormToken(draft.id, SECRET, NOW - 10_000)),
    );
    expect(outcome).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("rate limits repeated submissions from one connection", async () => {
    const { campaign } = await setup();
    const results = [];
    for (let i = 0; i < 4; i++) {
      const token = issueFormToken(campaign.id, SECRET, NOW - 10_000);
      results.push(
        await processInquirySubmission(publicDb, {
          ...request(campaign.slug, token, { email: `rl${i}@example.test` }),
          ip: "198.51.100.99",
          rateLimit: { max: 3, windowSeconds: 600 },
        }),
      );
    }
    expect(results.map((r) => (r.ok ? "ok" : r.reason))).toEqual(["ok", "ok", "ok", "rate_limited"]);
  });
});

describe("submission emails", () => {
  it("are stored as previews (never sent) when delivery is not configured", async () => {
    const { agent, campaign, token } = await setup();
    const outcome = await processInquirySubmission(publicDb, request(campaign.slug, token, { marketing_consent: "on" }));
    expect(outcome.ok).toBe(true);
    const outbox = await asAgent(db, agent, (tx) => listOutbox(tx, agent));
    expect(outbox.map((e) => [e.kind, e.status]).sort()).toEqual([
      ["acknowledgment", "preview"],
      ["agent_notification", "preview"],
    ]);
    const ack = outbox.find((e) => e.kind === "acknowledgment")!;
    expect(ack.to_email).toBe("casey@example.test");
    expect(ack.subject).toBe("Thanks, Casey – I received your request");
    expect(ack.body_text).toContain("42 Sample Road");
    expect(ack.body_text).toContain("https://scheduler.example.test/agent");
    expect(ack.sent_at).toBeNull();
    // The homeowner's email ends with a working unsubscribe link for this contact.
    const link = /Unsubscribe: (\S+)$/.exec(ack.body_text)?.[1] ?? "";
    expect(link.startsWith("https://app.example.test/unsubscribe?t=")).toBe(true);
    expect(readUnsubscribeToken(new URL(link).searchParams.get("t"), SECRET)).toBe(ack.contact_id);

    const alert = outbox.find((e) => e.kind === "agent_notification")!;
    expect(alert.body_text).toContain("https://app.example.test/leads/");
    expect(alert.body_text).not.toContain("/unsubscribe");
  });

  it("are handed to the provider only when live, and record the real result", async () => {
    const { agent, campaign, token } = await setup();
    const outcome = await processInquirySubmission(publicDb, { ...request(campaign.slug, token), emailLive: true });
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.emailIdsToDeliver).toHaveLength(2);

    const [alertId, ackId] = outcome.emailIdsToDeliver;
    let queued = await asAgent(db, agent, (tx) => listOutbox(tx, agent));
    expect(queued.every((e) => e.status === "queued")).toBe(true);

    const fakeSender = async (email: { id: string }) =>
      email.id === alertId ? ({ ok: true, messageId: "msg_123" } as const) : ({ ok: false, error: "provider_http_422" } as const);
    const result = await deliverQueuedEmails(
      (fn) => asService(db, fn),
      outcome.emailIdsToDeliver,
      fakeSender,
      { live: true, provider: "resend", from: "test@example.test", explanation: "" },
    );
    expect(result).toEqual({ sent: 1, failed: 1 });

    queued = await asAgent(db, agent, (tx) => listOutbox(tx, agent));
    const byId = Object.fromEntries(queued.map((e) => [e.id, e]));
    expect(byId[alertId]).toMatchObject({ status: "sent", provider: "resend" });
    expect(byId[alertId].sent_at).toBeInstanceOf(Date);
    expect(byId[ackId]).toMatchObject({ status: "failed", error_code: "provider_http_422", sent_at: null });

    // Delivery is never attempted twice for the same message.
    const again = await deliverQueuedEmails((fn) => asService(db, fn), outcome.emailIdsToDeliver, fakeSender, {
      live: true,
      provider: "resend",
      from: "test@example.test",
      explanation: "",
    });
    expect(again).toEqual({ sent: 0, failed: 0 });
  });

  it("never touches preview messages during delivery", async () => {
    const { agent, campaign, token } = await setup();
    await processInquirySubmission(publicDb, request(campaign.slug, token));
    const ids = (await asAgent(db, agent, (tx) => listOutbox(tx, agent))).map((e) => e.id);
    const result = await deliverQueuedEmails((fn) => asService(db, fn), ids, async () => ({ ok: true, messageId: "x" }), {
      live: true,
      provider: "resend",
      from: "test@example.test",
      explanation: "",
    });
    expect(result).toEqual({ sent: 0, failed: 0 });
    const statuses = await asOwner(db, (tx) =>
      tx.query<{ status: string }>(`select status from public.outbound_emails where id = any($1::text::uuid[])`, [`{${ids.join(",")}}`]),
    );
    expect(statuses.every((s) => s.status === "preview")).toBe(true);
  });
});
