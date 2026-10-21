import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { LocalModeNotice } from "@/components/local-mode-notice";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 py-5 sm:px-8">
        <BrandMark />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-12">
        <div className="w-full max-w-[420px]">
          {children}
          <LocalModeNotice className="mt-6" />
        </div>
      </main>
    </div>
  );
}
