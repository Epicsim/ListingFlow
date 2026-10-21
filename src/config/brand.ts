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
