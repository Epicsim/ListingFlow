import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui/display";
import { getSessionUser } from "@/lib/auth/session";
import { getBackend } from "@/lib/config";
import { safeNextPath } from "@/lib/request-origin";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : undefined;
  if (await getSessionUser()) redirect(next ?? "/dashboard");

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">Sign in to see your inquiries and consultations.</p>
      {params.error === "link" ? (
        <Notice tone="warning" className="mb-4">
          That link has expired or was already used. Sign in, or request a new link.
        </Notice>
      ) : null}
      <SignInForm next={next} showForgot={getBackend() === "supabase"} />
      <p className="mt-6 text-center text-sm text-ink-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
