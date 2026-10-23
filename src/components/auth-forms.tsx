"use client";

import Link from "next/link";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
} from "@/app/(auth)/actions";
import { ActionForm, SubmitButton } from "./ui/action-form";
import { CheckboxField, TextField } from "./ui/fields";

export function SignInForm({ next }: { next?: string }) {
  return (
    <ActionForm action={signInAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField name="email" label="Email" type="email" autoComplete="email" required />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
      <div className="-mt-1 text-right text-sm">
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          Forgot your password?
        </Link>
      </div>
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
      <CheckboxField
        name="accept_terms"
        required
        label={
          <>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-accent-ink underline underline-offset-4">
              Terms of Service
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-accent-ink underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </>
        }
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
        minLength={8}
        maxLength={200}
        required
      />
      <TextField
        name="confirm_password"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        maxLength={200}
        required
      />
      <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
        Save new password
      </SubmitButton>
      <p className="text-center text-sm text-ink-muted">
        Need a fresh link?{" "}
        <Link href="/forgot-password" className="font-medium text-accent-ink underline-offset-4 hover:underline">
          Request another reset
        </Link>
      </p>
    </ActionForm>
  );
}
