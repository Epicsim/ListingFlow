import "server-only";
import { cookies } from "next/headers";
import { getAppSecret } from "@/lib/config";
import { asLocalAuthOwner } from "@/lib/db";
import { signToken, verifyToken } from "@/lib/security/signing";
import { getDummyHash, hashPassword, verifyPassword } from "./password";

/**
 * Development-only sign-in for local mode. Accounts live in the embedded
 * database; the session is an HMAC-signed, httpOnly cookie. Production uses
 * Supabase Auth instead (see ./supabase.ts).
 */

const COOKIE = "lf_local_session";
const PURPOSE = "local-session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  uid: string;
  exp: number;
}

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

async function setSessionCookie(userId: string) {
  const secret = await getAppSecret();
  const token = signToken(
    { uid: userId, exp: Date.now() + MAX_AGE_SECONDS * 1000 } satisfies SessionPayload,
    secret,
    PURPOSE,
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.LOCAL_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function localSignUp(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  const hash = await hashPassword(password);
  const rows = await asLocalAuthOwner((tx) =>
    tx.query<{ id: string }>(
      `insert into auth.users (email, encrypted_password) values ($1::text, $2::text)
       on conflict (email) do nothing returning id`,
      [normalized, hash],
    ),
  );
  if (!rows.length) return { ok: false, error: "An account with this email already exists. Try signing in." };
  await setSessionCookie(rows[0].id);
  return { ok: true, userId: rows[0].id };
}

export async function localSignIn(email: string, password: string): Promise<AuthResult> {
  const rows = await asLocalAuthOwner((tx) =>
    tx.query<{ id: string; encrypted_password: string }>(
      `select id, encrypted_password from auth.users where email = $1::text`,
      [email.trim().toLowerCase()],
    ),
  );
  const user = rows[0];
  const valid = await verifyPassword(password, user?.encrypted_password ?? (await getDummyHash()));
  if (!user || !valid) return { ok: false, error: "That email and password don't match an account." };
  await setSessionCookie(user.id);
  return { ok: true, userId: user.id };
}

export async function localSignOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function localGetUser(): Promise<{ id: string; email: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken<SessionPayload>(token, await getAppSecret(), PURPOSE);
  if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  const rows = await asLocalAuthOwner((tx) =>
    tx.query<{ id: string; email: string }>(`select id, email from auth.users where id = $1::uuid`, [payload.uid]),
  );
  return rows[0] ?? null;
}
