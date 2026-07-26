import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright (used to render PDFs) must stay a Node external, not bundled.
  serverExternalPackages: ["playwright", "playwright-core"],

  experimental: {
    // Server Actions cap request bodies at 1MB by default. Our uploads need more:
    // scheme cover/logo images (≤2MB) and lab-onboarding documents (≤3 files ×5MB).
    // 16mb covers the largest case with headroom. The only large body is the PUBLIC
    // lab application, which is honeypot- + per-IP-rate-limited, so this doesn't open
    // a meaningful DoS surface; all other actions are auth-gated.
    serverActions: { bodySizeLimit: "16mb" },
  },

  // Baseline security headers applied to every response.
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
      {
        // App-wide baseline CSP — EVERYWHERE except the document render/fill routes,
        // which set their own STRICTER, script-restricting policy from the route
        // handler. A config-level header on "/(.*)" wins over a route-set one of the
        // same name, so without this exclusion the render routes' `default-src 'none'`
        // and the Fill route's per-request script nonce were silently overridden by
        // this baseline (leaving the sanitizer as the only XSS defense on those
        // routes). The negative lookahead skips any path ending in `/print` or
        // containing `/fill/` so their own CSP is the only one sent.
        source: "/((?!.*(?:/print$|/fill/)).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
