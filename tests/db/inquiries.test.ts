import { beforeAll, describe, expect, it } from "vitest";
import { setCampaignStatus } from "@/lib/data/campaigns";
import { getLeadDetail, listLeads } from "@/lib/data/leads";
import type { Driver } from "@/lib/db/types";
import { asAgent, asOwner, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;

beforeAll(async () => {
  db = await createTestDb();
});

describe("inquiry persistence", () => {
  it("stores the contact, the inquiry and its attribution", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const res = await submit(db, campaign.slug, {
      inquiry: { full_name: "Robin Sample", email: "Robin@Example.test", message: "Corner lot, new roof." },
      attribution: { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring", referrer_host: "l.instagram.com" },
    });
    expect(res.status).toBe("created");
    if (res.status !== "created") return;
    expect(res.is_repeat).toBe(false);

    const detail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, res.contact_id));
    expect(detail?.contact).toMatchObject({
      full_name: "Robin Sample",
      email: "Robin@Example.test",
      status: "new",
      inquiry_count: 1,
      marketing_consent: false,
    });
    expect(detail?.inquiries).toHaveLength(1);
    expect(detail?.inquiries[0]).toMatchObject({
      campaign_id: campaign.id,
      property_address: "123 Example Street, Springfield",
      timeline: "3_6_months",
      message: "Corner lot, new roof.",
      source: "instagram",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "spring",
      referrer_host: "l.instagram.com",
    });
    expect(detail?.activity.map((e) => e.type)).toContain("inquiry_submitted");
    expect(detail?.consents).toHaveLength(0);
  });

  it("records marketing consent with its wording, time and source only when given", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const wording = "Yes, Test Agent may email me occasional market updates. I can unsubscribe at any time.";
    const res = await submit(db, campaign.slug, {
      inquiry: { email: "consenting@example.test", marketing_consent: true },
      attribution: { utm_source: "facebook" },
      consentWording: wording,
    });
    if (res.status !== "created") throw new Error(res.status);
    const detail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, res.contact_id));
    expect(detail?.contact.marketing_consent).toBe(true);
    expect(detail?.consents).toHaveLength(1);
    expect(detail?.consents[0]).toMatchObject({
      consent_type: "marketing_email",
      wording,
      source_page: `/p/${campaign.slug}`,
      source_utm: "facebook",
      inquiry_id: res.inquiry_id,
    });
    expect(detail?.consents[0].captured_at).toBeInstanceOf(Date);
  });

  it("refuses submissions for draft or archived campaigns", async () => {
    const agent = await createAgent(db);
    const draft = await createCampaignFor(db, agent, { publish: false });
    expect((await submit(db, draft.slug)).status).toBe("campaign_unavailable");

    const archived = await createCampaignFor(db, agent);
    await asAgent(db, agent, (tx) => setCampaignStatus(tx, agent, archived.id, "archived"));
    expect((await submit(db, archived.slug)).status).toBe("campaign_unavailable");
    expect((await submit(db, "no-such-campaign")).status).toBe("campaign_unavailable");
  });

  it("is protected by database constraints even if app validation were bypassed", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    await expect(
      submit(db, campaign.slug, { inquiry: { timeline: "someday" as never, email: "bad-timeline@example.test" } }),
    ).rejects.toThrow(/check constraint/);
    await expect(submit(db, campaign.slug, { inquiry: { email: "not-an-email" } })).rejects.toThrow(/check constraint/);
    await expect(
      submit(db, campaign.slug, { inquiry: { marketing_consent: true, email: "c@example.test" }, consentWording: null }),
    ).rejects.toThrow(/consent wording is required/);
  });
});

