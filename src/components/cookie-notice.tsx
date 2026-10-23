"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { COOKIE_NOTICE_KEY } from "@/config/brand";
import { Button } from "./ui/button";

const CHANGE_EVENT = "listingflow-cookie-notice-change";
let closedThisPage = false;

function isClosed(): boolean {
  if (closedThisPage) return true;
  try {
    return localStorage.getItem(COOKIE_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function close() {
  closedThisPage = true;
  try {
    localStorage.setItem(COOKIE_NOTICE_KEY, "1");
  } catch {
    // Still closes for this page when browser storage is blocked.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Informational notice, not a consent prompt: only strictly necessary cookies
 * and storage are used, so there is nothing to opt in to (see /cookies).
 * Adding analytics or advertising cookies requires a real opt-in first.
 */
export function CookieNotice() {
  const closed = useSyncExternalStore(subscribe, isClosed, () => true);
  const pathname = usePathname();
  // Homeowner-facing pages set no cookies, and the notice would cover the agent's form.
  if (closed || /^\/(p\/|campaign-preview\/|unsubscribe)/.test(pathname)) return null;
  return (
    <section
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft shadow-raised sm:flex-row sm:items-center"
    >
      <p className="flex-1">
        We only use cookies needed to keep you signed in and remember your display settings. No tracking or
        advertising.{" "}
        <Link href="/cookies" className="font-medium text-accent-ink underline underline-offset-4">
          Cookie Policy
        </Link>
      </p>
      <Button size="sm" onClick={close}>
        OK
      </Button>
    </section>
  );
}
