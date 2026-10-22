import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { brand } from "@/config/brand";
import { ThemeSync } from "@/components/theme-control";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#10141e" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body className="min-h-full"><ThemeSync />{children}</body>
    </html>
  );
}
