import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAgent, requireWorkspaceAgent } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  getBackend: vi.fn(), hasPaidSubscription: vi.fn(), getProfile: vi.fn(), redirect: vi.fn(),
  getUser: vi.fn(), localGetUser: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ getBackend: mocks.getBackend }));
vi.mock("@/lib/data/billing", () => ({ hasPaidSubscription: mocks.hasPaidSubscription }));
vi.mock("@/lib/data/profiles", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/lib/auth/local", () => ({ localGetUser: mocks.localGetUser, localSignOut: vi.fn() }));
vi.mock("@/lib/auth/supabase", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/db", () => ({ asUser: async (_id: string, fn: (tx: object) => unknown) => fn({}) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("BILLING_MODE", "live");
  mocks.getBackend.mockReturnValue("supabase");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "agent", email: "fixture@example.test" } } });
  mocks.localGetUser.mockResolvedValue({ id: "agent", email: "fixture@example.test" });
  mocks.getProfile.mockResolvedValue({ id: "agent" });
  mocks.hasPaidSubscription.mockResolvedValue(false);
  mocks.redirect.mockImplementation((url) => { throw new Error(`redirect:${url}`); });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("workspace payment requirement", () => {
  it("redirects an unpaid live account even without configured Stripe API credentials", async () => {
    await expect(requireWorkspaceAgent()).rejects.toThrow("redirect:/settings/billing?subscription_required=1");
  });

  it("allows a verified paid live account", async () => {
    mocks.hasPaidSubscription.mockResolvedValue(true);
    expect((await requireWorkspaceAgent()).user.id).toBe("agent");
  });

  it.each(["test", "disabled"])("keeps %s mode free", async (mode) => {
    vi.stubEnv("BILLING_MODE", mode);
    expect((await requireWorkspaceAgent()).user.id).toBe("agent");
    expect(mocks.hasPaidSubscription).not.toHaveBeenCalled();
  });

  it("keeps local development free even when the live flag is set", async () => {
    mocks.getBackend.mockReturnValue("local");
    expect((await requireWorkspaceAgent()).user.id).toBe("agent");
    expect(mocks.hasPaidSubscription).not.toHaveBeenCalled();
  });

  it("lets unpaid users reach profile, account settings, receipts and billing through requireAgent", async () => {
    expect((await requireAgent()).user.id).toBe("agent");
    expect(mocks.hasPaidSubscription).not.toHaveBeenCalled();
  });

  it("still sends anonymous users to sign-in", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireWorkspaceAgent()).rejects.toThrow("redirect:/login");
  });
});
