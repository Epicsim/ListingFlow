import { describe, expect, it } from "vitest";
import { clientIp, rateLimitKey } from "@/lib/security/client-ip";
import { checkFormToken, idempotencyKey, issueFormToken, MAX_AGE_MS, MIN_FILL_MS } from "@/lib/security/form-token";
import { signToken, verifyToken } from "@/lib/security/signing";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sniffImageType } from "@/lib/images";
import { safeNextPath } from "@/lib/request-origin";

const SECRET = "unit-test-secret-unit-test-secret-1234";
const CAMPAIGN = "6f1c9a52-3b0e-4c4b-9d55-0c1f2a3b4c5d";

describe("signed tokens", () => {
  it("round-trips and rejects tampering, wrong secrets and wrong purposes", () => {
    const token = signToken({ uid: "u1" }, SECRET, "session");
    expect(verifyToken(token, SECRET, "session")).toEqual({ uid: "u1" });
    expect(verifyToken(token, SECRET, "inquiry-form")).toBeNull();
    expect(verifyToken(token, `${SECRET}x`, "session")).toBeNull();
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin" })).toString("base64url");
    expect(verifyToken(`${forged}.${mac}`, SECRET, "session")).toBeNull();
    expect(verifyToken(`${body}.`, SECRET, "session")).toBeNull();
    expect(verifyToken("garbage", SECRET, "session")).toBeNull();
  });
});

describe("inquiry form tokens", () => {
  const issuedAt = 1_800_000_000_000;
  const token = issueFormToken(CAMPAIGN, SECRET, issuedAt);

  it("accepts a form filled in at human speed", () => {
    expect(checkFormToken(token, CAMPAIGN, SECRET, issuedAt + MIN_FILL_MS + 1)).toMatchObject({ ok: true });
  });

  it("rejects instant (bot) submissions, expired pages and other campaigns", () => {
    expect(checkFormToken(token, CAMPAIGN, SECRET, issuedAt + 100)).toEqual({ ok: false, reason: "too_fast" });
    expect(checkFormToken(token, CAMPAIGN, SECRET, issuedAt + MAX_AGE_MS + 1)).toEqual({ ok: false, reason: "expired" });
    expect(checkFormToken(token, "00000000-0000-4000-8000-000000000000", SECRET, issuedAt + 10_000)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(checkFormToken(undefined, CAMPAIGN, SECRET)).toEqual({ ok: false, reason: "invalid" });
  });

  it("derives the same idempotency key only for the same form and contents", () => {
    const payload = { email: "a@example.test", timeline: "soon" };
    expect(idempotencyKey("nonce-1", payload)).toBe(idempotencyKey("nonce-1", { timeline: "soon", email: "a@example.test" }));
    expect(idempotencyKey("nonce-1", payload)).not.toBe(idempotencyKey("nonce-2", payload));
    expect(idempotencyKey("nonce-1", payload)).not.toBe(idempotencyKey("nonce-1", { ...payload, timeline: "exploring" }));
  });
});

describe("rate-limit keys", () => {
  it("uses the first forwarded address and never stores it in readable form", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIp(headers)).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBe("unknown");
    const key = rateLimitKey(SECRET, "203.0.113.9");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("203");
    expect(rateLimitKey(SECRET, "203.0.113.9")).toBe(key);
  });
});

describe("local passwords", () => {
  it("hashes with a salt and verifies only the right password", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("image uploads", () => {
  it("detects real image types from bytes and refuses everything else", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});

describe("redirect targets", () => {
  it("only allows same-site paths", () => {
    expect(safeNextPath("/leads/1")).toBe("/leads/1");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});
