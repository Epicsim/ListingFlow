import type { Tx } from "@/lib/db/types";
import type { ProfileInput } from "@/lib/validation";

export interface AgentProfile {
  id: string;
  full_name: string;
  brokerage: string | null;
  license_number: string | null;
  contact_email: string;
  phone: string | null;
  headshot_asset_id: string | null;
  logo_asset_id: string | null;
  primary_color: string;
  service_areas: string[];
  intro: string | null;
  booking_url: string | null;
  privacy_policy_url: string | null;
  notification_email: string | null;
  notify_new_inquiry: boolean;
  send_acknowledgment: boolean;
  send_daily_digest: boolean;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

const PROFILE_COLUMNS = `
  id, full_name, brokerage, license_number, contact_email, phone, headshot_asset_id, logo_asset_id,
  primary_color, service_areas, intro, booking_url, privacy_policy_url, notification_email,
  notify_new_inquiry, send_acknowledgment, send_daily_digest, timezone, created_at, updated_at`;

export async function getProfile(tx: Tx, agentId: string): Promise<AgentProfile | null> {
  const rows = await tx.query<AgentProfile>(
    `select ${PROFILE_COLUMNS} from public.agent_profiles where id = $1::uuid`,
    [agentId],
  );
  return rows[0] ?? null;
}

export async function updateDigestPreference(tx: Tx, agentId: string, enabled: boolean): Promise<void> {
  await tx.query(`update public.agent_profiles set send_daily_digest = $2::boolean where id = $1::uuid`, [agentId, enabled]);
}

export async function updateNotificationPreferences(tx: Tx, agentId: string, prefs: { digest: boolean; inquiries: boolean; acknowledgment: boolean }): Promise<void> {
  await tx.query(`update public.agent_profiles set send_daily_digest = $2::boolean,
    notify_new_inquiry = $3::boolean, send_acknowledgment = $4::boolean where id = $1::uuid`, [agentId, prefs.digest, prefs.inquiries, prefs.acknowledgment]);
}

function profileParams(input: ProfileInput) {
  return [
    input.full_name,
    input.brokerage ?? null,
    input.license_number ?? null,
    input.contact_email,
    input.phone ?? null,
    input.primary_color,
    JSON.stringify(input.service_areas),
    input.intro ?? null,
    input.booking_url ?? null,
    input.privacy_policy_url ?? null,
    input.notification_email ?? null,
    input.notify_new_inquiry,
    input.send_acknowledgment,
    input.timezone,
  ];
}

const SERVICE_AREAS_FROM_JSON = `coalesce((select array_agg(x) from jsonb_array_elements_text($8::text::jsonb) x), '{}')`;

export async function createProfile(tx: Tx, agentId: string, input: ProfileInput): Promise<void> {
  await tx.query(
    `insert into public.agent_profiles (
       id, full_name, brokerage, license_number, contact_email, phone, primary_color, service_areas,
       intro, booking_url, privacy_policy_url, notification_email, notify_new_inquiry, send_acknowledgment, timezone)
     values ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, ${SERVICE_AREAS_FROM_JSON},
       $9::text, $10::text, $11::text, $12::text, $13::boolean, $14::boolean, $15::text)`,
    [agentId, ...profileParams(input)],
  );
}

export async function updateProfile(tx: Tx, agentId: string, input: ProfileInput): Promise<void> {
  await tx.query(
    `update public.agent_profiles set
       full_name = $2::text, brokerage = $3::text, license_number = $4::text, contact_email = $5::text,
       phone = $6::text, primary_color = $7::text, service_areas = ${SERVICE_AREAS_FROM_JSON},
       intro = $9::text, booking_url = $10::text, privacy_policy_url = $11::text,
       notification_email = $12::text, notify_new_inquiry = $13::boolean,
       send_acknowledgment = $14::boolean, timezone = $15::text
     where id = $1::uuid`,
    [agentId, ...profileParams(input)],
  );
}

export type AssetKind = "headshot" | "logo" | "hero";

export async function insertAsset(
  tx: Tx,
  agentId: string,
  kind: AssetKind,
  contentType: string,
  bytes: Uint8Array,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `insert into public.assets (agent_id, kind, content_type, byte_size, data)
     values ($1::uuid, $2::text, $3::text, $4::int, $5::bytea) returning id`,
    [agentId, kind, contentType, bytes.byteLength, bytes],
  );
  return rows[0].id;
}

export async function deleteAsset(tx: Tx, agentId: string, assetId: string): Promise<void> {
  await tx.query(`delete from public.assets where id = $1::uuid and agent_id = $2::uuid`, [assetId, agentId]);
}

/**
 * Points a branding slot at a new image (or clears it) and removes the image it
 * replaces, so old uploads don't accumulate.
 */
export async function setProfileImage(
  tx: Tx,
  agentId: string,
  slot: "headshot" | "logo",
  assetId: string | null,
): Promise<void> {
  const column = slot === "headshot" ? "headshot_asset_id" : "logo_asset_id";
  const prev = await tx.query<{ old: string | null }>(
    `select ${column} as old from public.agent_profiles where id = $1::uuid`,
    [agentId],
  );
  await tx.query(`update public.agent_profiles set ${column} = $2::uuid where id = $1::uuid`, [agentId, assetId]);
  const old = prev[0]?.old;
  if (old && old !== assetId) await deleteAsset(tx, agentId, old);
}

/** Permanently deletes the signed-in agent's account; every agent-owned row cascades with it. */
export async function deleteOwnAccount(tx: Tx): Promise<boolean> {
  const rows = await tx.query<{ ok: boolean }>(`select public.delete_own_account() as ok`);
  return rows[0]?.ok === true;
}
