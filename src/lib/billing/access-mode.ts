import { getBackend } from "@/lib/config";

/** Explicit live mode enforces payment even when Stripe credentials are missing. */
export function requiresLiveSubscription(): boolean {
  return process.env.BILLING_MODE === "live" && getBackend() !== "local";
}
