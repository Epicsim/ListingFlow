import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui/display";
import { getSessionUser } from "@/lib/auth/session";
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
      {params.account_deleted === "1" ? (
        <Notice tone="accent" className="mb-4">
          Your account and all of its data have been permanently deleted.
        </Notice>
      ) : null}
      {params.error === "link" ? (
        <Notice tone="warning" className="mb-4">
          That link has expired or could not be verified. Sign in, or{" "}
          <Link href="/forgot-password" className="font-medium underline underline-offset-4">
            request a new password reset link
          </Link>.
        </Notice>
      ) : null}
      <SignInForm next={next} />
      <p className="mt-6 text-center text-sm text-ink-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent-ink underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
