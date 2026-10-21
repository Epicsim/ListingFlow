import "server-only";
import { headers } from "next/headers";
import { configuredSiteUrl } from "@/lib/config";

/**
 * Public origin for absolute links (share links, email links). Prefers the
 * configured NEXT_PUBLIC_SITE_URL so a spoofed Host header can't change links
 * that end up in emails.
 */
export async function requestOrigin(): Promise<string> {
  const configured = configuredSiteUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only allow redirects to paths on this site (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
