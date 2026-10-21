import { Mail, Server, Webhook } from "lucide-react";
import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile-form";
import { Card, CardHeader, PageHeader } from "@/components/ui/display";
import { requireAgent } from "@/lib/auth/session";
import { getBackend } from "@/lib/config";
import { getEmailDeliveryConfig } from "@/lib/email/config";
import { assetUrl } from "@/lib/images";
import { timeZoneOptions } from "@/lib/time";
import { saveProfileAction } from "./actions";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { profile } = await requireAgent();
  const email = getEmailDeliveryConfig();
  const backend = getBackend();

  return (
    <>
      <PageHeader title="Settings" description="Your profile, branding, booking link, notifications and time zone." />
      <SettingsTabs />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <ProfileForm
          mode="settings"
          action={saveProfileAction}
          timeZones={timeZoneOptions()}
          headshotUrl={assetUrl(profile.headshot_asset_id)}
          logoUrl={assetUrl(profile.logo_asset_id)}
          defaults={{
            full_name: profile.full_name,
            brokerage: profile.brokerage ?? "",
            license_number: profile.license_number ?? "",
            contact_email: profile.contact_email,
            phone: profile.phone ?? "",
            primary_color: profile.primary_color,
            service_areas: profile.service_areas.join(", "),
            intro: profile.intro ?? "",
            booking_url: profile.booking_url ?? "",
            privacy_policy_url: profile.privacy_policy_url ?? "",
            notification_email: profile.notification_email ?? "",
            notify_new_inquiry: profile.notify_new_inquiry,
            send_acknowledgment: profile.send_acknowledgment,
            timezone: profile.timezone,
          }}
        />
        <aside className="space-y-4">
          <Card>
            <CardHeader title="System status" />
            <ul className="divide-y divide-line text-sm">
              <li className="flex gap-3 p-4">
                <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <div>
                  <p className="font-medium">Email delivery: {email.live ? "Live" : "Preview only"}</p>
                  <p className="mt-0.5 text-ink-muted">{email.explanation}</p>
                </div>
              </li>
              <li className="flex gap-3 p-4">
                <Server aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <div>
                  <p className="font-medium">Data: {backend === "supabase" ? "Supabase" : "Local mode"}</p>
                  <p className="mt-0.5 text-ink-muted">
                    {backend === "supabase"
                      ? "Stored in your Supabase project with row-level security."
                      : "Stored on this computer only. Configure Supabase before real use."}
                  </p>
                </div>
              </li>
              <li className="flex gap-3 p-4">
                <Webhook aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <div>
                  <p className="font-medium">Automatic booking sync: not available yet</p>
                  <p className="mt-0.5 text-ink-muted">
                    Bookings made in your scheduler aren&rsquo;t imported automatically. Record each consultation on the
                    lead&rsquo;s page.
                  </p>
                </div>
              </li>
              <li className="flex gap-3 p-4">
                <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <div>
                  <p className="font-medium">Automated email sequences: off</p>
                  <p className="mt-0.5 text-ink-muted">
                    Scheduled marketing emails stay disabled until sender setup, consent and unsubscribe handling are in
                    place. Send follow-ups one at a time from a lead&rsquo;s page.
                  </p>
                </div>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
