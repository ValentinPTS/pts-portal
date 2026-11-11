import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright (used to render PDFs) must stay a Node external, not bundled.
  // @sparticuz/chromium ships the Lambda Chromium as brotli files it resolves from
  // its own package directory at runtime — bundling would break those paths.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],

  // WHY PDFs FAILED IN PRODUCTION. @sparticuz/chromium loads its payload — the
  // brotli-compressed Chromium, its fonts and swiftshader — from bin/ BY PATH at
  // runtime, not by import. Next's file tracer follows imports, so it shipped the
  // package's JavaScript and left all 69MB of bin/*.br behind: executablePath()
  // then unpacked a browser that wasn't in the bundle and every export 500'd,
  // while local dev (which uses the full `playwright` package instead) worked fine.
  // Same fix Next documents for aws-crt's binaries.
  outputFileTracingIncludes: {
    "/api/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },

  experimental: {
    // Server Actions cap request bodies at 1MB by default. Our uploads need more:
    // scheme cover/logo images (≤2MB) and lab-onboarding documents (≤3 files ×5MB).
    // 16mb covers the largest case with headroom. The only large body is the PUBLIC
    // lab application, which is honeypot- + per-IP-rate-limited, so this doesn't open
    // a meaningful DoS surface; all other actions are auth-gated.
    serverActions: { bodySizeLimit: "16mb" },
    // …and the proxy buffers a body at 10 MB by default: a 10–15 MB upload under /lab (or any page the
    // proxy runs on) arrived cut — «Unexpected end of form», a 500 — though the page promises 15 MB (the
    // security sweep, UL-1). The same 16 MB here. (On Vercel a function's body is about 4.5 MB at most.)
    proxyClientMaxBodySize: "16mb",

    // WHY THE DEV DISK CACHE IS OFF. Next 16.1+ keeps a Turbopack cache for `next dev`
    // in .next/dev/cache, and on 16.2.x it never prunes: it keeps every task it ever
    // compiled (vercel/next.js#94915). Long dev sessions with many edits and browser
    // checks grew it to 252 GB on 5–6 Nov 2026 and filled the disk. Off, each dev start
    // compiles cold — a few seconds per route on first visit. Revisit on 16.4+, which
    // adds `turbopackGc` to collect unreachable work.
    turbopackFileSystemCacheForDev: false,
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
        // The documents' font files (public/fonts/<family>/…, scripts/mirror-fonts.mjs).
        // public/ is served with max-age=0, so every document opening would re-ask
        // for each one; a file's name carries its source version (v19-latin-400.woff2),
        // so a changed font is a new name and the old one can be kept for good. The
        // stylesheets one level up (/fonts/<family>.css) keep the default.
        source: "/fonts/:family/:file",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // App-wide baseline CSP — EVERYWHERE except the document render/fill routes,
        // which set their own STRICTER, script-restricting policy from the route
        // handler. A config-level header on "/(.*)" wins over a route-set one of the
        // same name, so without this exclusion the render routes' `default-src 'none'`
        // and the Fill route's per-request script nonce were silently overridden by
        // this baseline (leaving the sanitizer as the only XSS defense on those
        // routes). The negative lookahead skips any path ending in `/print` or
        // containing `/fill/` so their own CSP is the only one sent — and every route that
        // serves a document's EDITION with its own `default-src 'none'` (lib/editions
        // editionResponse; the security sweep, SI-2: the baseline replaced it on the lab's
        // and the public's document routes): /lab/doc/…, /apply/<id>/plan|invitation,
        // /schemes/<id>/released/…, /schemes/<id>/editions/<edition>.
        source: "/((?!.*(?:/print$|/fill/))(?!lab/doc/|apply/[^/]+/(?:plan|invitation)$|schemes/[^/]+/(?:released/|editions/[^/]+$)).*)",
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
