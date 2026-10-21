import Link from "next/link";
import { brand } from "@/config/brand";

export function BrandGlyph({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <path
        d="M9 15.5 16 9.5l7 6V23a1 1 0 0 1-1 1h-3.5v-4.5h-5V24H10a1 1 0 0 1-1-1v-7.5Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandMark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 rounded-md ${className}`}>
      <BrandGlyph />
      <span className="font-display text-lg font-semibold tracking-tight text-ink">{brand.name}</span>
    </Link>
  );
}
