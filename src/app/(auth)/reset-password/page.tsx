import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth-forms";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The reset link signs the user in through /auth/callback before landing here.
  await requireUser();
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">You&rsquo;ll stay signed in after saving.</p>
      <ResetPasswordForm />
    </div>
  );
}
