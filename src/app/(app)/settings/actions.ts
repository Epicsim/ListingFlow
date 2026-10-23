"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, failure, success } from "@/lib/action-state";
import { endSession, requireAgent, requireWorkspaceAgent } from "@/lib/auth/session";
import { hasUnresolvedBilling } from "@/lib/data/billing";
import { deleteOwnAccount, insertAsset, setProfileImage, updateProfile, updateNotificationPreferences } from "@/lib/data/profiles";
import { saveTemplate } from "@/lib/data/templates";
import { asUser } from "@/lib/db";
import { parseProfileForm } from "@/lib/profile-form";
import { formFields, templateSchema, toFieldErrors } from "@/lib/validation";

export async function saveNotificationsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireAgent();
  await asUser(profile.id, (tx) => updateNotificationPreferences(tx, profile.id, {
    digest: formData.get("send_daily_digest") === "on", inquiries: formData.get("notify_new_inquiry") === "on",
    acknowledgment: formData.get("send_acknowledgment") === "on",
  }));
  revalidatePath("/settings", "layout");
  return success("Notification preferences saved.");
}

export async function saveProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireAgent();
  const parsed = await parseProfileForm(formData);
  if (!parsed.ok) return failure("Please fix the highlighted fields.", parsed.fieldErrors);

  await asUser(profile.id, async (tx) => {
    await updateProfile(tx, profile.id, parsed.input);
    for (const slot of ["headshot", "logo"] as const) {
      const upload = parsed[slot];
      if (upload) {
        const id = await insertAsset(tx, profile.id, slot, upload.contentType, upload.bytes);
        await setProfileImage(tx, profile.id, slot, id);
      } else if (slot === "headshot" ? parsed.removeHeadshot : parsed.removeLogo) {
        await setProfileImage(tx, profile.id, slot, null);
      }
    }
  });
  revalidatePath("/", "layout");
  return success("Settings saved. Your published pages show the changes right away.");
}

export async function saveTemplateAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireWorkspaceAgent();
  const parsed = templateSchema.safeParse(formFields(formData, ["kind", "subject", "body"]));
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  await asUser(profile.id, (tx) => saveTemplate(tx, profile.id, parsed.data.kind, parsed.data.subject, parsed.data.body));
  revalidatePath("/settings/templates");
  return success("Template saved.");
}

export async function deleteAccountAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireAgent();
  if (formData.get("confirm_delete") !== "delete") {
    return failure("Please confirm the permanent deletion.", {
      confirm_delete: "Check the box to confirm you want to permanently delete your account.",
    });
  }
  if (await asUser(profile.id, (tx) => hasUnresolvedBilling(tx, profile.id))) {
    return failure("Close your subscription or pending checkout in Settings → Billing, then refresh billing status before deleting your account. Scheduled cancellation must finish first.");
  }
  let deleted: boolean;
  try { deleted = await asUser(profile.id, deleteOwnAccount); }
  catch { return failure("We couldn't delete your account. Check that billing is closed, then try again."); }
  if (!deleted) return failure("We couldn't delete your account. Please try again.");
  await endSession();
  redirect("/login?account_deleted=1");
}
