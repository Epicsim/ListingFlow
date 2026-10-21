import { Inbox, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmailStatusBadge } from "@/components/status-badges";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/display";
import { requireAgent } from "@/lib/auth/session";
import { listOutbox } from "@/lib/data/outbox";
import { asUser } from "@/lib/db";
import { EMAIL_KIND_LABELS } from "@/lib/domain";
import { getEmailDeliveryConfig } from "@/lib/email/config";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Outbox" };

export default async function OutboxPage() {
  const { profile } = await requireAgent();
  const emails = await asUser(profile.id, (tx) => listOutbox(tx, profile.id));
  const config = getEmailDeliveryConfig();
  const tz = profile.timezone;

  return (
    <>
      <PageHeader
        title="Outbox"
        description="Every email the app prepared for you or your leads, and what actually happened to it."
      />
      <Notice tone={config.live ? "accent" : "warning"} icon={<Info />} className="mb-6" title={config.live ? "Email delivery is live" : "Preview mode – nothing is being sent"}>
        {config.explanation} “Accepted by email provider” means the provider took the message; it isn&rsquo;t proof it
        reached the inbox.
      </Notice>

      {emails.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox />} title="No emails yet">
            New-inquiry alerts, acknowledgments and follow-ups you write will be listed here.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {emails.map((e) => (
              <li key={e.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-col gap-2 px-5 py-4 hover:bg-sunken/30 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.subject}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {EMAIL_KIND_LABELS[e.kind]} · to {e.to_email} · {formatDateTime(e.created_at, tz)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <EmailStatusBadge status={e.status} />
                    </div>
                  </summary>
                  <div className="border-t border-line bg-sunken/30 px-5 py-4">
                    <pre className="font-sans text-sm whitespace-pre-wrap text-ink-soft">{e.body_text}</pre>
                    <p className="mt-3 text-xs text-ink-muted">
                      {e.status === "sent" && e.sent_at
                        ? `Accepted by ${e.provider ?? "the provider"} at ${formatDateTime(e.sent_at, tz)}.`
                        : e.status === "failed"
                          ? `Not sent – ${e.error_code ?? "provider error"}.`
                          : e.status === "queued"
                            ? "Waiting to be handed to the provider."
                            : "Preview only. This message was never sent."}
                      {e.contact_id ? (
                        <>
                          {" "}
                          <Link href={`/leads/${e.contact_id}`} className="text-accent hover:underline">
                            Open lead{e.contact_name ? ` (${e.contact_name})` : ""}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
