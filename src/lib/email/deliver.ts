import { getQueuedEmails, type QueuedEmail, recordDeliveryResult } from "@/lib/data/outbox";
import type { Tx } from "@/lib/db/types";
import { type EmailDeliveryConfig, getEmailDeliveryConfig } from "./config";

export type ServiceRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };
export type Sender = (email: QueuedEmail, config: EmailDeliveryConfig) => Promise<SendResult>;

/** Sends one message through Resend's HTTP API. Never logs message content. */
export const sendWithResend: Sender = async (email, config) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!config.live || !apiKey || !config.from) return { ok: false, error: "delivery_not_configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [email.to_email],
        subject: email.subject,
        text: email.body_text,
        ...(email.reply_to ? { reply_to: email.reply_to } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, error: `provider_http_${response.status}` };
    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    return data?.id ? { ok: true, messageId: data.id } : { ok: false, error: "provider_missing_id" };
  } catch (error) {
    return { ok: false, error: (error as Error).name === "TimeoutError" ? "provider_timeout" : "provider_unreachable" };
  }
};

/**
 * Hands queued messages to the provider and records the result. Messages in
 * "preview" status are never touched, so they can't be marked as sent.
 */
export async function deliverQueuedEmails(
  service: ServiceRunner,
  ids: string[],
  sender: Sender = sendWithResend,
  config: EmailDeliveryConfig = getEmailDeliveryConfig(),
): Promise<{ sent: number; failed: number }> {
  const emails = await service((tx) => getQueuedEmails(tx, ids));
  let sent = 0;
  let failed = 0;
  for (const email of emails) {
    const result = await sender(email, config);
    const provider = config.provider ?? "none";
    await service((tx) =>
      recordDeliveryResult(
        tx,
        email.id,
        result.ok ? { ok: true, provider, messageId: result.messageId } : { ok: false, provider, error: result.error },
      ),
    );
    if (result.ok) sent++;
    else {
      failed++;
      // Error codes only; no addresses or content in logs.
      console.error(`[email] delivery failed: ${result.error}`);
    }
  }
  return { sent, failed };
}
