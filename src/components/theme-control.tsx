"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useId, useSyncExternalStore } from "react";
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

const CHANGE_EVENT = "listingflow-theme-change";
const OPTIONS = [
  { value: "light", label: "Light", icon: Sun, description: "Bright and clear" },
  { value: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes" },
  { value: "system", label: "System", icon: Monitor, description: "Match your device" },
] as const;

function getPreference(): ThemePreference {
  return parseThemePreference(document.documentElement.dataset.themePreference);
}

function applyPreference(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolveTheme(preference, window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const systemChanged = () => {
    applyPreference(getPreference());
    onChange();
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      applyPreference(parseThemePreference(event.newValue));
      onChange();
    }
  };
  media.addEventListener("change", systemChanged);
  window.addEventListener("storage", storageChanged);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", systemChanged);
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const serverPreference = (): ThemePreference => "system";

function savePreference(preference: ThemePreference) {
  applyPreference(preference);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The choice still applies for this page when browser storage is blocked.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Keep device and cross-tab updates active even when Preferences is closed.
export function ThemeSync() {
  useEffect(() => subscribe(() => {}), []);
  return null;
}

export function ThemeControl({ variant = "compact" }: { variant?: "compact" | "cards" }) {
  const preference = useSyncExternalStore(subscribe, getPreference, serverPreference);
  const id = useId();
  const Icon = OPTIONS.find((option) => option.value === preference)!.icon;

  if (variant === "cards") {
    return (
      <fieldset>
        <legend className="sr-only">Color theme</legend>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {OPTIONS.map(({ value, label, icon: OptionIcon, description }) => (
            <button
              type="button"
              key={value}
              aria-pressed={preference === value}
              onClick={() => savePreference(value)}
              className={`relative flex min-w-0 flex-col items-start gap-3 rounded-xl border p-3 text-left transition-colors sm:p-4 ${
                preference === value ? "border-accent-ink bg-accent-soft text-accent-ink ring-1 ring-accent-ink" : "border-line-strong bg-surface text-ink-soft hover:bg-sunken"
              }`}
            >
              <OptionIcon aria-hidden className="size-5" />
              {preference === value ? <Check aria-hidden className="absolute top-3 right-3 size-4" /> : null}
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-1 hidden text-xs text-ink-muted sm:block">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="relative flex h-11 shrink-0 items-center rounded-xl border border-line-strong bg-surface text-ink-soft">
      <Icon aria-hidden className="pointer-events-none absolute left-3 size-4" />
      <label htmlFor={id} className="sr-only">Color theme</label>
      <select
        id={id}
        value={preference}
        onChange={(event) => savePreference(parseThemePreference(event.target.value))}
        className="h-full w-[116px] cursor-pointer rounded-xl bg-transparent pr-2 pl-9 text-sm focus-visible:outline-accent"
      >
        {OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
  );
}
