import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBillingConfig } from "@/lib/billing/config";

beforeEach(() => {
  vi.stubEnv("BILLING_MODE", "test");
  vi.stubEnv("LISTINGFLOW_BACKEND", "local");
  vi.stubEnv("STRIPE_PRICE_ID", "price_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
});
afterEach(() => vi.unstubAllEnvs());

describe("Stripe server credential modes", () => {
  it.each(["rk_test_fixture", "sk_test_fixture"])("accepts a sandbox server key: %s", (key) => {
    vi.stubEnv("STRIPE_SECRET_KEY", key);
    expect(getBillingConfig().livemode).toBe(false);
  });

  it.each(["rk_live_fixture", "sk_live_fixture", "pk_test_fixture"])("rejects a live or browser key in sandbox: %s", (key) => {
    vi.stubEnv("STRIPE_SECRET_KEY", key);
    expect(() => getBillingConfig()).toThrow("billing_unavailable");
  });

  it("accepts a live restricted key only with the production backend and HTTPS", () => {
    vi.stubEnv("BILLING_MODE", "live");
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_fixture");
    expect(() => getBillingConfig()).toThrow("billing_unavailable");
    vi.stubEnv("LISTINGFLOW_BACKEND", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://listingflow.example.test");
    expect(getBillingConfig().livemode).toBe(true);
  });
});
