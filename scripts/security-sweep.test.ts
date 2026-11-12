// The security sweep after Phase 10 (2026-11-11): four security reviews and four real-user agents.
// What each fix rests on, so it cannot quietly come undone. The behaviour itself is tested where it
// lives (names-guard, auth-links, sanitize-html, cert-register, proxy-paths, migrations, replay,
// public-limit); here, the wiring.
import { readFileSync } from "node:fs";
import { scrubIdentity } from "../src/lib/redact.ts";
import { sanitizeDocHtml } from "../src/lib/sanitize-html.ts";
import { otherSchemeNumbers } from "../src/lib/scheme-number.ts";
import { safeDest } from "../src/lib/auth-links.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const actions = src("lib/actions.ts");

// SA-1 / SC-1: no account id next to a code — written nowhere, redacted where it was
// (lines about an organisation itself — «entity:…», no code — may keep it: they are redacted on display)
const codedWithBy = actions.split("\n").filter((l) => /logAs\(|logActivity\(/.test(l) && /targetCode: (p|part!?|t\.part|own|meta)\b|\.\.\.meta/.test(l) && /\bby\b[:,} ]/.test(l) && /after: \{[^}]*\bby\b/.test(l));
t("SA-1: no journal line about a participation writes an account id in its after", codedWithBy.length === 0 && !/after: \{ \.\.\.\(meta\.after \?\? \{\}\), by \}/.test(actions) && !/targetCode: t\.part\.code, after: \{ by \}/.test(actions) && !/"participant\.applied_online", \{[^\n]*after: \{ by:/.test(actions), codedWithBy.join("\n").slice(0, 400));
t("SA-1: the journal page redacts per line by names.view", /authorize\(viewer, "names\.view", e\.schemeId \?\? undefined\) \? e : redactActivityForStaff\(e\)/.test(src("app/activity/page.tsx")));
t("SA-1: the redactor scrubs subject, before and after", /subject: staffLine \? e\.subject : scrubRef\(e\.subject\)/.test(src("lib/redact.ts")) && /after: staffLine \? e\.after : scrubIdentity\(e\.after\)/.test(src("lib/redact.ts")));
// SC-1: an organisation's e-mail words only to who sees names or manages the organisations
const notices = src("app/notices/page.tsx");
t("SC-1: «Изпратени имейли» shows a message's words only by code, names.view, or labs.manage (no scheme)", /const seesWords = \(m: \{ schemeId\?: string; code\?: string; kind: string \}\) => \(!!m\.code && !COURIER_NOTICE_KINDS\.has\(m\.kind\)\) \|\| seesAddress\(m\.schemeId\) \|\| \(!m\.schemeId && managesLabs\);/.test(notices) && /\{seesWords\(m\) \? \(/.test(notices));
// SC-3: the waybill
t("SC-3: no waybill in the coded export's shipments", !/coded\/shipments\.csv[^\n]*waybill/.test(src("lib/round-export.ts")) && /carrier: _c, waybill: _w/.test(src("lib/round-export.ts")));
// SC-5: the chain's size
t("SC-5: a laboratory's chain card gets its place only — never the chain's size", /position: \(\(p\) => \(p \? \{ position: p\.position \} : null\)\)\(positionOf\(chain, code\)\)/.test(src("lib/chain-view.ts")) && !/total/.test(src("components/DeviceChainCard.tsx")) && !/position\?\.total/.test(src("app/lab/page.tsx")) && !/position\?\.total/.test(src("app/lab/p/[id]/page.tsx")));
// SA-3: a session owing its 2FA or its new password reads nothing
t("SA-3: getViewer — nothing to a session owing its new password or (PTS) its second factor", /if \(ctx\.mustChangePassword \|\| \(REQUIRE_2FA && !ctx\.aal2 && ctx\.role !== "lab"\)\) return \{ email: ctx\.email, roles: NONE/.test(src("lib/access.ts")));
t("SA-3: the layout — no panel, no bell, no people for such a session", /const managesPeople = settled && \(await canManagePeople\(ctx\)\);/.test(src("app/layout.tsx")));
// SA-4: a lab administrator learns nothing of whose login an e-mail is
t("SA-4: a request to join refused by a login reason — one neutral answer to the lab, left for PTS", /if \("error" in j\) return JOIN_LOGIN_REFUSALS\.has\(j\.error\) \? \{ error: JOIN_HELD_FOR_PTS \} : j;/.test(actions));
// SD-1 / SI-6: the public forms counted in the database
t("SD-1: registration, application and password reset counted in the database, by the platform's address", /publicFormLimit\("registration", requestAddress\(h\)\)/.test(actions) && /publicFormLimit\("application", requestAddress\(h\)\)/.test(actions) && /publicFormLimit\("password_reset", requestAddress\(h\)\)/.test(src("lib/auth-actions.ts")) && /if \(limit === "all"\) redirect\("\/apply\/thanks\?later=1"\)/.test(actions) && /if \(limit === "all"\) return \{ message:/.test(src("lib/auth-actions.ts")) && !/allowSubmission/.test(actions) && !/h\.get\("x-forwarded-for"\)/.test(actions + src("lib/auth-actions.ts")));
// SI-1 / SI-5: what becomes a document
t("SI-1: a saved template is sanitized as a document is", /markCodedList\(docKey, sanitizeDocHtml\(String\(bg \?\? ""\)\)\)/.test(actions));
t("R2S-9: a run is sent as the text it shows (its references decoded), escaped once on the way back", /translateAction\(htmlRunText\(part\), "bg", "en"\)/.test(actions));
t("SI-5: a machine translation goes in as text, never markup", /String\(r\.text\)\.replace\(\/&\/g, "&amp;"\)\.replace\(\/<\/g, "&lt;"\)/.test(actions));
// SI-3: the PDF renderer
const pdf = src("app/api/pdf/route.ts");
t("SI-3: the PDF renderer — the document policy again, no other address fetched", /<meta http-equiv="Content-Security-Policy" content="\$\{policy\}">/.test(pdf) && /default-src 'none'/.test(pdf) && /if \(!imageUrlAllowed\(route\.request\(\)\.url\(\)\)\)/.test(pdf));
t("SI-2/3: a cover picture only from the portal's own places", /imageUrlAllowed\(coverRaw\)/.test(actions));
// UM-1, UM-2, UM-3, UM Q4
t("UM-1: «Създай проект» sends once", /if \(sent\.current\) \{ e\.preventDefault\(\); return; \}/.test(src("components/NewProjectDialog.tsx")) && /<PendingSubmit label=\{t\("np\.create"\)\}/.test(src("components/NewProjectDialog.tsx")));
t("UM-2: a save from a stale edit form is refused, said", /if \(seenRev !== null && Number\(seenRev\) !== \(current\.editRev \?\? 0\)\) \{ staleEdit = true; return \{\}; \}/.test(actions) && /editRev: \(current\.editRev \?\? 0\) \+ 1,/.test(actions) && /name="editRev" value=\{init\.editRev \?\? 0\}/.test(src("components/SchemeEditor.tsx")) && /err === "stale"/.test(src("app/schemes/[id]/edit/page.tsx")));
t("UM-3: an edition's refusals in both languages", [...actions.slice(actions.indexOf("const EDITION_REFUSAL"), actions.indexOf("};", actions.indexOf("const EDITION_REFUSAL"))).matchAll(/^\s+[\w"-]+: "([^"]*)",$/gm)].every((m) => / · /.test(m[1])));
t("UM Q4: a notice decided meanwhile — said", /redirect\(decision && !changed \? "\/notices\?refused=decided" : "\/notices"\)/.test(actions) && /data-notice-decided/.test(notices));
// UP-2 / UM-4: the portal's own «not found»
t("UP-2: the portal's own «not found», both languages, a way back", /data-not-found/.test(src("app/not-found.tsx")) && /Страницата не е намерена/.test(src("app/not-found.tsx")) && /Page not found/.test(src("app/not-found.tsx")));
// UP Q2: sign-in with no sign-in service
t("UP Q2: sign-in off or unconfigured — said, never the library's error page", /if \(!AUTH_ENABLED \|\| !process\.env\.NEXT_PUBLIC_SUPABASE_URL/.test(src("lib/auth-actions.ts")));

// UR-1: one of PTS without a right — a page that says so; no write control offered
t("UR-1: a gate refuses one of PTS to «/denied», never the sign-in page", /if \(!ok\(await getViewer\(\)\)\) redirect\(ctx\.role === "lab" \? "\/login\?denied=1" : "\/denied"\);/.test(src("lib/access.ts")) && /Нямате право на това/.test(src("app/denied/page.tsx")));
t("UR-1: the editor read-only, the documents' upload, the items and the skins — by the right", /readOnly: !\(await mayNow\("scheme\.edit", id\)\)/.test(src("app/schemes/[id]/edit/page.tsx")) && /\{init\.readOnly/.test(src("components/SchemeEditor.tsx")) && /canWrite=\{await mayNow\("scheme\.edit", id\)\}/.test(src("app/schemes/[id]/page.tsx")) && /canEdit=\{await mayAnywhereNow\("library\.manage"\)\}/.test(src("app/items/page.tsx")) && /const canManage = await mayAnywhereNow\("library\.manage"\);/.test(src("app/skins/page.tsx")));
// UR-2: a notice's kind in words
t("UR-2: a notice's kind in words on «Известия» — the kind kept as data-kind only", !/· \{(n|m)\.kind\}/.test(notices) && /noticeKindText\(n\.kind/.test(notices) && /noticeKindText\(m\.kind/.test(notices));

// the laboratory's journey (UL-1 … UL-7, Q5) and the document policy (SI-2)
const cfg = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
t("UL-1: the proxy buffers a body as large as the uploads it promises", /proxyClientMaxBodySize: "16mb"/.test(cfg) && /serverActions: \{ bodySizeLimit: "16mb" \}/.test(cfg));
t("SI-2: the baseline policy leaves out every route that serves an edition with its own", /\(\?!lab\/doc\/\|apply\/\[\^\/\]\+\/\(\?:plan\|invitation\)\$\|schemes\/\[\^\/\]\+\/\(\?:released\/\|editions\/\[\^\/\]\+\$\)\)/.test(cfg));
// …compiled as Next compiles a header's source, for the paths it serves
{
  const { pathToRegexp } = (await import("node:module")).createRequire(import.meta.url)("next/dist/compiled/path-to-regexp");
  const sources = [...cfg.matchAll(/source: "([^"]+)",\s*headers: \[\s*\{\s*key: "Content-Security-Policy"/g)].map((m) => m[1]);
  t("one baseline policy", sources.length === 1, String(sources.length));
  const re = pathToRegexp(sources[0] ?? "/", [], { strict: true, sensitive: false, delimiter: "/" });
  const baseline = (path: string) => re.test(path);
  for (const p of ["/lab/doc/26-11-T-1/plan", "/apply/26-11-T-1/plan", "/apply/26-11-T-1/invitation", "/schemes/26-11-T-1/released/plan", "/schemes/26-11-T-1/editions/3711033a-0000-4000-8000-000000000000", "/schemes/26-11-T-1/build/plan/print", "/schemes/26-11-T-1/fill/plan"]) t(`no baseline over ${p}`, !baseline(p));
  for (const p of ["/", "/dashboard", "/lab", "/lab/p/1", "/apply", "/apply/26-11-T-1", "/schemes/26-11-T-1", "/schemes/26-11-T-1/editions", "/catalogue", "/certificate"]) t(`the baseline over ${p}`, baseline(p));
}
t("UL-2: what was typed and not sent is saved as the results form goes", /if \(pending && !stopped\.current\) void saveNow\.current\(\);/.test(src("components/useDraftSaver.ts")));
t("UL-3: the receipt's day never before its dispatch", /min=\{awaitingDay\}/.test(src("app/lab/p/[id]/page.tsx")));
t("UL-4: a file keeps its own name (filename*)", /filename\*=UTF-8''\$\{utf8Name\(name\)\}/.test(src("lib/scheme-uploads.ts")));
t("UL-5: the participant's tabs wrap on a phone", /data-participant-nav/.test(src("components/ParticipantNav.tsx")) && /flexWrap: "wrap", minWidth: 0/.test(src("components/ParticipantNav.tsx")));
t("UL-6: the laboratory account's ЕИК and phone checked", /if \(!eik\.ok\) redirect\("\/lab\/profile\?err=eik"\);/.test(actions) && /redirect\("\/lab\/profile\?err=phone"\)/.test(actions) && /data-profile-error/.test(src("app/lab/profile/page.tsx")));
t("UL-7: a submission's hour with EET/EEST, never the browser's zone words", ["components/SubmitPanel.tsx", "components/ResultsRecord.tsx"].every((f) => /sofiaZoneAt\(Date\.parse\(iso\)\)/.test(src(f)) && !/timeZoneName: "short"/.test(src(f))));
t("UL Q5: a scheme every laboratory applied to — «Заявено» on the list", /data-apply-done-already/.test(src("app/lab/apply/page.tsx")));

// round 2 — the second security review's findings (R2S-*)
t("R2S-1: the shell's markers out before the body is sanitized; never removed from what it passed", /sanitizeDocHtml\(stripBodyMarkers\(/.test(src("lib/doc-template.ts")) && /String\(html\)\.replace\(BODY_MARKS, ""\)/.test(src("lib/sanitize-html.ts")));
t("R2S-1: every document route's own policy refuses forms and <base>", ["app/schemes/[id]/doc/[doc]/print/route.ts", "app/schemes/[id]/build/[doc]/print/route.ts", "app/lab/doc/[scheme]/[doc]/route.ts", "lib/editions.ts"].every((f) => /form-action 'none'; base-uri 'none'/.test(src(f))));
t("R2S-3: a courier's notice — read, released and exported only with names", /COURIER_NOTICE_KINDS\.has\(notice\.kind\) && !\(await mayNow\("names\.view", notice\.schemeId\)\)\) redirect\("\/notices\?refused=names"\)/.test(actions) && /const seesHeld = /.test(notices) && /x\.kind === "items\.dispatched" \? \{ \.\.\.x, \.\.\.Object\.fromEntries\(keys\.map\(\(k\) => \[k, DISPATCH_WORDS\]\)\) \}/.test(src("lib/round-export.ts")));
t("R2S-3: a typed dispatch's waybill never in the journal's words", /summary: `Timeline: \$\{kind\} for \$\{code\}\$\{ref && !courierRef \? ` \(\$\{ref\}\)` : ""\}`/.test(actions));
t("R2S-10: a document is never fetched as a picture or a script", /if \(NOT_A_DOCUMENT\.has\(\(req\.headers\.get\("sec-fetch-dest"\) \?\? ""\)\.toLowerCase\(\)\)\) return new Response\(null, \{ status: 403 \}\);/.test(src("app/lab/doc/[scheme]/[doc]/route.ts")) && /BRAND_FILE\.test\(coverRaw\) \|\| imageUrlAllowed\(coverRaw\)/.test(actions));

// round 2 — the second real-user pass (R2U-*)
t("R2U-1: brought back by «Back», the results form takes up its own latest save", /const mine = ownSaved\.get\(key\);/.test(src("components/useDraftSaver.ts")) && /ownSaved\.set\(key, \{ rev: r\.rev/.test(src("components/useDraftSaver.ts")) && /edits\.current > 0\) return;/.test(src("components/useDraftSaver.ts")));
t("R2U-2: the scheme page's dates, file menu and the builder's start — by the right", /canEdit=\{await mayNow\("scheme\.edit", id\)\} \/>/.test(src("app/schemes/[id]/page.tsx")) && /canSend=\{await mayNow\("docs\.release", id\)\}/.test(src("app/schemes/[id]/page.tsx")) && /\{canWrite && <button style=\{menuItem\} onClick=\{\(\) => pickFile\(d\.key\)\}>⟳/.test(src("components/SchemeDocuments.tsx")) && /const canEdit = await mayNow\("scheme\.edit", s\.id\);[\s\S]*canEdit=\{canEdit\}/.test(src("app/schemes/[id]/build/[doc]/page.tsx")) && /<fieldset disabled=\{!!init\.readOnly\}/.test(src("components/SchemeEditor.tsx")));
t("R2U-3: a file larger than the portal takes is refused before sending", /maxBytes=\{15_000_000\}/.test(src("app/lab/p/[id]/page.tsx")) && /maxBytes=\{15_000_000\}/.test(src("app/lab/page.tsx")) && /f\.size > 5_000_000/.test(src("components/RegisterForm.tsx")));
t("R2U-4: the receiver's name at least two letters, in the browser too", /name="receivedBy" required minLength=\{2\}/.test(src("app/lab/p/[id]/page.tsx")));
{
  // round 6 (R6UL-5): the browser's check passes what the server takes — spaces round it, a label, «BG-»
  const pats = [...src("app/lab/profile/page.tsx").matchAll(/pattern: ("(?:[^"\\]|\\.)*")/g)].map((m) => new RegExp(`^(?:${JSON.parse(m[1])})$`, "v"));
  const [phoneP, eikP] = pats;
  t("R2U-5: the lab profile's ЕИК and phone checked before sending (round 6: as the server reads them)", pats.length === 2
    && [" 175074752", "175074752 ", "ЕИК: 175074752", "EIK 175074752", "BG-175074752", "BG  175074752", "HRB 12345", "1750747520001"].every((v) => eikP.test(v))
    && ["123", "abc", "BG-12", "<b>"].every((v) => !eikP.test(v))
    && ["0888 123 456 вътр. 12 ", "+359 2 123 4567"].every((v) => phoneP.test(v)) && !phoneP.test("123"));
  t("R6UL-5: the server reads the ЕИК without its label", /const LBL = "\(\?:ЕИК\|EIK\|UIC\|БУЛСТАТ\)";/.test(actions) && /\.replace\(new RegExp\(`\^\$\{LBL\}/.test(actions));
}
t("R2U-6: a register's ceiling said in its own words", /REGISTER_TEXT\[r\.why === "code" \? "limitedCode"/.test(actions));
t("R2U-7: the staff side's downloads keep their names", ["app/schemes/[id]/uploaded/[doc]/route.ts", "app/users/declarations/[id]/route.ts"].every((f) => /filename\*=UTF-8''\$\{utf8Name\(/.test(src(f))));

// round 3 (after dcaa376)
const proxySrc = src("proxy.ts");
t("R3S-2: a page fetched as a picture/script/style is refused in the proxy, before the auth switch",
  /const NOT_A_PAGE = new Set\(\["image", "script", "style"/.test(proxySrc) && proxySrc.indexOf("NOT_A_PAGE.has(") < proxySrc.indexOf("if (!AUTH_ENABLED)") && /status: 403/.test(proxySrc));
t("R3S-3: a document's and a template's size checked before they are sanitized",
  (() => { const save = actions.slice(actions.indexOf("export async function saveDocHtmlAction")); const tpl = actions.slice(actions.indexOf("bg: markCodedList(docKey, sanitizeDocHtml(String(bg") - 600, actions.indexOf("bg: markCodedList(docKey, sanitizeDocHtml(String(bg"));
    return save.indexOf("docHtmlTooLarge(bg, en)") >= 0 && save.indexOf("docHtmlTooLarge(bg, en)") < save.indexOf("sanitizeDocHtml(bg)") && /docHtmlTooLarge\(bg, en\)/.test(tpl); })());
t("R3S-4: the dispatch line's words never carry the waybill", !/`, waybill \$\{fields\.waybill\}`/.test(actions) && /fields\.waybill \? ", with a waybill" : ""/.test(actions));
t("Q3: the per-number ceiling in its own words", /r\.why === "number" \? "limitedNumber"/.test(actions) && /limitedNumber: \{ bg:/.test(src("lib/cert-register-model.ts")));
t("Q4: a read-only role sees the document as it prints, not the editor — the SAVED one (round 4, R4U-2)", /if \(!canEdit\) \{[\s\S]{0,240}?<div data-doc-read-only/.test(src("components/WordEditor.tsx")) && /const roPrint = `\/schemes\/\$\{encodeURIComponent\(schemeId\)\}\/build\/\$\{encodeURIComponent\(docKey\)\}\/print/.test(src("components/WordEditor.tsx")) && !/\/doc\/\$\{encodeURIComponent\(docKey\)\}\/print/.test(src("components/WordEditor.tsx")));
{
  const m54 = readFileSync(new URL("../supabase/migrations/0054_certificate_register.sql", import.meta.url), "utf8");
  const m55 = readFileSync(new URL("../supabase/migrations/0055_security_sweep.sql", import.meta.url), "utf8");
  t("Q1: 0054 drops the earlier forms of register_try/register_refund before making them",
    m54.indexOf("drop function if exists public.register_try(text, text, text, text, text);") >= 0 && m54.indexOf("drop function if exists public.register_try(text, text, text);") >= 0 && m54.indexOf("drop function if exists public.register_try(text, text, text, text, text);") < m54.indexOf("create or replace function public.register_try("));
  t("Q1: 0055 drops public_form_try's first form before making it", m55.indexOf("drop function if exists public.public_form_try(text, text, text, integer, integer);") >= 0 && m55.indexOf("drop function if exists public.public_form_try(") < m55.indexOf("create or replace function public.public_form_try("));
}
// R3S-7: every «pattern» in a form compiles as the browser compiles it (the «v» flag) — an invalid one is
// silently ignored, and the field checks nothing
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(f) ? [p] : []; });
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("../src", import.meta.url));
  const pats: [string, string][] = [];
  for (const f of walk(root)) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/\bpattern="([^"]*)"/g)) pats.push([f.slice(root.length), m[1]]); // JSX: as written
    for (const m of text.matchAll(/\bpattern: "((?:[^"\\]|\\.)*)"/g)) pats.push([f.slice(root.length), JSON.parse(`"${m[1]}"`)]);
  }
  t("R3S-7: form patterns found", pats.length >= 5, String(pats.length));
  for (const [f, p] of pats) {
    let okv = true; try { new RegExp(`^(?:${p})$`, "v"); } catch { okv = false; }
    t(`R3S-7: ${f} — «${p.slice(0, 40)}» is a valid pattern`, okv);
  }
}
{
  const { utf8Name } = await import("../src/lib/scheme-uploads.ts");
  let threw = false, out = "";
  try { out = utf8Name("a".repeat(149) + "😀.pdf") + utf8Name("😀".repeat(80) + ".pdf") + utf8Name("x\ud800y"); } catch { threw = true; }
  t("R3S-6: a download's name cut at 150 characters never halves one (no URIError, no 500)", !threw && !out.includes("%ED%A0"), out.slice(0, 80));
  t("R4U-6: …and keeps its extension", decodeURIComponent(utf8Name("П".repeat(160) + "🧪.pdf")).endsWith("🧪.pdf") === false && decodeURIComponent(utf8Name("П".repeat(160) + "🧪.pdf")).endsWith(".pdf") && [...decodeURIComponent(utf8Name("П".repeat(160) + "🧪.pdf"))].length === 150);
}

// overnight 2026-11-12: the build print route (now the read-only roles' view) gives a document that shows
// identities — the lists AND the certificate — no saved body without names.view, as the build page does
t("a saved certificate or list body never reaches a role without names.view through the print route",
  /if \(\(isList \|\| showsIdentities\(doc\)\) && !reveal\) saved = "";/.test(src("app/schemes/[id]/build/[doc]/print/route.ts"))
  && /\(isList \|\| showsIdentities\(doc\)\) && !reveal \? \{ bg: "", en: "" \}/.test(src("app/schemes/[id]/build/[doc]/page.tsx"))
  // round 5 (R5SA-1): …and the Fill view
  && /\(isListDoc\(doc\) \|\| showsIdentities\(doc\)\) && !reveal \? "" : savedDocBody/.test(src("app/schemes/[id]/fill/[doc]/route.ts")));

// ── round 5 (2026-11-12) ────────────────────────────────────────────────────────────────────────
{
  const proxySrc5 = src("proxy.ts");
  t("R5SB-3: a page that acts when opened, opened from another site — a page to confirm, or refused",
    /import \{ ACTS_WHEN_OPENED \} from "\.\/lib\/acts-when-opened";/.test(proxySrc5) && /if \(foreign === "navigate"\) return confirmOpening\(request\);/.test(proxySrc5) && /if \(foreign === "other"\) return new NextResponse\(null, \{ status: 403 \}\);/.test(proxySrc5));
  const { ACTS_WHEN_OPENED: acts } = await import("../src/lib/acts-when-opened.ts");
  t("R5SB-3: …the exports, the audit pack, prints, files and lab documents — not the pages a link in an e-mail opens",
    ["/schemes/S/export", "/schemes/S/export/analysis", "/schemes/S/audit-pack", "/invoices/export", "/lab/doc/S/plan", "/lab/labdoc/S/proforma", "/schemes/S/build/plan/print", "/schemes/S/fill/feedback", "/registrations/letter/x"].every((p) => acts.test(p))
    && ["/lab", "/lab/p/1", "/schemes/S", "/notices", "/dashboard"].every((p) => !acts.test(p)));
  t("Q1: a request from the browser's own controls (Sec-Fetch-Site: none) is a person's own", /sec-fetch-site"\) \?\? ""\)\.toLowerCase\(\) === "none"\) return false;/.test(proxySrc5));
  t("R5SB-4: the session's cookies unreadable by script, in the server and the proxy",
    /httpOnly: true/.test(src("lib/session-cookie.ts")) && /cookieOptions: SESSION_COOKIE/.test(src("lib/auth.ts")) && /cookieOptions: SESSION_COOKIE/.test(proxySrc5) && !/from "\.\/lib\/auth"/.test(proxySrc5));
  const authA = src("lib/auth-actions.ts");
  t("R5SB-1: sign-in, the 6-digit code and the current password counted by the portal itself",
    /if \(!\(await signInAllowed\(email\)\)\) return \{ error: TOO_MANY_SIGN_IN \};/.test(authA) && (authA.match(/await codeAllowed\(/g) ?? []).length >= 3 && /attemptLimit\("password_check"/.test(authA));
  t("R5SB-7: no authenticator enrolled by a session that owes its second factor", (authA.match(/if \(session\.needsAal2\) return \{ error: authErrorText\("insufficient_aal"\) \};/g) ?? []).length >= 2);
  t("R5SB-2: the development server only on this machine", /"dev": "next dev -H 127\.0\.0\.1"/.test(readFileSync(new URL("../package.json", import.meta.url), "utf8")));
  t("R5SB-6: new functions, tables and sequences never granted to the browser's roles (0018)",
    ["tables", "sequences"].every((k) => new RegExp(`alter default privileges in schema public revoke all on ${k} from anon, authenticated;`).test(readFileSync(new URL("../supabase/migrations/0018_app_migrations.sql", import.meta.url), "utf8")))
    && /alter default privileges in schema public revoke execute on functions from anon, authenticated;/.test(readFileSync(new URL("../supabase/migrations/0018_app_migrations.sql", import.meta.url), "utf8")));
  t("Q4: a notice of no scheme is seen and released by who releases documents and manages the organisations",
    /: \(await mayAnywhereNow\("docs\.release"\)\) && \(await mayAnywhereNow\("labs\.manage"\)\);/.test(actions) && /\(!n\.schemeId && managesLabs\)/.test(src("app/notices/page.tsx")));
  t("R5SA-7/13: a document saved only under a key the portal knows, its bodies text only", /if \(!isDocKey\(docKey\)\) return \{ error: "Непознат документ\. · Unknown document\." \};\n  const bodies = bodiesOf\(body, enArg\);/.test(actions));
  t("R5UA-1: a document carrying another scheme's number is not sent", /otherSchemeNumbers\(now\.bg, scheme\.number\)/.test(actions));
  t("R5UA-5: the analysis import and the transfer check sent once", /<OnceForm action=\{importAnalysisAction\}/.test(src("components/AnalysisImportForm.tsx")) && /<OnceForm action=\{recordTransferCheckAction\}/.test(src("components/ProcessingRecordCard.tsx")));
  t("R5UA-9: read-only roles are offered no «Създай», no «Добави стъпка», no write control in the scheme's card",
    /canWrite \? <Link className="btn btn-primary" style=\{btnSm\} href=\{d\.buildHref\}>/.test(src("components/SchemeDocuments.tsx")) && /\{canAddStep && \(<>/.test(src("app/schemes/[id]/participants/[code]/page.tsx")) && /\[data-scheme-read-only\] \[data-write\]\{display:none!important\}/.test(src("components/SchemeEditor.tsx")));
  t("R5SA-4: the read-only view's frame is sandboxed", /sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"/.test(src("components/WordEditor.tsx")));
  t("Q2: the PDF's internal token only to the portal's own origin", /ownOrigins\.includes\(asked\) \? asked : ownOrigins\[0\]/.test(src("app/api/pdf/route.ts")));
  const we5 = src("components/WordEditor.tsx");
  t("R5UA-2: a link inside the portal, unsaved words — saved first, then followed", /document\.addEventListener\("click", onClick, true\)/.test(we5) && /void saveNow\.current\(\)\.then\(\(ok\) => \{\n\s*if \(ok\) return go\(\);/.test(we5) && /const go = \(\) => router\.push\(/.test(we5));
  t("R5UA-3: a document saved over a newer one is refused, said", /if \(loaded !== null && loaded !== kept\) \{ stale = true; return \{\}; \}/.test(actions) && /if \(stale\) return \{ error: DOC_STALE, stale: true \};/.test(actions) && /rev: revRef\.current/.test(we5) && /initialRev=\{s\.docs\?\.\[doc\]\?\.rev \?\? 0\}/.test(src("app/schemes/[id]/build/[doc]/page.tsx")));
  t("R5UB-1: a form the page's scripts send is held until they are live — never the browser's own GET",
    /<script id="pts-hold-early-submit" dangerouslySetInnerHTML=\{\{ __html: PRE_HYDRATION_GUARD \}\} \/>/.test(src("app/layout.tsx")) && /!f\.hasAttribute\("action"\)&&!f\.hasAttribute\("method"\)\)\{e\.preventDefault\(\)/.test(src("app/layout.tsx")) && /setAttribute\("data-hydrated", ""\)/.test(src("components/Hydrated.tsx")));
  t("R5UB-2: a register number that is no text never throws", /typeof input\.number === "string" \? input\.number : ""/.test(src("lib/cert-register.ts")));
  t("R5UB-3: «received» only for the organisation's own participation, its code from the server", /const ownThere = doneScheme \? mine\.filter/.test(src("app/lab/apply/page.tsx")) && !/sp\.code &&/.test(src("app/lab/apply/page.tsx")));
  t("R5UB-4: a results form past its deadline says so and shuts", ["components/ResultsForm.tsx", "components/CalibrationResultsForm.tsx"].every((f) => /const editable = editableProp && !closedNow;/.test(src(f)) && /data-results-closed-now/.test(src(f))));
  const { otherSchemeNumbers } = await import("../src/lib/scheme-number.ts");
  t("R5UA-1: another scheme's number found; this scheme's own (any spelling) not",
    JSON.stringify(otherSchemeNumbers(`<p>№ PTS 26/11-T-15</p><p>PTS 26/11-T-16 · ПTC 26/11-Т-16</p>`, "PTS 26/11-T-16")) === JSON.stringify(["PTS 26/11-T-15"]));
  const { datesOutOfOrder } = await import("../src/lib/scheme-dates.ts");
  t("R5UA-4: dates out of order found; in order (or the same day) fine",
    JSON.stringify(datesOutOfOrder({ dispatch: "2026-12-12", resultsDue: "2026-11-22" })) === JSON.stringify(["dispatch", "resultsDue"]) && datesOutOfOrder({ applicationsDue: "2026-11-01", dispatch: "2026-11-01T10:00", resultsDue: "2026-12-01", reportDue: "2027-01-10" }) === null);
  const { fitFileName } = await import("../src/lib/scheme-uploads.ts");
  t("R4U-6: a long name kept with its extension, never cut inside a character", fitFileName("П".repeat(200) + "🧪.pdf").endsWith(".pdf") && [...fitFileName("П".repeat(200) + "🧪.pdf")].length === 160 && fitFileName("кратко.pdf") === "кратко.pdf");
  const { imageUrlAllowed, docImgSrc } = await import("../src/lib/image-hosts.ts");
  t("R5SA-8: a picture from the website, never a page of the portal's own address (portal.ptsbg.eu: /brand/ only)",
    imageUrlAllowed("https://ptsbg.eu/x.jpg", {}) && imageUrlAllowed("https://www.ptsbg.eu/x.jpg", {}) && !imageUrlAllowed("https://portal.ptsbg.eu/schemes/S/export", {}) && imageUrlAllowed("https://portal.ptsbg.eu/brand/logo.png", {}) && !imageUrlAllowed("https://cdn.ptsbg.eu/x.png", {}) && !/\*\.ptsbg/.test(docImgSrc({})));
  const { catalogueRows, isSimulation } = await import("../src/lib/catalogue-model.ts");
  const rows = catalogueRows([{ id: "SIM-26-11-T-1", number: "SIM 26/11-T-1", status: "running" }, { id: "26-11-T-1", number: "PTS 26/11-T-1", status: "running" }] as never, () => Date.now(), () => false);
  t("R5UA-7: a simulation is never in the catalogue", isSimulation("SIM 26/11-T-1") && !isSimulation("PTS 26/11-T-1") && !JSON.stringify(rows).includes("SIM 26/11-T-1"));
  const { attemptLimit } = await import("../src/lib/public-limit.ts");
  // round 6 (R6S-3): one address on one account stops at 15; the account itself only at 200 — a stranger
  // guessing can no longer shut the real user out for the hour
  let n = 0; for (let i = 0; i < 25; i++) if ((await attemptLimit("sign_in_pair", "account-made.up@example.invalid-at-192.0.2.1")) === "ok") n++;
  t("R5SB-1/R6S-3: one address's sign-in attempts on one account stop at 15 an hour", n === 15, String(n));
  let m = 0; for (let i = 0; i < 205; i++) if ((await attemptLimit("sign_in_account", "account-made.up@example.invalid")) === "ok") m++;
  t("R6S-3: the account's own ceiling is far above one address's", m === 200, String(m));
  t("R6S-3: sign-in counts the address, the address on the account, and the account", /attemptLimit\("sign_in_pair", `account-\$\{[^}]+\}-at-\$\{[^}]+\}`\)/.test(authA) || /sign_in_pair/.test(authA));
}

// ── round 6 (2026-11-12) ────────────────────────────────────────────────────────────────────────
{
  // R6S-1 / R6UL-1: the guard always holds the browser's own GET of a form the page's scripts send — it
  // stopped once <html> said «hydrated», while a form rendered later still had no handler on it
  const layout = src("app/layout.tsx");
  const guard = layout.match(/const PRE_HYDRATION_GUARD = `([^`]+)`;/)![1];
  const listeners: Record<string, (e: unknown) => void> = {}; let alerts = 0; let hydrated = false;
  const fakeDoc = { addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; }, documentElement: { hasAttribute: () => hydrated } };
  new Function("document", "alert", guard)(fakeDoc, () => { alerts++; });
  const listener = listeners.submit;
  const form = (attrs: Record<string, string>, live = false) => ({ tagName: "FORM", hasAttribute: (a: string) => a in attrs, getAttribute: (a: string) => attrs[a] ?? null, ...(live ? { __reactProps$x: {} } : {}) });
  const send = (f: unknown) => { let prevented = false; listener({ target: f, preventDefault: () => { prevented = true; } }); return prevented; };
  const before = send(form({})); hydrated = true; const after = send(form({})); const liveOne = send(form({}, true));
  const postA = form({ method: "post", action: "/x" }); hydrated = false; const p1 = send(postA), p2 = send(postA);
  t("R6S-1: a script-handled form never goes out as the browser's GET — before and after <html> says hydrated", before && after && liveOne && alerts === 1);
  t("R6S-1: a plain POST form before the scripts: the first press goes, the second is held", !p1 && p2);
  // R7UL-2: nothing typed, chosen or ticked in a form whose script is not live — held (React would never take it)
  const field = (f: unknown, tag = "INPUT", type = "text") => ({ tagName: tag, closest: (sel: string) => (sel === "form" ? f : (tag === "SELECT" && /select/.test(sel)) || (tag === "INPUT" && sel.includes(`type=${type}`)) ? {} : null), matches: (sel: string) => (tag === "SELECT" && /select/.test(sel)) || (tag === "INPUT" && sel.includes(`type=${type}`)) });
  const fire = (type: string, target: unknown, key?: string) => { let prevented = false; listeners[type]({ target, key, preventDefault: () => { prevented = true; } }); return prevented; };
  const idle = form({ "data-live-only": "" }), ready = form({ "data-live-only": "" }, true), liveOnly = form({ action: "", method: "post", "data-live-only": "" }), native = form({ action: "/x", method: "post" }), plain = form({});
  t("R7UL-2: typing in a «data-live-only» form held until it is live; then taken", fire("beforeinput", field(idle)) && !fire("beforeinput", field(ready)) && fire("beforeinput", field(liveOnly)));
  t("R7UL-2 (gates): a form that reads its fields when sent — script-handled or native — takes typing early", !fire("beforeinput", field(plain)) && !fire("beforeinput", field(native)) && !fire("mousedown", field(plain, "SELECT")));
  t("R7UL-2: the results forms and the registration are «data-live-only»", /data-results-form=\{participantId\} data-live-only/.test(src("components/ResultsForm.tsx")) && /data-results-kind="C" data-live-only/.test(src("components/CalibrationResultsForm.tsx")) && /data-register-form data-live-only/.test(src("components/RegisterForm.tsx")));
  t("R7UL-2: a select, a checkbox (click and Space) held until live; Tab never", fire("mousedown", field(idle, "SELECT")) && fire("click", field(idle, "INPUT", "checkbox")) && fire("keydown", field(idle, "INPUT", "checkbox"), " ") && !fire("keydown", field(idle, "INPUT", "checkbox"), "Tab") && !fire("click", field(ready, "INPUT", "checkbox")));
  t("R7 verification: a date or time field held by its keys and its picker until live (no «beforeinput» there)", fire("keydown", field(idle, "INPUT", "date"), "1") && fire("mousedown", field(idle, "INPUT", "date")) && fire("keydown", field(idle, "INPUT", "time"), "1") && !fire("keydown", field(ready, "INPUT", "date"), "1") && !fire("keydown", field(idle, "INPUT", "date"), "Tab"));
  t("R7UL-6: with scripts off, a script-handled form is not shown, said", /<noscript>\s*<style>\{"form:not\(\[action\]\):not\(\[method\]\),form\[data-live-only\]\{display:none!important\}"\}<\/style>/.test(layout) && /data-register-form data-live-only/.test(src("components/RegisterForm.tsx")));
  // R6S-2: the waybill in the words people write
  const masked = ["товарителница № 1234567890", "Speedy 6200 1234 5678", "AWB: 123-45678901", "waybill no. 12345678", "tracking number is ABC12345", "пратка с номер 1234567", "Еконт 1051234567 и 1051234568"].map((x) => String(scrubIdentity(x)));
  t("R6S-2: a waybill masked however it is written", masked.every((x) => x.endsWith("•••") && !/\d{4}/.test(x)), masked.join(" | "));
  t("R6S-2: …and an ordinary line about a round left as it is", scrubIdentity("Схема PTS 26/11-T-1, проба 3, 2026-11-12, 12.5 mg/L") === "Схема PTS 26/11-T-1, проба 3, 2026-11-12, 12.5 mg/L");
  // R6S-4: a hidden field stays hidden (it became a stray text box in the Fill views)
  t("R6S-4: an <input type=hidden> keeps its type; a file input loses it", sanitizeDocHtml('<input type="hidden" name="x" value="1">') === '<input type="hidden" name="x" value="1">' && !/file/.test(sanitizeDocHtml('<input type="file" name="f">')));
  // R6S-7: nothing pinned over the page through a variable, nor a link stretched over it
  t("R6S-7: position through var() or a custom property is dropped", sanitizeDocHtml('<div style="position:var(--p);color:red">a</div>') === '<div style="color:red">a</div>' && !/position|fixed/.test(sanitizeDocHtml('<div style="--x:fixed;position:var(--x)">a</div>')));
  t("R6S-7: absolute inside a link is dropped; outside one it stays", !/position/.test(sanitizeDocHtml('<a href="https://ptsbg.eu"><span style="position:absolute;top:0;left:0;width:100vw">x</span></a>')) && /position:absolute/.test(sanitizeDocHtml('<span style="position:absolute;top:0">x</span>')));
  // R6S-8: only the keyword itself opens a new tab without its opener
  t("R6S-8: target=« _blank» (a named window that keeps the opener) is dropped; «_blank» kept", !/target/.test(sanitizeDocHtml('<a href="https://ptsbg.eu" target=" _blank">a</a>')) && /target="_blank"/.test(sanitizeDocHtml('<a href="https://ptsbg.eu" target="_blank">a</a>')));
  // R6S-11: another round's number found however the editor spelled it
  const others = otherSchemeNumbers("<p>PTS 26/<b></b>11-T-2 and PTS&nbsp;26/11&#8209;T&#x2D;3 and PTS 26/11-T-1</p>", "PTS 26/11-T-1");
  t("R6S-11: another round's number through tags and entities", others.length === 2, JSON.stringify(others));
  // R6S-5: the pages that show names, opened from another site, ask first; staff never land on one after sign-in
  const { ACTS_WHEN_OPENED: acts } = await import("../src/lib/acts-when-opened.ts");
  t("R6S-5: deliveries, declarations, proofs, participants, results, traceability act when opened", ["/deliveries", "/users/declarations/x", "/users/applications/x", "/organizations/proof/x", "/schemes/S/participants", "/schemes/S/results", "/schemes/S/traceability"].every((x) => acts.test(x)));
  t("R6S-5: after sign-in a PTS account goes home, not to such a page; a laboratory still to its document", safeDest("internal", "/schemes/S/export") === "/open?to=%2Fschemes%2FS%2Fexport" && safeDest("internal", "/deliveries?x=1") === "/open?to=%2Fdeliveries%3Fx%3D1" && safeDest("internal", "/schemes/S") === "/schemes/S" && safeDest("lab", "/lab/doc/S/plan") === "/lab/doc/S/plan");
  // R6S-6: the PDF maker takes JSON from the portal's own pages only
  const pdf = src("app/api/pdf/route.ts");
  t("R6S-6: /api/pdf refuses another site and anything but JSON", /if \(site === "cross-site" \|\| site === "same-site"\) return new Response\("Forbidden", \{ status: 403 \}\);/.test(pdf) && /if \(!\/\^application\\\/json\\b\/i\.test/.test(pdf));
  // R6S-10: a corrected file is sent at once after the page answered
  t("R6S-10: OnceForm lets a send through once the page came back on another address", /if \(sent\.current && window\.location\.href !== sentAt\.current\) sent\.current = 0;/.test(src("components/OnceForm.tsx")));
  // R6UL-3: a submission refused as closed shuts the form, as a refused save does
  t("R6UL-3: «closed» from the submission shuts both results forms", /if \(r\.error === "closed"\) \{ setStage\("idle"\); onClosed\?\.\(\); return; \}/.test(src("components/SubmitPanel.tsx"))
    && ["components/ResultsForm.tsx", "components/CalibrationResultsForm.tsx"].every((f) => /onClosed=\{\(\) => setRefusedClosed\(true\)\}/.test(src(f)) && /const closedNow = refusedClosed \|\|/.test(src(f))));
  // R6UL-4: an application on the waiting list is «получена», never «приета»
  t("R6UL Q5: a simulation is no public apply page, no download, no application — online or by a laboratory",
    /isSimulation\(s\.number\)\) notFound\(\);/.test(src("app/apply/[id]/page.tsx")) && ["plan", "invitation"].every((r) => /!isStarted\(s\) \|\| isSimulation\(s\.number\) \|\|/.test(src(`app/apply/[id]/${r}/route.ts`)))
    && /if \(!scheme \|\| isSimulation\(scheme\.number\) \|\| scheme\.status !== "open"/.test(actions) && /\|\| isSimulation\(scheme\.number\)\) return say\("not-open"\);/.test(actions) && /&& !isSimulation\(s\.number\)\)/.test(src("app/lab/apply/page.tsx")));
  t("R6UL-4: the apply banner says waiting list when the participation waits", /const doneWaiting = !!newest && waitingThere\.has\(newest\.id\);/.test(src("app/lab/apply/page.tsx")) && /списъка на чакащите/.test(src("app/lab/apply/page.tsx")));
}

// ── round 6, the PTS side (users) ──────────────────────────────────────────────────────────────
{
  const we = src("components/WordEditor.tsx");
  // R6UP-1 / R6UP-2: every edit counted; one save at a time; «saved» only when the latest edit went
  t("R6UP-1: an edit made while a save is on its way is saved too, never shown as «Всичко е запазено» before",
    /const setSaved = \(v: boolean\) => \{ if \(!v\) editGen\.current\+\+; savedRef\.current = v; setSavedState\(v\); \};/.test(we)
    && /function onBodyInput\(\) \{\n    editGen\.current\+\+;/.test(we)
    && /if \(editGen\.current === gen\) \{ savedRef\.current = true; setSavedState\(true\); \}/.test(we)
    && /return save\(\)\.then\(\(ok\) => \(ok && savedGen\.current < target \? saveAll\(target\) : ok\)\);/.test(we)
    && (we.match(/setSavedState\(true\)/g) ?? []).length === 2);
  t("R6UP-2: «Готов», «Страници», «PDF», «Попълване» wait for the save on its way (one chain), never send the same count twice",
    /const p = saveChain\.current\.then\(\(\) => saveOnce\.current\(snap\)\);/.test(we) && /if \(gen === savedGen\.current\)/.test(we) && !/!busyRef\.current\) save\(\)/.test(we));
  // R6UP-3: a save that cannot go through lets the person leave, asked
  t("R6UP-3: after a refused save a portal link asks to leave without saving — never swallowed", /if \(window\.confirm\(leaveUnsaved\.current\)\) \{ savedRef\.current = true; go\(\); \}/.test(we) && !/savedRef\.current \|\| busyRef\.current \|\| e\.defaultPrevented/.test(we));
  // R6UP-4: the Instruction's contacts — what a person added is kept; the block is not editable in the editor
  const { refreshInstruction, instructionContacts } = await import("../src/lib/docs/instruction-common.ts");
  const sT = { type: "T", team: [] } as never;
  const gen = instructionContacts(sT, "bg");
  const typed = `<h2>11.</h2>${gen.replace(/<\/div>\s*$/, '<p>Добавено изречение.</p><img src="/brand/logo.png"></div>').replace("✉ office@ptsbg.eu", "✉ office@ptsbg.eu И още.")}`;
  const printed = refreshInstruction(typed, sT, "bg");
  t("R6UP-4: words and a picture added in the contacts survive the print and the edition", printed.includes("Добавено изречение.") && printed.includes('src="/brand/logo.png"') && printed.includes("И още.") && (printed.match(/data-team-contacts/g) ?? []).length === 1 && refreshInstruction(`<h2>11.</h2>${gen}`, sT, "bg").replace(/\s+/g, "") .includes(gen.replace(/\s+/g, "")));
  t("R6UP-4: the editor keeps the contacts out of reach and a line after them; never saves the lock", /c\.setAttribute\("contenteditable", "false"\);/.test(we) && /clone\.querySelectorAll\("\[data-team-contacts\]"\)\.forEach\(\(n\) => \{ n\.removeAttribute\("contenteditable"\); n\.removeAttribute\("title"\); \}\);/.test(we));
  // R6UP-5 / R6UP-6: a cited number confirmed; the card's own (a replay's source) never asked
  t("R6UP-5: another scheme's number refused unless confirmed as cited — and the confirmation journalled",
    /const numbers = await numbersCheck\(scheme, now, note\?\.numbersOk\);/.test(actions) && (actions.match(/const numbers = await numbersCheck\(/g) ?? []).length === 2
    && /logActivity\("doc\.numbers_cited"/.test(actions) && /return \{ otherNumbers: left, error:/.test(actions)
    && ["components/SchemeDocuments.tsx", "components/ReleaseToOne.tsx", "components/IssueEdition.tsx"].every((f) => /citeQuestion\(r\.otherNumbers, lang\)/.test(src(f))));
  t("R6UP-6: a number the scheme's own card names (a replay's source) is not another scheme's", /const card = isSimulation\(scheme\.number\) \? otherSchemeNumbers\(\[scheme\.titleBg, scheme\.titleEn, scheme\.name\]/.test(actions) && /\.filter\(\(n\) => !card\.some\(\(c\) => sameSchemeNumber\(c, n\)\)\)/.test(actions));
  // R6UP-7: no English-only refusal left among the ones it named
  t("R6UP-7: the named refusals and the case file's automatic steps in both languages", !/error: `Nothing has changed since edition/.test(actions) && !/error: "This e-mail is a participant's user's login \(Организации\), so/.test(actions) && !/error: `Translator (unavailable|refused)/.test(actions) && /note: `онлайн протокол за получаване/.test(actions) && /note: `онлайн резултати — версия/.test(actions)
    && /descriptionBg:/.test(src("lib/doc-shell.ts")) && /sk\.meta\.descriptionBg/.test(src("app/skins/page.tsx")));
  // R6UP-8: the days as the card shows them
  const { datesOrderRefusal } = await import("../src/lib/scheme-dates.ts");
  const said = datesOrderRefusal(["dispatch", "resultsDue"], { dispatch: "2026-12-12", resultsDue: "2026-11-22T09:00" });
  t("R6UP-8: the dates' refusal gives 22.11.2026, not 2026-11-22", said.includes("22.11.2026") && said.includes("12.12.2026") && !said.includes("2026-11-22"), said.slice(0, 120));
  // R6UP-9: a mark in the contacts says where it is filled
  const { m1Problems } = await import("../src/lib/m1-render.ts");
  const { fillMark } = await import("../src/lib/fill-mark.ts");
  const team = `<div class="contacts" data-team-contacts><div class="person">${fillMark("bg", { bg: "техническият експерт (екипът на схемата)", en: "the technical expert (the scheme team)" })}</div></div>`;
  const probs = m1Problems(team, "instruction", "bg");
  t("R6UP-9: a contacts mark points to «Редактирай данните», not to the editor", probs.some((x) => x.includes("«Редактирай данните»")) && !probs.some((x) => x.includes("махнете и жълтото поле")), JSON.stringify(probs));
}

// ── round 7 (2026-11-12) ────────────────────────────────────────────────────────────────────────
{
  const authA7 = src("lib/auth-actions.ts");
  const { attemptLimit, knownDevice, withKnownDevice } = await import("../src/lib/public-limit.ts");
  const { normAddress } = await import("../src/lib/cert-register.ts");
  // R7S-1: an IPv6 /64 is one address — normalised before it goes into any key
  let ok6 = 0; for (let i = 0; i < 40; i++) if ((await attemptLimit("sign_in", normAddress(`2001:db8:7:7::${i + 1}`))) === "ok") ok6++;
  t("R7S-1: forty addresses of one IPv6 /64 share the address's 30 sign-in attempts", ok6 === 30, String(ok6));
  t("R7S-1: a mapped IPv4 address is the address itself", normAddress("::ffff:203.0.113.7") === normAddress("203.0.113.7"));
  t("R7S-1: sign-in and the code count the normalised address", (authA7.match(/const addr = normAddress\(requestAddress\(await headers\(\)\)\);/g) ?? []).length === 2);
  // R7S-2: the person's own browser is never shut by the account's ceiling from everywhere
  const cookie = withKnownDevice(undefined, "Person@Example.invalid");
  t("R7S-2: a browser where the account signed in is known to it — and only to it", knownDevice(cookie, "person@example.invalid") && !knownDevice(cookie, "other@example.invalid") && !knownDevice("0".repeat(32), "person@example.invalid"));
  t("R7S-2: at most four accounts remembered per browser", withKnownDevice(["a", "b", "c", "d", "e"].reduce((c: string | undefined, x) => withKnownDevice(c, `${x}@example.invalid`), undefined), "f@example.invalid").split(".").length === 4);
  t("R7S-2: the account's ceiling skipped for a known browser; remembered after a right password; the message no longer promises a new password helps",
    /&& \(known \|\| \(await attemptLimit\("sign_in_account", `account-\$\{email\}`\)\) === "ok"\);/.test(authA7) && /await rememberDevice\(email\);/.test(authA7) && /httpOnly: true/.test(authA7.slice(authA7.indexOf("async function rememberDevice"))) && !/TOO_MANY_SIGN_IN = "[^"]*Забравена парола/.test(authA7));
  // R7S-3: every page that opens the identity store (for anything but a laboratory's own data) asks first
  const { ACTS_WHEN_OPENED: acts7 } = await import("../src/lib/acts-when-opened.ts");
  const { readdirSync, statSync } = await import("node:fs");
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; if (statSync(p).isDirectory()) walk(p); else if (/\/(page\.tsx|route\.ts)$/.test(p)) files.push(p); } };
  const { fileURLToPath } = await import("node:url");
  const appDir = fileURLToPath(new URL("../src/app", import.meta.url));
  walk(appDir);
  const opening = files.filter((f) => !f.includes("/dev/") && /\b(?:openEntities|openLaboratories|openEntityUsers|openParticipationSnapshots|namesFor)\(/.test(readFileSync(f, "utf8")) && /purpose: "(?!lab\.own")/.test(readFileSync(f, "utf8")) || (!f.includes("/dev/") && /\bnamesFor\(/.test(readFileSync(f, "utf8"))));
  const pathOf = (f: string) => f.slice(appDir.length).replace(/\/(page\.tsx|route\.ts)$/, "").replace(/\/\([^)]+\)/g, "").replace(/\[[^\]]+\]/g, "x") || "/";
  const missed = opening.map(pathOf).filter((x) => !acts7.test(x));
  t("R7S-3: every page that opens names asks first when opened from another site", opening.length >= 12 && missed.length === 0, `${opening.length} pages; missed: ${missed.join(", ")}`);
  t("R7S-3: …organisations, registrations, invoices, editions among them", ["/organizations", "/registrations", "/invoices", "/schemes/S/editions"].every((x) => acts7.test(x)) && !acts7.test("/lab") && !acts7.test("/lab/apply"));
  t("R7S-3: another site never frames a portal page", /if \(\/\^\(\?:iframe\|frame\|fencedframe\)\$\/\.test\(\(request\.headers\.get\("sec-fetch-dest"\)/.test(src("proxy.ts")));
  // Q3: the e-mail's link is offered after sign-in, never opened by itself, never lost
  const openPage = src("app/open/page.tsx");
  t("Q3: after sign-in such a link is offered on «/open»; only a portal path, only such a page; no prefetch", safeDest("internal", "/registrations") === "/open?to=%2Fregistrations" && /const to = safeNext\(/.test(openPage) && /ACTS_WHEN_OPENED\.test\(to\.split/.test(openPage) && /<a href=\{offered\} className="btn btn-primary" data-open-continue>/.test(openPage) && !/<Link href=\{offered\}/.test(openPage));
  // R7S-4: the document body contains whatever is in it
  const docCss = src("lib/doc-css.ts");
  t("R7S-4 / RV7-2: links stay in the flow on screen; the body is NOT contained (a stamp below the text, a wide table stay visible); print untouched", !/contain:paint/.test(docCss) && /\.pts-docbody \.doc-side\{display:none!important;\}/.test(docCss) && /@media screen\{\s*\.pts-docbody a,\.pts-docbody a \*\{position:static!important;transform:none!important;translate:none!important;scale:none!important;float:none!important;margin:0!important;zoom:normal!important;max-width:100%!important;\}\s*\.pts-docbody a img\{height:auto!important;\}\s*\}/.test(docCss));
  // R7S-5: the waybill mask — more phrasings; what a codes-only reader needs kept
  const leaks7 = ["получено с куриер 62\u00A0555\u00A0444\u00A0333", "изпратено с куриер 62.555.444.333", "изпратено с куриер, номер 123456789", "Европът 1234567", "Box Now 98765432", "товарителница: 62–555–444–333", "колет 62555444333"].map((x) => String(scrubIdentity(x)));
  t("R7S-5: the waybill masked however it is written", leaks7.every((x) => x.endsWith("•••") && !/\d{3}/.test(x)), leaks7.join(" | "));
  const keep7 = ["дата 2026-11-12 10:30", "EN 1097-2 1097-3 и EN 933-1", "ISO/IEC 17043:2023, т. 7.2.1", "сума 1 234 567 890,00 лв.", "резултат 0,1234567890123 g/cm³", "кодове 26111716 26111750", "PTS 26/11-T-17 26111716", "колет 26111716", "12.11.2026 10:30", "x = 10.123456789", "0.1234567890123"];
  const kept7 = keep7.filter((x) => scrubIdentity(x) !== x);
  t("R7S-5: dates, standards, amounts, decimals and participation codes kept", kept7.length === 0, kept7.map((x) => `${x} → ${scrubIdentity(x)}`).join(" | "));
  // R7S-6: the confirmation journalled once the act is done, worded for it
  t("R7S-6: «cited on purpose» journalled after the send or the issue — never before",
    !/async function numbersCheck[\s\S]{0,1500}logActivity/.test(actions.slice(actions.indexOf("async function numbersCheck"), actions.indexOf("async function numbersCheck") + 1600))
    && (actions.match(/await citedLine\(scheme, docKey, cited, "sent"\);/g) ?? []).length === 2 && /await citedLine\(scheme, docKey, numbers\.cited, "issued"\);\n  return \{ ok: true, no: r\.edition\.no \};/.test(actions));
  // Q4: OnceForm lets a send through once the action answered, whatever address it came back on
  t("Q4: OnceForm releases when the form's action is done", /const \{ pending \} = useFormStatus\(\);/.test(src("components/OnceForm.tsx")) && /<ReleaseWhenDone onDone=\{release\} \/>/.test(src("components/OnceForm.tsx")));
}

// ── round 7, the users' findings ───────────────────────────────────────────────────────────────
{
  const apply7 = src("app/lab/apply/page.tsx");
  t("R7UL-1: the banner speaks of the application just made — the organisation's newest participation", /\.sort\(\(a, b\) => String\(b\.createdAt \?\? ""\)\.localeCompare\(String\(a\.createdAt \?\? ""\)\)\)\[0\]/.test(apply7) && /const doneCode = newest\?\.code \?\? null;/.test(apply7));
  const labP = src("app/lab/p/[id]/page.tsx");
  t("R7UL-3: the participation page's forms are sent once (upload, acknowledgements, receipt, problem)", ["labUploadDocAction", "acknowledgeDocAction", "submitReceiptAction", "reportDeliveryProblemAction"].every((a) => new RegExp(`<OnceForm action=\\{${a}\\}`).test(labP)) && !/<form action=\{(?:labUploadDocAction|acknowledgeDocAction|submitReceiptAction|reportDeliveryProblemAction)\}/.test(labP));
  const fresh = src("components/FreshOnReturn.tsx");
  t("R7UL-4 / RV7-1: the results page asks again when shown from an old copy — aged on the browser's own clock, no loop", /<FreshOnReturn renderedAt=\{new Date\(\)\.toISOString\(\)\} \/>/.test(src("app/lab/p/[id]/results/page.tsx")) && /const seen = firstSeen\.get\(renderedAt\);/.test(fresh) && /if \(seen === undefined\) \{ firstSeen\.set\(renderedAt, now\);/.test(fresh) && !/Date\.parse\(renderedAt\)/.test(fresh) && /if \(e\.persisted\) router\.refresh\(\);/.test(fresh));
  const prof = src("app/lab/profile/page.tsx");
  const eikRe = new RegExp(`^(?:${JSON.parse([...prof.matchAll(/pattern: ("(?:[^"\\]|\\.)*")/g)][1][1])})$`, "v");
  t("R7UL-5: the ЕИК box takes what the server takes and refuses what it refuses", ["ЕИК/БУЛСТАТ 166858335", "ЕИК 166858335 (БУЛСТАТ)", "ЕИК - 166858335", "EIK No. 166858335", "ЕИК\u00A0166\u00A0858\u00A0335", "HRB 12345"].every((v) => eikRe.test(v)) && ["123456789012", "EIK 12345", "EIK1", "UIC-12"].every((v) => !eikRe.test(v)));
  t("R7UL-5: a refused ЕИК or phone keeps its stored value — the rest is saved", /eik: eik\.ok \? eik\.normalized : ls\.lab\.eik,/.test(actions) && /phone: phoneOk \? phone : ls\.lab\.phone,/.test(actions) && actions.indexOf("revalidatePath(\"/lab\");\n  if (!eik.ok) redirect") > 0);
  t("R7UL-7: a simulation takes no wish and has no lab apply page", /if \(!s \|\| !isStarted\(s\) \|\| isSimulation\(s\.number\)\) return WISH_REFUSAL\("not-started"\);/.test(actions) && /isSimulation\(scheme\.number\) \? "not-open"/.test(src("app/lab/apply/[id]/page.tsx")));
  // R7UP-2: the contacts put back on print when deleted; R7UP-3: block edges are not a number's digits
  const { refreshInstruction: ri7 } = await import("../src/lib/docs/instruction-common.ts");
  const back = ri7(`<h2 class="sec"><span class="n">11.</span> Контакти</h2><div class="body"><p><br></p></div>`, { type: "T", team: [] } as never, "bg");
  t("R7UP-2: a deleted contacts block comes back under «Контакти» on print", /data-team-contacts/.test(back) && back.indexOf("data-team-contacts") > back.indexOf("Контакти") && /office@ptsbg\.eu/.test(back));
  t("R7UP-2: the editor holds a Backspace/Delete that would take the contacts", /if \(\(e\.key === "Backspace" \|\| e\.key === "Delete"\) && takesLocked\(e\.key === "Backspace"\)\) \{ e\.preventDefault\(\); return; \}/.test(src("components/WordEditor.tsx")));
  t("R7UP-3: «…T-4</div><div>2. …» is the scheme's own number, not «T-42»", otherSchemeNumbers("<div>№ PTS 26/11-T-4</div><div>2. Обхват</div><p>PTS 26/11-T-4<br>3 проби</p>", "PTS 26/11-T-4").length === 0 && otherSchemeNumbers("<p>PTS 25/0<b>9</b>-<i>T</i>-3</p>", "PTS 26/11-T-4").length === 1);
  // R7UP-4: the team is set in «Редактирай данните»; a blank calibration scheme has a technical expert
  const { blankScheme } = await import("../src/lib/new-scheme.ts");
  const { teamMember } = await import("../src/lib/docs/instruction-common.ts");
  const cBlank = blankScheme({ id: "x", number: "PTS 26/11-C-9", type: "C", titleEn: "x", titleBg: "x", objectEn: "", objectBg: "", distribution: "sequential", minParticipants: 1 } as never);
  t("R7UP-4: a blank calibration scheme starts with a technical expert in its team", !!teamMember(cBlank, "technical"));
  t("R7UP-4: the team is edited and saved with the scheme's data", /<TeamFields init=\{init\.team \?\? \[\]\} L=\{L\} \/>/.test(src("components/SchemeEditor.tsx")) && /const teamCountRaw = formData\.get\("teamCount"\);/.test(actions) && /\.\.\.\(teamNow \? \{ team: teamNow \} : \{\}\),/.test(actions) && /team: s\.team \?\? \[\],/.test(src("app/schemes/[id]/edit/page.tsx")));
  // R7UP-1 / R7UP-5 / R7UP-7: the editor's saves
  const we7 = src("components/WordEditor.tsx");
  t("R7UP-1: the autosave and Ctrl+S save once; only an act saves — up to the edits made when it was asked", /function saveAll\(target = editGen\.current\): Promise<boolean> \{/.test(we7) && /useEffect\(\(\) => \{ saveNow\.current = saveAll; \}\);/.test(we7) && (we7.match(/await saveAll\(\)/g) ?? []).length === 4 && /return p\.then\(\(ok\) => \{ if \(ok && editGen\.current !== savedGen\.current\) scheduleAutosave\(\); return ok; \}\);/.test(we7));
  t("R7UP-5: leaving the editor any way with unsaved words saves them as it closes", /useLayoutEffect\(\(\) => \(\) => closing\.current\(\), \[\]\);/.test(we7) && /if \(!savedRef\.current && ref\.current\) void save\(snapshot\(\)\);/.test(we7));
  t("R7UP-7: a failed translation or template save never leaves the editor busy", (we7.match(/catch \{ setBusy\(""\); return alert\(/g) ?? []).length >= 4);
}

// ── round 7, the review and the verification ────────────────────────────────────────────────────
{
  const { scrubIdentity: scrub8 } = await import("../src/lib/redact.ts");
  const leaks8 = ["TRACKING NUMBER GIVEN 625554443331", "OPEN 625554443331", "ISO 625554443331", "62555444 333"].filter((x) => /\d{6}/.test(String(scrub8(x))));
  t("RV7-4: no number escapes through «EN» inside a word, a long «ISO …», or 8+3 digits", leaks8.length === 0, leaks8.map((x) => `${x} → ${scrub8(x)}`).join(" | "));
  const { knownDevice: kd, withKnownDevice: wkd } = await import("../src/lib/public-limit.ts");
  const a1 = wkd(undefined, "p@example.invalid"), a2 = wkd(undefined, "p@example.invalid");
  const jan = Date.UTC(2027, 0, 15), may = Date.UTC(2027, 4, 15);
  const old = wkd(undefined, "p@example.invalid", jan);
  t("RV7-7: a known-device mark is per browser (two browsers, two marks) and lapses after three months", a1 !== a2 && kd(a1, "p@example.invalid") && kd(old, "p@example.invalid", Date.UTC(2027, 2, 20)) && !kd(old, "p@example.invalid", may));
  t("RV7-6: an edition issued citing another's number is journalled as issued, at the issue", /await citedLine\(scheme, docKey, numbers\.cited, "issued"\);\n  return \{ edition: r\.edition, issued: true, cited: \[\] \};/.test(actions));
  const we8 = src("components/WordEditor.tsx");
  t("RV7-5: the contacts guard only for the block itself or one that ends/begins with it; a selection is the person's own act", we8.includes('return rest.toString().replace(/[\\s\\u200B]/g, "") === ""') && /if \(!r\.collapsed\) return false;/.test(we8));
  t("R7 verification: «Готов» and a template's deletion never leave the editor stuck on a lost connection", /try \{ r = await setDocReadyAction\(schemeId, docKey, next\); \}/.test(we8) && /try \{ await deleteDocTemplateAction\(id\); \}/.test(we8));
  // the team and the contacts as the scheme's are now — in the print AND in what the editor opens
  const { refreshTeam, teamBlock, addedInContacts: aic, instructionContacts: icx } = await import("../src/lib/docs/instruction-common.ts");
  const sTeam = { type: "T", team: [{ roleEn: "PT Scheme Manager", roleBg: "Ръководител на схемата", name: "Нов Ръководител" }] } as never;
  const oldPlan = `<h2>2.</h2><div class="team"><div class="role"><span class="rl">Ръководител на схемата</span><span class="nm">Стар</span></div><p>Добавено.</p></div>`;
  const newPlan = refreshTeam(oldPlan, sTeam, "bg");
  t("R7UP-4 (verification): a saved plan's team follows the scheme's team; words added in it kept", newPlan.includes("Нов Ръководител") && !newPlan.includes("Стар") && newPlan.includes("Добавено.") && newPlan.includes(teamBlock(sTeam, "bg")));
  t("R7UP-4: the print and the editor both refresh the team (and the Instruction's contacts)", /const teamed = refreshTeam\(key === "instruction" \? refreshInstruction\(gated, s, lang\) : gated, s, lang\);/.test(src("lib/doc-template.ts")) && /refreshTeam\(doc === "instruction" \? refreshInstruction\(body, s, l\) : body, s, l\)/.test(src("app/schemes/[id]/build/[doc]/page.tsx")));
  const gen8 = icx({ type: "T", team: [] } as never, "bg");
  t("R7UP-6 (verification): bare text and a line's end inside the contacts come out on opening", aic(gen8.replace(/<\/div>\s*$/, "Голо изречение.</div>")).includes("Голо изречение.") && aic(gen8.replace("✉ office@ptsbg.eu", "✉ office@ptsbg.eu Края.")).includes("Края."));
}

console.log(`security-sweep.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
