import { createServerClient } from "@supabase/ssr";
import { expect, it, vi } from "vitest";

it("preserves recovery intent between SSR requests using the exact callback and real PKCE cookies", async () => {
  const jar = new Map<string, string>();
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated", role: "authenticated", email: "agent@example.test",
    app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
  };
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const accessToken = `eyJhbGciOiJIUzI1NiJ9.${payload}.test-signature`;
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/recover") return Response.json({});
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
      return Response.json({ access_token: accessToken, refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 3600, user });
    }
    throw new Error("unexpected_auth_request");
  });
  const createClient = () => createServerClient("https://example.supabase.co", "test-publishable-key", {
    global: { fetch: fetchMock },
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          if (options.maxAge === 0) jar.delete(name);
          else jar.set(name, value);
        }
      },
    },
  });

  const requested = await createClient().auth.resetPasswordForEmail(user.email, {
    redirectTo: "https://listingflow.test/auth/callback",
  });
  expect(requested.error).toBeNull();
  const recoverUrl = new URL(String(fetchMock.mock.calls[0][0]));
  expect(recoverUrl.searchParams.get("redirect_to")).toBe("https://listingflow.test/auth/callback");
  expect(jar.size).toBeGreaterThan(0);

  const result = await createClient().auth.exchangeCodeForSession("test-auth-code");
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ redirectType: "recovery", user: { id: user.id } });
  const tokenBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
  expect(tokenBody).toMatchObject({ auth_code: "test-auth-code", code_verifier: expect.any(String) });
  expect(tokenBody.code_verifier.length).toBeGreaterThan(0);
});
