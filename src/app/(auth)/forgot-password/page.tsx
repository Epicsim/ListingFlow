import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui/display";
import { getBackend } from "@/lib/config";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const isLocal = getBackend() === "local";
  const requested = !isLocal && params.requested === "1";

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      {requested ? (
        <>
          <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
            <Mail className="size-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Check your inbox</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            If an account matches that email, you&rsquo;ll receive a link to choose a new password.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Open the link in this browser. If it doesn&rsquo;t arrive, check your spam folder or wait a few minutes before trying again.
          </p>
          <Link href="/forgot-password" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
            Try another email or request a new link
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1 mb-6 text-sm text-ink-muted">Enter your account email and we&rsquo;ll help you get back in.</p>
          {isLocal ? (
            <Notice tone="neutral">
              Password reset emails aren&rsquo;t available in local mode. Use your existing password to sign in.
            </Notice>
          ) : (
            <>
              {params.error === "link" ? (
                <Notice tone="warning" className="mb-4">
                  That reset link has expired or could not be verified. Request a new one and open it in this browser.
                </Notice>
              ) : null}
              <ForgotPasswordForm />
            </>
          )}
        </>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
