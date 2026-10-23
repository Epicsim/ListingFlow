import type { Metadata } from "next";
import Link from "next/link";
import { UnsubscribeForm } from "@/components/unsubscribe-form";
import { getAppSecret } from "@/lib/config";
import { readUnsubscribeToken } from "@/lib/email/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const { t } = await searchParams;
  const token = typeof t === "string" && readUnsubscribeToken(t, await getAppSecret()) ? t : null;

  return (
    <>
      <h1>Unsubscribe from emails</h1>
      {token ? (
        <>
          <p>
            Stop receiving emails from the real estate agent who contacted you. Your request itself isn&rsquo;t
            affected; to have your details deleted, contact the agent or see{" "}
            <Link href="/privacy#your-rights">your privacy rights</Link>.
          </p>
          <UnsubscribeForm token={token} />
        </>
      ) : (
        <p>
          This unsubscribe link is incomplete or invalid. Please use the full link from the email, or reply to the email
          and ask to be removed.
        </p>
      )}
    </>
  );
}
