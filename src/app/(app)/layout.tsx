import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { SideNav, TabNav } from "@/components/app-nav";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/display";
import { requireAgent } from "@/lib/auth/session";
import { getBackend } from "@/lib/config";
import { assetUrl } from "@/lib/images";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await requireAgent();
  const local = getBackend() === "local";
  const headshot = assetUrl(profile.headshot_asset_id);
  const initials = profile.full_name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const account = (
    <div className="flex min-w-0 items-center gap-3">
      {headshot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={headshot} alt="" className="size-9 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">
          {initials}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{profile.full_name}</p>
        <p className="truncate text-xs text-ink-muted">{user.email}</p>
      </div>
    </div>
  );

  const signOut = (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-sunken hover:text-ink"
      >
        <LogOut aria-hidden className="size-4" />
        Sign out
      </button>
    </form>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-canvas px-4 py-5 lg:flex">
        <div className="flex items-center justify-between px-2">
          <BrandMark href="/dashboard" />
        </div>
        {local ? (
          <div className="mt-3 px-2">
            <Badge tone="warning">Local mode</Badge>
          </div>
        ) : null}
        <div className="mt-6 flex-1">
          <SideNav />
        </div>
        <div className="space-y-2 border-t border-line pt-4">
          <div className="px-2">{account}</div>
          {signOut}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 pt-3 pb-2.5 backdrop-blur lg:hidden">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <BrandMark href="/dashboard" />
            <div className="flex items-center gap-2">
              {local ? <Badge tone="warning">Local mode</Badge> : null}
              {signOut}
            </div>
          </div>
          <TabNav />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
