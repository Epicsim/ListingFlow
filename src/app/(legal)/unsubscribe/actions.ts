"use server";

import { type ActionState, failure, success } from "@/lib/action-state";
import { getAppSecret } from "@/lib/config";
import { unsubscribeContact } from "@/lib/data/public";
import { asService } from "@/lib/db";
import { readUnsubscribeToken } from "@/lib/email/unsubscribe";

export async function unsubscribeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const contactId = readUnsubscribeToken(String(formData.get("t") ?? ""), await getAppSecret());
  if (!contactId) return failure("This unsubscribe link isn't valid. Please reply to the email and ask to be removed.");
  try {
    const exists = await asService((tx) => unsubscribeContact(tx, contactId));
    return success(
      exists
        ? "You're unsubscribed. You won't receive more emails from this agent through this service."
        : "Your details have already been deleted, so you won't receive more emails.",
    );
  } catch (error) {
    // Error class and code only - never the contact.
    const e = error as { code?: string; name?: string };
    console.error(`[unsubscribe] failed: ${e.name ?? "Error"} ${e.code ?? ""}`.trim());
    return failure("We couldn't process this right now. Please try again in a moment.");
  }
}
