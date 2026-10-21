import postgres from "postgres";
import type { Driver, Tx } from "./types";

/**
 * Driver for a Supabase (or any) Postgres database.
 *
 * `prepare: false` keeps it compatible with Supabase's transaction-mode pooler
 * (port 6543), which is the recommended connection for serverless hosting.
 */
export function postgresDriver(connectionString: string): Driver {
  const url = new URL(connectionString);
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const sql = postgres(connectionString, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: url.searchParams.has("sslmode") ? undefined : isLocalHost ? false : "require",
    // Never print query parameters (they can contain personal data).
    debug: false,
    onnotice: () => {},
  });

  return {
    async transaction(fn) {
      const result = await sql.begin(async (raw) => {
        const tx: Tx = {
          async query(text, params) {
            const rows = await raw.unsafe(text, (params ?? []) as never[]);
            return [...rows] as never[];
          },
          async exec(text) {
            await raw.unsafe(text);
          },
        };
        return fn(tx);
      });
      return result as Awaited<ReturnType<typeof fn>>;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
