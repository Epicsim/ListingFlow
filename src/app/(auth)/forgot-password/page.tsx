import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui/display";
import { getBackend } from "@/lib/config";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">We&rsquo;ll email you a link to choose a new password.</p>
      {getBackend() === "local" ? (
        <Notice tone="neutral">Password reset emails aren&rsquo;t available in local mode.</Notice>
      ) : (
        <ForgotPasswordForm />
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
