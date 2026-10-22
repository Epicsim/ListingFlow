import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { getBackend } from "@/lib/config";
import { safeNextPath } from "@/lib/request-origin";

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && ["signup", "invite", "magiclink", "recovery", "email_change", "email"].includes(value);
}

/** Completes Supabase email confirmation and password-reset links. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, url), {
    headers: { "Cache-Control": "private, no-store" },
  });
  if (getBackend() !== "supabase") return redirectTo("/login");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const isRecovery = type === "recovery" || next === "/reset-password";

  try {
    const supabase = await createSupabaseServerClient();
    if (code) {
      const flowId = url.searchParams.get("sb_flow_id");
      const { data, error } = await supabase.auth.exchangeCodeForSession(code, flowId !== null ? { flowId } : undefined);
      // Use the intent saved with the PKCE verifier, even when the exact callback has no `next` query.
      if (!error) return redirectTo("redirectType" in data && data.redirectType === "recovery" ? "/reset-password" : next);
    } else if (tokenHash && isEmailOtpType(type)) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return redirectTo(type === "recovery" ? "/reset-password" : next);
    }
  } catch {
    // Invalid, expired, missing-verifier and network failures all have a safe retry path.
  }
  return redirectTo(isRecovery ? "/forgot-password?error=link" : "/login?error=link");
}
