import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { resolveTheme, themeInitScript } from "@/lib/theme";
import { contrastRatio } from "@/lib/color";

describe("theme before first paint", () => {
  it.each([
    ["light", true, "light", "light"],
    ["dark", false, "dark", "dark"],
    ["system", true, "system", "dark"],
    [null, false, "system", "light"],
    ["untrusted-value", true, "system", "dark"],
  ])("restores %s with system dark=%s", (saved, systemDark, preference, resolved) => {
    const dataset: Record<string, string> = {};
    runInNewContext(themeInitScript, {
      document: { documentElement: { dataset } },
      localStorage: { getItem: () => saved },
      matchMedia: () => ({ matches: systemDark }),
    });
    expect(dataset).toEqual({ themePreference: preference, theme: resolved });
  });

  it("honors the device when local storage is blocked", () => {
    const dataset: Record<string, string> = {};
    runInNewContext(themeInitScript, {
      document: { documentElement: { dataset } },
      localStorage: { getItem() { throw new Error("Storage blocked"); } },
      matchMedia: () => ({ matches: true }),
    });
    expect(dataset.theme).toBe("dark");
    expect(dataset.themePreference).toBe("system");
  });

  it("falls back to light when media queries are unavailable", () => {
    const dataset: Record<string, string> = {};
    runInNewContext(themeInitScript, { document: { documentElement: { dataset } } });
    expect(dataset.theme).toBe("light");
  });

  it("updates System with the OS while explicit choices remain fixed", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("theme readability", () => {
  const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  const light = css.split("@theme {")[1].split("\n}")[0];
  const dark = css.split('html[data-theme="dark"] {')[1].split("\n  }")[0];

  it.each([["light", light], ["dark", dark]])("keeps normal text at AA contrast in %s mode", (_, block) => {
    const colors = Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*(#[\da-fA-F]+)/g)].map((m) => [m[1], m[2]]));
    for (const foreground of ["ink", "ink-soft", "ink-muted", "accent-ink"]) {
      for (const surface of ["canvas", "surface", "sunken"]) {
        expect(contrastRatio(colors[foreground], colors[surface]), `${foreground} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const tone of ["accent", "danger", "warning", "info"]) {
      expect(contrastRatio(colors[tone === "accent" ? "accent-ink" : tone], colors[`${tone}-soft`]), tone).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio("#ffffff", colors.accent), "primary button label").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors["line-strong"], colors.surface), "control boundary").toBeGreaterThanOrEqual(3);
  });
});
