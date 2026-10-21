"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { type ActionState, failure, success } from "@/lib/action-state";
import { localSignIn, localSignOut, localSignUp } from "@/lib/auth/local";
import { requireUser } from "@/lib/auth/session";
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
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  // Same response whether or not the account exists.
  return success("If an account exists for that email, a reset link is on its way.");
}

export async function updatePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  if (getBackend() === "local") return failure("Password changes aren't available in local mode.");
  await requireUser();
  const parsed = z.object({ password: newPassword }).safeParse({ password: formData.get("password") });
  if (!parsed.success) return failure("Please fix the highlighted fields.", toFieldErrors(parsed.error));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failure("We couldn't update your password. Please request a new reset link.");
  redirect("/dashboard");
}
