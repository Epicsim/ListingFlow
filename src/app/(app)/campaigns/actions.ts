"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, failure, success } from "@/lib/action-state";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import {
  createCampaign,
  getCampaign,
  SlugTakenError,
  setCampaignStatus,
  updateCampaign,
} from "@/lib/data/campaigns";
import { deleteAsset, insertAsset } from "@/lib/data/profiles";
import { asUser } from "@/lib/db";
import { CAMPAIGN_STATUSES, type CampaignStatus } from "@/lib/domain";
import { readImageUpload } from "@/lib/images";
import { campaignSchema, formFields, toFieldErrors, uuidSchema } from "@/lib/validation";

const FIELDS = ["name", "slug", "headline", "description", "cta_text", "thank_you_message", "booking_url"] as const;

async function parseCampaignForm(formData: FormData) {
  const parsed = campaignSchema.safeParse(formFields(formData, FIELDS));
  const fieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);
  const hero = await readImageUpload(formData.get("hero"));
  if (hero && !hero.ok) fieldErrors.hero = hero.error;
  return { parsed, fieldErrors, hero: hero?.ok ? hero : null, removeHero: formData.get("remove_hero") === "on" };
}

export async function createCampaignAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const { parsed, fieldErrors, hero } = await parseCampaignForm(formData);
  if (!parsed.success || Object.keys(fieldErrors).length) {
    return failure("Please fix the highlighted fields.", fieldErrors);
  }
  const publish = formData.get("intent") === "publish";

  let campaignId: string;
  try {
    campaignId = await asUser(profile.id, async (tx) => {
      const heroId = hero ? await insertAsset(tx, profile.id, "hero", hero.contentType, hero.bytes) : null;
      const id = await createCampaign(tx, profile.id, parsed.data, heroId);
      if (publish) await setCampaignStatus(tx, profile.id, id, "published");
      return id;
    });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return failure("That page link is already taken.", { slug: "That link is already in use. Try another." });
    }
    throw error;
  }
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}?${publish ? "published=1" : "created=1"}`);
}

export async function updateCampaignAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const id = uuidSchema.safeParse(formData.get("campaign_id"));
  if (!id.success) return failure("This campaign could not be found.");
  const { parsed, fieldErrors, hero, removeHero } = await parseCampaignForm(formData);
  if (!parsed.success || Object.keys(fieldErrors).length) {
    return failure("Please fix the highlighted fields.", fieldErrors);
  }

  try {
    const updated = await asUser(profile.id, async (tx) => {
      const current = await getCampaign(tx, profile.id, id.data);
      if (!current) return false;
      let heroChange: { assetId: string | null } | "keep" = "keep";
      if (hero) heroChange = { assetId: await insertAsset(tx, profile.id, "hero", hero.contentType, hero.bytes) };
      else if (removeHero) heroChange = { assetId: null };
      await updateCampaign(tx, profile.id, id.data, parsed.data, heroChange);
      if (heroChange !== "keep" && current.hero_asset_id) await deleteAsset(tx, profile.id, current.hero_asset_id);
      return true;
    });
    if (!updated) return failure("This campaign could not be found.");
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return failure("That page link is already taken.", { slug: "That link is already in use. Try another." });
    }
    throw error;
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id.data}`);
  return success("Campaign saved.");
}

export async function setCampaignStatusAction(formData: FormData): Promise<void> {
  const { profile } = await requireWorkspaceAgent();
  const id = uuidSchema.safeParse(formData.get("campaign_id"));
  const status = formData.get("status") as CampaignStatus;
  if (!id.success || !CAMPAIGN_STATUSES.includes(status)) return;
  await asUser(profile.id, (tx) => setCampaignStatus(tx, profile.id, id.data, status));
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id.data}`);
  revalidatePath("/dashboard");
}
