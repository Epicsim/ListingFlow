"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { type ActionState, failure, success } from "@/lib/action-state";
import { localSignIn, localSignOut, localSignUp } from "@/lib/auth/local";
import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { getBackend } from "@/lib/config";
import { requestOrigin, safeNextPath } from "@/lib/request-origin";
import { toFieldErrors } from "@/lib/validation";

const emailField = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ error: "Enter a valid email address." }));
const newPassword = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .max(200, { error: "Use at most 200 characters." });

const signUpSchema = z.object({ email: emailField, password: newPassword });
const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, { error: "Enter your password." }).max(200),
});
const resetPasswordSchema = z.object({
  password: newPassword,
  confirm_password: z.string().min(1, { error: "Confirm your new password." }).max(200),
}).refine((value) => value.password === value.confirm_password, {
  error: "Your passwords don't match.",
  path: ["confirm_password"],
});

export async function signUpAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const { email, password } = parsed.data;

  if (getBackend() === "local") {
    const result = await localSignUp(email, password);
    if (!result.ok) return failure(result.error);
    redirect("/onboarding");
  }

  const supabase = await createSupabaseServerClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) {
    return failure(
      /already registered|already exists/i.test(error.message)
        ? "An account with this email already exists. Try signing in."
        : "We couldn't create your account. Please try again.",
    );
  }
  if (data.session) redirect("/onboarding");
  return success("Check your inbox for a confirmation link. After confirming, you'll set up your profile.");
}

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const { email, password } = parsed.data;

  if (getBackend() === "local") {
    const result = await localSignIn(email, password);
    if (!result.ok) return failure(result.error);
    redirect(next);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return failure(
      /confirm/i.test(error.message)
        ? "Please confirm your email address first – check your inbox for the link."
        : "That email and password don't match an account.",
    );
  }
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  if (getBackend() === "local") {
    await localSignOut();
  } else {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function requestPasswordResetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (getBackend() === "local") {
    return failure("Password reset emails aren't available in local mode.");
  }
  const parsed = z.object({ email: emailField }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const origin = await requestOrigin();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      // Match the exact allowlisted URL. The PKCE verifier records the recovery intent.
      redirectTo: `${origin}/auth/callback`,
    });
    if (error) {
      return failure(error.status === 429
        ? "Too many reset requests. Please wait a few minutes before trying again."
        : "We couldn't request a reset link. Please try again in a few minutes.");
    }
  } catch {
    return failure("We couldn't request a reset link. Please try again in a few minutes.");
  }
  // Supabase returns the same result whether or not the account exists.
  redirect("/forgot-password?requested=1");
}

export async function updatePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (getBackend() === "local") return failure("Password changes aren't available in local mode.");
  if (!await getSessionUser()) return failure("Your reset session has expired. Please request a new reset link.");
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  try {
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error?.code === "same_password") {
      return failure("Please choose a different password.", { password: "Use a different password from your current one." });
    }
    if (error?.code === "weak_password") {
      return failure("Please choose a stronger password.", { password: "This password doesn't meet the account's security requirements." });
    }
    if (error) return failure("We couldn't update your password. Please request a new reset link and try again.");
  } catch {
    return failure("We couldn't update your password. Please try again in a few minutes.");
  }
  redirect("/reset-password?updated=1");
}
