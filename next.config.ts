import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright (used to render PDFs) must stay a Node external, not bundled.
  serverExternalPackages: ["playwright", "playwright-core"],

  // Baseline security headers applied to every response. (A full
  // Content-Security-Policy with nonces is added in Phase 2 — see SECURITY.md.)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
