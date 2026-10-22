"use client";

import { useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/config/brand";

const LINKS = [{ label: `Why ${brand.name}`, href: "#why" }, { label: "How it works", href: "#how" }, { label: "Pricing", href: "#pricing" }, { label: "FAQ", href: "#faq" }];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <header className="lfm-header" onKeyDown={(event) => { if (event.key === "Escape" && open) { setOpen(false); menuButton.current?.focus(); } }}>
      <div className="lfm-headerInner">
        <BrandMark className="lfm-headerLogo" />
        <nav className="lfm-desktopNav" aria-label="Website">{LINKS.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
        <div className="lfm-headerActions"><Link href="/login" className="lfm-signIn">Sign in</Link><Link href="/signup" className="lfm-button lfm-headerCta">Get started <ArrowRight aria-hidden size={15} /></Link><button ref={menuButton} type="button" className="lfm-menuToggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-marketing-nav" onClick={() => setOpen(!open)}>{open ? <X aria-hidden size={21} /> : <Menu aria-hidden size={21} />}</button></div>
      </div>
      <nav id="mobile-marketing-nav" className="lfm-mobileNav" hidden={!open} aria-label="Mobile website">{LINKS.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}<ArrowRight aria-hidden size={16} /></a>)}<Link href="/signup" onClick={() => setOpen(false)}>Create your seller page <ArrowRight aria-hidden size={16} /></Link></nav>
    </header>
  );
}
