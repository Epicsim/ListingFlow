import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPasswordResetAction, updatePasswordAction } from "@/app/(auth)/actions";

const mocks = vi.hoisted(() => ({
  getBackend: vi.fn(),
  getSessionUser: vi.fn(),
  createClient: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  requestOrigin: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ getBackend: mocks.getBackend }));
vi.mock("@/lib/auth/local", () => ({ localSignIn: vi.fn(), localSignUp: vi.fn(), localSignOut: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/auth/supabase", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("@/lib/request-origin", () => ({ requestOrigin: mocks.requestOrigin, safeNextPath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getBackend.mockReturnValue("supabase");
  mocks.getSessionUser.mockResolvedValue({ id: "agent-id" });
  mocks.createClient.mockResolvedValue({ auth: {
    resetPasswordForEmail: mocks.resetPasswordForEmail,
    updateUser: mocks.updateUser,
  } });
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.requestOrigin.mockResolvedValue("https://listingflow.test");
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("request password reset", () => {
  it.each(["", "not-an-email", "a".repeat(255) + "@example.test"])("rejects an invalid email before contacting Supabase (%s)", async (email) => {
    const result = await requestPasswordResetAction({ ok: false }, form({ email }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not offer email-free account recovery in local mode", async () => {
    mocks.getBackend.mockReturnValue("local");
    expect(await requestPasswordResetAction({ ok: false }, form({ email: "demo@example.test" }))).toMatchObject({ ok: false });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it.each(["  agent@example.test  ", "unknown@example.test"])("uses the exact callback and the same confirmation for any accepted request", async (email) => {
    await expect(requestPasswordResetAction({ ok: false }, form({ email }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(email.trim(), {
      redirectTo: "https://listingflow.test/auth/callback",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/forgot-password?requested=1");
  });

  it("handles rate limits without reporting that a message was sent", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { status: 429, message: "private provider details" } });
    expect(await requestPasswordResetAction({ ok: false }, form({ email: "agent@example.test" }))).toEqual({
      ok: false, message: "Too many reset requests. Please wait a few minutes before trying again.", fieldErrors: undefined,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["provider", "network"])("does not expose provider details or show confirmation on a %s failure", async (kind) => {
    if (kind === "provider") mocks.resetPasswordForEmail.mockResolvedValue({ error: { status: 500, message: "private provider details" } });
    else mocks.resetPasswordForEmail.mockRejectedValue(new Error("private provider details"));
    const result = await requestPasswordResetAction({ ok: false }, form({ email: "agent@example.test" }));
    expect(result).toMatchObject({ ok: false, message: "We couldn't request a reset link. Please try again in a few minutes." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("update recovered password", () => {
  it("requires a verified signed-in user before changing a password", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const result = await updatePasswordAction({ ok: false }, form({ password: "new-password", confirm_password: "new-password" }));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("expired") });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["short", "short", "password"],
    ["a".repeat(201), "a".repeat(201), "password"],
    ["new-password", "different-password", "confirm_password"],
    ["new-password", "", "confirm_password"],
  ])("requires a valid, matching confirmation", async (password, confirmPassword, field) => {
    const result = await updatePasswordAction({ ok: false }, form({ password, confirm_password: confirmPassword }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.[field]).toBeTruthy();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses local password changes", async () => {
    mocks.getBackend.mockReturnValue("local");
    expect(await updatePasswordAction({ ok: false }, form({ password: "new-password", confirm_password: "new-password" }))).toMatchObject({ ok: false });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each(["provider", "network"])("does not report success when an update fails (%s)", async (kind) => {
    if (kind === "provider") mocks.updateUser.mockResolvedValue({ error: { message: "private provider details" } });
    else mocks.updateUser.mockRejectedValue(new Error("private provider details"));
    const result = await updatePasswordAction({ ok: false }, form({ password: "new-password", confirm_password: "new-password" }));
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("private provider details");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["same_password", "weak_password"])("shows password policy feedback without reporting success (%s)", async (code) => {
    mocks.updateUser.mockResolvedValue({ error: { code, message: "private provider details" } });
    const result = await updatePasswordAction({ ok: false }, form({ password: "new-password", confirm_password: "new-password" }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
    expect(result.message).not.toContain("private provider details");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("updates only the signed-in user's password and confirms only after success", async () => {
    await expect(updatePasswordAction({ ok: false }, form({
      password: "new-password", confirm_password: "new-password", email: "other@example.test", user_id: "other-id",
    }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(mocks.redirect).toHaveBeenCalledWith("/reset-password?updated=1");
  });
});
