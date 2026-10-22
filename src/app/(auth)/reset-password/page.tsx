import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth-forms";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { getBackend } from "@/lib/config";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  // The reset link signs the user in through /auth/callback before landing here.
  const user = getBackend() === "supabase" ? await getSessionUser() : null;
  const params = await searchParams;
  if (!user) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Request a fresh reset link</h1>
        <p className="mt-2 mb-6 text-sm leading-relaxed text-ink-muted">
          Open the link from your reset email in the same browser where you requested it. If it has expired, request a new one below.
        </p>
        <ButtonLink href="/forgot-password" size="lg" className="w-full">Request a reset link</ButtonLink>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">Back to sign in</Link>
        </p>
      </div>
    );
  }

  if (params.updated === "1") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Password updated</h1>
        <p className="mt-2 mb-6 text-sm text-ink-muted">You&rsquo;re signed in. Use your new password the next time you sign in.</p>
        <ButtonLink href="/dashboard" size="lg" className="w-full">Go to dashboard</ButtonLink>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">You&rsquo;ll stay signed in after saving.</p>
      <ResetPasswordForm />
    </div>
  );
}
