import Image from "next/image";
import Link from "next/link";
import { brand } from "@/config/brand";
import listingFlowLogo from "../../public/brand/listingflow-logo-v1.png";
import "./brand-mark.css";

export function BrandGlyph({ className = "size-7" }: { className?: string }) {
  return (
    <span aria-hidden className={`brand-glyph ${className}`}>
      <Image src={listingFlowLogo} alt="" sizes="160px" className="brand-glyph-image" />
    </span>
  );
}

export function BrandMark({ href = "/", className = "", compact = false }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={`inline-flex min-h-11 shrink-0 items-center rounded-md ${className}`}>
      <span className={`brand-logo ${compact ? "brand-logo-compact" : ""}`}>
        <Image
          src={listingFlowLogo}
          alt={brand.name}
          sizes={compact ? "150px" : "215px"}
          loading="eager"
          className="brand-logo-image"
        />
      </span>
    </Link>
  );
}
