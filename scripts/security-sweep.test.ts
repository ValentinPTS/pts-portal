// The security sweep after Phase 10 (2026-11-11): four security reviews and four real-user agents.
// What each fix rests on, so it cannot quietly come undone. The behaviour itself is tested where it
// lives (names-guard, auth-links, sanitize-html, cert-register, proxy-paths, migrations, replay,
// public-limit); here, the wiring.
import { readFileSync } from "node:fs";

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
t("R2S-10: a document is never fetched as a picture or a script", /if \(NOT_A_DOCUMENT\.has\(\(req\.headers\.get\("sec-fetch-dest"\) \?\? ""\)\.toLowerCase\(\)\)\) return new Response\(null, \{ status: 403 \}\);/.test(src("app/lab/doc/[scheme]/[doc]/route.ts")) && /coverRaw\.startsWith\("\/brand\/"\) \|\| imageUrlAllowed\(coverRaw\)/.test(actions));

// round 2 — the second real-user pass (R2U-*)
t("R2U-1: brought back by «Back», the results form takes up its own latest save", /const mine = ownSaved\.get\(key\);/.test(src("components/useDraftSaver.ts")) && /ownSaved\.set\(key, \{ rev: r\.rev/.test(src("components/useDraftSaver.ts")) && /edits\.current > 0\) return;/.test(src("components/useDraftSaver.ts")));
t("R2U-2: the scheme page's dates, file menu and the builder's start — by the right", /canEdit=\{await mayNow\("scheme\.edit", id\)\} \/>/.test(src("app/schemes/[id]/page.tsx")) && /canSend=\{await mayNow\("docs\.release", id\)\}/.test(src("app/schemes/[id]/page.tsx")) && /\{canWrite && <button style=\{menuItem\} onClick=\{\(\) => pickFile\(d\.key\)\}>⟳/.test(src("components/SchemeDocuments.tsx")) && /canEdit=\{await mayNow\("scheme\.edit", s\.id\)\}/.test(src("app/schemes/[id]/build/[doc]/page.tsx")) && /<fieldset disabled=\{!!init\.readOnly\}/.test(src("components/SchemeEditor.tsx")));
t("R2U-3: a file larger than the portal takes is refused before sending", /maxBytes=\{15_000_000\}/.test(src("app/lab/p/[id]/page.tsx")) && /maxBytes=\{15_000_000\}/.test(src("app/lab/page.tsx")) && /f\.size > 5_000_000/.test(src("components/RegisterForm.tsx")));
t("R2U-4: the receiver's name at least two letters, in the browser too", /name="receivedBy" required minLength=\{2\}/.test(src("app/lab/p/[id]/page.tsx")));
t("R2U-5: the lab profile's ЕИК and phone checked before sending", /pattern: "\(BG \?\)\?\[0-9\]\{9\}/.test(src("app/lab/profile/page.tsx")));
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
t("Q4: a read-only role sees the document as it prints, not the editor", /if \(!canEdit\) \{\s*return \(\s*<div data-doc-read-only/.test(src("components/WordEditor.tsx")));
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
}

console.log(`security-sweep.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
