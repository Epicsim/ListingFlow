import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Server-side configuration. Kept free of `server-only` so it can also be used
 * by the proxy, scripts and tests. Never import it from client components.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type Backend = "local" | "supabase";

/**
 * - "supabase": Supabase Auth + Supabase Postgres (production).
 * - "local": embedded PGlite database and a development-only sign-in, so the
 *   whole app runs on one machine without any accounts or credentials.
 */
export function getBackend(): Backend {
  const explicit = process.env.LISTINGFLOW_BACKEND?.trim().toLowerCase();
  let backend: Backend;
  if (explicit === "local" || explicit === "supabase") backend = explicit;
  else if (explicit) throw new ConfigError('LISTINGFLOW_BACKEND must be "local" or "supabase".');
  else backend = process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "local";

  if (backend === "local" && process.env.VERCEL) {
    throw new ConfigError(
      "Local mode stores data on the server's disk and is for development only. Configure Supabase for hosted deployments.",
    );
  }
  return backend;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_DB_URL,
  );
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!url || !anonKey || !dbUrl) {
    throw new ConfigError(
      "Supabase mode needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_DB_URL. See .env.example.",
    );
  }
  return { url, anonKey, dbUrl };
}

export function localDataDir(): string {
  // Runtime-only location (local mode); excluded from Turbopack's file tracing.
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.LOCAL_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data"),
  );
}

let cachedSecret: string | undefined;

/**
 * Secret used to sign form tokens and local sessions and to key the IP hash
 * used for rate limiting. Required in Supabase mode; generated once and kept
 * in the gitignored .data directory in local mode.
 */
export async function getAppSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) {
    if (fromEnv.length < 32) throw new ConfigError("APP_SECRET must be at least 32 characters long.");
    cachedSecret = fromEnv;
    return fromEnv;
  }
  if (getBackend() !== "local") {
    throw new ConfigError("APP_SECRET is required. Generate one with: openssl rand -base64 48");
  }
  const dir = localDataDir();
  const file = path.join(/*turbopackIgnore: true*/ dir, "app-secret");
  try {
    cachedSecret = (await readFile(file, "utf8")).trim();
  } catch {
    await mkdir(dir, { recursive: true });
    cachedSecret = randomBytes(48).toString("base64url");
    await writeFile(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

/** Public base URL used in share links and emails when no request is available. */
export function configuredSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return null;
  }
}
