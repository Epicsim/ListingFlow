/**
 * Applies database migrations.
 *   Local mode:    npm run db:migrate   (the app also does this automatically on start)
 *   Supabase mode: set SUPABASE_DB_URL (see .env.example), then npm run db:migrate
 */
import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  const { getBackend, getSupabaseConfig } = await import("@/lib/config");
  const { applyMigrations } = await import("@/lib/db/migrate");
  const backend = getBackend();

  if (backend === "supabase") {
    const { postgresDriver } = await import("@/lib/db/postgres-driver");
    const driver = postgresDriver(getSupabaseConfig().dbUrl);
    try {
      const result = await applyMigrations(driver, { withLocalShim: false });
      report("Supabase", result);
    } finally {
      await driver.close();
    }
    return;
  }

  const { openLocalDatabase } = await import("@/lib/db/local");
  const { driver, release, migrations } = await openLocalDatabase();
  try {
    report("local (.data/pglite)", migrations);
  } finally {
    await driver.close();
    release();
  }
}

function report(target: string, result: { applied: string[]; skipped: string[] }) {
  console.log(`Database: ${target}`);
  console.log(result.applied.length ? `Applied:\n  ${result.applied.join("\n  ")}` : "No new migrations to apply.");
  console.log(`Already applied: ${result.skipped.length}`);
}

main().catch((error) => {
  console.error(`Migration failed: ${(error as Error).message}`);
  process.exit(1);
});
