import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getBackend, getSupabaseConfig } from "@/lib/config";

/**
 * In Supabase mode, refreshes the auth session cookie on each request so
 * Server Components always see a valid session. Local mode needs no proxy work.
 * Authorization itself happens on the server (requireAgent) and in the
 * database (row-level security), never only here.
 */
export async function proxy(request: NextRequest) {
  if (getBackend() !== "supabase") return NextResponse.next();

  const { url, anonKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Skip static files, public landing pages, legal pages and image assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|assets/|p/|privacy|terms|cookies|refunds|unsubscribe|api/stripe/webhook|api/cron/daily-digest).*)"],
};
