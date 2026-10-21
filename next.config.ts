import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every agent page reads the session and every public page reads live campaign
  // data, so the app renders dynamically instead of opting into Cache Components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // PGlite ships WebAssembly and data files that must be loaded with Node's
  // own resolver rather than bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Branding uploads are capped at 2 MB per image in the app; allow a little
      // headroom for multipart overhead when a form carries more than one image.
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
