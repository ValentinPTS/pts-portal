// The §4.2 regression's completeness (plan part 2.9): every page and route of the app
// is in scripts/regression-routes.mjs, with what it may show of a laboratory's
// identity — so a new page fails here until it is placed, and the browser regression
// (scripts/verify-confidentiality.mjs) opens it as every role.
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTES, DOCS } from "./regression-routes.mjs";
import { DOCUMENTS } from "../src/lib/documents.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const app = fileURLToPath(new URL("../src/app/", import.meta.url));

const found: string[] = [];
const walk = (dir: string, rel = "") => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, rel ? `${rel}/${f}` : f);
    // a page or a route in any of the forms Next takes — and the metadata routes and
    // parallel-route defaults, which serve on their own
    else if (/^(page|route|default)\.(tsx|ts|jsx|js|mdx)$/.test(f) || /^(opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\./.test(f)) found.push(rel ? `${rel}/${f}` : f);
  }
};
walk(app);

const listed = new Set(ROUTES.map((r: { file: string }) => r.file));
const missing = found.filter((f) => !listed.has(f));
t(`every page and route of the app (${found.length}) is in the regression's inventory`, missing.length === 0, missing.join(", "));
const stale = [...listed].filter((f) => !existsSync(join(app, f)));
t("…and the inventory names no page that is gone", stale.length === 0, stale.join(", "));
t("…each once", listed.size === ROUTES.length);
t("…each with what it may show: names in its scheme, never, the laboratory's own, or a development persona", ROUTES.every((r: { names: string }) => ["scheme", "never", "own", "dev"].includes(r.names)));
const ctx = { S: "S", OTHER: "O", code: "C1", docs: DOCS, forms: ["feedback"], folderPath: "/files/testing/f/x", skinId: "k" };
t("…and each but the dev routes (they change who you are, or code at once) and the PDF (posted) gives at least one address to open", ROUTES.filter((r: { file: string }) => !r.file.startsWith("dev/") && r.file !== "api/pdf/route.ts").every((r: { paths: (c: typeof ctx) => string[] }) => r.paths(ctx).length > 0));
t("the documents opened are every document the portal has", JSON.stringify([...DOCS].sort()) === JSON.stringify(DOCUMENTS.map((d) => d.key).sort()));
t("…the public pages and the dashboard never show a laboratory's identity; the laboratory's portal its own", ["apply/page.tsx", "register/page.tsx", "login/page.tsx", "dashboard/page.tsx", "auth/forgot/page.tsx"].every((f) => ROUTES.find((r: { file: string }) => r.file === f)?.names === "never") && ["lab/page.tsx", "lab/profile/page.tsx", "lab/doc/[scheme]/[doc]/route.ts"].every((f) => ROUTES.find((r: { file: string }) => r.file === f)?.names === "own"));

// ── what the regression's review found, where the browser cannot plant it ─────
// (no upload, no failed e-mail and no certificate exist in its run; the PDF case is
// proven there by the identity store's record of openings)
import { readFileSync } from "node:fs";
const src = (p: string) => readFileSync(join(app, p), "utf8");
t("an UPLOADED F 7.2.1-4 or certificate (they carry names, as F 7.2.1-6) opens only for who sees names in the scheme", /if \(\(isRestrictedDoc\(doc\) \|\| showsIdentities\(doc\)\) && !\(await mayNow\("names\.view", id\)\)\) return new Response\("Forbidden/.test(src("schemes/[id]/uploaded/[doc]/route.ts")));
t("a certificate's number and date go with its code only to who sees names (the public register's key, Реш. 115)", /certNo: reveal \? cert\?\.no : undefined, certDate: reveal \? cert\?\.date : undefined/.test(src("schemes/[id]/doc/[doc]/page.tsx")));
t("a failed e-mail's error (it may quote the address) is scrubbed for who does not see the address", /title=\{seesAddress\(m\.schemeId\) \? m\.error : m\.error\?\.replace\(/.test(src("notices/page.tsx")));
t("/api/pdf without the internal token renders as the SAME person (their cookies), never as the open build", /: \{ cookie: req\.headers\.get\("cookie"\) \?\? "" \}/.test(src("api/pdf/route.ts")));

console.log(`regression-inventory.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
