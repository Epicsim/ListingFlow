import type { Metadata } from "next";
import { ThemeControl } from "@/components/theme-control";
import { Card, CardHeader, PageHeader } from "@/components/ui/display";
import { SettingsTabs } from "../settings-tabs";

export const metadata: Metadata = { title: "Preferences" };

export default function PreferencesPage() {
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
    </>
  );
}
