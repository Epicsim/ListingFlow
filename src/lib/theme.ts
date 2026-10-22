export const THEME_STORAGE_KEY = "listingflow-theme";
export type ThemePreference = "light" | "dark" | "system";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

// First-party, static code runs in the head before paint. Storage can be blocked
// in private browsing; the OS preference still works in that case.
export const themeInitScript = `(() => {
  let preference = "system";
  try {
    const saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {}
  const systemDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
})();`;
