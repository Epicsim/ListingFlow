/**
 * Creates a demo agent account with clearly fictional sample data, for local
 * mode only. Inquiries go through the same submission pipeline as the public
 * form (validation, idempotency, contact matching, outbox previews).
 *
 *   npm run db:seed-demo            create the demo account if it doesn't exist
 *   npm run db:seed-demo -- --reset delete and recreate it
 *
 * Stop `npm run dev` first: the local database can only be open in one process.
 */
import { loadEnv } from "./load-env";

loadEnv();

/** Local-only demo sign-in. Never use these values anywhere else. */
export const DEMO_ACCOUNT = { email: "demo@listingflow.test", password: "listingflow-demo" } as const;

const DAY = 86_400_000;

async function main() {
  const reset = process.argv.includes("--reset");
  const { getAppSecret, getBackend } = await import("@/lib/config");
  if (getBackend() !== "local") {
    throw new Error("The demo seed only runs in local mode. It never writes to a Supabase project.");
  }
  const { openLocalDatabase } = await import("@/lib/db/local");
  const { runAs } = await import("@/lib/db/run-as");
  const { hashPassword } = await import("@/lib/auth/password");
  const { createProfile } = await import("@/lib/data/profiles");
  const { createCampaign, setCampaignStatus } = await import("@/lib/data/campaigns");
  const { recordBookingClick } = await import("@/lib/data/public");
  const { markContacted, updateLeadStatus, addNote } = await import("@/lib/data/leads");
  const { savePlan, savePlanStep, startPlan } = await import("@/lib/data/plans");
  const { STARTER_PLANS } = await import("@/lib/follow-up-plans");
  const { createTask } = await import("@/lib/data/tasks");
  const { recordAppointment, updateAppointmentStatus } = await import("@/lib/data/appointments");
  const { processInquirySubmission } = await import("@/lib/inquiry-service");
  const { issueFormToken } = await import("@/lib/security/form-token");
  const { STARTER_CAMPAIGN } = await import("@/lib/domain");
  type Tx = import("@/lib/db/types").Tx;

  const { driver, release } = await openLocalDatabase();
  try {
    const existing = await driver.transaction((tx) =>
      tx.query<{ id: string }>(`select id from auth.users where email = $1::text`, [DEMO_ACCOUNT.email]),
    );
    if (existing.length && !reset) {
      console.log(`The demo account already exists (${DEMO_ACCOUNT.email}). Use --reset to recreate it.`);
      return;
    }
    if (existing.length) {
      await driver.transaction((tx) => tx.query(`delete from auth.users where id = $1::uuid`, [existing[0].id]));
    }

    const hash = await hashPassword(DEMO_ACCOUNT.password);
    const [{ id: agentId }] = await driver.transaction((tx) =>
      tx.query<{ id: string }>(`insert into auth.users (email, encrypted_password) values ($1::text, $2::text) returning id`, [
        DEMO_ACCOUNT.email,
        hash,
      ]),
    );
    const asAgent = <T>(fn: (tx: Tx) => Promise<T>) => runAs(driver, "authenticated", agentId, fn);
    const asOwner = <T>(fn: (tx: Tx) => Promise<T>) => driver.transaction(fn);

    await asAgent((tx) =>
      createProfile(tx, agentId, {
        full_name: "Jordan Rivera",
        brokerage: "Example Realty (Demo)",
        license_number: "DEMO-000000",
        contact_email: "jordan.rivera@example.com",
        phone: "(555) 010-0199",
        primary_color: "#1F5F4A",
        service_areas: ["Maple Heights", "Riverside", "Old Town"],
        intro:
          "I've helped neighbors in Maple Heights and Riverside sell for over a decade. I'll walk you through what your home could sell for, what to fix (and what to skip), and how to time your move.\n\nThis is a demo profile with fictional details.",
        booking_url: "https://scheduler.example.com/jordan-rivera-demo",
        privacy_policy_url: undefined,
        notification_email: "jordan.alerts@example.com",
        notify_new_inquiry: true,
        send_acknowledgment: true,
        timezone: "America/Chicago",
      }),
    );

    const base = { ...STARTER_CAMPAIGN, booking_url: undefined };
    const instagram = await asAgent(async (tx) => {
      const id = await createCampaign(tx, agentId, { ...base, name: "Instagram – home value", slug: "demo-jordan-home-value" }, null);
      await setCampaignStatus(tx, agentId, id, "published");
      return { id, slug: "demo-jordan-home-value" };
    });
    const website = await asAgent(async (tx) => {
      const id = await createCampaign(
        tx,
        agentId,
        {
          ...base,
          name: "Website banner",
          slug: "demo-jordan-website",
          headline: "What could your Riverside home sell for this season?",
        },
        null,
      );
      await setCampaignStatus(tx, agentId, id, "published");
      return { id, slug: "demo-jordan-website" };
    });
    await asAgent((tx) =>
      createCampaign(tx, agentId, { ...base, name: "Open house follow-up", slug: "demo-jordan-open-house" }, null),
    );

    const secret = await getAppSecret();
    const publicDb = {
      anon: <T>(fn: (tx: Tx) => Promise<T>) => runAs(driver, "anon", null, fn),
      service: <T>(fn: (tx: Tx) => Promise<T>) => runAs(driver, "service_role", null, fn),
    };

    type Seed = {
      campaign: { id: string; slug: string };
      daysAgo: number;
      fields: Record<string, string>;
    };
    const seeds: Seed[] = [
      { campaign: website, daysAgo: 40, fields: { full_name: "Drew Kim", email: "drew.kim@example.com", property_address: "88 Hillcrest Ave, Springfield", timeline: "exploring", preferred_contact: "email", utm_source: "email", utm_medium: "email" } },
      { campaign: website, daysAgo: 20, fields: { full_name: "Taylor Brooks", email: "taylor.brooks@example.com", property_address: "602 Cedar St, Springfield", timeline: "3_6_months", preferred_contact: "email", utm_source: "website", utm_medium: "referral" } },
      { campaign: instagram, daysAgo: 12, fields: { full_name: "Riley Patel", email: "riley.patel@example.com", phone: "555-0187", property_address: "15 Orchard Lane, Springfield", timeline: "soon", preferred_contact: "text", utm_source: "instagram", utm_medium: "social", message: "We'd like to list before school starts." } },
      { campaign: instagram, daysAgo: 9, fields: { full_name: "Casey Nguyen", email: "casey.nguyen@example.com", property_address: "1290 Old Town Rd, Springfield", timeline: "6_12_months", preferred_contact: "email", utm_source: "facebook", utm_medium: "social", marketing_consent: "on" } },
      { campaign: website, daysAgo: 5, fields: { full_name: "Morgan Lee", email: "morgan.lee@example.com", phone: "555-0142", property_address: "77 Riverside Ct, Springfield", timeline: "3_6_months", preferred_contact: "phone", utm_source: "website", utm_medium: "referral" } },
      { campaign: instagram, daysAgo: 2, fields: { full_name: "Avery Thompson", email: "avery.thompson@example.com", property_address: "418 Maple Heights Dr, Springfield", timeline: "soon", preferred_contact: "email", utm_source: "instagram", utm_medium: "social", marketing_consent: "on" } },
      { campaign: instagram, daysAgo: 1, fields: { full_name: "Jamie Ortiz", email: "jamie.ortiz@example.com", property_address: "3 Lakeview Terrace, Springfield", timeline: "exploring", preferred_contact: "email", marketing_consent: "on" } },
      // A repeat request from Morgan Lee via a different campaign.
      { campaign: instagram, daysAgo: 0, fields: { full_name: "Morgan Lee", email: "morgan.lee@example.com", phone: "555-0142", property_address: "77 Riverside Ct, Springfield", timeline: "soon", preferred_contact: "phone", utm_source: "instagram", utm_medium: "social", message: "Plans changed – we may move sooner." } },
    ];

    const contacts: Record<string, string> = {};
    const tokens: Record<string, string> = {};
    for (const [i, seed] of seeds.entries()) {
      const outcome = await processInquirySubmission(publicDb, {
        slug: seed.campaign.slug,
        secret,
        ip: `198.51.100.${i + 10}`,
        siteOrigin: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        emailLive: false,
        fields: { ...seed.fields, form_token: issueFormToken(seed.campaign.id, secret, Date.now() - 10_000) },
      });
      if (!outcome.ok) throw new Error(`Seeding inquiry ${i + 1} failed: ${outcome.reason}`);
      const [{ id: inquiryId, contact_id }] = await asOwner((tx) =>
        tx.query<{ id: string; contact_id: string }>(`select id, contact_id from public.inquiries where public_token = $1::uuid`, [
          outcome.publicToken,
        ]),
      );
      contacts[seed.fields.email] = contact_id;
      tokens[seed.fields.email] = outcome.publicToken;
      if (seed.daysAgo > 0) {
        // Spread the sample history over the past weeks.
        await asOwner(async (tx) => {
          const at = new Date(Date.now() - seed.daysAgo * DAY - i * 3_600_000).toISOString();
          await tx.query(`update public.inquiries set created_at = $2::timestamptz where id = $1::uuid`, [inquiryId, at]);
          await tx.query(`update public.activity_events set created_at = $2::timestamptz where inquiry_id = $1::uuid`, [inquiryId, at]);
          await tx.query(`update public.outbound_emails set created_at = $2::timestamptz where inquiry_id = $1::uuid`, [inquiryId, at]);
          await tx.query(`update public.consent_records set captured_at = $2::timestamptz where inquiry_id = $1::uuid`, [inquiryId, at]);
          await tx.query(
            `update public.contacts set first_inquiry_at = least(first_inquiry_at, $2::timestamptz),
               last_inquiry_at = (select max(created_at) from public.inquiries where contact_id = $1::uuid)
             where id = $1::uuid`,
            [contact_id, at],
          );
        });
      }
    }

    const service = publicDb.service;
    await service((tx) => recordBookingClick(tx, instagram.slug, tokens["avery.thompson@example.com"]));
    await service((tx) => recordBookingClick(tx, instagram.slug, tokens["riley.patel@example.com"]));
    await service((tx) => recordBookingClick(tx, instagram.slug, tokens["jamie.ortiz@example.com"]));

    await asAgent(async (tx) => {
      const c = contacts;
      // Avery: booked a consultation for later this week.
      await markContacted(tx, agentId, c["avery.thompson@example.com"]);
      await recordAppointment(tx, agentId, {
        contactId: c["avery.thompson@example.com"],
        scheduledAt: new Date(Date.now() + 2 * DAY),
        notes: "Walk-through at the property. Bring recent comparable sales.",
      });
      // Riley: consultation happened, listing won.
      await markContacted(tx, agentId, c["riley.patel@example.com"]);
      const riley = await recordAppointment(tx, agentId, {
        contactId: c["riley.patel@example.com"],
        scheduledAt: new Date(Date.now() - 4 * DAY),
      });
      if (riley) await updateAppointmentStatus(tx, agentId, riley, "attended");
      await updateLeadStatus(tx, agentId, c["riley.patel@example.com"], "won", "Listing agreement signed (demo).");
      // Morgan: contacted, estimate follow-up is overdue.
      await markContacted(tx, agentId, c["morgan.lee@example.com"]);
      await createTask(tx, agentId, c["morgan.lee@example.com"], "Send the written estimate", new Date(Date.now() - DAY));
      // Casey: longer timeline, nurturing.
      await markContacted(tx, agentId, c["casey.nguyen@example.com"]);
      await updateLeadStatus(tx, agentId, c["casey.nguyen@example.com"], "nurturing", undefined);
      await addNote(tx, agentId, c["casey.nguyen@example.com"], "Wants to finish the kitchen first. Check in next spring.");
      await createTask(tx, agentId, c["casey.nguyen@example.com"], "Check in about kitchen progress", new Date(Date.now() + 5 * DAY));
      // Taylor: decided not to sell.
      await markContacted(tx, agentId, c["taylor.brooks@example.com"]);
      await updateLeadStatus(tx, agentId, c["taylor.brooks@example.com"], "lost", "Decided to rent the home out instead.");
      // A fictional plan is off for automatic starts, but manually enrolled for Casey.
      const demoPlan = await savePlan(tx, agentId, { name: "Fictional demo follow-up", is_active: false, timelines: ["6_12_months"], campaign_id: null });
      for (const step of STARTER_PLANS[2].steps) await savePlanStep(tx, agentId, demoPlan, step);
      await startPlan(tx, agentId, c["casey.nguyen@example.com"], demoPlan);
      // Drew: contacted a while ago.
      await markContacted(tx, agentId, c["drew.kim@example.com"]);
    });

    console.log("Demo data created (all people, addresses and contact details are fictional).");
    console.log(`Sign in at http://localhost:3000/login with ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`);
    console.log(`Public demo page: http://localhost:3000/p/${instagram.slug}`);
  } finally {
    await driver.close();
    release();
  }
}

main().catch((error) => {
  console.error(`Seeding failed: ${(error as Error).message}`);
  process.exit(1);
});
