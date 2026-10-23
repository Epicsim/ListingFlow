import { createHash, timingSafeEqual } from "node:crypto";
import { requiresLiveSubscription } from "@/lib/billing/access-mode";
import { hasPaidSubscription } from "@/lib/data/billing";
import { countDigestAgentsAfter, createAgentDigest, listDigestAgents } from "@/lib/data/digests";
import type { Tx } from "@/lib/db/types";
import { getEmailDeliveryConfig } from "@/lib/email/config";
import { deliverQueuedEmails, type ServiceRunner } from "@/lib/email/deliver";

export function cronAuthorized(header: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret?.trim() || !header) return false;
  // Hash both strings to a fixed length before constant-time comparison.
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(header), hash(`Bearer ${secret}`));
}
export function digestLocalHour(raw = process.env.DIGEST_LOCAL_HOUR): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (!/^(?:[01]?\d|2[0-3])$/.test(raw)) throw new Error("digest_hour_invalid");
  return Number(raw);
}
export interface DigestDb {
  service: ServiceRunner;
  user<T>(agentId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
}
// Leave 15 seconds for the in-flight agent/provider result and the count query.
// Keep below the cron route's explicit 60-second maximum duration.
export const DIGEST_RUN_BUDGET_MS = 45_000;

export async function runDailyDigest(db: DigestDb, options: { now?: Date; siteOrigin: string; localHour?: number; paidRequired?: boolean; timeBudgetMs?: number; clock?: () => number } ) {
  const clock = options.clock ?? (() => performance.now());
  const deadline = clock() + (options.timeBudgetMs ?? DIGEST_RUN_BUDGET_MS);
  const now = options.now ?? new Date();
  const localHour = options.localHour ?? digestLocalHour();
  const config = getEmailDeliveryConfig();
  const paidRequired = options.paidRequired ?? requiresLiveSubscription();
  let created = 0;
  let failed = 0;
  let after: string | null = null;
  run: for (;;) {
    if (clock() >= deadline) break;
    const agents = await db.service((tx) => listDigestAgents(tx, after));
    if (!agents.length) break;
    for (const agent of agents) {
      if (clock() >= deadline) break run;
      after = agent.id;
      try {
        // Reuse the existing invoker function under the agent's RLS role;
        // service_role gets no new billing permissions.
        if (paidRequired && !await db.user(agent.id, (tx) => hasPaidSubscription(tx, agent.id))) continue;
        const id = await db.service((tx) => createAgentDigest(tx, agent.id, now, options.siteOrigin, config.live, localHour));
        if (!id) continue;
        created++;
        if (config.live) {
          const result = await deliverQueuedEmails(db.service, [id]);
          failed += result.failed;
        }
      } catch (error) {
        failed++;
        console.error(`[digest] agent_failed ${(error as { code?: string }).code ?? "digest_error"}`);
      }
    }
    if (agents.length < 100) break;
  }
  if (clock() >= deadline) {
    const notReached = await db.service((tx) => countDigestAgentsAfter(tx, after));
    if (notReached) console.warn(`[digest] agents_not_reached ${notReached}`);
  }
  return { created, failed };
}
