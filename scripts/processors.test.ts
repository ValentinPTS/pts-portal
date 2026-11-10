// The outside services (plan part 1.12): every host the code names is in the registry,
// with what it is for, which personal data reach it, where, and on what contract —
// and no registry host is stale. (A host a person types — a link in a document — is
// not in the code; pictures may come only from the portal's own places, so a viewer's
// browser is never sent to an arbitrary host.)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { EXTERNAL_SERVICES, serviceForHost } from "../src/lib/processors.ts";
import { imageUrlAllowed, docImgSrc } from "../src/lib/image-hosts.ts";
import { sanitizeDocHtml } from "../src/lib/sanitize-html.ts";
import { sanitizeSkinData, compileSkin, previewDocHtml, FONTS } from "../src/skins/custom.ts";
import { BRAND_FONTS, fontSlug, localizeFontLinks } from "../src/lib/doc-fonts.ts";
import { wrapDoc } from "../src/lib/doc-shell.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const portal = fileURLToPath(new URL("../", import.meta.url));
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/node_modules|\.next|\.git$/.test(p)) walk(p); } else if (/\.(ts|tsx|css|mjs|js|json|html)$/.test(f) && !/package-lock/.test(f)) files.push(p); } };
for (const d of ["src", "public"]) if (existsSync(join(portal, d))) walk(join(portal, d));
for (const f of ["next.config.ts", "vercel.json", "package.json"]) if (existsSync(join(portal, f))) files.push(join(portal, f));
const all = files.map((f) => readFileSync(f, "utf8")).join("\n");

