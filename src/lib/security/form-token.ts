import { randomUUID } from "node:crypto";
import { sha256Hex, signToken, verifyToken } from "./signing";

/**
 * Each rendered inquiry form carries a signed token holding the campaign id,
 * the time it was issued and a random nonce. It provides:
 *  - a time trap: bots that post instantly are rejected,
 *  - expiry: very old pages must be reloaded,
 *  - the nonce for idempotency (see `idempotencyKey`).
 */

const PURPOSE = "inquiry-form";
export const MIN_FILL_MS = 2_500;
export const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

interface FormTokenPayload {
  c: string;
  t: number;
  n: string;
}

export function issueFormToken(campaignId: string, secret: string, now = Date.now()): string {
  return signToken({ c: campaignId, t: now, n: randomUUID() } satisfies FormTokenPayload, secret, PURPOSE);
}

export type FormTokenCheck =
  | { ok: true; nonce: string }
  | { ok: false; reason: "invalid" | "too_fast" | "expired" };

export function checkFormToken(
  token: string | null | undefined,
  campaignId: string,
  secret: string,
  now = Date.now(),
): FormTokenCheck {
  const payload = verifyToken<FormTokenPayload>(token, secret, PURPOSE);
  if (!payload || payload.c !== campaignId || typeof payload.t !== "number" || typeof payload.n !== "string") {
    return { ok: false, reason: "invalid" };
  }
  const age = now - payload.t;
  if (age < MIN_FILL_MS) return { ok: false, reason: "too_fast" };
  if (age > MAX_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true, nonce: payload.n };
}

/**
 * Same form instance + same contents => same key, so double-clicks and network
 * retries are stored once. Editing any field (or loading the page again)
 * produces a new key, so a genuinely new request is never discarded.
 */
export function idempotencyKey(nonce: string, normalizedPayload: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.keys(normalizedPayload)
      .sort()
      .map((k) => [k, normalizedPayload[k] ?? null]),
  );
  return sha256Hex(`${nonce}|${canonical}`);
}
