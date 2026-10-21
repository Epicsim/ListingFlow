/**
 * Runs the production database driver (postgres.js, used with Supabase) over a
 * real Postgres wire-protocol connection - served by PGlite through
 * pglite-socket - to check it returns the same shapes as the local driver and
 * that role switching / row-level security behave identically through it.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLeadDetail, listLeads } from "@/lib/data/leads";
import { getOverviewMetrics } from "@/lib/data/metrics";
import { getProfile, insertAsset } from "@/lib/data/profiles";
import { getPublicAsset } from "@/lib/data/public";
import { applyMigrations } from "@/lib/db/migrate";
import { postgresDriver } from "@/lib/db/postgres-driver";
import type { Driver } from "@/lib/db/types";
import { asAgent, asAnon, createAgent, createCampaignFor, submit } from "../helpers/db";

let server: PGLiteSocketServer;
let pglite: PGlite;
let db: Driver;

beforeAll(async () => {
  pglite = new PGlite();
  const port = 55000 + Math.floor(Math.random() * 5000);
  server = new PGLiteSocketServer({ db: pglite, port, host: "127.0.0.1", maxConnections: 4 });
  await server.start();
  process.env.DATABASE_POOL_MAX = "1";
  db = postgresDriver(`postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
  await applyMigrations(db, { withLocalShim: true });
});

afterAll(async () => {
  await db?.close();
  await server?.stop();
  await pglite?.close();
});

describe("postgres.js driver (Supabase mode)", () => {
  it("applies migrations idempotently", async () => {
    const again = await applyMigrations(db, { withLocalShim: true });
    expect(again.applied).toEqual([]);
    expect(again.skipped.length).toBeGreaterThanOrEqual(3);
  });

  it("returns the same value shapes as the local driver", async () => {
    const agent = await createAgent(db, "Driver Check");
    const profile = await asAgent(db, agent, (tx) => getProfile(tx, agent));
    expect(profile?.service_areas).toEqual(["Springfield"]);
    expect(profile?.created_at).toBeInstanceOf(Date);
    expect(typeof profile?.notify_new_inquiry).toBe("boolean");

    const campaign = await createCampaignFor(db, agent);
    const res = await submit(db, campaign.slug, { attribution: { utm_source: "instagram" } });
    expect(res.status).toBe("created");
    if (res.status !== "created") return;

    const metrics = await asAgent(db, agent, (tx) =>
      getOverviewMetrics(tx, agent, { from: null, to: new Date(Date.now() + 60_000) }, new Date()),
    );
    expect(metrics.new_inquiries).toBe(1);
    expect(typeof metrics.new_inquiries).toBe("number");

    const detail = await asAgent(db, agent, (tx) => getLeadDetail(tx, agent, res.contact_id));
    expect(detail?.inquiries[0].source).toBe("instagram");
    expect(detail?.activity[0].data).toMatchObject({ source: "instagram" });

    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const assetId = await asAgent(db, agent, (tx) => insertAsset(tx, agent, "logo", "image/png", bytes));
    const asset = await asAnon(db, (tx) => getPublicAsset(tx, assetId));
    expect(Array.from(asset!.data)).toEqual(Array.from(bytes));
  });

  it("enforces row-level security through role switching on a pooled connection", async () => {
    const a = await createAgent(db);
    const b = await createAgent(db);
    const campaignB = await createCampaignFor(db, b);
    await submit(db, campaignB.slug, { inquiry: { email: "private-b@example.test" } });

    const seenByA = await asAgent(db, a, (tx) => listLeads(tx, b, {}, new Date()));
    expect(seenByA.rows).toHaveLength(0);
    const seenByB = await asAgent(db, b, (tx) => listLeads(tx, b, {}, new Date()));
    expect(seenByB.rows).toHaveLength(1);

    await expect(asAnon(db, (tx) => tx.query(`select * from public.contacts`))).rejects.toThrow(/permission denied/);
    // The role is transaction-local: the next transaction on the same connection is back to the owner role.
    const role = await db.transaction((tx) => tx.query<{ r: string }>(`select current_user as r`));
    expect(role[0].r).toBe("postgres");
  });
});
