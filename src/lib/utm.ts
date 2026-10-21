/** Campaign link building and traffic-source attribution. */

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

export const SHARE_PRESETS = [
  { id: "instagram", label: "Instagram", hint: "Bio link, stories and posts", source: "instagram", medium: "social" },
  { id: "facebook", label: "Facebook", hint: "Profile, page and posts", source: "facebook", medium: "social" },
  { id: "website", label: "Your website", hint: "Buttons and banners on your site", source: "website", medium: "referral" },
  { id: "email", label: "Email signature", hint: "Your email footer or newsletter", source: "email", medium: "email" },
  { id: "ads", label: "Paid ads", hint: "Ads you run and pay for yourself", source: "paid_ads", medium: "cpc" },
] as const;

/** Lowercase token used to group inquiries by source; "direct" when unknown. */
export function normalizeSource(raw: string | null | undefined): string {
  const cleaned = (raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return cleaned || "direct";
}

export function sourceLabel(source: string): string {
  const preset = SHARE_PRESETS.find((p) => p.source === source);
  if (preset) return preset.label === "Your website" ? "Website" : preset.label;
  if (source === "direct") return "Direct / unknown";
  return source.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function publicCampaignPath(slug: string): string {
  return `/p/${slug}`;
}

export function buildCampaignUrl(origin: string, slug: string, utm: UtmParams = {}): string {
  const url = new URL(publicCampaignPath(slug), origin);
  const entries: [string, string | undefined][] = [
    ["utm_source", utm.source],
    ["utm_medium", utm.medium],
    ["utm_campaign", utm.campaign],
    ["utm_content", utm.content],
  ];
  for (const [key, value] of entries) {
    const v = value?.trim();
    if (v) url.searchParams.set(key, v);
  }
  return url.toString();
}

/** Reads UTM values from page search params (first value wins). */
export function readUtm(searchParams: Record<string, string | string[] | undefined>) {
  const pick = (key: string) => {
    const v = searchParams[key];
    const s = Array.isArray(v) ? v[0] : v;
    return s ? s.slice(0, 100) : undefined;
  };
  return {
    utm_source: pick("utm_source"),
    utm_medium: pick("utm_medium"),
    utm_campaign: pick("utm_campaign"),
    utm_content: pick("utm_content"),
    utm_term: pick("utm_term"),
  };
}
