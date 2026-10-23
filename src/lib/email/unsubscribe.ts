import { signToken, verifyToken } from "@/lib/security/signing";
import { uuidSchema } from "@/lib/validation";

/**
 * Every email to a homeowner ends with a signed, non-expiring unsubscribe link.
 * The token holds only the contact id, so the URL carries no personal data.
 */

const PURPOSE = "unsubscribe";

export function unsubscribeUrl(origin: string, contactId: string, secret: string): string {
  return `${origin}/unsubscribe?t=${signToken({ c: contactId }, secret, PURPOSE)}`;
}

/** The contact id from a valid link, otherwise null. */
export function readUnsubscribeToken(token: string | null | undefined, secret: string): string | null {
  const payload = verifyToken<{ c?: unknown }>(token, secret, PURPOSE);
  return uuidSchema.safeParse(payload?.c).success ? (payload!.c as string) : null;
}

export function withUnsubscribeLink(body: string, url: string): string {
  return `${body}\n\n--\nDon't want these emails? Unsubscribe: ${url}`;
}
