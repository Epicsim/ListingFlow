import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LocalModeNotice } from "@/components/local-mode-notice";
import { ProfileForm } from "@/components/profile-form";
import { getOptionalProfile, requireUser } from "@/lib/auth/session";
import { DEFAULT_PRIMARY_COLOR } from "@/lib/domain";
import { timeZoneOptions } from "@/lib/time";
import { completeOnboardingAction } from "./actions";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (await getOptionalProfile(user.id)) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <BrandMark href="/onboarding" />
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-20 sm:px-6">
        <p className="text-sm font-medium text-accent-ink">Step 1 of 2 · Your profile</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Tell homeowners who you are</h1>
        <p className="mt-2 mb-8 max-w-2xl text-[15px] text-ink-muted">
          Just the basics for now. Next, you&rsquo;ll create a seller page with ready-to-edit starter copy that you
          can share from your social profiles, website or ads.
        </p>
        <ProfileForm
          mode="onboarding"
          action={completeOnboardingAction}
          timeZones={timeZoneOptions()}
          defaults={{
            full_name: "",
            brokerage: "",
            license_number: "",
            contact_email: user.email,
            phone: "",
            primary_color: DEFAULT_PRIMARY_COLOR,
            service_areas: "",
            intro: "",
            booking_url: "",
            privacy_policy_url: "",
            notification_email: user.email,
            notify_new_inquiry: true,
            send_acknowledgment: true,
            timezone: "America/New_York",
          }}
        />
        <LocalModeNotice className="mt-8" />
      </main>
    </div>
  );
}
