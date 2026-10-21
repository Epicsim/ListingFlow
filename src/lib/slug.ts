import { randomInt } from "node:crypto";

export function slugify(text: string, maxLength = 60): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomSuffix(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** A readable, very-likely-unique public slug such as "jordan-rivera-home-value-k3fp". */
export function suggestCampaignSlug(agentName: string, campaignName: string): string {
  const base = slugify(`${agentName} ${campaignName}`, 60) || "home-value";
  return `${base}-${randomSuffix()}`;
}
