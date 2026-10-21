import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Driver } from "./types";

const ROOT = /*turbopackIgnore: true*/ process.cwd();
export const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
export const LOCAL_SHIM_FILE = path.join(ROOT, "supabase", "local", "supabase_shim.sql");

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies every `supabase/migrations/*.sql` file that has not run yet, in
 * filename order, each in its own transaction. Applied names are recorded in
 * app_private.schema_migrations so the runner is safe to call repeatedly.
 *
 * `withLocalShim` first installs the Supabase stand-ins (roles, auth schema)
 * needed by the embedded PGlite database. Never enable it for Supabase.
 */
export async function applyMigrations(
  driver: Driver,
  options: { withLocalShim: boolean },
): Promise<MigrationResult> {
  if (options.withLocalShim) {
    const shim = await readFile(LOCAL_SHIM_FILE, "utf8");
    await driver.transaction((tx) => tx.exec(shim));
  }

  await driver.transaction((tx) =>
    tx.exec(`
      create schema if not exists app_private;
      revoke all on schema app_private from public;
      create table if not exists app_private.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `),
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const done = await driver.transaction((tx) =>
    tx.query<{ name: string }>("select name from app_private.schema_migrations"),
  );
  const doneSet = new Set(done.map((r) => r.name));

  const result: MigrationResult = { applied: [], skipped: [] };
  for (const file of files) {
    if (doneSet.has(file)) {
      result.skipped.push(file);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    await driver.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into app_private.schema_migrations (name) values ($1::text)", [file]);
    });
    result.applied.push(file);
  }
  return result;
}
