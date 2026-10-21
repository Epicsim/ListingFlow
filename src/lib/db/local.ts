import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { localDataDir } from "@/lib/config";
import { applyMigrations, type MigrationResult } from "./migrate";
import { pgliteDriver } from "./pglite-driver";
import type { Driver } from "./types";

/**
 * Opens the embedded local-mode database (PGlite) in `.data/pglite`, applying
 * the local Supabase shim and all migrations. A lock file prevents two
 * processes (e.g. `next dev` and a script) from opening it at the same time.
 */

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(lockFile: string) {
  try {
    const pid = Number((await readFile(lockFile, "utf8")).trim());
    if (pid && pid !== process.pid && processIsAlive(pid)) {
      throw new Error(
        `The local database is already open in another process (pid ${pid}). Stop the other ListingFlow process (for example "next dev" or "next start") and try again.`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(lockFile, String(process.pid));
  const release = () => {
    void rm(lockFile, { force: true });
  };
  process.once("exit", release);
  return release;
}

export async function openLocalDatabase(): Promise<{ driver: Driver; release: () => void; migrations: MigrationResult }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = path.join(/*turbopackIgnore: true*/ localDataDir(), "pglite");
  await mkdir(dataDir, { recursive: true });
  const release = await acquireLock(path.join(/*turbopackIgnore: true*/ localDataDir(), "pglite.lock"));
  const db = new PGlite(dataDir);
  await db.waitReady;
  const driver = pgliteDriver(db);
  const migrations = await applyMigrations(driver, { withLocalShim: true });
  return { driver, release, migrations };
}
