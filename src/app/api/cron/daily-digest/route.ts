import { configuredSiteUrl } from "@/lib/config";
import { cronAuthorized, runDailyDigest } from "@/lib/daily-digest";
import { asService, asUser } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return Response.json({ error: "cron_unconfigured" }, { status: 503, headers });
  if (!cronAuthorized(request.headers.get("authorization"))) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const siteOrigin = configuredSiteUrl();
  if (!siteOrigin) return Response.json({ error: "site_url_unconfigured" }, { status: 503, headers });
  try {
    const result = await runDailyDigest({ service: asService, user: asUser }, { siteOrigin });
    return Response.json(result, { status: result.failed ? 500 : 200, headers });
  } catch {
    console.error("[digest] run_failed");
    return Response.json({ error: "digest_failed" }, { status: 500, headers });
  }
}
