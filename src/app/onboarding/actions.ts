"use server";

import { redirect } from "next/navigation";
import { type ActionState, failure } from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { createProfile, getProfile, insertAsset, setProfileImage } from "@/lib/data/profiles";
import { asUser } from "@/lib/db";
import { parseProfileForm } from "@/lib/profile-form";

export async function completeOnboardingAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  // Onboarding keeps notifications on by default; they can be changed in Settings.
  const parsed = await parseProfileForm(formData, { notify_new_inquiry: "on", send_acknowledgment: "on" });
  if (!parsed.ok) return failure("Please fix the highlighted fields.", parsed.fieldErrors);

  const input = { ...parsed.input, notification_email: parsed.input.notification_email ?? user.email ?? undefined };

  await asUser(user.id, async (tx) => {
    if (await getProfile(tx, user.id)) return;
    await createProfile(tx, user.id, input);
    if (parsed.headshot) {
      const id = await insertAsset(tx, user.id, "headshot", parsed.headshot.contentType, parsed.headshot.bytes);
      await setProfileImage(tx, user.id, "headshot", id);
    }
    if (parsed.logo) {
      const id = await insertAsset(tx, user.id, "logo", parsed.logo.contentType, parsed.logo.bytes);
      await setProfileImage(tx, user.id, "logo", id);
    }
  });
  redirect("/campaigns/new?welcome=1");
}
