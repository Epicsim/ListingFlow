import type { Metadata } from "next";
import Link from "next/link";
import { ThemeControl } from "@/components/theme-control";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, PageHeader } from "@/components/ui/display";
import { CheckboxField } from "@/components/ui/fields";
import { requireAgent } from "@/lib/auth/session";
import { deleteAccountAction, saveNotificationsAction } from "../actions";
import { SettingsTabs } from "../settings-tabs";

export const metadata: Metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const { profile } = await requireAgent();
  return (
    <>
      <PageHeader title="Settings" description="Make this workspace yours. Manage your appearance, profile and preferences." />
      <SettingsTabs />
      <Card>
        <CardHeader
          title="Appearance"
          description="Choose a look for your workspace. Your preference is saved in this browser."
        />
        <div className="p-5 sm:p-6">
          <div className="max-w-xl"><ThemeControl variant="cards" /></div>
          <p className="mt-4 text-sm text-ink-muted">
            System follows your device. The website home page and your public seller pages stay light.
          </p>
        </div>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Email notifications" description="Delivery must be live to send email. Otherwise messages are previews in your Outbox." />
        <ActionForm action={saveNotificationsAction} className="max-w-xl space-y-4 p-5 sm:p-6">
          <CheckboxField name="notify_new_inquiry" label="Email me when a new inquiry arrives" defaultChecked={profile.notify_new_inquiry} />
          <CheckboxField name="send_acknowledgment" label="Acknowledge the homeowner's request" defaultChecked={profile.send_acknowledgment} />
          <CheckboxField name="send_daily_digest" label="Send me a daily digest" defaultChecked={profile.send_daily_digest} hint="Today's and overdue follow-ups and consultations. Goes only to your notification email, or your contact email if none is set." />
          <SubmitButton size="sm">Save notifications</SubmitButton>
        </ActionForm>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Delete account" description="Permanently delete your account and everything in it." />
        <ActionForm action={deleteAccountAction} className="max-w-xl space-y-4 p-5 sm:p-6">
          <p className="text-sm text-ink-soft">
            This deletes your profile, branding, campaigns, leads, consent records, consultations, notes, reminders
            and outbox. Your seller pages stop working immediately. This can&rsquo;t be undone, and emails already
            sent can&rsquo;t be recalled.
          </p>
          <p className="text-sm text-ink-muted">Close any subscription or pending checkout in <Link href="/settings/billing" className="underline">Billing</Link> first. This prevents charges continuing after account deletion.</p>
          <CheckboxField
            name="confirm_delete"
            value="delete"
            required
            label="I understand this permanently deletes my account and all of its data."
          />
          <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
            Permanently delete account
          </SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
