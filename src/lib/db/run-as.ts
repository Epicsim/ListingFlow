import type { DbRole, Driver, Tx } from "./types";

const ROLES: ReadonlySet<DbRole> = new Set(["anon", "authenticated", "service_role"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction that has switched to a Supabase API role.
 *
 * For `authenticated`, the user's id is published as the JWT `sub` claim, which
 * is what `auth.uid()` reads in every row-level security policy. The role and
 * claims are transaction-local (`set local` / `set_config(..., true)`), so a
 * pooled connection never leaks one request's identity into another.
 */
export async function runAs<T>(
  driver: Driver,
  role: DbRole,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!ROLES.has(role)) throw new Error("Unknown database role");
  if (role === "authenticated" && (!userId || !UUID_RE.test(userId))) {
    throw new Error("An authenticated database session requires a valid user id");
  }

  return driver.transaction(async (tx) => {
    const claims = role === "authenticated" ? { sub: userId, role } : { role };
    await tx.query("select set_config('request.jwt.claims', $1::text, true)", [JSON.stringify(claims)]);
    // `role` is restricted to the fixed allow-list above, so interpolation is safe.
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}
