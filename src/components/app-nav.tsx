"use client";

import { Inbox, LayoutDashboard, Megaphone, Settings, Users } from "lucide-react";
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
    <nav aria-label="Main" className="space-y-0.5">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors ${
              active ? "bg-surface font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-soft hover:bg-sunken hover:text-ink"
            }`}
          >
            <Icon aria-hidden className={`size-[18px] ${active ? "text-accent" : "text-ink-muted"}`} />
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
    <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${
                  active ? "bg-ink text-white" : "text-ink-soft hover:bg-sunken"
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
