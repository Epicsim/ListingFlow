import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getBackend } from "@/lib/config";
import { requiresLiveSubscription } from "@/lib/billing/access-mode";
import { hasPaidSubscription } from "@/lib/data/billing";
import { type AgentProfile, getProfile } from "@/lib/data/profiles";
import { asUser } from "@/lib/db";
import { localGetUser, localSignOut } from "./local";
import { createSupabaseServerClient } from "./supabase";

export interface SessionUser {
  id: string;
  email: string;
}

/** The signed-in user for this request, verified with the auth provider. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (getBackend() === "local") return localGetUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
});

/** Signs the current browser out (local session cookie or Supabase session). */
export async function endSession(): Promise<void> {
  if (getBackend() === "local") await localSignOut();
  else await (await createSupabaseServerClient()).auth.signOut();
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

const getProfileForUser = cache(async (userId: string) => asUser(userId, (tx) => getProfile(tx, userId)));

/** Signed-in agent with a completed profile; otherwise redirects to sign-in or onboarding. */
export async function requireAgent(): Promise<{ user: SessionUser; profile: AgentProfile }> {
  const user = await requireUser();
  const profile = await getProfileForUser(user.id);
  if (!profile) redirect("/onboarding");
  return { user, profile };
}

export async function getOptionalProfile(userId: string): Promise<AgentProfile | null> {
  return getProfileForUser(userId);
}

const paidAccess = cache(async (agentId: string) => asUser(agentId, (tx) => hasPaidSubscription(tx, agentId)));

/** Paid features are gated in pages AND actions; billing/settings remain accessible. */
export async function requireWorkspaceAgent(): Promise<{ user: SessionUser; profile: AgentProfile }> {
  const agent = await requireAgent();
  if (requiresLiveSubscription() && !await paidAccess(agent.user.id)) redirect("/settings/billing?subscription_required=1");
  return agent;
}
