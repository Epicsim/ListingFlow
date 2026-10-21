import "server-only";
import { type ImageCheck, readImageUpload } from "@/lib/images";
import { type FieldErrors, formFields, type ProfileInput, profileSchema, toFieldErrors } from "@/lib/validation";

export const PROFILE_FIELDS = [
  "full_name",
  "brokerage",
  "license_number",
  "contact_email",
  "phone",
  "primary_color",
  "service_areas",
  "intro",
  "booking_url",
  "privacy_policy_url",
  "notification_email",
  "notify_new_inquiry",
  "send_acknowledgment",
  "timezone",
] as const;

type Image = Extract<ImageCheck, { ok: true }>;

export type ParsedProfileForm =
  | {
      ok: true;
      input: ProfileInput;
      headshot: Image | null;
      logo: Image | null;
      removeHeadshot: boolean;
      removeLogo: boolean;
    }
  | { ok: false; fieldErrors: FieldErrors };

export async function parseProfileForm(
  formData: FormData,
  overrides: Partial<Record<(typeof PROFILE_FIELDS)[number], string>> = {},
): Promise<ParsedProfileForm> {
  const raw = { ...formFields(formData, PROFILE_FIELDS), ...overrides };
  const parsed = profileSchema.safeParse(raw);
  const fieldErrors: FieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);

  const headshot = await readImageUpload(formData.get("headshot"));
  const logo = await readImageUpload(formData.get("logo"));
  if (headshot && !headshot.ok) fieldErrors.headshot = headshot.error;
  if (logo && !logo.ok) fieldErrors.logo = logo.error;

  if (!parsed.success || Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    input: parsed.data,
    headshot: headshot?.ok ? headshot : null,
    logo: logo?.ok ? logo : null,
    removeHeadshot: formData.get("remove_headshot") === "on",
    removeLogo: formData.get("remove_logo") === "on",
  };
}
