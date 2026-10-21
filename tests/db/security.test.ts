import { beforeAll, describe, expect, it } from "vitest";
import { recordAppointment } from "@/lib/data/appointments";
import { getCampaign, listCampaignsWithStats, updateCampaign } from "@/lib/data/campaigns";
import { deleteLead, getLeadDetail, listLeads, updateLeadStatus } from "@/lib/data/leads";
import { getOverviewMetrics } from "@/lib/data/metrics";
import { getPublicCampaign } from "@/lib/data/public";
import { createTask } from "@/lib/data/tasks";
import type { Driver } from "@/lib/db/types";
import { STARTER_CAMPAIGN } from "@/lib/domain";
import {
  asAgent,
  asAnon,
  createAgent,
  createCampaignFor,
  createTestDb,
  submit,
} from "../helpers/db";

const PRIVATE_TABLES = [
  "agent_profiles",
  "assets",
  "campaigns",
  "contacts",
  "inquiries",
  "consent_records",
  "booking_clicks",
  "appointments",
  "follow_up_tasks",
  "lead_notes",
  "activity_events",
  "email_templates",
  "outbound_emails",
];

let db: Driver;
let agentA: string;
let agentB: string;
let campaignA: { id: string; slug: string };
let campaignB: { id: string; slug: string };
let contactB: string;

beforeAll(async () => {
  db = await createTestDb();
  agentA = await createAgent(db, "Agent Alpha");
  agentB = await createAgent(db, "Agent Beta");
  campaignA = await createCampaignFor(db, agentA);
  campaignB = await createCampaignFor(db, agentB);
  await submit(db, campaignA.slug, { inquiry: { email: "homeowner-a@example.test" } });
  const res = await submit(db, campaignB.slug, { inquiry: { email: "homeowner-b@example.test" } });
  if (res.status !== "created") throw new Error("setup failed");
  contactB = res.contact_id;
});

