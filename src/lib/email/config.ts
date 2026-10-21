/**
 * Email delivery is OFF unless all of these are set:
 *   EMAIL_DELIVERY=live
 *   RESEND_API_KEY=...
 *   EMAIL_FROM="Your Name <notifications@your-verified-domain.com>"
 *
 * Otherwise every message is stored in the outbox as a clearly labeled preview
 * and nothing leaves the server. Tests never send.
 */
export interface EmailDeliveryConfig {
  live: boolean;
  provider: "resend" | null;
  from: string | null;
  /** Human-readable explanation shown in Settings and the outbox. */
  explanation: string;
}

export function getEmailDeliveryConfig(): EmailDeliveryConfig {
  const mode = process.env.EMAIL_DELIVERY?.trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || null;

  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return { live: false, provider: null, from, explanation: "Email delivery is disabled while tests run." };
  }
  if (mode !== "live") {
    return {
      live: false,
      provider: null,
      from,
      explanation:
        "Preview mode: emails are saved to your outbox but not sent. Set EMAIL_DELIVERY=live with Resend credentials to send.",
    };
  }
  if (!apiKey || !from) {
    return {
      live: false,
      provider: null,
      from,
      explanation: "EMAIL_DELIVERY=live is set, but RESEND_API_KEY or EMAIL_FROM is missing, so emails are saved as previews only.",
    };
  }
  return { live: true, provider: "resend", from, explanation: "Live: emails are sent through Resend." };
}
