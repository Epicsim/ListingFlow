"use client";

import { ChevronRight, Inbox, LayoutDashboard, Megaphone, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/outbox", label: "Outbox", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-1.5">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink-soft hover:bg-sunken hover:text-ink"
            }`}
          >
            <Icon aria-hidden strokeWidth={1.8} className="size-[18px]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="min-w-0 overflow-x-auto [scrollbar-width:none]">
      <ul className="flex justify-between gap-1 sm:justify-start">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] whitespace-nowrap sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm ${
                  active ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink-soft hover:bg-sunken"
                }`}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function WorkspaceBreadcrumb() {
  const pathname = usePathname();
  const current = ITEMS.find((item) => isActive(pathname, item.href));
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-ink-muted">Workspace</span>
      <ChevronRight aria-hidden className="size-3.5 text-ink-muted" />
      <span className="font-medium text-ink">{current?.label ?? "Overview"}</span>
    </div>
  );
}
