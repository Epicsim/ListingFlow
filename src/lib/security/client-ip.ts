import { keyedHash } from "./signing";

/**
 * Best-effort client IP for rate limiting. On Vercel and most managed hosts the
 * platform sets x-forwarded-for / x-real-ip. If you self-host behind your own
 * proxy, make sure it overwrites (not appends to) these headers.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : "unknown";
}

/** The raw IP is never stored; only this keyed hash reaches the database. */
export function rateLimitKey(secret: string, ip: string): string {
  return keyedHash(secret, "inquiry-rate-limit", ip);
}
