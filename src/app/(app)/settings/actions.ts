"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, failure, success } from "@/lib/action-state";
import { requireAgent } from "@/lib/auth/session";
import { insertAsset, setProfileImage, updateProfile } from "@/lib/data/profiles";
import { saveTemplate } from "@/lib/data/templates";
import { asUser } from "@/lib/db";
import { parseProfileForm } from "@/lib/profile-form";
import { formFields, templateSchema, toFieldErrors } from "@/lib/validation";

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
  const { profile } = await requireAgent();
  const parsed = templateSchema.safeParse(formFields(formData, ["kind", "subject", "body"]));
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  await asUser(profile.id, (tx) => saveTemplate(tx, profile.id, parsed.data.kind, parsed.data.subject, parsed.data.body));
  revalidatePath("/settings/templates");
  return success("Template saved.");
}
