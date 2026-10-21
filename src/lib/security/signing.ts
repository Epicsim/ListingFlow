import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Compact HMAC-signed tokens: base64url(JSON payload) + "." + base64url(MAC).
 * `purpose` is mixed into the MAC so a token minted for one use (a form) can
 * never be replayed as another (a session).
 */

function mac(secret: string, purpose: string, body: string): Buffer {
  return createHmac("sha256", secret).update(`${purpose}.${body}`).digest();
}

export function signToken(payload: object, secret: string, purpose: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(secret, purpose, body).toString("base64url")}`;
}

export function verifyToken<T>(token: string | null | undefined, secret: string, purpose: string): T | null {
  if (!token || token.length > 2048) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  let given: Buffer;
  try {
    given = Buffer.from(token.slice(dot + 1), "base64url");
  } catch {
    return null;
  }
  const expected = mac(secret, purpose, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Keyed hash so stored values (e.g. IP addresses) cannot be reversed or correlated elsewhere. */
export function keyedHash(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
