import type { Metadata } from "next";
import { TemplateEditor } from "@/components/template-editor";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/display";
import { requireWorkspaceAgent } from "@/lib/auth/session";
import { getTemplates } from "@/lib/data/templates";
import { asUser } from "@/lib/db";
import { TEMPLATE_KINDS } from "@/lib/domain";
import { templateValuesFor } from "@/lib/email/messages";
import { DEFAULT_TEMPLATES } from "@/lib/email/templates";
import { SettingsTabs } from "../settings-tabs";

export const metadata: Metadata = { title: "Email templates" };

export default async function TemplatesPage() {
  const { profile } = await requireWorkspaceAgent();
  const templates = await asUser(profile.id, (tx) => getTemplates(tx, profile.id));
  const sample = templateValuesFor(
    profile,
    { full_name: "Sam Example", property_address: "12 Sample Lane, Springfield" },
    profile.booking_url,
  );

  return (
    <>
      <PageHeader title="Settings" description="Your profile, branding, booking link, notifications and time zone." />
      <SettingsTabs />
      <div className="space-y-6">
        {TEMPLATE_KINDS.map((kind) => (
          <Card key={kind}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {DEFAULT_TEMPLATES[kind].label}
                  {templates[kind].customized ? <Badge>Customized</Badge> : <Badge tone="neutral">Starter text</Badge>}
                </span>
              }
              description={DEFAULT_TEMPLATES[kind].description}
            />
            <div className="p-5">
              <TemplateEditor kind={kind} subject={templates[kind].subject} body={templates[kind].body} sample={sample} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
