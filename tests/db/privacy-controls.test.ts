import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getContact } from "@/lib/data/leads";
import { createFollowUpEmail } from "@/lib/data/outbox";
import { deleteOwnAccount } from "@/lib/data/profiles";
import { getPublicCampaign, unsubscribeContact } from "@/lib/data/public";
import type { Driver } from "@/lib/db/types";
import { asAgent, asAnon, asOwner, asService, createAgent, createCampaignFor, createTestDb, submit } from "../helpers/db";

let db: Driver;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

async function leadFor(agent: string, email: string) {
  const campaign = await createCampaignFor(db, agent);
  const result = await submit(db, campaign.slug, { inquiry: { email, marketing_consent: true } });
  if (result.status !== "created") throw new Error("setup failed");
  return { campaign, contactId: result.contact_id };
}

const followUp = (agentId: string, contactId: string) => (tx: Parameters<typeof createFollowUpEmail>[0]) =>
  createFollowUpEmail(tx, {
    agentId,
    contactId,
    inquiryId: null,
    kind: "follow_up",
    to: "homeowner@example.test",
    replyTo: null,
    subject: "Your estimate",
    body: "Hello",
    status: "preview",
  });

describe("email unsubscribe", () => {
  it("withdraws marketing consent once, keeps consent history and blocks new follow-ups", async () => {
    const agent = await createAgent(db);
    const { contactId } = await leadFor(agent, "unsub@example.test");

    expect(await asService(db, (tx) => unsubscribeContact(tx, contactId))).toBe(true);
    expect(await asService(db, (tx) => unsubscribeContact(tx, contactId))).toBe(true);

    const contact = await asAgent(db, agent, (tx) => getContact(tx, agent, contactId));
    expect(contact?.unsubscribed_at).toBeInstanceOf(Date);
    expect(contact?.marketing_consent).toBe(false);
    const [counts] = await asOwner(db, (tx) =>
      tx.query<{ events: number; consents: number }>(
        `select (select count(*)::int from public.activity_events where contact_id = $1::uuid and type = 'email_unsubscribed') as events,
                (select count(*)::int from public.consent_records where contact_id = $1::uuid) as consents`,
        [contactId],
      ),
    );
    expect(counts).toEqual({ events: 1, consents: 1 });

    await expect(asAgent(db, agent, followUp(agent, contactId))).rejects.toThrow(/row-level security/);
    await expect(
      asAgent(db, agent, (tx) => tx.query(`update public.contacts set unsubscribed_at = null where id = $1::uuid`, [contactId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("still lets agents write to contacts who haven't unsubscribed", async () => {
    const agent = await createAgent(db);
    const { contactId } = await leadFor(agent, "subscribed@example.test");
    await expect(asAgent(db, agent, followUp(agent, contactId))).resolves.toBeTypeOf("string");
  });

  it("reports unknown contacts and is callable only by the server's service role", async () => {
    expect(await asService(db, (tx) => unsubscribeContact(tx, randomUUID()))).toBe(false);
    const agent = await createAgent(db);
    const { contactId } = await leadFor(agent, "rpc@example.test");
    await expect(asAnon(db, (tx) => unsubscribeContact(tx, contactId))).rejects.toThrow(/permission denied/);
    await expect(asAgent(db, agent, (tx) => unsubscribeContact(tx, contactId))).rejects.toThrow(/permission denied/);
  });
});

describe("account deletion", () => {
  it("deletes the agent's login and every agent-owned row, and nothing of other agents", async () => {
    const agent = await createAgent(db);
    const other = await createAgent(db);
    const mine = await leadFor(agent, "mine@example.test");
    const theirs = await leadFor(other, "theirs@example.test");

    expect(await asAgent(db, agent, deleteOwnAccount)).toBe(true);

    const [left] = await asOwner(db, (tx) =>
      tx.query<{ users: number; profiles: number; contacts: number; campaigns: number; activity: number }>(
        `select (select count(*)::int from auth.users where id = $1::uuid) as users,
                (select count(*)::int from public.agent_profiles where id = $1::uuid) as profiles,
                (select count(*)::int from public.contacts where agent_id = $1::uuid) as contacts,
                (select count(*)::int from public.campaigns where agent_id = $1::uuid) as campaigns,
                (select count(*)::int from public.activity_events where agent_id = $1::uuid) as activity`,
        [agent],
      ),
    );
    expect(left).toEqual({ users: 0, profiles: 0, contacts: 0, campaigns: 0, activity: 0 });
    expect(await asAnon(db, (tx) => getPublicCampaign(tx, mine.campaign.slug))).toBeNull();
    expect(await asAnon(db, (tx) => getPublicCampaign(tx, theirs.campaign.slug))).not.toBeNull();
    expect(await asAgent(db, other, (tx) => getContact(tx, other, theirs.contactId))).not.toBeNull();
  });

  it("is available only to a signed-in agent", async () => {
    await expect(asAnon(db, deleteOwnAccount)).rejects.toThrow(/permission denied/);
    await expect(asService(db, deleteOwnAccount)).rejects.toThrow(/permission denied/);
  });
});