describe("public (anonymous) access", () => {
  it.each(PRIVATE_TABLES)("cannot read %s", async (table) => {
    await expect(asAnon(db, (tx) => tx.query(`select * from public.${table} limit 1`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot write lead data directly", async () => {
    await expect(
      asAnon(db, (tx) =>
        tx.query(
          `insert into public.contacts (agent_id, email, email_normalized, full_name, preferred_contact)
           values ($1::uuid, 'x@example.test', 'x@example.test', 'X', 'email')`,
          [agentA],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot delete a lead", async () => {
    await expect(asAnon(db, (tx) => deleteLead(tx, agentB, contactB))).rejects.toThrow(/permission denied/);
    expect(await asAgent(db, agentB, (tx) => getLeadDetail(tx, agentB, contactB))).not.toBeNull();
  });

  it("cannot call the submission or booking-click functions (server only)", async () => {
    await expect(
      asAnon(db, (tx) => tx.query(`select public.submit_inquiry('x', '{}'::jsonb, 'k', null, 6, 600, null)`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, (tx) => tx.query(`select public.record_booking_click('x', null)`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot read the private rate-limit table", async () => {
    await expect(asAnon(db, (tx) => tx.query(`select * from app_private.submission_throttle`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("can read only published campaigns, and only public fields", async () => {
    const published = await asAnon(db, (tx) => getPublicCampaign(tx, campaignA.slug));
    expect(published?.agent_name).toBe("Agent Alpha");
    expect(published).not.toHaveProperty("notification_email");
    expect(published).not.toHaveProperty("agent_id");

    const draft = await createCampaignFor(db, agentA, { publish: false });
    expect(await asAnon(db, (tx) => getPublicCampaign(tx, draft.slug))).toBeNull();
  });
});

describe("agent-to-agent isolation", () => {
  it("an agent sees only their own leads, campaigns and metrics", async () => {
    const leadsA = await asAgent(db, agentA, (tx) => listLeads(tx, agentA, {}, new Date()));
    expect(leadsA.rows.map((r) => r.email)).toEqual(["homeowner-a@example.test"]);

    // Even when asking for the other agent's id explicitly, RLS returns nothing.
    const leakedLeads = await asAgent(db, agentA, (tx) => listLeads(tx, agentB, {}, new Date()));
    expect(leakedLeads.rows).toHaveLength(0);
    const leakedCampaigns = await asAgent(db, agentA, (tx) => listCampaignsWithStats(tx, agentB));
    expect(leakedCampaigns).toHaveLength(0);
    const leakedMetrics = await asAgent(db, agentA, (tx) =>
      getOverviewMetrics(tx, agentB, { from: null, to: new Date(Date.now() + 1000) }, new Date()),
    );
    expect(leakedMetrics.total_leads).toBe(0);
    expect(leakedMetrics.new_inquiries).toBe(0);
  });

  it.each(PRIVATE_TABLES)("raw select on %s returns only the agent's own rows", async (table) => {
    const column = table === "agent_profiles" ? "id" : "agent_id";
    const rows = await asAgent(db, agentA, (tx) =>
      tx.query<{ owner: string }>(`select ${column} as owner from public.${table}`),
    );
    expect(rows.every((r) => r.owner === agentA)).toBe(true);
  });

  it("cannot open another agent's lead or campaign", async () => {
    expect(await asAgent(db, agentA, (tx) => getLeadDetail(tx, agentB, contactB))).toBeNull();
    expect(await asAgent(db, agentA, (tx) => getCampaign(tx, agentB, campaignB.id))).toBeNull();
  });

  it("cannot modify another agent's records", async () => {
    const changed = await asAgent(db, agentA, (tx) =>
      updateCampaign(
        tx,
        agentB,
        campaignB.id,
        { ...STARTER_CAMPAIGN, slug: "hijacked-campaign", booking_url: undefined },
        "keep",
      ),
    );
    expect(changed).toBe(false);
    expect(await asAgent(db, agentA, (tx) => updateLeadStatus(tx, agentB, contactB, "lost", undefined))).toBe(false);

    const raw = await asAgent(db, agentA, (tx) =>
      tx.query(`update public.contacts set status = 'lost' where id = $1::uuid returning id`, [contactB]),
    );
    expect(raw).toHaveLength(0);
  });

  it("cannot delete another agent's lead, even with a spoofed agent id or raw SQL", async () => {
    const before = await asAgent(db, agentB, (tx) => getLeadDetail(tx, agentB, contactB));
    expect(await asAgent(db, agentA, (tx) => deleteLead(tx, agentA, contactB))).toBe(false);
    expect(await asAgent(db, agentA, (tx) => deleteLead(tx, agentB, contactB))).toBe(false);
    const raw = await asAgent(db, agentA, (tx) =>
      tx.query(`delete from public.contacts where id = $1::uuid returning id`, [contactB]),
    );
    expect(raw).toHaveLength(0);
    expect(await asAgent(db, agentB, (tx) => getLeadDetail(tx, agentB, contactB))).toEqual(before);
    const events = await asAgent(db, agentA, (tx) =>
      tx.query(`select id from public.activity_events where type = 'lead_deleted'`),
    );
    expect(events).toHaveLength(0);
  });

  it("cannot attach records to another agent's contact", async () => {
    expect(
      await asAgent(db, agentA, (tx) => createTask(tx, agentA, contactB, "Call", new Date())),
    ).toBeNull();
    expect(
      await asAgent(db, agentA, (tx) => recordAppointment(tx, agentA, { contactId: contactB, scheduledAt: new Date() })),
    ).toBeNull();

    // Bypassing the app code: the composite foreign key refuses the cross-agent link.
    await expect(
      asAgent(db, agentA, (tx) =>
        tx.query(
          `insert into public.follow_up_tasks (agent_id, contact_id, title, due_at) values ($1::uuid, $2::uuid, 'x', now())`,
          [agentA, contactB],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("cannot create rows owned by another agent", async () => {
    await expect(
      asAgent(db, agentA, (tx) =>
        tx.query(
          `insert into public.campaigns (agent_id, name, slug, headline, description, cta_text, thank_you_message)
           values ($1::uuid, 'x', 'impersonated-slug', 'h', 'd', 'c', 't')`,
          [agentB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("agent write restrictions", () => {
  it("cannot rewrite a homeowner's submitted details", async () => {
    await expect(
      asAgent(db, agentA, (tx) => tx.query(`update public.contacts set email = 'changed@example.test'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asAgent(db, agentA, (tx) => tx.query(`update public.inquiries set property_address = 'Changed'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asAgent(db, agentA, (tx) => tx.query(`delete from public.consent_records`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot forge visitor activity or mark an email as sent", async () => {
    await expect(
      asAgent(db, agentA, (tx) =>
        tx.query(
          `insert into public.activity_events (agent_id, type, actor) values ($1::uuid, 'inquiry_submitted', 'visitor')`,
          [agentA],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asAgent(db, agentA, (tx) =>
        tx.query(
          `insert into public.outbound_emails (agent_id, kind, to_email, subject, body_text, status, sent_at)
           values ($1::uuid, 'follow_up', 'x@example.test', 's', 'b', 'sent', now())`,
          [agentA],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot record appointments as if they came from a booking webhook", async () => {
    const leads = await asAgent(db, agentA, (tx) => listLeads(tx, agentA, {}, new Date()));
    await expect(
      asAgent(db, agentA, (tx) =>
        tx.query(
          `insert into public.appointments (agent_id, contact_id, scheduled_at, source, external_provider, external_event_id)
           values ($1::uuid, $2::uuid, now(), 'booking_webhook', 'calendly', 'evt_1')`,
          [agentA, leads.rows[0].id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot call the server-only submission function while signed in", async () => {
    await expect(
      asAgent(db, agentA, (tx) => tx.query(`select public.submit_inquiry('x', '{}'::jsonb, 'k', null, 6, 600, null)`)),
    ).rejects.toThrow(/permission denied/);
  });
});
