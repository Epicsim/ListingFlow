import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";

const mocks = vi.hoisted(() => ({
  getBackend: vi.fn(),
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ getBackend: mocks.getBackend }));
vi.mock("@/lib/auth/supabase", () => ({ createSupabaseServerClient: mocks.createClient }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getBackend.mockReturnValue("supabase");
  mocks.createClient.mockResolvedValue({ auth: {
    exchangeCodeForSession: mocks.exchangeCodeForSession,
    verifyOtp: mocks.verifyOtp,
  } });
  mocks.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: null }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
});

async function callback(query = "") {
  return GET(new NextRequest(`https://listingflow.test/auth/callback${query}`));
}

describe("Supabase auth callback", () => {
  it("routes verified PKCE recovery to the password form without a next parameter", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: "recovery" }, error: null });
    const response = await callback("?code=valid-code");
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid-code", undefined);
    expect(response.headers.get("location")).toBe("https://listingflow.test/reset-password");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("preserves safe sign-up and existing password-reset destinations", async () => {
    for (const path of ["/onboarding", "/reset-password"]) {
      const response = await callback(`?code=valid-code&next=${encodeURIComponent(path)}`);
      expect(response.headers.get("location")).toBe(`https://listingflow.test${path}`);
    }
  });

  it("uses verified recovery intent ahead of a supplied destination", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: "recovery" }, error: null });
    expect((await callback("?code=valid-code&next=/dashboard")).headers.get("location")).toBe("https://listingflow.test/reset-password");
  });

  it.each(["flow-id", ""])("passes explicit PKCE flow IDs to the SDK for validation", async (flowId) => {
    await callback(`?code=valid-code&sb_flow_id=${flowId}`);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid-code", { flowId });
  });

  it("supports a verified recovery token hash", async () => {
    const response = await callback("?token_hash=valid-hash&type=recovery");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "valid-hash" });
    expect(response.headers.get("location")).toBe("https://listingflow.test/reset-password");
  });

  it("does not pass arbitrary OTP types to Supabase", async () => {
    const response = await callback("?token_hash=valid-hash&type=invalid");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://listingflow.test/login?error=link");
  });

  it.each(["https://other.test", "//other.test", "/\\other.test"])("refuses an external next destination (%s)", async (next) => {
    const response = await callback(`?code=valid-code&next=${encodeURIComponent(next)}`);
    expect(response.headers.get("location")).toBe("https://listingflow.test/dashboard");
  });

  it("sends expired recovery tokens to a fresh reset request", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const response = await callback("?token_hash=expired&type=recovery");
    expect(response.headers.get("location")).toBe("https://listingflow.test/forgot-password?error=link");
  });

  it("sends failed PKCE exchanges to a safe retry without granting access", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: null }, error: { message: "missing verifier" } });
    expect((await callback("?code=expired")).headers.get("location")).toBe("https://listingflow.test/login?error=link");
    expect((await callback("?code=expired&next=/reset-password")).headers.get("location")).toBe("https://listingflow.test/forgot-password?error=link");
  });

  it("handles network failures and missing tokens without exposing credentials", async () => {
    mocks.exchangeCodeForSession.mockRejectedValue(new Error("private provider details"));
    for (const query of ["?code=private-code", ""]) {
      const response = await callback(query);
      expect(response.headers.get("location")).toBe("https://listingflow.test/login?error=link");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("does not exchange tokens in local mode", async () => {
    mocks.getBackend.mockReturnValue("local");
    expect((await callback("?code=valid-code")).headers.get("location")).toBe("https://listingflow.test/login");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