describe("duplicate and repeat submissions", () => {
  it("stores a retried submission (same idempotency key) only once", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const key = "retry-key-0000000000000001";
    const first = await submit(db, campaign.slug, { idempotencyKey: key });
    const second = await submit(db, campaign.slug, { idempotencyKey: key });
    const third = await submit(db, campaign.slug, { idempotencyKey: key });
    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");
    expect(third.status).toBe("duplicate");
    if (first.status !== "created" || second.status !== "duplicate") return;
    expect(second.public_token).toBe(first.public_token);

    const detail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, first.contact_id));
    expect(detail?.inquiries).toHaveLength(1);
    expect(detail?.contact.inquiry_count).toBe(1);
  });

  it("links a new request from the same homeowner to the existing contact without discarding it", async () => {
    const agent = await createAgent(db);
    const instagram = await createCampaignFor(db, agent, { name: "Instagram spring" });
    const website = await createCampaignFor(db, agent, { name: "Website banner" });

    const first = await submit(db, instagram.slug, {
      inquiry: { email: "repeat@example.test", timeline: "exploring", property_address: "1 First Ave, Springfield" },
      attribution: { utm_source: "instagram" },
    });
    const second = await submit(db, website.slug, {
      inquiry: {
        email: "  REPEAT@example.test ",
        timeline: "soon",
        property_address: "1 First Ave, Springfield",
        phone: undefined,
        message: "Ready to move sooner now.",
      },
      attribution: { utm_source: "website" },
    });
    if (first.status !== "created" || second.status !== "created") throw new Error("unexpected status");

    expect(second.contact_id).toBe(first.contact_id);
    expect(second.inquiry_id).not.toBe(first.inquiry_id);
    expect(second.is_repeat).toBe(true);

    const detail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, first.contact_id));
    expect(detail?.contact.inquiry_count).toBe(2);
    expect(detail?.contact.phone).toBe("555-0123"); // kept from the first inquiry
    // Each inquiry keeps its own campaign and source.
    const byCampaign = Object.fromEntries(detail!.inquiries.map((i) => [i.campaign_id, i]));
    expect(byCampaign[instagram.id]).toMatchObject({ source: "instagram", timeline: "exploring", is_repeat: false });
    expect(byCampaign[website.id]).toMatchObject({
      source: "website",
      timeline: "soon",
      is_repeat: true,
      message: "Ready to move sooner now.",
    });
    // The returning homeowner gets an immediate follow-up reminder.
    expect(detail?.tasks.some((t) => t.title.startsWith("Respond to new inquiry") && !t.completed_at)).toBe(true);
    expect(detail?.activity.map((e) => e.type)).toContain("repeat_inquiry_submitted");

    // The lead list shows one lead, findable through either campaign.
    for (const campaignId of [instagram.id, website.id]) {
      const list = await asAgent(db, agent, (tx) => listLeads(tx, agent, { campaignId }, new Date()));
      expect(list.rows.map((r) => r.id)).toEqual([first.contact_id]);
    }
  });

  it("keeps the same homeowner separate for different agents", async () => {
    const agentA = await createAgent(db);
    const agentB = await createAgent(db);
    const a = await createCampaignFor(db, agentA);
    const b = await createCampaignFor(db, agentB);
    const ra = await submit(db, a.slug, { inquiry: { email: "shared@example.test" } });
    const rb = await submit(db, b.slug, { inquiry: { email: "shared@example.test" } });
    if (ra.status !== "created" || rb.status !== "created") throw new Error("unexpected status");
    expect(ra.contact_id).not.toBe(rb.contact_id);
    expect(rb.is_repeat).toBe(false);
  });
});

describe("rate limiting", () => {
  it("rejects a burst of submissions from the same source and allows others", async () => {
    const agent = await createAgent(db);
    const campaign = await createCampaignFor(db, agent);
    const limit = { max: 3, windowSeconds: 600 };
    const statuses: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await submit(db, campaign.slug, {
        rateKey: "a".repeat(64),
        rateLimit: limit,
        inquiry: { email: `burst${i}@example.test` },
      });
      statuses.push(r.status);
    }
    expect(statuses).toEqual(["created", "created", "created", "rate_limited"]);
    const other = await submit(db, campaign.slug, { rateKey: "b".repeat(64), rateLimit: limit });
    expect(other.status).toBe("created");

    // Only a keyed hash is stored, never an address.
    const stored = await asOwner(db, (tx) =>
      tx.query<{ key_hash: string }>(`select key_hash from app_private.submission_throttle`),
    );
    expect(stored.every((r) => /^[ab]{64}$/.test(r.key_hash))).toBe(true);
  });
});
