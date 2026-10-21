"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getAppSecret } from "@/lib/config";
import { asAnon, asService } from "@/lib/db";
import { getEmailDeliveryConfig } from "@/lib/email/config";
import { deliverQueuedEmails } from "@/lib/email/deliver";
import { INQUIRY_FIELDS, processInquirySubmission } from "@/lib/inquiry-service";
import { requestOrigin } from "@/lib/request-origin";
import { clientIp } from "@/lib/security/client-ip";
import type { FieldErrors } from "@/lib/validation";
import { formFields } from "@/lib/validation";

export type PublicSubmitResult = { ok: false; message: string; fieldErrors?: FieldErrors };

/**
 * Public inquiry submission. Redirects to the confirmation page only after the
 * inquiry has been committed; otherwise returns a message for the form.
 */
export async function submitInquiryAction(slug: string, formData: FormData): Promise<PublicSubmitResult> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{3,80}$/.test(slug)) {
    return { ok: false, message: "This page is no longer accepting requests." };
  }
  const emailConfig = getEmailDeliveryConfig();
  const outcome = await processInquirySubmission(
    { anon: asAnon, service: asService },
    {
      slug,
      fields: formFields(formData, INQUIRY_FIELDS),
      ip: clientIp(await headers()),
      siteOrigin: await requestOrigin(),
      secret: await getAppSecret(),
      emailLive: emailConfig.live,
    },
  );

  if (!outcome.ok) return { ok: false, message: outcome.message, fieldErrors: outcome.fieldErrors };

  if (outcome.emailIdsToDeliver.length) {
    // Send after the response so the homeowner isn't kept waiting on the email provider.
    after(() => deliverQueuedEmails(asService, outcome.emailIdsToDeliver));
  }
  redirect(`/p/${slug}/thanks?r=${outcome.publicToken}`);
}
