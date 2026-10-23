import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyDigest, type DigestDb } from "@/lib/daily-digest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), count: vi.fn(), create: vi.fn(), paid: vi.fn() }));
vi.mock("@/lib/data/digests", () => ({ listDigestAgents: mocks.list, countDigestAgentsAfter: mocks.count, createAgentDigest: mocks.create }));
vi.mock("@/lib/data/billing", () => ({ hasPaidSubscription: mocks.paid }));
vi.mock("@/lib/email/config", () => ({ getEmailDeliveryConfig: () => ({ live: false }) }));
const db: DigestDb = {
  service: async (fn) => fn({} as never),
  user: async (_id, fn) => fn({} as never),
};
let elapsed = 0;
const options = { siteOrigin: "https://app.example.test", paidRequired: false, timeBudgetMs: 100, clock: () => elapsed };

beforeEach(() => {
  vi.resetAllMocks(); elapsed = 0;
  mocks.list.mockResolvedValue([{ id: "first" }, { id: "second" }, { id: "third" }]);
  mocks.count.mockResolvedValue(2);
  mocks.create.mockImplementation(async () => { elapsed = 101; return "fictional-digest-id"; });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("daily digest time budget", () => {
  it("finishes the in-flight agent, starts no further agent, and logs only a remaining count", async () => {
    expect(await runDailyDigest(db, options)).toEqual({ created: 1, failed: 0 });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][1]).toBe("first");
    expect(mocks.count).toHaveBeenCalledWith(expect.anything(), "first");
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("[digest] agents_not_reached 2");
  });
  it("counts everyone if a slow page query exhausts the budget before the first agent", async () => {
    mocks.list.mockImplementation(async () => { elapsed = 101; return [{ id: "first" }]; });
    mocks.count.mockResolvedValue(3);
    expect(await runDailyDigest(db, options)).toEqual({ created: 0, failed: 0 });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.count).toHaveBeenCalledWith(expect.anything(), null);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("[digest] agents_not_reached 3");
  });
  it.each(["unpaid", "failed"])("excludes an already attempted %s agent from the remaining count", async (outcome) => {
    mocks.paid.mockImplementation(async () => { elapsed = 101; if (outcome === "failed") throw { code: "fictional_failure" }; return false; });
    expect(await runDailyDigest(db, { ...options, paidRequired: true })).toEqual({ created: 0, failed: outcome === "failed" ? 1 : 0 });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.count).toHaveBeenCalledWith(expect.anything(), "first");
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("[digest] agents_not_reached 2");
  });
  it("does not warn or count unprocessed agents when an ordinary run finishes", async () => {
    mocks.create.mockResolvedValue(null);
    expect(await runDailyDigest(db, options)).toEqual({ created: 0, failed: 0 });
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
