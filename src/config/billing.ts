/** Public, fixed plan details. Stripe's configured Price is checked against these before checkout. */
export const MONTHLY_PLAN = { amount: 2000, currency: "usd", interval: "month", label: "US$20/month" } as const;
