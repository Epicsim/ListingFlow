import "server-only";
import { getBackend, getSupabaseConfig } from "@/lib/config";
import { openLocalDatabase } from "./local";
import { postgresDriver } from "./postgres-driver";
import { runAs } from "./run-as";
import type { Driver, Tx } from "./types";

export type { Tx } from "./types";

type DbState = { driver?: Promise<Driver> };

// Shared across module instances (dev hot reload, separate server bundles) so
// only one driver - and, in local mode, one PGlite instance - exists per process.
const globalState = globalThis as typeof globalThis & { __listingflowDb?: DbState };

export function getDriver(): Promise<Driver> {
  const state = (globalState.__listingflowDb ??= {});
  if (!state.driver) {
    const pending =
      getBackend() === "local"
        ? openLocalDatabase().then((local) => local.driver)
        : Promise.resolve(postgresDriver(getSupabaseConfig().dbUrl));
    state.driver = pending.catch((error) => {
      state.driver = undefined;
      throw error;
    });
  }
  return state.driver;
}

/** Runs as the signed-in agent. Row-level security limits every statement to their rows. */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAs(await getDriver(), "authenticated", userId, fn);
}

/** Runs as an anonymous visitor: only the public read functions are available. */
export async function asAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAs(await getDriver(), "anon", null, fn);
}

/**
 * Runs with the service role, which bypasses row-level security. Use only for
 * the server-side steps that have no signed-in agent: recording a validated
 * public submission, tracking a booking click and updating email delivery.
 */
export async function asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAs(await getDriver(), "service_role", null, fn);
}

/** Direct access for local-mode authentication (auth.users). Local mode only. */
export async function asLocalAuthOwner<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (getBackend() !== "local") throw new Error("Local authentication is only available in local mode");
  return (await getDriver()).transaction(fn);
}
