import Link from "next/link";
import { business, LEGAL_LINKS } from "@/config/brand";

export function BusinessDetails({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      © {new Date().getFullYear()} {business.legalName} · {business.address} ·{" "}
      <a href={`mailto:${business.email}`} className="underline underline-offset-4 hover:text-ink">
        {business.email}
      </a>
    </p>
  );
}

/** Business details and legal links for the auth and legal pages. */
export function LegalFooter() {
  return (
    <footer className="border-t border-line px-5 py-5 text-[13px] text-ink-muted sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <BusinessDetails />
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
