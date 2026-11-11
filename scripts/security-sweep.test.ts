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
t("SC-1: «Изпратени имейли» shows a message's words only by code, names.view, or labs.manage (no scheme)", /const seesWords = \(m: \{ schemeId\?: string; code\?: string \}\) => !!m\.code \|\| seesAddress\(m\.schemeId\) \|\| \(!m\.schemeId && managesLabs\);/.test(notices) && /\{seesWords\(m\) \? \(/.test(notices));
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
t("SD-1: registration, application and password reset counted in the database, by the platform's address", /publicFormAllowed\("registration", requestAddress\(h\)\)/.test(actions) && /publicFormAllowed\("application", requestAddress\(h\)\)/.test(actions) && /publicFormAllowed\("password_reset", requestAddress\(h\)\)/.test(src("lib/auth-actions.ts")) && !/allowSubmission/.test(actions) && !/h\.get\("x-forwarded-for"\)/.test(actions + src("lib/auth-actions.ts")));
// SI-1 / SI-5: what becomes a document
t("SI-1: a saved template is sanitized as a document is", /markCodedList\(docKey, sanitizeDocHtml\(String\(bg \?\? ""\)\)\)/.test(actions));
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

console.log(`security-sweep.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
