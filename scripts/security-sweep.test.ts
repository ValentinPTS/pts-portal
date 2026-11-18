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
t("SA-1: the journal page redacts per line by names.view", /authorize\(viewer, "names\.view", e\.schemeId \?\? undefined\) \|\| \(e\.action === "deadline\.extended" && authorize\(viewer, "order\.manage", e\.schemeId \?\? undefined\)\) \? e : redactActivityForStaff\(e\)/.test(src("app/activity/page.tsx")));
t("SA-1: the redactor scrubs subject, before and after", /subject: staffLine \? e\.subject : scrubRef\(e\.subject\)/.test(src("lib/redact.ts")) && /after: staffLine \? e\.after : scrubIdentity\(e\.after\)/.test(src("lib/redact.ts")));
// SC-1: an organisation's e-mail words only to who sees names or manages the organisations
const notices = src("app/notices/page.tsx");
t("SC-1: «Изпратени имейли» shows a message's words only by code, names.view, or labs.manage (no scheme)", /const seesWords = \(m: \{ schemeId\?: string; code\?: string; kind: string \}\) => \(!!m\.code && !COURIER_NOTICE_KINDS\.has\(m\.kind\) && !TYPED_NOTICE_KINDS\.has\(m\.kind\)\) \|\| seesAddress\(m\.schemeId\) \|\| seesOwnOrder\(m\) \|\| \(!m\.schemeId && managesLabs\);/.test(notices) && /\{seesWords\(m\) \? \(/.test(notices));
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
t("UL-5: the participant's tabs wrap on a phone (the redesign, R1: the rule in the stylesheet, «ui-tabs»)", /className="ui-tabs"[^>]*data-participant-nav/.test(src("components/ParticipantNav.tsx")) && /\.ui-tabs \{ display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; \}/.test(src("app/globals.css")) && /\.ui-topbar \{ display: flex; flex-wrap: wrap;/.test(src("app/globals.css")));
t("UL-6: the laboratory account's ЕИК and phone checked (round 8: both said when both refused)", /if \(!eik\.ok \|\| !phoneOk\) redirect\(`\/lab\/profile\?err=\$\{!eik\.ok && !phoneOk \? "eik-phone" : !eik\.ok \? "eik" : "phone"\}`\);/.test(actions) && /data-profile-error/.test(src("app/lab/profile/page.tsx")) && /err === "eik-phone"/.test(src("app/lab/profile/page.tsx")));
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
t("an uploaded document by the scheme's own keys only — «constructor» is not found, never a 500 (round 9, T4 A5)", /const up = scheme\?\.uploads && Object\.hasOwn\(scheme\.uploads, doc\) \? scheme\.uploads\[doc\] : undefined;/.test(src("app/schemes/[id]/uploaded/[doc]/route.ts")) && !/scheme\?\.uploads\?\.\[doc\]/.test(src("app/schemes/[id]/uploaded/[doc]/route.ts")));
t("…and an upload is removed only for a document the portal knows", /export async function removeSchemeDocUploadAction[\s\S]{0,700}if \(!isDocKey\(docKey\)\) return \{ error:/.test(src("lib/actions.ts")));
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
  t("R5UA-3: a document saved over a newer one is refused, said", /if \(loaded !== null && loaded !== kept\) \{ stale = true; return \{\}; \}/.test(actions) && /if \(stale\) return \{ error: DOC_STALE, stale: true, rev: keptRev, sid: keptSid \?\? null \};/.test(actions) && /rev: revRef\.current/.test(we5) && /initialRev=\{s\.docs\?\.\[doc\]\?\.rev \?\? 0\}/.test(src("app/schemes/[id]/build/[doc]/page.tsx")));
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
  const field = (f: { hasAttribute: (a: string) => boolean }, tag = "INPUT", type = "text") => ({ tagName: tag, closest: (sel: string) => (sel === "form" ? f : sel === "[data-live-only]" ? (f.hasAttribute("data-live-only") ? f : null) : (tag === "SELECT" && /select/.test(sel)) || (tag === "INPUT" && sel.includes(`type=${type}`)) ? {} : null), matches: (sel: string) => (tag === "SELECT" && /select/.test(sel)) || (tag === "INPUT" && sel.includes(`type=${type}`)) });
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
  t("R6S-7 / round 9: no inline position — inside a link or out (a free picture gets it from its class)", !/position/.test(sanitizeDocHtml('<a href="https://ptsbg.eu"><span style="position:absolute;top:0;left:0;width:100vw">x</span></a>')) && !/position/.test(sanitizeDocHtml('<span style="position:absolute;top:0">x</span>')));
  // R6S-8: only the keyword itself opens a new tab without its opener
  t("R6S-8 / round 9: a link's target is the cleaner's own — «_blank» with «noopener noreferrer», whatever was written (« _blank», a named window, «opener», none)", ['', ' target=" _blank"', ' target="_blank"', ' target="w1" rel="opener"', ' rel="noopener"'].every((x) => sanitizeDocHtml(`<a href="https://ptsbg.eu"${x}>a</a>`) === '<a href="https://ptsbg.eu" target="_blank" rel="noopener noreferrer">a</a>'));
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
    /const setSaved = \(v: boolean\) => \{ if \(!v\) \{ editGen\.current\+\+; scheduleAutosave\(\); \} savedRef\.current = v; setSavedState\(v\); \};/.test(we)
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
  t("R6UP-4: the editor keeps the contacts out of reach and a line after them; never saves the lock", /c\.setAttribute\("contenteditable", "false"\);/.test(we) && /clone\.querySelectorAll\("\[data-team-contacts\], div\.team"\)\.forEach\(\(n\) => \{ n\.removeAttribute\("contenteditable"\); n\.removeAttribute\("title"\); \}\);/.test(we));
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
  t("Q3: after sign-in such a link is offered on «/open»; only a portal path, only such a page; no prefetch", safeDest("internal", "/registrations") === "/open?to=%2Fregistrations" && /const to = safeNext\(/.test(openPage) && /const path = to\.split\(\/\[\?#\]\/\)\[0\];/.test(openPage) && /path !== "\/open" && ACTS_WHEN_OPENED\.test\(path\)/.test(openPage) && /<a href=\{offered\} className="btn btn-primary" data-open-continue>/.test(openPage) && !/<Link href=\{offered\}/.test(openPage));
  // R7S-4: the document body contains whatever is in it
  const docCss = src("lib/doc-css.ts");
  t("R7S-4 / RV7-2 / round 9: links stay in the flow in EVERY medium (the PDF too); the body is NOT contained (a stamp below the text, a wide table stay visible) but is its own stacking context; pictures take no clicks", !/contain:paint/.test(docCss) && /\.pts-docbody \.doc-side\{display:none!important;\}/.test(docCss) && !/@media screen\{\s*\.pts-docbody a,\.pts-docbody a \*\{position/.test(docCss) && /\.pts-docbody a,\.pts-docbody a \*\{position:static!important;display:inline!important;float:none!important;transform:none!important;/.test(docCss) && /\.pts-docbody\{isolation:isolate;\}/.test(docCss) && /\.pts-docbody img\{pointer-events:none;\}/.test(docCss) && /\.pts-docbody :has\(a\)\{position:static!important;transform:none!important;/.test(docCss));
  // round 9 review 4: the body a stacking context on SCREEN only (in print the title page's white band, z 41, must cover
  // the printed side strip, z 40); a word longer than its line breaks; fields give way in a cell; a link always looks one
  t("round 9 review 4: isolation on screen only; long words break; fields in a cell give way; a link's colour is its own",
    /@media screen\{\.pts-docbody\{isolation:isolate;\}\}/.test(docCss) && !/(^|[;}\s])\.pts-docbody\{isolation:isolate;\}/.test(docCss.replace(/@media screen\{\.pts-docbody\{isolation:isolate;\}\}/g, ""))
    && /\.pts-docbody :is\(td,th\) select,[^{]*\{width:100%;\}/.test(docCss));
  // …and its second look: a word breaks only where it would run out of its line (never «anywhere» in the body — it split
  // «Международни» in an 18-mm cell); a link breaks anywhere, keeps its own colour edged in white over what shows through,
  // and is underlined on itself only (a <s> inside keeps its line); the editor's canvas looks and breaks the same
  const we = src("components/WordEditor.tsx");
  t("round 9 review 4b: words whole in the body, links break anywhere; a link's look forced on the link, behind it transparent; the canvas the same",
    /\.pts-docbody\{overflow-wrap:break-word;\}/.test(docCss) && !/overflow-wrap:anywhere;\}/.test(docCss.replace(/\.pts-docbody a,\.pts-docbody a \*\{[^}]*\}/, ""))
    && /\.pts-docbody a,\.pts-docbody a \*\{[^}]*overflow-wrap:anywhere!important;color:#0563c1!important;background:transparent!important;/.test(docCss)
    && /\.pts-docbody a\{font-size:min\(1em,24pt\)!important;text-decoration:underline!important;/.test(docCss) && !/\.pts-docbody a,\.pts-docbody a \*\{[^}]*text-decoration/.test(docCss)
    && /\.we-docbody\{overflow-wrap:break-word;\}/.test(we) && /\.we-docbody a,\.we-docbody a \*\{[^}]*color:#0563c1!important;background:transparent!important;/.test(we) && /\.we-docbody a\{font-size:min\(1em,24pt\)!important;text-decoration:underline!important;/.test(we));
  // …and its last look: the white edge on screen only (in print it is more text — the PDF read each linked word twice),
  // never a stroke; a link painted above any free picture (z-index ≤ 20), under the printed strip (40) and band (41);
  // the editor's canvas the same
  const noEdge = (css: string, body: string) => new RegExp(`\\.${body} a,\\.${body} a \\*\\{[^}]*text-shadow:none!important;-webkit-text-stroke:0!important;\\}`).test(css)
    && new RegExp(`@media screen\\{\\.${body} a,\\.${body} a \\*\\{text-shadow:[^}]*#fff[^}]*!important;\\}\\}`).test(css)
    && (css.match(/text-shadow:(?!none)[^;]*;/g) ?? []).length === 1 && !/text-stroke:(?!0!)/.test(css)
    && new RegExp(`\\.${body} a\\{[^}]*position:relative!important;z-index:21!important;\\}`).test(css);
  t("round 9 last look: a link's white edge on screen only, no stroke; links above free pictures (≤ 20), below the strip (40) and the band (41); the canvas the same",
    noEdge(docCss, "pts-docbody") && noEdge(we, "we-docbody") && /\.doc-side\{[^}]*z-index:40;/.test(docCss) && /\.dochead-wrap\{[^}]*z-index:41;/.test(docCss)
    && /const z = Math\.max\(0, Math\.min\(20, t\.n\)\);/.test(src("lib/sanitize-html.ts")));
  // R7S-5: the waybill mask — more phrasings; what a codes-only reader needs kept
  const leaks7 = ["получено с куриер 62\u00A0555\u00A0444\u00A0333", "изпратено с куриер 62.555.444.333", "изпратено с куриер, номер 123456789", "Европът 1234567", "Box Now 98765432", "товарителница: 62–555–444–333", "колет 62555444333"].map((x) => String(scrubIdentity(x)));
  t("R7S-5: the waybill masked however it is written", leaks7.every((x) => x.endsWith("•••") && !/\d{3}/.test(x)), leaks7.join(" | "));
  const keep7 = ["дата 2026-11-12 10:30", "EN 1097-2 1097-3 и EN 933-1", "ISO/IEC 17043:2023, т. 7.2.1", "сума 1 234 567 890,00 лв.", "резултат 0,123456789 g/cm³", "кодове 26111716 26111750", "PTS 26/11-T-17 26111716", "колет 26111716", "12.11.2026 10:30", "x = 10.123456789", "0.123456789", "стойности 12.5 13.1 12.9 13.0", "Пратка 26111716 е получена"];
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
  t("R7UL-5: a refused ЕИК or phone keeps its stored value — the rest is saved", /eik: eik\.ok \? eik\.normalized : ls\.lab\.eik,/.test(actions) && /phone: phoneOk \? phone : ls\.lab\.phone,/.test(actions) && actions.indexOf("revalidatePath(\"/lab\");\n  if (!eik.ok || !phoneOk) redirect") > 0);
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

// ── round 8 (2026-11-12) ────────────────────────────────────────────────────────────────────────
{
  // R8S-1: the certificate's signatory by role; an empty team never breaks it; the team keeps its manager
  const { getDoc: gd8 } = await import("../src/lib/documents.ts");
  const { pavingBlocks: pb8 } = await import("../src/lib/seed-paving-blocks.ts");
  const cert = gd8("certificate")!;
  const o8 = { participant: { code: "26111716", labName: "Лаб", certNo: "C-1", certDate: "2026-11-12" } } as never;
  let emptyOk = false; try { emptyOk = /за попълване/.test(cert.render!({ ...pb8, team: [] } as never, "bg", o8)); } catch { emptyOk = false; }
  const rev8 = [...pb8.team].reverse();
  const signed = cert.render!({ ...pb8, team: rev8 } as never, "bg", o8);
  t("R8S-1: an empty team never breaks the certificate (a mark to fill)", emptyOk);
  t("R8S-1: the certificate is signed by the scheme manager by role, whatever the order", signed.includes(pb8.team.find((m) => /Ръководител на схемата/.test(m.roleBg))!.name) && !signed.includes(rev8[0].name));
  t("R8S-1: certificate, its calibration twin, the Order and the statistical design: never «team[0]» (the Order: signed by the head of PTS — the real-user walk-through, M3)", ["certificate", "certificate-c", "stat-project"].every((f) => !/s\.team\[0\]/.test(src(`lib/docs/${f}.ts`)) && /teamMember\(s, "manager"\)/.test(src(`lib/docs/${f}.ts`))) && !/s\.team\[0\]/.test(src("lib/docs/order.ts")) && /const head = providerHeadName\(lang\);/.test(src("lib/docs/order.ts")));
  // (round 9: the scheme manager is MARKED in «Екип на схемата» — exactly one, by the server and by the form)
  t("R8S-1: a team without its scheme manager is refused — by the server and by the form before it is sent", /if \(teamNow && teamNow\.filter\(\(m\) => m\.duties\?\.includes\("manager"\)\)\.length !== 1\) redirect\(`\/schemes\/\$\{id\}\/edit\?err=team-manager`\);/.test(actions) && /const at = String\(fd\.get\("duty_manager"\) \?\? ""\);[\s\S]{0,200}e\.preventDefault\(\);/.test(src("components/SchemeEditor.tsx")) && /err === "team-manager"/.test(src("app/schemes/[id]/edit/page.tsx")));
  // R8S-2: whatever holds a link is held too; a large negative margin dropped, a Word table's small one kept
  const { sanitizeDocHtml: san8 } = await import("../src/lib/sanitize-html.ts");
  t("R8S-2: a margin pulling far back is dropped; Word's «-5.4pt» on a table clamped to -1 mm (round 9: what a hit may stray)", !/margin/.test(san8('<div style="margin-top:-2000px">x</div>')) && !/margin/.test(san8('<div style="margin:-30em 0 0">x</div>')) && /margin-left:-1mm/.test(san8('<table style="margin-left:-5.4pt"><tr><td>x</td></tr></table>')));
  t("R8S-2 / round 9: a positioned or transformed box around a link is held, in every medium, and is as tall as its content", /\.pts-docbody :has\(a\)\{position:static!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;zoom:normal!important;height:auto!important;max-height:none!important;\}/.test(src("lib/doc-css.ts")) && !/@media screen\{\s*[^}]*:has\(a\)/.test(src("lib/doc-css.ts")));
  // R8S-3: the waybill mask
  const { scrubIdentity: sc8 } = await import("../src/lib/redact.ts");
  t("R8S-3: two waybills joined by a comma are masked; nothing of a waybill beside a decimal shows", !/\d{6}/.test(String(sc8("62555444333,62555444334"))) && !/\d{5}/.test(String(sc8("0.5 62555444333"))));
  // RV8-1: a short decimal never sits between a courier's word and its reference
  const rv81 = ["товарителница 62.555 444 333", "товарителница 62.555 444.333", "AWB 62,555 444 333", "Speedy 1234,56", "товарителница 6255.544 4333", "тов. 1.234 5678 901", "62.555 444 333"].filter((x) => /\d{3}/.test(String(sc8(x))));
  t("RV8-1: waybills written with a decimal point or comma are masked", rv81.length === 0, rv81.map((x) => `${x} → ${sc8(x)}`).join(" | "));
  // R8S-4: /open asks first from another site, never offers itself
  const { ACTS_WHEN_OPENED: acts8 } = await import("../src/lib/acts-when-opened.ts");
  t("R8S-4: /open reached from another site asks first; it never offers itself", acts8.test("/open") && /path !== "\/open"/.test(src("app/open/page.tsx")));
  // R8UP-1: the editor is never unmounted by «Страници»
  const we9 = src("components/WordEditor.tsx");
  t("R8UP-1: «⤢ Страници» hides the editor, never unmounts it (it came back empty and was saved empty)", /<div className="we-body" style=\{preview && pdfUrl \? \{ display: "none" \} : undefined\}>/.test(we9) && !/\{preview && pdfUrl \? \(/.test(we9));
  t("R8UP-2: the plan's team is locked in the editor like the Instruction's contacts", /body\.querySelectorAll<HTMLElement>\("div\.team"\)/.test(we9) && /const locked = Array\.from\(body\.querySelectorAll\("\[data-team-contacts\], div\.team"\)\);/.test(we9));
  t("R8UP-3: an organisation's user gets its own participation's certificate — its laboratory's name, opened as its own", /openLaboratories\(\{ actor: participantActor\(ps\.user\.id\), purpose: "lab\.own" \}, \{ entityId: ps\.entity\.id \}\)\)\.find\(\(l\) => l\.id === mine\.laboratoryId\)/.test(src("app/lab/doc/[scheme]/[doc]/route.ts")));
  t("R8UP-5: «Заключи (попълване)» makes the editor read-only from the press, saves, then leaves", /if \(body\) body\.contentEditable = "false";\n    setBusy\("fill"\);\n    if \(!\(await saveAll\(\)\)\) \{ if \(syncingRef\.current\) alert\(syncLost\(\)\); else if \(body\) body\.contentEditable = "true"; setBusy\(""\); return; \}/.test(we9));
  t("R8 verification: a save never deselects; a click that moved nothing is no edit", /const \{ nb, ne \} = snap \?\? \(\(\) => \{ const x = snapshot\(\); setBg\(x\.nb\); setEn\(x\.ne\); return x; \}\)\(\);/.test(we9) && /if \(dragMoved\.current\) setSaved\(false\);/.test(we9));
  // RV8-2: no inline «!important» however spelled; a negative margin however spelled
  const { sanitizeDocHtml: san9 } = await import("../src/lib/sanitize-html.ts");
  t("RV8-2: «!important» never kept inline (any spelling); a font name with «!» is none (round 9: letters, digits, spaces, «._-»)", !/important|!/.test(san9('<p style="color:red!/**/important;width:1px!\\69mportant">a</p>').replace(/<\/?p[^>]*>/g, (m) => (m.startsWith("<p ") ? m.replace(/style="[^"]*"/, (x) => x) : m)).match(/style="([^"]*)"/)?.[1] ?? "") && san9(`<p style="font-family:'A!B'">a</p>`) === "<p>a</p>" && /font-family:'A B'/.test(san9(`<p style="font-family:'A B'">a</p>`)));
  t("RV8-2: a negative margin as e-notation, calc(), var(), an unknown unit or -webkit- is dropped; Word's -42.55pt clamped to -1 mm (round 9)", ['margin-top:-5e3px', 'margin:calc(-1 * 5000px)', '--m:-5000px;margin-top:var(--m)', '-webkit-margin-before:-5000px', 'margin-top:-40lh'].every((c) => !/margin/.test(san9(`<div style="${c}">a</div>`))) && /margin-left:-1mm/.test(san9('<table style="margin-left:-42.55pt"><tr><td>a</td></tr></table>')));
  // RV8-4 / RV8-5: who signs
  const { findTeamMember: ftm } = await import("../src/lib/team-roles.ts");
  const mk = (bg: string, en: string, name = "x") => ({ roleBg: bg, roleEn: en, name });
  t("RV8-4: never a technical, quality, laboratory or office manager, never a deputy, as the scheme manager", [mk("Технически ръководител", "Technical Manager"), mk("Ръководител по качеството", "Quality Manager"), mk("Ръководител на лабораторията", "Laboratory Manager"), mk("Офис мениджър", "Office Manager"), mk("Заместник-ръководител на схемата", "Deputy PT Scheme Manager")].every((m) => !ftm([m], "manager")) && ftm([mk("Заместник-ръководител на схемата", "Deputy PT Scheme Manager", "D"), mk("Ръководител на схемата за изпитване за пригодност", "PT Scheme Manager", "M")], "manager")?.name === "M");
  t("RV8-4: the codes-and-results list's «Проверил» by the same rule", /const approver = findTeamMember\(s\.team \?\? \[\], "manager"\);/.test(src("lib/docs/results-coded.ts")));
  t("RV8-5: once a certificate is released, the scheme manager's row is not changed", /redirect\(`\/schemes\/\$\{id\}\/edit\?err=team-signed`\)/.test(actions) && /err === "team-signed"/.test(src("app/schemes/[id]/edit/page.tsx")));
  const { refreshTeam: rt9 } = await import("../src/lib/docs/instruction-common.ts");
  t("R8 verification: the plan's team put back under «Персонал…» when a selection took it", /class="team"/.test(rt9(`<h2 class="sec"><span class="n">2.</span> Персонал, участващ в схемата за изпитване за пригодност</h2><div class="body"><p>x</p></div>`, { team: [mk("Ръководител на схемата", "PT Scheme Manager", "M")] } as never, "bg")));
  t("R8UP-7: the empty editor's hint in the screen's language", /content:attr\(data-empty-hint\)/.test(we9) && /data-empty-hint=\{L\("Започнете да пишете/.test(we9));
  // R8UL: the lab account's home upload sends once; early input held in any marked part of a page
  t("R8UL-1: the lab account's home upload is sent once", /<OnceForm action=\{labUploadDocAction\}/.test(src("app/lab/page.tsx")) && !/<form action=\{labUploadDocAction\}/.test(src("app/lab/page.tsx")));
  t("R8UL-2/4: a join refusal's reason and the feedback sheet hold early input", /data-join-decision=\{id\} data-live-only/.test(src("components/JoinDecision.tsx")) && /<form data-live-only onSubmit=/.test(src("components/FeedbackForm.tsx")) && /t\.closest\("\[data-live-only\]"\)/.test(src("app/layout.tsx")));
}

// ── round 8, the final check ────────────────────────────────────────────────────────────────────
{
  const { findTeamMember: f9 } = await import("../src/lib/team-roles.ts");
  const m9 = (bg: string, en: string) => ({ roleBg: bg, roleEn: en, name: "x" });
  t("R8 final: a combined role naming the scheme manager is accepted («…и технически експерт», «Customer Service», «Officer»)", [m9("Ръководител на схемата и технически експерт", "PT Scheme Manager and Technical Expert"), m9("Ръководител на схемата (обслужване)", "PT Scheme Manager (Customer Service)"), m9("Ръководител на схемата", "PT Scheme Manager, Officer"), m9("Ръководител на РТ схемата", ""), m9("", "PT scheme manager")].every((x) => !!f9([x], "manager")));
  const { scrubIdentity: sc9 } = await import("../src/lib/redact.ts");
  const leak9 = ["AWB 1234.567890", "Speedy 62555,444333", "Еконт 1051,234567", "товарителница 625554.443331", "товарителница 1.234567890", "waybill 625.5544 4333", "62555444333,5 62555444334"].filter((x) => /\d{4}/.test(String(sc9(x))));
  t("R8 final: a courier reference with one decimal point or comma is masked; «…333,5» is no amount", leak9.length === 0, leak9.map((x) => `${x} → ${sc9(x)}`).join(" | "));
  t("R8 final: an amount written in thousands and a long decimal fraction kept", sc9("сума 1 234 567 890,00 лв.") === "сума 1 234 567 890,00 лв." && sc9("x = 0,123456789") === "x = 0,123456789");
  const { sanitizeDocHtml: san10 } = await import("../src/lib/sanitize-html.ts");
  t("R8 final: «!important» hidden behind a comment holding a quote is cut too", !/important/.test(san10(`<a href="https://x.example"><img class="free" style="pointer-events:auto/*'*/!important"></a>`)) && !/important/.test(san10(`<p style='color:red/*"*/!important'>a</p>`)));
  t("R8 final / round 9: a link and what is in it have no border, in every medium; an svg paints only inside its box", /\.pts-docbody a,\.pts-docbody a \*\{[^}]*border:0!important;/.test(src("lib/doc-css.ts")) && /\.pts-docbody svg\{overflow:hidden!important;\}/.test(src("lib/doc-css.ts")));
  const { refreshTeam: rt10 } = await import("../src/lib/docs/instruction-common.ts");
  const merged = `<h2 class="sec"><span class="n">2.</span> Персонал, участващ в схемата за изпитване за пригодност<span style="font-size: 13.5pt;">&nbsp;Информация за услуги, доставени от външни доставчици, свързани с тази схема</span></h2><div class="body"><p>x</p></div>`;
  const back10 = rt10(merged, { team: [{ roleBg: "Ръководител на схемата", roleEn: "PT Scheme Manager", name: "M" }] } as never, "bg");
  t("R8 final: the plan's team comes back under a heading with a span in it (a selection merged two headings) — once", (back10.match(/class="team"/g) ?? []).length === 1 && (rt10(back10, { team: [] } as never, "bg").match(/class="team"/g) ?? []).length === 1);
}


// ── round 9, the team: a duty is GIVEN to a person, never guessed from the role's words (T5, the part-1 review) ─
{
  const { findTeamMember: ft } = await import("../src/lib/team-roles.ts");
  type D = "manager" | "technical" | "coding";
  const r = (bg: string, en: string, name: string, ...duties: D[]) => ({ roleBg: bg, roleEn: en, name, ...(duties.length ? { duties } : {}) });
  const sales = r("Мениджър продажби", "Sales Manager", "S"), mgr = r("Ръководител на схемата", "PT Scheme Manager", "M"), mgr2 = r("Ръководител на РТ схемата", "Scheme Manager", "M2"), dep = r("Заместник-ръководител на схемата", "Deputy PT Scheme Manager", "D");
  t("T5: a duty nobody was given — a «Sales Manager» never signs; no one, when no row is the scheme manager", ft([sales, r("Технически експерт", "Technical expert", "T")], "manager") === undefined);
  t("T5: …two scheme managers: no one (never the row order); the deputy never", ft([mgr, mgr2], "manager") === undefined && ft([mgr2, mgr], "manager") === undefined && ft([dep, mgr], "manager")?.name === "M");
  t("T5: …one scheme manager by the role's own name: that one, whatever the order", ft([sales, mgr, dep], "manager")?.name === "M" && ft([dep, sales, mgr], "manager")?.name === "M");
  t("T5: a given duty decides, not the words", ft([r("Мениджър продажби", "Sales Manager", "S", "manager"), mgr], "manager")?.name === "S");
  t("T5: …a duty not given falls back to the role's own name — a technical expert added as a row is named (review 1)", ft([r("Ръководител на схемата", "PT Scheme Manager", "M", "manager"), r("Технически експерт", "Technical expert", "T")], "technical")?.name === "T");
  t("T5: …one person may hold two duties — the manager and the technical expert (review 3)", ft([r("Ръководител на схемата и технически експерт", "PT Scheme Manager and Technical Expert", "V", "manager", "technical")], "technical")?.name === "V" && ft([r("x", "y", "V", "manager", "technical")], "manager")?.name === "V");
  t("T5: the server reads «duty_<d>» as the row's index; the scheme manager must be given", /const dutyRow = \(d: TeamDuty\): number =>/.test(actions) && /duties: TEAM_DUTIES\.filter\(\(d\) => dutyRow\(d\) === i\)/.test(actions));
  t("T5: the «signed» lock only when someone DID sign (review 2)", /return !!was && JSON\.stringify\(\[was\.name, was\.roleBg, was\.roleEn\]\) !== JSON\.stringify/.test(actions));
  t("T5: the lists' compiler by the same reading — the registered list and F 7.2.1-6 (review 4)", /return findTeamMember\(s\.team \?\? \[\], "coding"\);/.test(src("lib/docs/registered.ts")) && /const compiler = findTeamMember\(s\.team \?\? \[\], "coding"\);/.test(src("lib/docs/results-coded.ts")) && !/function teamRole/.test(src("lib/docs/results-coded.ts")));
  t("T5: the sample teams carry their duties", /duties: \["manager"\]/.test(src("lib/seed-force.ts")) && /duties: \["technical"\]/.test(src("lib/seed-force.ts")) && /duties: \["manager"\]/.test(src("lib/seed-paving-blocks.ts")));
}

// ── round 9, stage 2 — T2 free text (Ivaylo 2026-11-13, option b): who sees codes only reads no typed words ──────────
// (the rule end to end, every page as every role: scratchpad qa/round9/freetext/verify-freetext.mjs)
{
  const red = await import("../src/lib/redact.ts");
  const nk = await import("../src/lib/notice-kinds.ts");
  type CE = Parameters<typeof red.redactCaseEventForStaff>[0];
  type AE = Parameters<typeof red.redactActivityForStaff>[0];
  const WB = "товарителница 62 555 444 333", NAME = "Лаборатория Тест ООД", PLAIN = "получено от Иван — всичко наред";
  const ce = (p: Partial<CE>): CE => ({ id: "c", schemeId: "S", code: "26111701", kind: "other", at: "2026-11-15", recordedBy: "ana@ptsbg.eu", recordedAt: "2026-11-15T10:00:00Z", source: "manual", ...p });

  // F1 — a timeline step's typed words: hidden whatever they hold, said so; the rest of the step kept
  for (const words of [WB, NAME, PLAIN, "ok", "12"]) {
    const r = red.redactCaseEventForStaff(ce({ ref: words, note: words, voidReason: words, voidedAt: "2026-11-15T11:00:00Z", voidedBy: "ana@ptsbg.eu" }));
    t(`round 9 F1: a step's reference, note and void reason hidden, whatever they hold («${words}»)`, r.ref === undefined && r.note === undefined && r.voidReason === undefined
      && JSON.stringify(r.hidden) === JSON.stringify(["ref", "note", "voidReason"]) && r.kind === "other" && r.at === "2026-11-15" && r.recordedBy === "ana@ptsbg.eu" && r.voidedBy === "ana@ptsbg.eu", JSON.stringify(r));
  }
  const bare = ce({});
  t("round 9 F1: a step with no typed words comes back as it is", red.redactCaseEventForStaff(bare) === bare);
  t("round 9 F1: an older stamp of a laboratory — its recorder «laboratory»", red.redactCaseEventForStaff(ce({ source: "auto", recordedBy: "office@lab.bg", note: "x" })).recordedBy === red.LAB_RECORDER);
  // …but the app's own note on a step it stamped (AUTO_NOTE_KINDS) — read where it is written; a typed one never
  const own9 = red.redactCaseEventForStaff(ce({ source: "auto", kind: "receipt_confirmed", recordedBy: red.LAB_RECORDER, ref: "W2-52234", note: "онлайн протокол за получаване 11:24: НЕгоден · online receipt protocol 11:24: NOT fit" }));
  t("round 9 F1: the app's own note on its stamp (a listed kind) kept — its reference hidden", own9.note === "онлайн протокол за получаване 11:24: НЕгоден · online receipt protocol 11:24: NOT fit" && own9.ref === undefined && own9.hidden === undefined /* the app's own ref is not announced as typed (round 9 review) */, JSON.stringify(own9));
  t("round 9 F1: …not of an unlisted kind (PTS's dispatch names the scheme's documents), nor a step PTS recorded by hand (the chain's stamps)",
    red.redactCaseEventForStaff(ce({ source: "auto", kind: "items_dispatched", note: "dispatched; documents: Декларация" })).note === undefined
    && red.redactCaseEventForStaff(ce({ source: "manual", kind: "receipt_confirmed", note: `device received 12:30 (calibration chain) — recorded by PTS: ${NAME}` })).note === undefined
    && !("items_dispatched" in red.AUTO_NOTE_KINDS));
  // every auto stamp of a listed kind is one read for the list: a new one, or a changed note, fails here until read
  const REVIEWED9 = [
    "prev ? \"заменен от лабораторията (качен в портала) · replaced by the laboratory (portal upload)\" : \"качен от лабораторията (портала) · uploaded by the laboratory (portal)\",",
    "`device received ${sofiaTime(at)} (calibration chain)`, source: \"auto\",",
    "`device handed on ${sofiaTime(at)} (calibration chain)`, source: \"auto\",",
    "`онлайн протокол за получаване ${fields.time}: ${fields.suitable ? \"годен\" : \"НЕгоден\"}${fields.undamaged ? \"\" : \" (повредена опаковка)\"} · online receipt protocol ${fields.time}: ${fields.suitable ? \"fit\" : \"NOT fit\"}${fields.undamaged ? \"\" : \" (packaging damaged)\"}`,",
    "`онлайн резултати — версия ${version}${lateBy ? \" (отключено от PTS след срока)\" : \"\"} · online results — version ${version}${late}`, recordedBy: LAB_RECORDER, source: \"auto\""
  ];
  const listed9 = [...actions.matchAll(/addCaseEvent\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]).filter((b) => /source: "auto"/.test(b))
    .filter((b) => (/kind: "([a-z_]+)"/.exec(b)?.[1] ?? "") in red.AUTO_NOTE_KINDS || /kind: slotDef\.kind/.test(b)).map((b) => (/note: ([^\n]*)/.exec(b)?.[1] ?? "").trim());
  t("round 9 F1: every auto stamp of a listed kind writes a note read for the list (built from the record's data only)", listed9.length === REVIEWED9.length && listed9.every((n) => REVIEWED9.includes(n)), listed9.filter((n) => !REVIEWED9.includes(n)).join(" | "));
  t("round 9 F1: the calibration chain's stamp note — to who sees names only", /note: seesNames \? st\.received\.note : undefined/.test(src("app/schemes/[id]/page.tsx")) && /note: seesNames \? st\.sent\.note : undefined/.test(src("app/schemes/[id]/page.tsx")));
  t("round 9 F1: the pages hide (the case file, traceability, the audit pack's codes-only copy) and say so; the round export (names only) masks",
    /canReveal \? e : redactCaseEventForStaff\(e\)/.test(src("app/schemes/[id]/participants/[code]/page.tsx")) && /data-typed-hidden/.test(src("app/schemes/[id]/participants/[code]/page.tsx"))
    && /reveal \? rawEvents : rawEvents\.map\(redactCaseEventForStaff\)/.test(src("app/schemes/[id]/traceability/page.tsx")) && /e\.hidden\?\.length \?/.test(src("app/schemes/[id]/traceability/page.tsx"))
    && /showNames \? e : redactCaseEventForStaff\(e\)/.test(src("app/schemes/[id]/audit-pack/route.ts")) && /data-typed-hidden/.test(src("app/schemes/[id]/audit-pack/route.ts"))
    && /maskCaseEventForExport\(e\)/.test(src("lib/round-export.ts")) && /maskActivityForExport\(e\)/.test(src("lib/round-export.ts")));
  // decision 3 — the audit pack: its results and their evaluation only with results.read
  t("round 9: the audit pack's results and evaluation only to who reads the results (the head: the pack without them)",
    /const seesResults = await mayNow\("results\.read", id\);/.test(src("app/schemes/[id]/audit-pack/route.ts")) && /const metrics = seesResults \? metricsForScheme\(scheme\) : \[\];/.test(src("app/schemes/[id]/audit-pack/route.ts"))
    && /\$\{seesResults \? `<h3>/.test(src("app/schemes/[id]/audit-pack/route.ts")));

  // the journal — an allow-list: words only of the listed actions; the label, the code, the time otherwise
  const ev = (p: Partial<AE>): AE => ({ id: "1", at: "2026-11-15T10:00:00Z", actorEmail: "ana@ptsbg.eu", actorRole: "staff", action: "x", summary: "", ...p });
  for (const [action, summary] of [["case.updated", `Timeline: other for 26111701 (${PLAIN})`], ["deadline.extended", `26111701: the results deadline extended to 2026-12-01 by Order No. 7 of 2026-11-15 — ${NAME}`],
    ["labdoc.uploaded", "Proforma invoice No. 12345 sent to 26111701"], ["some.new_action", NAME]]) {
    const r = red.redactActivityForStaff(ev({ action, summary, schemeId: "S", targetCode: "26111701" }));
    t(`round 9 journal: «${action}» — the label, the code and the time, never its words`, r.summary === "" && r.summaryHidden === true && r.targetCode === "26111701" && r.at === "2026-11-15T10:00:00Z", JSON.stringify(r));
  }
  const ok9 = red.redactActivityForStaff(ev({ action: "results.submitted", summary: "26111701 submitted its results online — version 2", schemeId: "S" }));
  t("round 9 journal: a line built from the record's own data — as it is", ok9.summary === "26111701 submitted its results online — version 2" && !ok9.summaryHidden);
  const mail9 = red.redactActivityForStaff(ev({ action: "lab_application.approved", summary: "Lab application approved for office@primer-lab.bg" }));
  t("round 9 journal: an older line's e-mail in shown words — masked", !mail9.summary.includes("primer-lab") && mail9.summary.includes("•••@•••"), mail9.summary);
  const up9 = red.redactActivityForStaff(ev({ action: "lab.uploaded", summary: "Lab upload: protocol (Protokol_Primer_Lab_OOD.pdf)" }));
  const disp9 = red.redactActivityForStaff(ev({ action: "delivery.dispatched", summary: "The object for 26111677 — 2026-11-11, waybill 62 123 456 789" }));
  t("round 9 journal: older lines in the known forms — the file name and the waybill cut, as before", up9.summary === "Lab upload: protocol" && disp9.summary === "The object for 26111677 — 2026-11-11, waybill •••", `${up9.summary} | ${disp9.summary}`);
  const ba9 = red.redactActivityForStaff(ev({ action: "deadline.extended", schemeId: "S", before: { until: "2026-11-20" },
    after: { until: "2026-12-01", orderNo: "7", orderDate: "2026-11-15", reason: PLAIN, n: 3, ok: true, by: "entityuser:7b81e94d-0bbf-4008-a67c-f454b4bfbdaf", dates: { resultsDue: "2026-12-01" }, note: WB, number: "12345" } }));
  t("round 9 journal: before/after — states, dates, numbers kept; every typed string and every id «•••»",
    JSON.stringify(ba9.after) === JSON.stringify({ until: "2026-12-01", orderNo: "•••", orderDate: "2026-11-15", reason: "•••", n: 3, ok: true, by: "•••", dates: { resultsDue: "2026-12-01" }, note: "•••", number: "•••" })
    && JSON.stringify(ba9.before) === JSON.stringify({ until: "2026-11-20" }), JSON.stringify(ba9.after));
  const staff9 = red.redactActivityForStaff(ev({ action: "staff.added", summary: "Staff ana@ptsbg.eu added as staff", after: { by: "head@ptsbg.eu" } }));
  t("round 9 journal: a line about PTS's own people — as before", staff9.summary === "Staff ana@ptsbg.eu added as staff" && JSON.stringify(staff9.after) === JSON.stringify({ by: "head@ptsbg.eu" }));
  const actor9 = red.redactActivityForStaff(ev({ action: "auth.logout", summary: "Signed out", actorEmail: "office@lab.bg", actorRole: "none", actorName: "office@lab.bg", actorId: "u" }));
  t("round 9 journal: the actor's rules as before — an unrecognised account masked, no id", actor9.actorEmail === "•••@•••" && actor9.actorName === "•••@•••" && actor9.actorId === undefined);
  t("round 9 journal: the page marks a line whose words are hidden, with its code", /\.map\(\(e\): ShownActivityEvent => \(authorize\(viewer, "names\.view", e\.schemeId \?\? undefined\) \|\| \(e\.action === "deadline\.extended" && authorize\(viewer, "order\.manage", e\.schemeId \?\? undefined\)\) \? e : redactActivityForStaff\(e\)\)\)/.test(src("app/activity/page.tsx")) && /data-summary-hidden/.test(src("app/activity/page.tsx")));
  // every action the portal writes is placed — shown with its reason, or hidden — so a new one is decided, not leaked
  const { readdirSync } = await import("node:fs");
  const written9 = new Set<string>();
  for (const f of readdirSync(new URL("../src/", import.meta.url), { recursive: true }) as string[]) {
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const s = src(f);
    for (const m of s.matchAll(/(?:logActivity\(|logAs\(\s*\{[^}]*\}\s*,|\blog\(|\.log\()\s*(?:[\w.!]+(?:\s*===\s*"[^"]*")?\s*\?\s*)?"([a-z_]+\.[a-z_0-9]+)"(?:\s*:\s*"([a-z_]+\.[a-z_0-9]+)")?/g)) { written9.add(m[1]); if (m[2]) written9.add(m[2]); }
  }
  const labelled9 = [...src("lib/i18n.ts").matchAll(/"act\.([a-z_]+\.[a-z_0-9]+)"/g)].map((m) => m[1]);
  const unplaced9 = [...new Set([...labelled9, ...written9])].filter((a) => !/^(staff|role)\./.test(a) && !(a in red.SUMMARY_SHOWN) && !(a in red.SUMMARY_HIDDEN));
  t("round 9 journal: every action written or labelled is placed — shown (with why) or hidden", unplaced9.length === 0 && written9.size > 100, `${written9.size} written; unplaced: ${unplaced9.join(", ")}`);
  t("round 9 journal: shown and hidden do not overlap; the three typed ones hidden", Object.keys(red.SUMMARY_SHOWN).every((a) => !(a in red.SUMMARY_HIDDEN))
    && ["case.updated", "deadline.extended", "labdoc.uploaded"].every((a) => a in red.SUMMARY_HIDDEN));

  // F2 — the courier on F 7.2.1-4: masked as the identity columns
  t("round 9 F2: the courier on «Регистрирани участници» masked for who sees no names", /<td class="c">\$\{maskCell\(reveal, p\.courier \?\? "", lang\)\}<\/td>/.test(src("lib/docs/registered.ts")) && !/esc\(p\.courier/.test(src("lib/docs/registered.ts")));

  // F3 (and F4, F5 on «Известия») — a notice whose words carry what a person typed: its label, code and time to who sees
  // no names, held or sent; released only by who sees names (as the courier's)
  t("round 9 F3: the three kinds", ["participation.refused", "deadline.extended", "invoice.ready"].every((k) => nk.TYPED_NOTICE_KINDS.has(k)) && nk.TYPED_NOTICE_KINDS.size === 3);
  const np9 = src("app/notices/page.tsx");
  t("round 9 F3: «Известия» — held and sent, their words to who sees names in the scheme; the line said instead",
    /const seesHeld = \(n: \{ schemeId\?: string; kind: string \}\) => \(!COURIER_NOTICE_KINDS\.has\(n\.kind\) && !TYPED_NOTICE_KINDS\.has\(n\.kind\)\) \|\| seesAddress\(n\.schemeId\) \|\| seesOwnOrder\(n\);/.test(np9)
    && /!!m\.code && !COURIER_NOTICE_KINDS\.has\(m\.kind\) && !TYPED_NOTICE_KINDS\.has\(m\.kind\)/.test(np9)
    && (np9.match(/data-typed-words-hidden/g) ?? []).length === 2 && /TYPED_NOTICE_KINDS\.has\(n\.kind\) \? <div data-typed-words-hidden/.test(np9));
  t("round 9 F3: such a notice released only by who sees names in its scheme — said so",
    /if \(decision === "release" && TYPED_NOTICE_KINDS\.has\(notice\.kind\) && !\(await mayNow\("names\.view", notice\.schemeId\)\)\) redirect\("\/notices\?refused=typed"\);/.test(actions) && /refusedAs === "typed" && <div role="alert" data-notice-typed-needed/.test(np9));
  t("round 9 F3: the laboratory and the e-mail get the whole text — nothing stored differently", !/typed/.test(src("lib/notifications.ts")) && /Основание: \$\{reason\}/.test(src("lib/notify-events.ts")) && /по Заповед № \$\{orderNo\}/.test(src("lib/notify-events.ts")));

  // F4 — an extension's order number and reason: to who sees names only, everywhere PTS's pages show them
  const cp9 = src("app/schemes/[id]/participants/[code]/page.tsx");
  t("round 9 F4: the case file — the deadlines «удължен по заповед», the list without number and reason, for who sees no names",
    (cp9.match(/seesExtension \? \(lang === "bg" \? `удължен по Заповед №/g) ?? []).length === 2 && /\{seesExtension \? <>\{lang === "bg" \? "Заповед №" : "Order No\."\} \{e\.orderNo\}/.test(cp9));
  t("round 9 F4: the calibration chain — a stop's window «удължен», its order's number to who sees names (and, the attack round, who grants it)",
    /orderNo: seesExtension \? w\.ext\?\.orderNo : undefined, extended: !!w\.ext/.test(src("app/schemes/[id]/page.tsx")) && /r\.due\.extended \?/.test(src("components/SchemeChainPanel.tsx")));

  // the side items
  t("round 9: a carrier's offer takes 60 characters, as the server", /name="carrier" required maxLength=\{60\}/.test(src("components/CarrierOffersPanel.tsx")));
  t("round 9: the subcontracted part on the case file only under the reveal step (an opening on record)", /\{revealed \? `: \$\{d\.confirmations\.subcontractedPart/.test(cp9) && !/canReveal \? `: \$\{d\.confirmations\.subcontractedPart/.test(cp9));
}


// ── round 9, part 2 review: who typed it reads it; the app's own steps are not «typed» ───────────────
{
  const { redactCaseEventForStaff: rc } = await import("../src/lib/redact.ts");
  const own = rc({ id: "e", schemeId: "S", code: "1", kind: "results_returned", day: "2026-11-15", source: "auto", recordedBy: "laboratory", ref: "v1", note: "online results — version 1" } as never) as { ref?: string; note?: string; hidden?: string[] };
  t("R9 review: a step the app stamped — its ref kept out, never announced as typed words; its note shown", own.ref === undefined && !(own.hidden ?? []).includes("ref") && own.note === "online results — version 1");
  const typed = rc({ id: "e", schemeId: "S", code: "1", kind: "other", day: "2026-11-15", source: "manual", recordedBy: "staff@x", ref: "товарителница 1", note: "бележка" } as never) as { ref?: string; note?: string; hidden?: string[] };
  t("R9 review: …a step PTS typed — its ref and note hidden and announced", typed.ref === undefined && typed.note === undefined && (typed.hidden ?? []).includes("ref") && (typed.hidden ?? []).includes("note"));
  const pp = src("app/schemes/[id]/participants/[code]/page.tsx");
  t("R9 review: an extension's Order number and reason — also to who issues the Orders (the head typed them)", /const seesExtension = canReveal \|\| \(await mayNow\("order\.manage", id\)\);/.test(pp) && (pp.match(/seesExtension \?/g) ?? []).length >= 2
    && /e\.action === "deadline\.extended" && authorize\(viewer, "order\.manage"/.test(src("app/activity/page.tsx")) && /const seesOwnOrder = /.test(src("app/notices/page.tsx")));
  t("R9 review: the messages name who can act — the journal for the scheme manager; the notice sent by the scheme manager", /думите на реда — за ръководителя на схемата"/.test(src("app/activity/page.tsx")) && /изпраща го ръководителят на схемата/.test(src("app/notices/page.tsx")));
  t("R9 review: the scheme page links the audit pack with names for who sees names", /\{seesNames && <a href=\{`\/schemes\/\$\{id\}\/audit-pack\?lang=\$\{lang\}&names=1`\}/.test(src("app/schemes/[id]/page.tsx")));
}

// ── round 9, the editor's saves: the version belongs to the TAB, not to each opening of the editor (T3 F1/F2) ─────────
{
  const we10 = src("components/WordEditor.tsx");
  const read10 = src("lib/doc-editor-read.ts");
  const page10 = src("app/schemes/[id]/build/[doc]/page.tsx");
  const tab = await import("../src/lib/doc-tab.ts");
  const sync10 = we10.slice(we10.indexOf("async function syncWithTab("), we10.indexOf("function adoptStored("));
  const adopt10 = we10.slice(we10.indexOf("function adoptStored("), we10.indexOf("function adoptStored(") + 1400);
  // wiring
  t("T3: every save is named; the tab's record told before it goes and when it is answered", /sid = newSaveId\(\);\n\s*mySids\.current = \[\.\.\.mySids\.current, sid\]\.slice\(-30\);\n\s*tabSent\(schemeId, docKey, sid\);\n\s*const r = await saveDocHtmlAction\(schemeId, docKey, \{ bg: nb, en: ne, rev: revRef\.current, sid \}\);\n\s*tabAnswered\(schemeId, docKey, sid, /.test(we10));
  t("T3: the save chain is the tab's — the next opening of the document waits for it, the closing save too", /saveChain\.current = p\.catch\(\(\) => false\);\n\s*tabTrack\(schemeId, docKey, saveChain\.current\);/.test(we10) && /if \(!savedRef\.current && ref\.current\) void save\(snapshot\(\)\);/.test(we10));
  t("T3 F1/F2: an editor opened again reads the tab's newer copy first — read-only before the first paint, every save after it", /useLayoutEffect\(\(\) => \{\n\s*if \(!canEdit \|\| syncingRef\.current\) return;\n\s*const plan = planOpen\(schemeId, docKey, initialRev\);\n\s*if \(!plan\.read\) return;\n\s*syncingRef\.current = true;\n\s*if \(ref\.current\) ref\.current\.contentEditable = "false";/.test(we10) && /async function saveOnceNow\(snap\?: \{ nb: string; ne: string \}\): Promise<boolean> \{\n[^\n]*\n[^\n]*\n\s*if \(editGen\.current !== savedGen\.current\) await synced\.current;/.test(we10) && /await Promise\.race\(\[plan\.wait\.catch\(\(\) => \{\}\), sleepMs\(SYNC_WAIT_MS\), woken\(\)\]\);/.test(sync10) && /if \(ref\.current && busyRef\.current !== "fill"\) ref\.current\.contentEditable = "true";/.test(sync10));
  t("T3: what is read is shown and its version taken; nothing waits to be saved; a read that never comes is said", /revRef\.current = got\.rev;\n\s*tabAdopt\(schemeId, docKey, got\.rev, settled\);/.test(adopt10) && /savedGen\.current = editGen\.current;\n\s*setSaved\(true\);/.test(adopt10) && /<span data-sync-error/.test(we10) && /if \(l === lang \|\| syncingRef\.current\) return;/.test(we10));
  t("T3: the server keeps each save's id with its version and names the stored ones in a refusal; any other id is none", /\[docKey\]: \{ bg: cleanBg, en: cleanEn, rev, \.\.\.\(sid && tag \? \{ sid, sidBy: tag \} : \{\}\) \}/.test(actions) && /keptRev = kept; keptSid = sidFor\(cur\.docs\?\.\[docKey\], tag\) \?\? undefined;\n\s*if \(loaded !== null && loaded !== kept\) \{ stale = true; return \{\}; \}/.test(actions) && /const sid = typeof sidIn === "string" && SAVE_ID\.test\(sidIn\) \? sidIn : undefined;/.test(actions));
  t("T3: the editor's read and its peek are gated before anything is read", /export async function readDocForEditorAction\(schemeId: string, docKey: string\)[^\n]*\n[^\n]*\n\s*await requireCap\("codes\.view", schemeId\);[^\n]*\n\s*const d = await editorDocNow\(schemeId, docKey\);/.test(actions) && /export async function peekDocForEditorAction\(schemeId: string, docKey: string\)[^\n]*\n[^\n]*\n\s*await requireCap\("codes\.view", schemeId\);[^\n]*\n\s*const v = await editorDocVersion\(schemeId, docKey\);/.test(actions));
  // the read: the page's gates, all and only, and its body line for line (the page keeps its own lines — gates read them)
  const gates = (f: string) => [...f.matchAll(/await (require\w+)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`).sort().join(" | ");
  const pinned = [
    'if (isRestrictedDoc(doc)) await requireCap("names.view", id);',
    "const coded = (await listParticipants(id)).filter(inRound);",
    'const reveal = await mayNow("names.view", id);',
    "const participants = reveal && showsIdentities(doc) ? await namesFor(id, coded) : coded.map(withoutIdentity);",
    'if (reveal && pairsNamesWithCodes(doc) && participants.length) await logActivity("names.viewed", { schemeId: id, subject: `doc:${doc}`, summary: `Laboratory names shown with their codes — the document ${doc}` });',
    'const saved0 = (isList || showsIdentities(doc)) && !reveal ? { bg: "", en: "" } : (savedDocBody(s, doc) ?? { bg: "", en: "" });',
    "const dft = defaultDocHtml(s, doc, participants, reveal);",
    '? { bg: retagFormBody(saved0.bg ?? "", dft.bg), en: retagFormBody(saved0.en ?? "", dft.en) }',
    'refreshTeam(doc === "instruction" ? refreshInstruction(body, s, l) : body, s, l)',
  ];
  const peek10 = read10.slice(read10.indexOf("export async function editorDocVersion("), read10.indexOf("export async function editorDocNow("));
  t("T3: the editor's read — the page's gates, all and only (for the body and the version alike), and its body line for line", gates(page10) === gates(read10) && gates(read10).split(" | ").length === 4 && (read10.match(/await editorGate\(id, doc\);/g) ?? []).length === 2 && pinned.every((l) => page10.includes(l) && read10.includes(l)) && /initialRev=\{s\.docs\?\.\[doc\]\?\.rev \?\? 0\}/.test(page10) && /rev: s\.docs\?\.\[doc\]\?\.rev \?\? 0, sid: sidFor\(s\.docs\?\.\[doc\], await saverTagNow\(\)\)/.test(read10), `${gates(page10)} ≠ ${gates(read10)}; missing: ${pinned.filter((l) => !(page10.includes(l) && read10.includes(l))).join(" ¦ ")}`);
  t("T3: the autosave waits AUTOSAVE_MS after the last edit, never more than AUTOSAVE_MAX_WAIT_MS of steady typing", tab.AUTOSAVE_MS === 2500 && tab.AUTOSAVE_MAX_WAIT_MS === 20_000 && tab.autosaveWait(1000, 1000) === 2500 && tab.autosaveWait(0, 19_000) === 1000 && tab.autosaveWait(0, 25_000) === 0 && tab.autosaveWait(0, 25_000, 2500) === 2500 && /const wait = autosaveDelay\(dirtySince, atLeast\);/.test(we10) && (() => { const d: { current: number | null } = { current: null }; return tab.autosaveDelay(d) === 2500 && typeof d.current === "number" && tab.autosaveDelay({ current: Date.now() - 30_000 }) === 0 && tab.autosaveDelay({ current: Date.now() - 30_000 }, 2500) === 2500; })());
  t("T3: «Готов» refused — said, never nothing", /if \(!r\?\.error\) setReady\(next\);\n\s*else alert\(/.test(we10));
  // review 3
  t("T3 review 1: one autosave queued or on its way at most — a hung save never floods; the maximum wait counts again from the queue", /function queueSave\(\) \{\n\s*dirtySince\.current = null;\n\s*if \(autoQueued\.current\) return;\n\s*const p = save\(\);\n\s*autoQueued\.current = p;/.test(we10) && /scheduleAutosave\(AUTOSAVE_MS\); else queueSave\(\); \}/.test(we10) && /if \(!savedRef\.current\) queueSave\(\);/.test(we10) && !/else void save\(\); \}/.test(we10) && !/if \(!savedRef\.current\) void save\(\);/.test(we10));
  t("T3 review 2: an empty stored copy opens the start screen, as the page — never the old body shown as «saved»", /setCoverIn\(hasCover\(nb\) \|\| hasCover\(ne\)\);\n[^\n]*\n[^\n]*\n\s*if \(got\.bg === "" && got\.en === ""\) setStarted\(false\);/.test(adopt10));
  t("T3 review 3: after a failed sync «Заключи (попълване)» keeps the editor read-only and says so; nothing to save is no refusal", /if \(!\(await saveAll\(\)\)\) \{ if \(syncingRef\.current\) alert\(syncLost\(\)\); else if \(body\) body\.contentEditable = "true";/.test(we10) && we10.indexOf("if (gen === savedGen.current) { dirtySince.current = null;") < we10.indexOf("if (syncingRef.current) return false;") && /Презаредете страницата/.test(we10.slice(we10.indexOf("const syncLost = "), we10.indexOf("const syncLost = ") + 300)));
  t("T3 review 4: the sync stops when its editor is gone, and at the first refused read — never asked again (each refusal a navigation)", /useLayoutEffect\(\(\) => \{ alive\.current = true; return \(\) => \{ alive\.current = false; \}; \}, \[\]\);/.test(we10) && (sync10.match(/if \(!alive\.current\) return;/g) ?? []).length >= 5 && /if \(!v\) return failed\(\);/.test(sync10) && /if \(!got\) return failed\(\);/.test(sync10) && !/i >= SYNC_POLLS/.test(sync10));
  t("T3 review 5: the wait is bounded by time; the version is peeked at (no body, nothing journalled), the body read once; a thrown save is answered", /const quick = deadline\(SYNC_POLL_TOTAL_MS\);/.test(sync10) && /const v = await ask<\{ rev: number; sid: string \| null \}>\(\(\) => peekDocForEditorAction\(schemeId, docKey\)\);/.test(sync10) && (we10.match(/readDocForEditorAction\(schemeId, docKey\)/g) ?? []).length === 1 && !/logActivity|savedDocBody|namesFor/.test(peek10) && /if \(sid && !pageLeaving\(\)\) tabAnswered\(schemeId, docKey, sid, null\);/.test(we10) && tab.SYNC_POLL_TOTAL_MS === 4000 && tab.deadline(0).passed() && !tab.deadline(60_000).passed());
  t("T3 review 6: only THIS opening's echo is taken; another opening's late save is refused and said, never written over; an unanswered save is waited for, read-only", /if \(r\?\.stale && typeof r\.rev === "number" && !again && !!r\.sid && mySids\.current\.includes\(r\.sid\)\) \{ revRef\.current = r\.rev; continue; \}/.test(we10) && /if \(r\?\.stale && isOwnSave\(schemeId, docKey, r\.sid\)\) \{ setSaveErr\(/.test(we10) && /if \(unansweredAge\(schemeId, docKey\) >= SYNC_GIVE_UP_MS \|\| gaveUp\.passed\(\)\) break;/.test(sync10) && tab.SYNC_GIVE_UP_MS === 60_000);
  // review 3, recheck
  t("T3 recheck 1: the wait says up to a minute and that a reload does not shorten it; «Отвори записаното сега» takes the stored copy at once", /до една минута — презареждането не скъсява чакането/.test(sync10) && /function openStoredNow\(\) \{ openNow\.current = true; wake\.current\?\.\(\); \}/.test(we10) && (we10.match(/data-sync-open-now onClick=\{openStoredNow\}/g) ?? []).length === 2 && /while \(plan\.read && \(plan\.wait \|\| plan\.awaitSid\) && !openNow\.current\)/.test(sync10) && /if \(plan\.read \|\| openNow\.current\) \{/.test(sync10));
  t("T3 recheck 1: …safe — a save landing after it is refused and said, never taken as this opening's echo", /!!r\.sid && mySids\.current\.includes\(r\.sid\)\) \{ revRef\.current = r\.rev; continue; \}/.test(we10) && !/isOwnSave\(schemeId, docKey, r\.sid\)\) \{ revRef\.current/.test(we10));
  t("T3 recheck 2: a failed peek or read is tried again within the time bound; a refusal (Next's redirect) stops at the first", /if \(isNextRefusal\(e\) \|\| i >= SYNC_RETRIES \|\| gaveUp\.passed\(\) \|\| !alive\.current\) return null;/.test(sync10) && /const got = await ask<EditorDocNowIn>\(\(\) => readDocForEditorAction\(schemeId, docKey\)\);/.test(sync10) && tab.SYNC_RETRIES === 4 && tab.isNextRefusal({ digest: "NEXT_REDIRECT;push;/denied;307;" }) && tab.isNextRefusal({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }) && !tab.isNextRefusal(new TypeError("Failed to fetch")) && !tab.isNextRefusal(null) && !tab.isNextRefusal({ digest: 3 }));
  t("T3 recheck 3: the refusal of a newer copy is true in this tab and in a duplicated one", /от този или от друг раздел/.test(we10) && /from this tab or another/.test(we10) && !/по-ранно отваряне на документа в този раздел/.test(we10));
  // T3 F2, traced: a save broken off as the page leaves is not marked answered — the next opening waits for it
  t("T3 F2 (traced): a save that throws while the page leaves stays unanswered — the next opening waits for it; one that fails while the page stays is answered", /if \(sid && !pageLeaving\(\)\) tabAnswered\(schemeId, docKey, sid, null\);/.test(we10) && /window\.addEventListener\("pagehide", \(\) => markLeaving\(true\)\);/.test(src("lib/doc-tab.ts")) && /window\.addEventListener\("pageshow", \(\) => markLeaving\(false\)\);/.test(src("lib/doc-tab.ts")) && !tab.pageLeaving() && (tab.markLeaving(true), tab.pageLeaving()) && (tab.markLeaving(false), !tab.pageLeaving()));
  // behaviour: the tab's record (a storage of the test's own — a full page load keeps it, the module's memory not)
  const kv = new Map<string, string>();
  const ss = { getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => { kv.set(k, v); } };
  const S = "26-01-T-1", D = "plan";
  tab.__tabForTests(ss);
  const first = tab.planOpen(S, D, 0);
  t("T3: a first opening — nothing to wait for, nothing to read", first.wait === null && !first.read && first.awaitSid === null);
  // F1: the save of the editor before answered after its page left; Back/Forward bring back the copy of version 3
  let settle!: () => void;
  const onItsWay = new Promise<void>((res) => { settle = res; });
  tab.tabSent(S, D, "s1-aaaaaaaa"); tab.tabTrack(S, D, onItsWay);
  const during = tab.planOpen(S, D, 3);
  t("T3 F1: opened again while that save is on its way — waits for it", during.wait === onItsWay && during.read);
  tab.tabAnswered(S, D, "s1-aaaaaaaa", 4); settle(); await onItsWay; await Promise.resolve();
  const after = tab.planOpen(S, D, 3);
  t("T3 F1: …then reads the stored copy (version 4 known; the page's copy is version 3)", after.wait === null && after.read && after.awaitSid === null);
  t("T3: a page drawn after that save — nothing to read", !tab.planOpen(S, D, 4).read && !tab.planOpen(S, "instruction", 0).read);
  // F2: a full load while a save of this tab was on its way (its page gone, its answer never seen)
  tab.tabSent(S, D, "s2-bbbbbbbb");
  tab.__tabForTests(ss);
  const f2 = tab.planOpen(S, D, 4);
  t("T3 F2: a reload with a save of this tab unanswered — reads until the stored copy is that save", f2.read && f2.awaitSid === "s2-bbbbbbbb" && f2.wait === null);
  t("T3 review 6: …its age is known (by this browser's clock); none once answered", tab.unansweredAge(S, D) >= 0 && tab.unansweredAge(S, D) < 5000);
  tab.tabAdopt(S, D, 5, "s2-bbbbbbbb");
  t("T3 F2: …once taken, an opening of version 5 reads nothing", !tab.planOpen(S, D, 5).read && tab.unansweredAge(S, D) === -1);
  t("T3: this tab's saves are its own (through a reload); another's, or none, are not", tab.isOwnSave(S, D, "s2-bbbbbbbb") && tab.isOwnSave(S, D, "s1-aaaaaaaa") && !tab.isOwnSave(S, D, "s9-zzzzzzzz") && !tab.isOwnSave(S, D, null) && !tab.isOwnSave(S, "instruction", "s2-bbbbbbbb"));
  tab.tabSent(S, D, "s3-cccccccc"); tab.tabAnswered(S, D, "s3-cccccccc", null);
  t("T3: a refused save is answered — nothing to wait for — and stores no version", !tab.planOpen(S, D, 5).read && tab.planOpen(S, D, 4).read);
  // review 4: an adoption never takes the tab's version back, and settles only the save it waited for
  tab.tabSent(S, D, "s5-eeeeeeee"); tab.tabAnswered(S, D, "s5-eeeeeeee", 7);
  tab.tabAdopt(S, D, 5, null);
  t("T3 review 4: an opening that took version 5 after version 7 was answered — the tab still knows 7", tab.planOpen(S, D, 6).read && !tab.planOpen(S, D, 7).read);
  tab.tabSent(S, D, "s6-ffffffff"); // a newer editor's save, on its way
  tab.tabAdopt(S, D, 7, "s5-eeeeeeee");
  t("T3 review 4: …and settles only the save it waited for — a newer editor's still on its way stays unanswered", tab.planOpen(S, D, 7).awaitSid === "s6-ffffffff");
  tab.tabAdopt(S, D, 8, "s6-ffffffff");
  t("T3 review 4: …which the opening that waited for it settles", tab.planOpen(S, D, 8).awaitSid === null && !tab.planOpen(S, D, 8).read);
  tab.__tabForTests({ getItem: () => null, setItem: () => {} });
  t("T3: another tab (its own storage, its own memory) — none of this tab's saves, nothing to read", !tab.isOwnSave(S, D, "s2-bbbbbbbb") && !tab.planOpen(S, D, 0).read);
  tab.__tabForTests({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  tab.tabSent(S, D, "s4-dddddddd"); tab.tabAnswered(S, D, "s4-dddddddd", 9);
  t("T3: storage blocked — the page's own memory still holds the record", tab.planOpen(S, D, 8).read && tab.isOwnSave(S, D, "s4-dddddddd") && tab.unansweredAge(S, D) === -1);
  t("T3: a save id is one the server takes", tab.SAVE_ID.test(tab.newSaveId()) && !tab.SAVE_ID.test("x") && !tab.SAVE_ID.test("<script>aaaaaaaa"));
  tab.__tabForTests(null);
}

// ── round 9, stage 3 — the fresh attack's Lows, as fixed ────────────────────────────────────────────────────────
{
  const act9 = src("lib/actions.ts"), read9 = src("lib/doc-editor-read.ts"), page9 = src("app/schemes/[id]/page.tsx");
  const upd = act9.slice(act9.indexOf("export async function updateSchemeAction"), act9.indexOf("export async function updateSchemeAction") + 60000);
  const lockAt = upd.indexOf("await updateSchemeWith(id, (current) => {");
  t("round 9 attack S2: a save's id is stored with its saver's tag, and named back only to that saver (the save, the peek, the read)",
    /keptSid = sidFor\(cur\.docs\?\.\[docKey\], tag\) \?\? undefined;/.test(act9) && /\.\.\.\(sid && tag \? \{ sid, sidBy: tag \} : \{\}\)/.test(act9)
    && (read9.match(/sid: sidFor\(s\.docs\?\.\[doc\], await saverTagNow\(\)\)/g) ?? []).length === 2 && !/sid: s\.docs\?\.\[doc\]\?\.sid/.test(read9));
  t("round 9 attack L2: the «signed» team lock decided on the scheme INSIDE its lock too (a certificate released while the save ran)",
    lockAt > 0 && /if \(teamNow && changesSigner\(current, teamNow\)\) \{ teamSignedLate = true; return \{\}; \}/.test(upd.slice(lockAt, lockAt + 1500))
    && /if \(teamSignedLate\) redirect\(`\/schemes\/\$\{id\}\/edit\?err=team-signed`\);/.test(upd) && /if \(teamNow && changesSigner\(existing, teamNow\)\) redirect/.test(upd));
  t("round 9 attack L3: the scheme page's chain shows the extension's Order No. to who grants it (order.manage) too",
    /const seesExtension = seesNames \|\| \(await mayNow\("order\.manage", id\)\);/.test(page9) && /orderNo: seesExtension \? w\.ext\?\.orderNo : undefined/.test(page9));
}

console.log(`security-sweep.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