// every host named in the code — absolute and protocol-relative («//host»)
const NOT_A_HOST = new Set(["www.w3.org", "portal.invalid", "schemas.openxmlformats.org", "purl.org"]); // XML namespaces (the XLSX writer, 7.1 — names, never contacted), a placeholder
const OWN = /(^|\.)(ptsbg\.eu|localhost|example\.(com|org|test|bg))$/;
const found = new Set([
  ...[...all.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map((m) => m[1].toLowerCase()),
  ...[...all.matchAll(/["'(`]\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)[/"')`]/gi)].map((m) => m[1].toLowerCase()),
].filter((h) => !NOT_A_HOST.has(h) && !OWN.test(h)));
const registry = new Set(EXTERNAL_SERVICES.flatMap((s) => s.hosts).filter((h) => !h.startsWith("env:")));
const unnamed = [...found].filter((h) => !serviceForHost(h));
t(`every outside host in the code (${found.size}) is in the registry`, unnamed.length === 0, `not named: ${unnamed.join(", ")}`);
t("…and every registry host is still in the code (no stale entry)", [...registry].every((h) => found.has(h)), [...registry].filter((h) => !found.has(h)).join());
t("the database comes from configuration — Supabase is in the registry for it", EXTERNAL_SERVICES.some((s) => s.key === "supabase" && s.hosts.includes("env:NEXT_PUBLIC_SUPABASE_URL")) && /process\.env\.NEXT_PUBLIC_SUPABASE_URL/.test(all));
t("each entry: what for, which personal data, where, on what contract", EXTERNAL_SERVICES.every((s) => s.purpose.length > 10 && s.personalData.length > 3 && s.location.length > 0 && s.contract.length > 3 && s.company.length > 3));
t("a processor's entry names its DPA", EXTERNAL_SERVICES.filter((s) => s.role === "processor").every((s) => /DPA/.test(s.contract)));
t("the plan's five are there: database host, web host, mail provider, the editor's translation, VIES", ["supabase", "vercel", "resend", "mymemory", "vies"].every((k) => EXTERNAL_SERVICES.some((s) => s.key === k)));
t("…and what the plan did not name: the documents' fonts — where they came from (Google Fonts), now with no host and no personal data", EXTERNAL_SERVICES.some((s) => s.key === "google-fonts" && s.role === "no-personal" && s.hosts.length === 0 && /OFL/.test(s.contract)));
t("a service with no contract carries a recommendation", EXTERNAL_SERVICES.filter((s) => /^None/.test(s.contract)).every((s) => !!s.note));
t("Vercel's default region (iad1, USA) is said", /iad1/.test(EXTERNAL_SERVICES.find((s) => s.key === "vercel")!.location));

// pictures: only from the portal's own places
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" };
t("a picture from the portal's storage or ptsbg.eu: allowed", imageUrlAllowed("https://abc.supabase.co/storage/v1/object/public/skin-assets/c.png", env) && imageUrlAllowed("https://ptsbg.eu/x.png", env) && imageUrlAllowed("https://www.ptsbg.eu/x.png", env));
t("…from anywhere else, or not https, or the storage's other paths: not", !imageUrlAllowed("https://tracker.example.net/p.gif", env) && !imageUrlAllowed("http://ptsbg.eu/x.png", env)
  && !imageUrlAllowed("https://abc.supabase.co/rest/v1/x", env) && !imageUrlAllowed("https://evilptsbg.eu/x.png", env) && !imageUrlAllowed("https://ptsbg.eu.evil.net/x.png", env));
t("the documents' CSP: no «any https» for pictures", !/https:(?=\s|;|$)/.test(docImgSrc(env).replace(/https:\/\/\S+/g, "")) && docImgSrc(env).includes("https://abc.supabase.co"));
const cleaned = sanitizeDocHtml('<p>x</p><img src="https://tracker.example.net/p.gif"><img src="//tracker.example.net/q.gif"><img src="/brand/logo.png"><a href="https://anywhere.example.net">link</a>');
t("the sanitizer drops a picture from elsewhere (and a protocol-relative one), keeps the portal's and every link", !/tracker\.example\.net/.test(cleaned) && /\/brand\/logo\.png/.test(cleaned) && /anywhere\.example\.net/.test(cleaned), cleaned);
t("a skin's logo from elsewhere falls back", sanitizeSkinData({ name: "x", logo: "https://tracker.example.net/l.png" }, "s1").logo !== "https://tracker.example.net/l.png");
const csp = ["app/schemes/[id]/doc/[doc]/print/route.ts", "app/schemes/[id]/build/[doc]/print/route.ts", "app/lab/doc/[scheme]/[doc]/route.ts", "lib/editions.ts", "app/schemes/[id]/fill/[doc]/route.ts"]
  .map((f) => readFileSync(join(portal, "src", f), "utf8"));
t("every document route's CSP takes its pictures' rule from the one place", csp.every((s) => /img-src \$\{docImgSrc\(\)\}/.test(s) && !/img-src 'self' data: https:/.test(s)));
t("…and lets stylesheets and fonts come only from the portal itself", csp.every((s) => /style-src 'unsafe-inline' 'self'; font-src 'self'/.test(s)));

// the documents' fonts are the portal's own (public/fonts, scripts/mirror-fonts.mjs):
// opening a document sends no one's browser to Google (PROCESSORS-BG.md, item 1 of
// «Четири неща за решение»)
t("neither Google font host is named anywhere in the code", !/fonts\.(googleapis|gstatic)\.com/.test(all));
const fontsDir = join(portal, "public/fonts");
const families = [...new Set([...BRAND_FONTS, ...FONTS.map((f) => f.id)])];
const sheetProblems: string[] = [];
for (const fam of families) {
  const slug = fontSlug(fam);
  const sheet = join(fontsDir, `${slug}.css`);
  if (!existsSync(sheet)) { sheetProblems.push(`${fam}: no ${slug}.css`); continue; }
  const css = readFileSync(sheet, "utf8");
  if (!css.includes(`font-family: '${fam}';`)) sheetProblems.push(`${fam}: the stylesheet declares another family`);
  if (/https?:|\/\//.test(css.replace(/\/\*[\s\S]*?\*\//g, ""))) sheetProblems.push(`${fam}: an outside address`);
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  if (!urls.length) sheetProblems.push(`${fam}: no font files`);
  for (const u of urls) {
    const file = join(fontsDir, u);
    if (!u.startsWith(`${slug}/`) || !existsSync(file) || readFileSync(file).subarray(0, 4).toString("latin1") !== "wOF2") sheetProblems.push(`${fam}: ${u}`);
  }
  const ofl = join(fontsDir, slug, "OFL.txt");
  if (!existsSync(ofl) || !/SIL OPEN FONT LICENSE/i.test(readFileSync(ofl, "utf8"))) sheetProblems.push(`${fam}: no OFL.txt beside its files`);
}
t(`every family a document can use (${families.length}) is served by the portal: its stylesheet, its woff2 files, its licence`, sheetProblems.length === 0, sheetProblems.join("; "));
t("the brand pair carries Cyrillic (the documents are Bulgarian)", BRAND_FONTS.every((f) => /unicode-range: U\+0301, U\+0400-045F/.test(readFileSync(join(fontsDir, `${fontSlug(f)}.css`), "utf8"))));
const shell = wrapDoc("bg", "t", "<p>x</p>");
t("a document loads the brand pair's stylesheets from the portal, and nothing from outside", shell.includes('<link href="/fonts/pt-serif.css" rel="stylesheet">') && shell.includes('<link href="/fonts/sofia-sans-condensed.css" rel="stylesheet">') && !/<link[^>]+(https?:|\/\/)/.test(shell) && !/preconnect/.test(shell), shell.slice(0, 400));
const editorial = sanitizeSkinData({ name: "x", base: "editorial" }, "s2");
const editorialPreview = previewDocHtml(editorial, "bg");
t("a custom skin loads its own two families from the portal — the documents and the editor's preview alike", compileSkin(editorial).fonts.join() === "Playfair Display,EB Garamond"
  && editorialPreview.includes('<link href="/fonts/playfair-display.css" rel="stylesheet">') && editorialPreview.includes('<link href="/fonts/eb-garamond.css" rel="stylesheet">') && !/<link[^>]+(https?:|\/\/)/.test(editorialPreview));
const keptBefore = '<head>\n<meta charset="utf-8">\n<title>t</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
  + '<link href="https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&family=Sofia+Sans+Condensed:wght@400;600;700;800&display=swap" rel="stylesheet">\n<style>x</style>\n</head>';
const servedNow = localizeFontLinks(keptBefore);
t("a copy kept before the move is served with the portal's copies of the same families, nothing from Google", servedNow === '<head>\n<meta charset="utf-8">\n<title>t</title>\n<link href="/fonts/pt-serif.css" rel="stylesheet">\n<link href="/fonts/sofia-sans-condensed.css" rel="stylesheet">\n<style>x</style>\n</head>', servedNow);
t("…a copy kept since is served unchanged, and every kept copy is served through that", localizeFontLinks(shell) === shell && /new Response\(localizeFontLinks\(html\)/.test(readFileSync(join(portal, "src/lib/editions.ts"), "utf8")));
t("the proxy gate lets /fonts/ through — a lab's document and the PDF renderer load them with no owner session", /matcher: \["\/\(\(\?![^"]*\|fonts\/\|/.test(readFileSync(join(portal, "src/proxy.ts"), "utf8")));

// the translation: a document naming laboratories never goes out
const actions = readFileSync(join(portal, "src/lib/actions.ts"), "utf8");
t("the whole-document translation refuses a document naming laboratories — by its kind and by its content", /export async function translateDocHtmlAction\(html: string, docKey\?: string\)[\s\S]{0,200}isListDoc\(docKey\) \|\| pairsNamesWithCodes\(docKey\)[\s\S]{0,120}hasCohortNames\(/.test(actions));
t("…and the editor sends its kind, and greys the button out for those", /translateDocHtmlAction\(nb, docKey\)/.test(readFileSync(join(portal, "src/components/WordEditor.tsx"), "utf8")) && /disabled=\{busy === "tr" \|\| NAMES_DOCS\.has\(docKey\)\}/.test(readFileSync(join(portal, "src/components/WordEditor.tsx"), "utf8")));
t("the system check: the registry, where the server runs, and London is not the EU", /EXTERNAL_SERVICES\.map/.test(readFileSync(join(portal, "src/app/system/page.tsx"), "utf8")) && /\/\^\(fra\|cdg\|arn\|dub\)\\d\//.test(readFileSync(join(portal, "src/app/system/page.tsx"), "utf8")));

// the document for PTS names every one of them — checked where the documents are
// (on this computer; the code's repository and its CI do not hold them)
const doc = fileURLToPath(new URL("../../docs/participant-portal/PROCESSORS-BG.md", import.meta.url));
if (existsSync(doc)) {
  const d = readFileSync(doc, "utf8");
  t("PROCESSORS-BG.md (for M4 §7) names every service in the registry", EXTERNAL_SERVICES.every((s) => d.includes(s.name)), EXTERNAL_SERVICES.filter((s) => !d.includes(s.name)).map((s) => s.name).join());
} else console.log("note: docs/participant-portal is not here — the check of PROCESSORS-BG.md is skipped");

console.log(`processors.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
