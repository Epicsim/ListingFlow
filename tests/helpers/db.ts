import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createCampaign, setCampaignStatus } from "@/lib/data/campaigns";
import { createProfile } from "@/lib/data/profiles";
import { type SubmitArgs, submitInquiry } from "@/lib/data/public";
import { applyMigrations } from "@/lib/db/migrate";
import { pgliteDriver } from "@/lib/db/pglite-driver";
import { runAs } from "@/lib/db/run-as";
import type { Driver, Tx } from "@/lib/db/types";
import { STARTER_CAMPAIGN } from "@/lib/domain";
import type { AttributionInput, InquiryInput } from "@/lib/validation";

/** A fresh in-memory Postgres with the real migrations and RLS policies applied. */
export async function createTestDb(): Promise<Driver> {
  const driver = pgliteDriver(new PGlite());
  await applyMigrations(driver, { withLocalShim: true });
  return driver;
}

export const asAgent = <T>(db: Driver, agentId: string, fn: (tx: Tx) => Promise<T>) =>
  runAs(db, "authenticated", agentId, fn);
export const asAnon = <T>(db: Driver, fn: (tx: Tx) => Promise<T>) => runAs(db, "anon", null, fn);
export const asService = <T>(db: Driver, fn: (tx: Tx) => Promise<T>) => runAs(db, "service_role", null, fn);
/** Database owner (bypasses RLS) - used only to arrange test data, e.g. backdating rows. */
export const asOwner = <T>(db: Driver, fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

let counter = 0;

/** Creates a Supabase-style auth user plus an agent profile (via the agent's own RLS session). */
export async function createAgent(db: Driver, name = `Test Agent ${++counter}`): Promise<string> {
  const id = randomUUID();
  await asOwner(db, (tx) =>
    tx.query(`insert into auth.users (id, email, encrypted_password) values ($1::uuid, $2::text, 'x')`, [
      id,
      `agent-${id}@example.test`,
    ]),
  );
  await asAgent(db, id, (tx) =>
    createProfile(tx, id, {
      full_name: name,
      brokerage: "Example Realty (Fictional)",
      license_number: undefined,
      contact_email: `agent-${id.slice(0, 8)}@example.test`,
      phone: "555-0100",
      primary_color: "#1F5F4A",
      service_areas: ["Springfield"],
      intro: undefined,
      booking_url: "https://scheduler.example.test/agent",
      privacy_policy_url: undefined,
      notification_email: `alerts-${id.slice(0, 8)}@example.test`,
      notify_new_inquiry: true,
      send_acknowledgment: true,
      timezone: "America/Chicago",
    }),
  );
  return id;
}

export async function createCampaignFor(
  db: Driver,
  agentId: string,
  opts: { slug?: string; publish?: boolean; name?: string; bookingUrl?: string } = {},
): Promise<{ id: string; slug: string }> {
  const slug = opts.slug ?? `campaign-${randomUUID().slice(0, 8)}`;
  const id = await asAgent(db, agentId, (tx) =>
    createCampaign(
      tx,
      agentId,
      {
        name: opts.name ?? STARTER_CAMPAIGN.name,
        slug,
        headline: STARTER_CAMPAIGN.headline,
        description: STARTER_CAMPAIGN.description,
        cta_text: STARTER_CAMPAIGN.cta_text,
        thank_you_message: STARTER_CAMPAIGN.thank_you_message,
        booking_url: opts.bookingUrl,
      },
      null,
    ),
  );
  if (opts.publish !== false) await asAgent(db, agentId, (tx) => setCampaignStatus(tx, agentId, id, "published"));
  return { id, slug };
}

export function sampleInquiry(overrides: Partial<InquiryInput> = {}): InquiryInput {
  return {
    full_name: "Pat Example",
    email: "pat@example.test",
    phone: "555-0123",
    property_address: "123 Example Street, Springfield",
    timeline: "3_6_months",
    message: undefined,
    preferred_contact: "email",
    marketing_consent: false,
    ...overrides,
  };
}

export async function submit(
  db: Driver,
  slug: string,
  overrides: Omit<Partial<SubmitArgs>, "inquiry" | "attribution"> & {
    inquiry?: Partial<InquiryInput>;
    attribution?: Partial<AttributionInput>;
  } = {},
) {
  const { inquiry, ...rest } = overrides;
  return asService(db, (tx) =>
    submitInquiry(tx, {
      slug,
      inquiry: sampleInquiry(inquiry),
      attribution: {},
      idempotencyKey: randomUUID().replace(/-/g, ""),
      rateKey: null,
      consentWording: "Yes, the agent may email me occasional updates. I can unsubscribe at any time.",
      ...rest,
    }),
  );
}
