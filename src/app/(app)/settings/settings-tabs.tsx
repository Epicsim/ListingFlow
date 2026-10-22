"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Profile & branding" },
  { href: "/settings/templates", label: "Email templates" },
  { href: "/settings/preferences", label: "Preferences" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-2 py-2.5 text-xs font-medium whitespace-nowrap sm:px-3 sm:text-sm ${
              active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
