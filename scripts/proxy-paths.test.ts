// The proxy's matcher against crafted paths (the security sweep, 2026-11-11): Next matches the
// matcher on the path AS SENT and on it decoded — dot segments still in — but serves the page
// they resolve to. «/certificate/%2e%2e/dashboard» was left out (as «certificate…») and served
// the dashboard with no proxy, no 2FA check. Here: Next's own matcher compiler and route
// matcher, fed the same two forms Next feeds them (server/lib/router-utils/resolve-routes.js),
// and the proxy's PUBLIC_PATH on the normalised path (a WHATWG URL, as request.nextUrl).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info.js");
const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher.js");

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const src = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
const block = src.slice(src.indexOf("matcher: ["), src.indexOf("],", src.indexOf("matcher: [")) + 1);
const matchers: string[] = [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
t("two matchers", matchers.length === 2, JSON.stringify(matchers));
const compiled = getMiddlewareMatchers(matchers, { i18n: undefined, basePath: "" });
const match = getMiddlewareRouteMatcher(compiled);
// as Next does: the path as sent, and it decoded
const runs = (raw: string) => {
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* as Next: not decodable, not matched so */ }
  return !!match(raw, { headers: {} }, {}) || !!match(decoded, { headers: {} }, {});
};
const PUBLIC = new RegExp(src.match(/const PUBLIC_PATH = \/(.+)\/;/)![1]);
const normalised = (raw: string) => new URL(raw, "http://portal.invalid").pathname;
// the proxy gates a request when it runs AND the normalised path is not public
const gated = (raw: string) => runs(raw) && !PUBLIC.test(normalised(raw));

// an owner page, however the path is dressed
for (const raw of [
  "/dashboard", "/users", "/schemes/26-11-T-1", "/registrations",
  "/certificate/%2e%2e/dashboard", "/certificate/%2E%2E/dashboard", "/certificate/../dashboard",
  "/_next/static/%2e%2e/%2e%2e/dashboard", "/_next/static/../../dashboard", "/favicon.ico/%2e%2e/dashboard",
  "/fonts/%2e%2e/dashboard", "/brand/%2e%2e/dashboard", "/api/%2e%2e/dashboard", "/apply/%2e%2e/users",
  "/register/%2e%2e/registrations", "/feed/%2e%2e/dashboard", "/catalogue/%2e%2e/users", "/certificate/.%2e/dashboard",
  "/certificate/%2e./dashboard", "/certificate\\..\\dashboard", "/certificate/%5c..%5cdashboard",
]) {
  t(`gated: ${raw} (served as ${normalised(raw)})`, normalised(raw) === "/" || !PUBLIC.test(normalised(raw)) ? gated(raw) : true, `runs=${runs(raw)} normalised=${normalised(raw)}`);
}
// the public parts stay open — no session asked for
for (const raw of ["/catalogue", "/certificate", "/certificate?no=1", "/apply", "/apply/26-11-T-1", "/apply/26-11-T-1/plan", "/register", "/register/thanks", "/feed/schemes.json", "/api/certificate", "/api/pdf", "/fonts/inter/v1.woff2", "/brand/logo.png", "/_next/static/chunks/a.js", "/favicon.ico"]) {
  t(`open: ${raw}`, !gated(raw.split("?")[0]), `runs=${runs(raw)}`);
}
// «/registrations» is PTS's section, never the public registration
t("«/registrations» is gated", gated("/registrations") && gated("/registrations/letter/x"));
t("the lab side runs through the proxy", runs("/lab") && runs("/lab/p/1"));

// round 4 (R4S-9): a later top-level route that merely STARTS like a public part still runs through the proxy
for (const raw of ["/applications", "/brandbook", "/apiary", "/apply-later", "/fontsx", "/favicon.icox", "/feedback", "/registrations/x"]) {
  t(`a route that only starts like a public part runs through the proxy: ${raw}`, runs(raw));
}
// round 4 (R4S-2): a ping, a prefetch, an attribution report — refused on a non-public path
{
  const prox = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  t("the proxy refuses «empty» + «no-cors» and attribution requests before the auth switch", /request\.headers\.has\("attribution-reporting-eligible"\)/.test(prox) && /dest === "empty" && \(request\.headers\.get\("sec-fetch-mode"\)/.test(prox) && prox.indexOf("notAPage(request)") < prox.indexOf("if (!AUTH_ENABLED)"));
}

console.log(`proxy-paths.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
