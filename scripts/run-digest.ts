import { loadEnv } from "./load-env";
loadEnv();

async function main() {
  const { configuredSiteUrl, getBackend } = await import("@/lib/config");
  if (getBackend() !== "local") throw new Error("digest_local_only");
  if (process.env.EMAIL_DELIVERY?.trim().toLowerCase() === "live") throw new Error("digest_local_preview_only");
  const { openLocalDatabase } = await import("@/lib/db/local");
  const { runAs } = await import("@/lib/db/run-as");
  const { runDailyDigest } = await import("@/lib/daily-digest");
  const { driver, release } = await openLocalDatabase();
  try {
    const result = await runDailyDigest({
      service: (fn) => runAs(driver, "service_role", null, fn),
      user: (id, fn) => runAs(driver, "authenticated", id, fn),
    }, { siteOrigin: configuredSiteUrl() ?? "http://localhost:3000" });
    console.log(`Digest previews created: ${result.created}; failures: ${result.failed}. Nothing sent.`);
    if (result.failed) process.exitCode = 1;
  } finally { await driver.close(); release(); }
}
main().catch(() => { console.error("[digest] local_run_failed"); process.exitCode = 1; });
