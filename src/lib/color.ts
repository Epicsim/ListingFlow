/** Contrast helpers so an agent's brand color never produces unreadable text. */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const INK = "#1C1A17";
const WHITE = "#FFFFFF";

/** Text color for content placed on a brand-colored surface (e.g. a button). */
export function readableOn(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK;
}

/** Use the brand color for text/links on light backgrounds only if it is legible (WCAG AA). */
export function brandTextColor(brand: string, background = "#FFFFFF"): string {
  return contrastRatio(brand, background) >= 4.5 ? brand : INK;
}

/** CSS custom properties for a branded public page. */
export function brandStyle(primary: string): Record<string, string> {
  const safe = /^#[0-9a-f]{6}$/i.test(primary) ? primary : "#1F5F4A";
  return {
    "--brand": safe,
    "--brand-contrast": readableOn(safe),
    "--brand-text": brandTextColor(safe),
  };
}
