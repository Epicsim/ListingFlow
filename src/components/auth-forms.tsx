"use client";

import Link from "next/link";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
} from "@/app/(auth)/actions";
import { ActionForm, SubmitButton } from "./ui/action-form";
import { TextField } from "./ui/fields";

export function SignInForm({ next, showForgot }: { next?: string; showForgot: boolean }) {
  return (
    <ActionForm action={signInAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField name="email" label="Email" type="email" autoComplete="email" required />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
      {showForgot ? (
        <div className="-mt-1 text-right text-sm">
          <Link href="/forgot-password" className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
            Forgot your password?
          </Link>
        </div>
      ) : null}
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </ActionForm>
  );
}

export function SignUpForm() {
  return (
    <ActionForm action={signUpAction} className="space-y-4">
      <TextField name="email" label="Email" type="email" autoComplete="email" required />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
      />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </ActionForm>
  );
}

export function ForgotPasswordForm() {
  return (
    <ActionForm action={requestPasswordResetAction} className="space-y-4">
      <TextField name="email" label="Email" type="email" autoComplete="email" required />
      <SubmitButton className="w-full" size="lg" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm() {
  return (
    <ActionForm action={updatePasswordAction} className="space-y-4">
      <TextField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
      />
      <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </ActionForm>
  );
}
