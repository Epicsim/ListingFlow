import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/daily-digest/route";
import { cronAuthorized, digestLocalHour } from "@/lib/daily-digest";

vi.mock("@/lib/db", () => ({ asService: vi.fn(), asUser: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
describe("daily digest authorization", () => {
  it("returns 401 for absent or wrong credentials, and never caches", async () => {
    vi.stubEnv("CRON_SECRET", "fictional-cron-secret");
    for (const header of [null, "Bearer wrong", "fictional-cron-secret"]) {
      const r = await GET(new Request("https://app.example.test/api/cron/daily-digest", { headers: header ? { Authorization: header } : {} }));
      expect(r.status).toBe(401);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("refuses to run with an unset or empty secret", async () => {
    for (const secret of ["", " "]) {
      vi.stubEnv("CRON_SECRET", secret);
      expect((await GET(new Request("https://app.example.test/api/cron/daily-digest"))).status).toBe(503);
    }
    expect(cronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
  it("requires the exact bearer value for arbitrary input lengths", () => {
    expect(cronAuthorized("Bearer example", "example")).toBe(true);
    expect(cronAuthorized("Bearer example extra", "example")).toBe(false);
    expect(cronAuthorized("x".repeat(10000), "example")).toBe(false);
  });
  it("validates the optional local hour and defaults to no threshold", () => {
    expect(digestLocalHour("")).toBeUndefined();
    expect(digestLocalHour("7")).toBe(7);
    for (const value of ["24", "-1", "7.5", "early"]) expect(() => digestLocalHour(value)).toThrow("digest_hour_invalid");
  });
});
