/**
 * Product name and copy used across the app, in one place.
 * Set NEXT_PUBLIC_APP_NAME to rename the product without code changes.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "ListingFlow",
  tagline: "Turn the visitors you already have into seller consultations.",
  description:
    "Branded seller landing pages, a simple inquiry form and a focused follow-up dashboard for individual real estate agents.",
} as const;

/**
 * The business behind the product, shown in footers and the legal pages.
 * Set these before launch; the bracketed placeholders are shown until you do.
 */
export const business = {
  legalName: process.env.NEXT_PUBLIC_BUSINESS_NAME?.trim() || "[Registered business name]",
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim() || "[Business postal address]",
  email: process.env.NEXT_PUBLIC_BUSINESS_EMAIL?.trim() || "[Contact email]",
} as const;

/** Version of the Terms, Privacy, Cookie and Refund pages. Recorded when an agent accepts the Terms. */
export const legalUpdated = { iso: "2026-10-22T00:00:00-07:00", label: "October 22, 2026" } as const;

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
  { href: "/refunds", label: "Refunds" },
] as const;

/** Browser-storage key remembering that the cookie notice was closed. */
export const COOKIE_NOTICE_KEY = "listingflow-cookie-notice";
